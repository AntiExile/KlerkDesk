
use lancedb::arrow::arrow_array::Array;
use lancedb::connection::Connection;
use lancedb::query::{ExecutableQuery, QueryBase};
use std::sync::{Arc, Mutex};

use tauri::State;

use crate::rag::embed::Embedder;

use crate::types::{FileInfo, WatchedFolderInfo};
use crate::watcher::{self, WatcherState};

/// Open the native OS folder picker and return the selected path.
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app
        .dialog()
        .file()
        .set_title("Select a folder to watch")
        .blocking_pick_folder();

    Ok(folder.map(|f| f.to_string()))
}

/// Add a folder to the watch list.
#[tauri::command]
pub fn add_watched_folder(
    path: String,
    state: State<'_, Mutex<WatcherState>>,
    app: tauri::AppHandle,
    db_conn: State<'_, Arc<Connection>>,
    embedder: State<'_, Arc<Embedder>>,
) -> Result<WatchedFolderInfo, String> {
    let mut watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;

    let folder = watcher.add_folder(path.clone())?;
    let file_count = watcher::count_files(&folder.path);

    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        let folders: Vec<String> = watcher.folders.iter().map(|f| f.path.clone()).collect();
        store.set("watchedFolders", serde_json::json!(folders));
        let _ = store.save();
    }

    // Initial background sync
    let conn_clone = db_conn.inner().clone();
    let embedder_clone = embedder.inner().clone();
    let folder_path = folder.path.clone();

    tauri::async_runtime::spawn(async move {
        println!("[MundusAI] Starting initial sync for {:?}", folder_path);
        let files = watcher::list_files(&folder_path);
        for file in files {
            let path_buf = std::path::PathBuf::from(&file.path);
            let ext = path_buf
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ["txt", "md", "csv", "json", "pdf"].contains(&ext.as_str()) {
                if let Err(e) =
                    crate::rag::ingest::process_file(&path_buf, &embedder_clone, &conn_clone).await
                {
                    log::error!("[MundusAI] Initial sync failed for {:?}: {}", path_buf, e);
                }
            }
        }
        println!("[MundusAI] Initial sync completed for {:?}", folder_path);
    });

    Ok(WatchedFolderInfo {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        added_at: folder.added_at,
        file_count,
    })
}

/// Remove a folder from the watch list.
#[tauri::command]
pub fn remove_watched_folder(
    id: String,
    state: State<'_, Mutex<WatcherState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    let result = watcher.remove_folder(&id);

    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        let folders: Vec<String> = watcher.folders.iter().map(|f| f.path.clone()).collect();
        store.set("watchedFolders", serde_json::json!(folders));
        let _ = store.save();
    }

    result
}

/// Get all watched folders with live file counts.
#[tauri::command]
pub fn get_watched_folders(
    state: State<'_, Mutex<WatcherState>>,
) -> Result<Vec<WatchedFolderInfo>, String> {
    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(watcher.get_folder_infos())
}

/// Get all files in a specific folder.
#[tauri::command]
pub fn get_folder_files(path: String) -> Result<Vec<FileInfo>, String> {
    let abs_path = std::path::Path::new(&path);
    if !abs_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    Ok(watcher::list_files(&path))
}

