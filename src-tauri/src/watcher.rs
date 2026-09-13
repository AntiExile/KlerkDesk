use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::types::{FileInfo, FsChangeEvent, WatchedFolder, WatchedFolderInfo};

/// Manages watched folders and the filesystem watcher.
pub struct WatcherState {
    pub folders: Vec<WatchedFolder>,
    app_handle: Option<AppHandle>,
    /// Channel sender to stop the current watcher thread.
    stop_tx: Option<mpsc::Sender<()>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            folders: Vec::new(),
            app_handle: None,
            stop_tx: None,
        }
    }

    /// Store the app handle so we can emit events to the frontend.
    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    /// Add a folder to the watch list and restart the watcher.
    pub fn add_folder(&mut self, path: String) -> Result<WatchedFolder, String> {
        let abs_path = resolve_path(&path)?;

        // Don't add duplicates
        if self.folders.iter().any(|f| f.path == abs_path) {
            return Err(format!("Folder already watched: {}", abs_path));
        }

        let name = Path::new(&abs_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| abs_path.clone());

        let folder = WatchedFolder {
            id: Uuid::new_v4().to_string(),
            name,
            path: abs_path,
            added_at: Utc::now(),
        };

        self.folders.push(folder.clone());
        self.rebuild_watcher();

        Ok(folder)
    }

    /// Remove a folder by ID and restart the watcher.
    pub fn remove_folder(&mut self, id: &str) -> Result<(), String> {
        let initial_len = self.folders.len();
        self.folders.retain(|f| f.id != id);

        if self.folders.len() == initial_len {
            return Err(format!("Folder not found: {}", id));
        }

        self.rebuild_watcher();
        Ok(())
    }

    /// Get all watched folders enriched with live file counts.
    pub fn get_folder_infos(&self) -> Vec<WatchedFolderInfo> {
        self.folders
            .iter()
            .map(|f| WatchedFolderInfo {
                id: f.id.clone(),
                name: f.name.clone(),
                path: f.path.clone(),
                added_at: f.added_at,
                file_count: count_files(&f.path),
            })
            .collect()
    }

    /// Total file count across all watched folders.
    pub fn total_file_count(&self) -> u64 {
        self.folders.iter().map(|f| count_files(&f.path)).sum()
    }

    /// Stop the current watcher and start a new one watching all current folders.
    fn rebuild_watcher(&mut self) {
        // Stop existing watcher
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }

        if self.folders.is_empty() {
            return;
        }

        let app_handle = match &self.app_handle {
            Some(h) => h.clone(),
            None => return,
        };

        let paths: Vec<PathBuf> = self
            .folders
            .iter()
            .map(|f| PathBuf::from(&f.path))
            .collect();

        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        self.stop_tx = Some(stop_tx);

        // Spawn watcher on a background thread
        std::thread::spawn(move || {
            let (tx, rx) = mpsc::channel();

            let mut debouncer = match new_debouncer(Duration::from_secs(2), tx) {
                Ok(d) => d,
                Err(e) => {
                    log::error!("[MundusAI] Failed to create file watcher: {}", e);
                    return;
                }
            };

            for path in &paths {
                if let Err(e) = debouncer.watcher().watch(path, RecursiveMode::Recursive) {
                    log::error!("[MundusAI] Failed to watch {}: {}", path.display(), e);
                }
            }

            log::info!(
                "[MundusAI] Watching {} folder(s) for changes",
                paths.len()
            );

            loop {
                // Check for stop signal (non-blocking)
                if stop_rx.try_recv().is_ok() {
                    log::info!("[MundusAI] Watcher stopped");
                    break;
                }

                // Check for FS events (with timeout so we can check stop signal)
                match rx.recv_timeout(Duration::from_millis(500)) {
                    Ok(Ok(events)) => {
                        let changed_paths: Vec<String> = events
                            .iter()
                            .filter(|e| e.kind == DebouncedEventKind::Any)
                            .map(|e| e.path.to_string_lossy().to_string())
                            .collect();

                        if !changed_paths.is_empty() {
                            let event = FsChangeEvent {
                                event_type: "change".to_string(),
                                paths: changed_paths.clone(),
                            };

                            if let Err(e) =
                                app_handle.emit("mundusai://fs-change", &event)
                            {
                                log::error!(
                                    "[MundusAI] Failed to emit fs-change event: {}",
                                    e
                                );
                            }

                            // Trigger RAG Ingestion
                            for path_str in event.paths {
                                let path = PathBuf::from(path_str);
                                // Note: In a real app we should verify it's a file, but notify gives us the exact path.
                                // We also might want to check the extension first.
                                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                                if !["txt", "md", "csv", "json", "pdf"].contains(&ext.as_str()) {
                                    continue;
                                }

                                let db_conn = app_handle.state::<std::sync::Arc<lancedb::connection::Connection>>().inner().clone();
                                let embedder = app_handle.state::<std::sync::Arc<crate::rag::embed::Embedder>>().inner().clone();

                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = crate::rag::ingest::process_file(&path, &embedder, &db_conn).await {
                                        log::error!("[MundusAI] Failed to ingest {:?}: {}", path, e);
                                    }
                                });
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        log::error!("[MundusAI] Watcher error: {:?}", e);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        // Normal timeout, loop continues
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        log::info!("[MundusAI] Watcher channel disconnected");
                        break;
                    }
                }
            }
        });
    }
}

/// Recursively count all files (not directories) under a path.
pub fn count_files(path: &str) -> u64 {
    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count() as u64
}

/// List all files under a path with metadata.
pub fn list_files(path: &str) -> Vec<FileInfo> {
    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|entry| {
            let metadata = entry.metadata().ok();
            FileInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                size_bytes: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
                modified_at: metadata
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let dt: DateTime<Utc> = t.into();
                        dt.to_rfc3339()
                    }),
            }
        })
        .collect()
}

/// Resolve a path string, expanding ~ to the home directory.
fn resolve_path(path: &str) -> Result<String, String> {
    let expanded = if path.starts_with('~') {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "Cannot determine home directory".to_string())?;
        path.replacen('~', &home, 1)
    } else {
        path.to_string()
    };

    let canonical = PathBuf::from(&expanded);
    if !canonical.exists() {
        return Err(format!("Path does not exist: {}", expanded));
    }
    if !canonical.is_dir() {
        return Err(format!("Path is not a directory: {}", expanded));
    }

    Ok(canonical.to_string_lossy().to_string())
}
