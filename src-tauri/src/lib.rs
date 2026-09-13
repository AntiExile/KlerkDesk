mod commands;
mod rag;
mod types;
mod watcher;

use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_store::StoreExt;
use watcher::WatcherState;

pub struct EngineState {
    pub child: Mutex<Option<CommandChild>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(Mutex::new(WatcherState::new()))
        .manage(EngineState { child: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            commands::pick_folder,
            commands::add_watched_folder,
            commands::remove_watched_folder,
            commands::get_watched_folders,
            commands::get_folder_files,
            commands::get_total_file_count,
            commands::ask_question,
            commands::pick_model_folder,
            commands::test_connection,
            commands::restart_engine,
        ])
        .setup(|app| {
            // Give the watcher access to the app handle so it can emit events
            let state = app.state::<Mutex<WatcherState>>();
            let mut watcher = state.lock().expect("Failed to lock WatcherState on setup");
            watcher.set_app_handle(app.handle().clone());

            let store = app.store("settings.json");
            if let Ok(store_handle) = &store {
                if let Some(folders_val) = store_handle.get("watchedFolders") {
                    if let Some(folders) = folders_val.as_array() {
                        for folder_val in folders {
                            if let Some(path) = folder_val.as_str() {
                                let _ = watcher.add_folder(path.to_string());
                            }
                        }
                    }
                }
            }

            // RAG Initialization
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");

            // Block on async DB init and Embedder init
            let (conn, embedder) = tauri::async_runtime::block_on(async {
                let conn = rag::db::init_db(app_data_dir.clone())
                    .await
                    .expect("Failed to init LanceDB");
                    
                let embedder = rag::embed::Embedder::new(app_data_dir)
                    .await
                    .expect("Failed to init Embedder");
                    
                (conn, embedder)
            });

            // Manage them
            app.manage(Arc::new(conn));
            app.manage(Arc::new(embedder));

            // Kill any orphaned process on port 14205 from a previous run
            let _ = std::process::Command::new("sh")
                .args(["-c", "lsof -ti :14205 | xargs kill -9 2>/dev/null"])
                .output();

            // Spawn Colibri Sidecar
            let store = app.store("settings.json");
            let mut use_default = true;
            let mut custom_model = String::new();

            if let Ok(store) = store {
                if let Some(val) = store.get("useDefault") {
                    use_default = val.as_bool().unwrap_or(true);
                }
                if let Some(val) = store.get("selectedModel") {
                    custom_model = val.as_str().unwrap_or("").to_string();
                }
            }

            match app.shell().sidecar("colibri-server") {
                Ok(mut command) => {
                    command = command.args(["--port", "14205"]);
                    
                    if !use_default && !custom_model.is_empty() {
                        command = command.args([
                            "--model", &custom_model,
                        ]);
                    }

                    match command.spawn() {
                        Ok((mut rx, child)) => {
                            println!("[MundusAI] Spawned colibri-server sidecar on port 14205");
                            if let Ok(mut child_lock) = app.state::<EngineState>().child.lock() {
                                *child_lock = Some(child);
                            }

                            // Pipe sidecar output to frontend
                            let app_handle = app.handle().clone();
                            tauri::async_runtime::spawn(async move {
                                use tauri_plugin_shell::process::CommandEvent;
                                while let Some(event) = rx.recv().await {
                                    let line = match event {
                                        CommandEvent::Stdout(ref bytes) | CommandEvent::Stderr(ref bytes) => {
                                            let s = String::from_utf8_lossy(bytes).trim().to_string();
                                            if s.is_empty() { None } else { Some(s) }
                                        }
                                        CommandEvent::Terminated(ref payload) => {
                                            Some(format!("Engine process exited (code: {:?})", payload.code))
                                        }
                                        _ => None,
                                    };
                                    if let Some(line) = line {
                                        println!("[Colibri] {}", line);
                                        let _ = app_handle.emit("engine-log", serde_json::json!({ "line": line }));
                                    }
                                }
                            });
                        }
                        Err(e) => {
                            eprintln!("[MundusAI] Failed to spawn colibri-server sidecar: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[MundusAI] Failed to create sidecar command: {}", e);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