/// Get the total file count across all watched folders.
#[tauri::command]
pub fn get_total_file_count(state: State<'_, Mutex<WatcherState>>) -> Result<u64, String> {
    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(watcher.total_file_count())
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceCitation {
    pub file_path: String,
    pub text_snippet: String,
}

#[derive(serde::Serialize, Clone)]
pub struct ChatSourcesEvent {
    pub message_id: String,
    pub sources: Vec<SourceCitation>,
}

#[derive(serde::Serialize, Clone)]
pub struct ChatTokenEvent {
    pub message_id: String,
    pub token: String,
}

/// Ask a question using the RAG pipeline.
#[tauri::command]
pub fn cancel_question(message_id: String, query_state: tauri::State<'_, crate::QueryState>) {
    let mut active = query_state.active_queries.lock().unwrap();
    if let Some(tx) = active.remove(&message_id) {
        let _ = tx.send(());
        println!("[MundusAI] Cancelled question {}", message_id);
    }
}

#[tauri::command]
pub async fn ask_question(
    message_id: String,
    prompt: String,
    folder_filters: Vec<String>,
    app: tauri::AppHandle,
    db_conn: tauri::State<'_, std::sync::Arc<lancedb::connection::Connection>>,
    embedder: tauri::State<'_, std::sync::Arc<crate::rag::embed::Embedder>>,
    query_state: tauri::State<'_, crate::QueryState>,
) -> Result<(), String> {
    use tauri::Emitter;

    let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut active = query_state.active_queries.lock().unwrap();
        active.insert(message_id.clone(), tx);
    }

    // 1. Generate embedding
    let vector = embedder
        .embed_batch(&[prompt.clone()])
        .map_err(|e| format!("Embedding error: {}", e))?
        .pop()
        .unwrap_or_default();

    // 2. Search LanceDB — fetch a broad candidate pool for MMR
    let table = crate::rag::db::get_or_create_table(db_conn.inner().as_ref()).await?;

    let mut query = table
        .vector_search(vector.as_slice())
        .map_err(|e| format!("Vector search error: {}", e))?
        .limit(50);

    // Apply folder-based pre-filter if the user has toggled specific folders
    if !folder_filters.is_empty() {
        let clauses: Vec<String> = folder_filters
            .iter()
            .map(|p| {
                let escaped = p.replace('\'', "''");
                format!("file_path LIKE '{}%'", escaped)
            })
            .collect();
        let filter = clauses.join(" OR ");
        println!("[MundusAI] Applying folder filter: {}", filter);
        query = query.only_if(filter);
    }

    let execute_future = query.execute();
    let mut results = tokio::select! {
        res = execute_future => res.map_err(|e| format!("Execute error: {}", e))?,
        _ = &mut rx => {
            println!("[MundusAI] Query cancelled during vector search");
            let mut active = query_state.active_queries.lock().unwrap();
            active.remove(&message_id);
            return Ok(());
        }
    };

    // Extract text, file_path, vector, and _distance from all candidate rows
    let mut candidates: Vec<crate::rag::mmr::CandidateChunk> = Vec::new();

    while let Some(batch_res) = futures::StreamExt::next(&mut results).await {
        let batch = batch_res.map_err(|e| format!("Batch error: {}", e))?;

        let text_col = batch
            .column_by_name("text")
            .and_then(|c| c.as_any().downcast_ref::<lancedb::arrow::arrow_array::StringArray>());
        let path_col = batch
            .column_by_name("file_path")
            .and_then(|c| c.as_any().downcast_ref::<lancedb::arrow::arrow_array::StringArray>());
        let dist_col = batch
            .column_by_name("_distance")
            .and_then(|c| c.as_any().downcast_ref::<lancedb::arrow::arrow_array::Float32Array>());
        let vec_col = batch
            .column_by_name("vector")
            .and_then(|c| c.as_any().downcast_ref::<lancedb::arrow::arrow_array::FixedSizeListArray>());

        if let (Some(texts), Some(paths), Some(vecs)) = (text_col, path_col, vec_col) {
            for i in 0..texts.len() {
                if texts.is_null(i) || paths.is_null(i) {
                    continue;
                }

                // Extract the 384-dim embedding vector for this row
                let vec_value = vecs.value(i);
                let float_arr = vec_value
                    .as_any()
                    .downcast_ref::<lancedb::arrow::arrow_array::Float32Array>()
                    .map(|a| a.values().to_vec())
                    .unwrap_or_default();

                let distance = dist_col.map(|d| d.value(i)).unwrap_or(0.0);

                candidates.push(crate::rag::mmr::CandidateChunk {
                    text: texts.value(i).to_string(),
                    file_path: paths.value(i).to_string(),
                    vector: float_arr,
                    _distance: distance,
                });
            }
        }
    }

    println!(
        "[MundusAI] Retrieved {} candidates, applying MMR selection...",
        candidates.len()
    );

    // 3. Apply MMR: select 20 diverse chunks, max 5 per file, lambda=0.7
    let selected = crate::rag::mmr::select_mmr(&vector, candidates, 20, 0.7, 5);

    println!(
        "[MundusAI] MMR selected {} chunks from {} distinct files",
        selected.len(),
        selected
            .iter()
            .map(|c| c.file_path.as_str())
            .collect::<std::collections::HashSet<_>>()
            .len()
    );

    // Build context and sources from MMR-selected chunks
    let mut context_chunks = Vec::new();
    let mut sources = Vec::new();

    for chunk in &selected {
        context_chunks.push(chunk.text.clone());
        sources.push(SourceCitation {
            file_path: chunk.file_path.clone(),
            text_snippet: chunk.text.chars().take(150).collect::<String>() + "...",
        });
    }

    // Emit sources immediately
    if let Err(e) = app.emit(
        "chat-sources",
        ChatSourcesEvent {
            message_id: message_id.clone(),
            sources,
        },
    ) {
        log::error!("[MundusAI] Failed to emit chat-sources: {}", e);
    }

    let context_str = context_chunks.join("\n\n---\n\n");
    let full_prompt = format!("Context:\n{}\n\nQuestion: {}", context_str, prompt);

    println!(
        "[MundusAI] Querying sidecar with prompt length: {}",
        full_prompt.len()
    );

    // 3. POST to Colibri on port 14205
    let client = reqwest::Client::new();
    let mut model_id = String::from("default");

    // Fetch available model
    if let Ok(model_res) = client.get("http://localhost:14205/v1/models").send().await {
        if let Ok(json) = model_res.json::<serde_json::Value>().await {
            if let Some(id) = json["data"][0]["id"].as_str() {
                model_id = id.to_string();
            }
        }
    }

    let payload = serde_json::json!({
        "model": model_id,
        "messages": [
            { "role": "system", "content": "You are MundusAI, a helpful local assistant. Answer based ONLY on the provided context." },
            { "role": "user", "content": full_prompt }
        ],
        "stream": true
    });

    let post_future = client
        .post("http://localhost:14205/v1/chat/completions")
        .json(&payload)
        .send();
        
    let mut res = tokio::select! {
        res = post_future => res.map_err(|e| format!("Request to sidecar failed: {}", e))?,
        _ = &mut rx => {
            println!("[MundusAI] Query cancelled during sidecar request");
            let mut active = query_state.active_queries.lock().unwrap();
            active.remove(&message_id);
            return Ok(());
        }
    };

    println!("[MundusAI] Sidecar response status: {}", res.status());

    // 4. Read SSE Stream
    loop {
        let chunk_opt = tokio::select! {
            chunk_opt = res.chunk() => chunk_opt.map_err(|e| format!("Stream error: {}", e))?,
            _ = &mut rx => {
                println!("[MundusAI] Stream cancelled by user");
                break;
            }
        };

        match chunk_opt {
            Some(chunk) => {
                let chunk_str = String::from_utf8_lossy(&chunk);
                println!(
                    "[MundusAI] Raw chunk: {}",
                    &chunk_str[..chunk_str.len().min(200)]
                );

                // SSE chunks can contain multiple 'data: {...}' lines
                for line in chunk_str.lines() {
                    let line = line.trim();
                    if line.starts_with("data: ") {
                        let data = &line["data: ".len()..];

                        if data == "[DONE]" {
                            let _ = app.emit(
                                "chat-done",
                                serde_json::json!({
                                    "message_id": message_id.clone()
                                }),
                            );
                            continue;
                        }

                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            let delta = &json["choices"][0]["delta"];

                            let mut text_to_emit = String::new();

                            if let Some(reasoning) = delta["reasoning_content"].as_str() {
                                text_to_emit.push_str(reasoning);
                            }
                            if let Some(content) = delta["content"].as_str() {
                                text_to_emit.push_str(content);
                            }

                            if !text_to_emit.is_empty() {
                                if let Err(e) = app.emit(
                                    "chat-token",
                                    ChatTokenEvent {
                                        message_id: message_id.clone(),
                                        token: text_to_emit,
                                    },
                                ) {
                                    log::error!("[MundusAI] Failed to emit chat-token: {}", e);
                                }
                            }
                        }
                    }
                }
            }
            None => break,
        }
    }

    // Ensure we clean up the query state
    {
        let mut active = query_state.active_queries.lock().unwrap();
        active.remove(&message_id);
    }

    // Fallback: Ensure UI unlocks even if [DONE] is missed
    let _ = app.emit(
        "chat-done",
        serde_json::json!({
            "message_id": message_id.clone()
        }),
    );

    Ok(())
}
#[tauri::command]
pub async fn pick_model_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app
        .dialog()
        .file()
        .set_title("Select Colibri Model Directory")
        .blocking_pick_folder();

    Ok(folder.map(|f| f.to_string()))
}

