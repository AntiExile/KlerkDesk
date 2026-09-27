use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A folder being watched by Terra.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedFolder {
    pub id: String,
    pub name: String,
    pub path: String,
    pub added_at: DateTime<Utc>,
}

/// A watched folder enriched with a live file count.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolderInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub added_at: DateTime<Utc>,
    pub file_count: u64,
}

/// Metadata about a single file inside a watched folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

/// A filesystem change event emitted to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    pub event_type: String,
    pub paths: Vec<String>,
}

/// Status of the local AI model for engine execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatusInfo {
    pub has_model: bool,
    pub model_path: Option<String>,
    pub model_name: Option<String>,
    pub is_default: bool,
    pub default_model_path: String,
}

/// Progress event emitted while downloading model files.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgress {
    pub status: String, // "downloading" | "verifying" | "completed" | "error" | "cancelled"
    pub current_file: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f32,
    pub error_message: Option<String>,
}
