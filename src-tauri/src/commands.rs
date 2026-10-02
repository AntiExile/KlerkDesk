
use lancedb::arrow::arrow_array::Array;
use lancedb::connection::Connection;
use lancedb::query::{ExecutableQuery, QueryBase};
use std::sync::{Arc, Mutex};

use tauri::{Emitter, State};

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
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        println!("[Terra] Starting initial sync for {:?}", folder_path);
        let files = watcher::list_files(&folder_path);
        let mut supported_files = Vec::new();
        for file in files {
            let path_buf = std::path::PathBuf::from(&file.path);
            let ext = path_buf
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if crate::rag::ingest::is_supported_extension(ext) {
                supported_files.push(path_buf);
            }
        }

        let total = supported_files.len();
        if total > 0 {
            let _ = app_clone.emit("indexing-progress", serde_json::json!({
                "completed": 0,
                "total": total,
                "currentFile": ""
            }));

            let mut completed = 0;
            for path_buf in supported_files {
                let file_name = path_buf
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                let _ = app_clone.emit("indexing-progress", serde_json::json!({
                    "completed": completed,
                    "total": total,
                    "currentFile": file_name
                }));

                if let Err(e) =
                    crate::rag::ingest::process_file(&path_buf, &embedder_clone, &conn_clone).await
                {
                    log::error!("[Terra] Initial sync failed for {:?}: {}", path_buf, e);
                }
                completed += 1;
                let _ = app_clone.emit("indexing-progress", serde_json::json!({
                    "completed": completed,
                    "total": total,
                    "currentFile": file_name
                }));
            }
            let _ = app_clone.emit("indexing-done", serde_json::json!({ "totalFiles": completed }));
        } else {
            let _ = app_clone.emit("indexing-done", serde_json::json!({ "totalFiles": 0 }));
        }
        println!("[Terra] Initial sync completed for {:?}", folder_path);
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
pub async fn remove_watched_folder(
    id: String,
    state: State<'_, Mutex<WatcherState>>,
    db_conn: State<'_, Arc<lancedb::connection::Connection>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let (result, folder_path) = {
        let mut watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        let path = watcher.folders.iter().find(|f| f.id == id).map(|f| f.path.clone());
        let res = watcher.remove_folder(&id);
        (res, path)
    };

    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        if let Ok(watcher) = state.lock() {
            let folders: Vec<String> = watcher.folders.iter().map(|f| f.path.clone()).collect();
            store.set("watchedFolders", serde_json::json!(folders));
            let _ = store.save();
        }
    }

    if let Some(ref folder) = folder_path {
        println!("[Terra] Removing watched folder {:?}, purging chunks from LanceDB...", folder);
        if let Err(e) = crate::rag::db::delete_folder_chunks(&db_conn, folder).await {
            log::error!("[Terra] Failed to delete chunks for folder {:?}: {}", folder, e);
        }
    }

    result
}

/// Re-index all watched folders: clears vector database and re-embeds all documents.
#[tauri::command]
pub async fn reindex_all(
    watcher_state: State<'_, Mutex<WatcherState>>,
    db_conn: State<'_, Arc<lancedb::connection::Connection>>,
    embedder: State<'_, Arc<Embedder>>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    println!("[Terra] Starting Re-index All: clearing LanceDB...");
    crate::rag::db::clear_all_chunks(&db_conn).await?;

    let folders = {
        let watcher = watcher_state.lock().map_err(|e| format!("Lock error: {}", e))?;
        watcher.folders.clone()
    };

    let mut supported_files = Vec::new();
    for folder in &folders {
        println!("[Terra] Scanning folder {:?} for re-indexing", folder.path);
        let files = watcher::list_files(&folder.path);
        for file in files {
            let path_buf = std::path::PathBuf::from(&file.path);
            let ext = path_buf
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if crate::rag::ingest::is_supported_extension(ext) {
                supported_files.push(path_buf);
            }
        }
    }

    let total = supported_files.len();
    println!("[Terra] Re-indexing {} supported files across {} folders", total, folders.len());

    let _ = app.emit("indexing-progress", serde_json::json!({
        "completed": 0,
        "total": total,
        "currentFile": ""
    }));

    let mut completed = 0;
    for path_buf in supported_files {
        let file_name = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let _ = app.emit("indexing-progress", serde_json::json!({
            "completed": completed,
            "total": total,
            "currentFile": file_name
        }));

        if let Err(e) = crate::rag::ingest::process_file(&path_buf, &embedder, &db_conn).await {
            log::error!("[Terra] Failed to re-index {:?}: {}", path_buf, e);
        }

        completed += 1;
        let _ = app.emit("indexing-progress", serde_json::json!({
            "completed": completed,
            "total": total,
            "currentFile": file_name
        }));
    }

    println!("[Terra] Re-indexing completed: {} files processed", completed);
    let _ = app.emit("indexing-done", serde_json::json!({ "totalFiles": completed }));
    Ok(completed)
}