/// Test connection to the Colibri sidecar
#[tauri::command]
pub async fn test_connection() -> Result<bool, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("http://localhost:14205/v1/models")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await;

    Ok(res.map(|r| r.status().is_success()).unwrap_or(false))
}

/// Restart the engine with the provided parameters
#[tauri::command]
pub async fn restart_engine(
    use_default: bool,
    model_path: Option<String>,
    app: tauri::AppHandle,
    engine_state: State<'_, crate::EngineState>,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    // 1. Kill the old sidecar if it's running
    if let Ok(mut child_lock) = engine_state.child.lock() {
        if let Some(child) = child_lock.take() {
            let _ = child.kill();
        }
    }

    // Give the OS a moment to free the port
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

    // 2. Spawn the new one
    match app.shell().sidecar("colibri-server") {
        Ok(mut command) => {
            if !use_default {
                if let Some(path) = model_path {
                    if !path.is_empty() {
                        command = command.args(["--model", &path, "--port", "14205"]);
                    }
                }
            } else {
                command = command.args(["--port", "14205"]);
            }

            match command.spawn() {
                Ok((mut rx, child)) => {
                    println!("[MundusAI] Restarted colibri-server sidecar on port 14205");
                    if let Ok(mut child_lock) = engine_state.child.lock() {
                        *child_lock = Some(child);
                    }

                    // Pipe sidecar output to frontend
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        use tauri::Emitter;
                        use tauri_plugin_shell::process::CommandEvent;
                        while let Some(event) = rx.recv().await {
                            let line = match event {
                                CommandEvent::Stdout(ref bytes)
                                | CommandEvent::Stderr(ref bytes) => {
                                    let s = String::from_utf8_lossy(bytes).trim().to_string();
                                    if s.is_empty() {
                                        None
                                    } else {
                                        Some(s)
                                    }
                                }
                                CommandEvent::Terminated(ref payload) => Some(format!(
                                    "Engine process exited (code: {:?})",
                                    payload.code
                                )),
                                _ => None,
                            };
                            if let Some(line) = line {
                                println!("[Colibri] {}", line);
                                let _ = app_clone
                                    .emit("engine-log", serde_json::json!({ "line": line }));
                            }
                        }
                    });

                    Ok(())
                }
                Err(e) => Err(format!("Failed to spawn colibri sidecar: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to create sidecar command: {}", e)),
    }
}