/// Returns the total count of document chunks in LanceDB.
#[tauri::command]
pub async fn get_indexed_chunk_count(
    db_conn: State<'_, Arc<lancedb::connection::Connection>>,
) -> Result<usize, String> {
    crate::rag::db::count_chunks(&db_conn).await
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
        println!("[Terra] Cancelled question {}", message_id);
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
        println!("[Terra] Applying folder filter: {}", filter);
        query = query.only_if(filter);
    }

    let execute_future = query.execute();
    let mut results = tokio::select! {
        res = execute_future => res.map_err(|e| format!("Execute error: {}", e))?,
        _ = &mut rx => {
            println!("[Terra] Query cancelled during vector search");
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
        "[Terra] Retrieved {} candidates, applying MMR selection...",
        candidates.len()
    );

    // 3. Apply MMR: select 20 diverse chunks, max 5 per file, lambda=0.7
    let selected = crate::rag::mmr::select_mmr(&vector, candidates, 20, 0.7, 5);

    println!(
        "[Terra] MMR selected {} chunks from {} distinct files",
        selected.len(),
        selected
            .iter()
            .map(|c| c.file_path.as_str())
            .collect::<std::collections::HashSet<_>>()
            .len()
    );

    // Build context and sources from MMR-selected chunks with context window budgeting
    let mut context_chunks = Vec::new();
    let mut sources = Vec::new();
    let mut current_chars = 0;
    // Colibri default ctx is 8192 tokens. Reserving 2048 for output generation,
    // we budget ~14,000 characters (~3,500 tokens) for retrieved context chunks.
    const MAX_CONTEXT_CHARS: usize = 14_000;

    for chunk in &selected {
        if current_chars + chunk.text.len() > MAX_CONTEXT_CHARS {
            let remaining = MAX_CONTEXT_CHARS.saturating_sub(current_chars);
            if remaining > 200 {
                let truncated: String = chunk.text.chars().take(remaining).collect();
                context_chunks.push(truncated + "...");
                sources.push(SourceCitation {
                    file_path: chunk.file_path.clone(),
                    text_snippet: chunk.text.chars().take(150).collect::<String>() + "...",
                });
            }
            break;
        }
        current_chars += chunk.text.len();
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
        log::error!("[Terra] Failed to emit chat-sources: {}", e);
    }

    let context_str = context_chunks.join("\n\n---\n\n");
    let full_prompt = format!("Context:\n{}\n\nQuestion: {}", context_str, prompt);

    println!(
        "[Terra] Querying sidecar with prompt length: {}",
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
            { "role": "system", "content": "You are Terra, a helpful local assistant. Answer based ONLY on the provided context." },
            { "role": "user", "content": full_prompt }
        ],
        "max_tokens": 2048,
        "temperature": 0.3,
        "stream": true
    });

    let post_future = client
        .post("http://localhost:14205/v1/chat/completions")
        .json(&payload)
        .send();
        
    let mut res = tokio::select! {
        res = post_future => res.map_err(|e| format!("Request to sidecar failed: {}", e))?,
        _ = &mut rx => {
            println!("[Terra] Query cancelled during sidecar request");
            let mut active = query_state.active_queries.lock().unwrap();
            active.remove(&message_id);
            return Ok(());
        }
    };

    println!("[Terra] Sidecar response status: {}", res.status());

    if !res.status().is_success() {
        let status = res.status();
        let error_body = res.text().await.unwrap_or_else(|_| "Failed to read error response".to_string());
        log::error!("[Terra] Sidecar returned error {}: {}", status, error_body);

        let error_msg = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&error_body) {
            json["error"]["message"].as_str().unwrap_or(&error_body).to_string()
        } else {
            error_body
        };

        let _ = app.emit(
            "chat-token",
            ChatTokenEvent {
                message_id: message_id.clone(),
                token: format!("\n\n⚠️ **AI Engine Error (HTTP {}):** {}", status, error_msg),
            },
        );
        let _ = app.emit(
            "chat-done",
            serde_json::json!({
                "message_id": message_id.clone()
            }),
        );
        let mut active = query_state.active_queries.lock().unwrap();
        active.remove(&message_id);
        return Ok(());
    }

    // 4. Read SSE Stream
    loop {
        let chunk_opt = tokio::select! {
            chunk_opt = res.chunk() => chunk_opt.map_err(|e| format!("Stream error: {}", e))?,
            _ = &mut rx => {
                println!("[Terra] Stream cancelled by user");
                break;
            }
        };

        match chunk_opt {
            Some(chunk) => {
                let chunk_str = String::from_utf8_lossy(&chunk);
                println!(
                    "[Terra] Raw chunk: {}",
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
                                    log::error!("[Terra] Failed to emit chat-token: {}", e);
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

    // Ensure port is completely freed (cross-platform orphan cleanup and poll)
    crate::process::kill_process_on_port(14205);
    let _ = crate::process::wait_for_port_free(14205, std::time::Duration::from_millis(2000));

    // 2. Spawn the new one
    use tauri::Manager;
    let app_data_dir = app.path().app_data_dir().unwrap_or_default();
    let resource_dir = app.path().resource_dir().unwrap_or_else(|_| app_data_dir.clone());

    match app.shell().sidecar("colibri-server") {
        Ok(mut command) => {
            command = command
                .env("TERRA_APP_DATA_DIR", app_data_dir.to_string_lossy().to_string())
                .env("TERRA_RESOURCE_DIR", resource_dir.to_string_lossy().to_string());

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
                    println!("[Terra] Restarted colibri-server sidecar on port 14205");
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

/// Helper to determine if a directory contains valid model weights or configuration.
pub fn is_valid_model_dir(path: &std::path::Path) -> bool {
    if !path.exists() || !path.is_dir() {
        return false;
    }
    if path.join("config.json").exists() || path.join("config.hf.json").exists() {
        return true;
    }
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ext_str == "safetensors" || ext_str == "bin" || ext_str == "gguf" {
                    return true;
                }
            }
        }
    }
    false
}

/// Check the current status and location of the local AI model.
#[tauri::command]
pub async fn check_model_status(
    app: tauri::AppHandle,
) -> Result<crate::types::ModelStatusInfo, String> {
    use tauri::Manager;
    use tauri_plugin_store::StoreExt;

    let app_data_dir = app.path().app_data_dir().unwrap_or_default();
    let default_dest = app_data_dir.join("models").join("default");
    let default_str = default_dest.to_string_lossy().to_string();

    let mut use_default = true;
    let mut selected_model = String::new();

    if let Ok(store) = app.store("settings.json") {
        if let Some(val) = store.get("useDefault") {
            use_default = val.as_bool().unwrap_or(true);
        }
        if let Some(val) = store.get("selectedModel") {
            selected_model = val.as_str().unwrap_or("").to_string();
        }
    }

    // 1. If user explicitly selected a custom model, check it
    if !use_default && !selected_model.is_empty() {
        let p = std::path::PathBuf::from(&selected_model);
        if is_valid_model_dir(&p) {
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Custom Model".to_string());
            return Ok(crate::types::ModelStatusInfo {
                has_model: true,
                model_path: Some(selected_model),
                model_name: Some(name),
                is_default: false,
                default_model_path: default_str,
            });
        }
    }

    // 2. Check standard default directory
    if is_valid_model_dir(&default_dest) {
        return Ok(crate::types::ModelStatusInfo {
            has_model: true,
            model_path: Some(default_str.clone()),
            model_name: Some("Colibrì Default Model".to_string()),
            is_default: true,
            default_model_path: default_str,
        });
    }

    // 3. Check environment variable
    if let Ok(env_path) = std::env::var("COLIBRI_MODEL_PATH") {
        let p = std::path::PathBuf::from(&env_path);
        if is_valid_model_dir(&p) {
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Environment Model".to_string());
            return Ok(crate::types::ModelStatusInfo {
                has_model: true,
                model_path: Some(env_path),
                model_name: Some(name),
                is_default: true,
                default_model_path: default_str,
            });
        }
    }

    // 4. Check local development fallback
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let dev_model = std::path::PathBuf::from(&home).join("work/MundusAI_Models/Qwen36-Colibri");
    if is_valid_model_dir(&dev_model) {
        return Ok(crate::types::ModelStatusInfo {
            has_model: true,
            model_path: Some(dev_model.to_string_lossy().to_string()),
            model_name: Some("Qwen36-Colibri (Local Dev)".to_string()),
            is_default: true,
            default_model_path: default_str,
        });
    }

    // 5. No model found
    Ok(crate::types::ModelStatusInfo {
        has_model: false,
        model_path: None,
        model_name: None,
        is_default: true,
        default_model_path: default_str,
    })
}

/// Set a model directory, either linking directly or importing/copying into standard storage.
#[tauri::command]
pub async fn set_model_folder(
    path: String,
    copy_to_default: bool,
    app: tauri::AppHandle,
    engine_state: State<'_, crate::EngineState>,
) -> Result<crate::types::ModelStatusInfo, String> {
    use tauri::Manager;
    use tauri_plugin_store::StoreExt;

    let source = std::path::PathBuf::from(&path);
    if !source.exists() || !source.is_dir() {
        return Err(format!("Directory does not exist: {}", path));
    }

    if !is_valid_model_dir(&source) {
        return Err("The selected directory does not appear to contain valid model files (e.g. config.json, .safetensors, or .gguf).".to_string());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let default_dest = app_data_dir.join("models").join("default");

    let final_model_path: String;
    let is_default_flag: bool;

    if copy_to_default {
        std::fs::create_dir_all(&default_dest)
            .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        println!("[Terra] Copying model files from {:?} to {:?}", source, default_dest);

        for entry in walkdir::WalkDir::new(&source).min_depth(1).max_depth(3) {
            let entry = entry.map_err(|e| e.to_string())?;
            let rel = entry.path().strip_prefix(&source).map_err(|e| e.to_string())?;
            let target = default_dest.join(rel);
            if entry.file_type().is_dir() {
                std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            } else if entry.file_type().is_file() {
                let name = entry.file_name().to_string_lossy();
                if !name.starts_with('.') {
                    std::fs::copy(entry.path(), &target)
                        .map_err(|e| format!("Failed to copy file {:?}: {}", rel, e))?;
                }
            }
        }
        final_model_path = default_dest.to_string_lossy().to_string();
        is_default_flag = true;

        if let Ok(store) = app.store("settings.json") {
            store.set("useDefault", serde_json::json!(true));
            store.set("selectedModel", serde_json::json!(""));
            let _ = store.save();
        }
    } else {
        final_model_path = path.clone();
        is_default_flag = false;

        if let Ok(store) = app.store("settings.json") {
            store.set("useDefault", serde_json::json!(false));
            store.set("selectedModel", serde_json::json!(path.clone()));
            let _ = store.save();
        }
    }

    // Restart engine with newly selected model
    let _ = restart_engine(is_default_flag, Some(final_model_path.clone()), app.clone(), engine_state).await;

    let model_name = std::path::Path::new(&final_model_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Selected Model".to_string());

    Ok(crate::types::ModelStatusInfo {
        has_model: true,
        model_path: Some(final_model_path),
        model_name: Some(model_name),
        is_default: is_default_flag,
        default_model_path: default_dest.to_string_lossy().to_string(),
    })
}

/// Download default model weights directly into the application storage directory.
#[tauri::command]
pub async fn download_default_model(
    source_url: Option<String>,
    app: tauri::AppHandle,
    download_state: State<'_, crate::DownloadState>,
    engine_state: State<'_, crate::EngineState>,
) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    use tauri_plugin_store::StoreExt;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target_dir = app_data_dir.join("models").join("default");
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut guard = download_state.cancel_tx.lock().unwrap();
        *guard = Some(cancel_tx);
    }

    let url = source_url.unwrap_or_else(|| {
        "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/resolve/main/model.safetensors".to_string()
    });

    let filename = url
        .split('/')
        .last()
        .filter(|s| !s.is_empty())
        .unwrap_or("model.safetensors")
        .to_string();

    let dest_file = target_dir.join(&filename);

    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to model host: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Download failed with HTTP {}", res.status()));
    }

    let total_bytes = res.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let _ = app.emit(
        "model-download-progress",
        crate::types::ModelDownloadProgress {
            status: "downloading".to_string(),
            current_file: filename.clone(),
            downloaded_bytes: 0,
            total_bytes,
            percentage: 0.0,
            error_message: None,
        },
    );

    let mut file = std::fs::File::create(&dest_file)
        .map_err(|e| format!("Failed to create destination file: {}", e))?;
    let mut stream = res.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    loop {
        let chunk_res = tokio::select! {
            chunk_opt = futures::StreamExt::next(&mut stream) => {
                match chunk_opt {
                    Some(c) => c,
                    None => break, // Stream complete
                }
            }
            _ = &mut cancel_rx => {
                println!("[Terra] Model download cancelled by user");
                let _ = std::fs::remove_file(&dest_file);
                let _ = app.emit("model-download-progress", crate::types::ModelDownloadProgress {
                    status: "cancelled".to_string(),
                    current_file: filename,
                    downloaded_bytes: downloaded,
                    total_bytes,
                    percentage: 0.0,
                    error_message: Some("Download cancelled by user".to_string()),
                });
                return Ok(());
            }
        };

        let chunk = chunk_res.map_err(|e| format!("Download stream error: {}", e))?;
        use std::io::Write;
        file.write_all(&chunk)
            .map_err(|e| format!("Disk write error: {}", e))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed().as_millis() > 150 {
            let percentage = if total_bytes > 0 {
                (downloaded as f32 / total_bytes as f32) * 100.0
            } else {
                0.0
            };

            let _ = app.emit(
                "model-download-progress",
                crate::types::ModelDownloadProgress {
                    status: "downloading".to_string(),
                    current_file: filename.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    percentage,
                    error_message: None,
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    if let Ok(store) = app.store("settings.json") {
        store.set("useDefault", serde_json::json!(true));
        store.set("selectedModel", serde_json::json!(""));
        let _ = store.save();
    }

    let _ = app.emit(
        "model-download-progress",
        crate::types::ModelDownloadProgress {
            status: "completed".to_string(),
            current_file: filename,
            downloaded_bytes: downloaded,
            total_bytes: downloaded,
            percentage: 100.0,
            error_message: None,
        },
    );

    // Auto-restart engine with new model
    let _ = restart_engine(true, None, app, engine_state).await;

    Ok(())
}

/// Cancel an ongoing model download.
#[tauri::command]
pub fn cancel_model_download(
    download_state: State<'_, crate::DownloadState>,
) -> Result<(), String> {
    let mut guard = download_state.cancel_tx.lock().unwrap();
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
        println!("[Terra] Cancelled model download");
    }
    Ok(())
}
