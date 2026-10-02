import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FolderOpen, Trash2, Plus, RefreshCw, Loader2 } from 'lucide-react';
import type { IndexingProgress, IndexingDone } from '@/types';

interface WatchedFolderInfo {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  fileCount: number;
}

export function DataSyncTab() {
  const [folders, setFolders] = useState<WatchedFolderInfo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);

  const refreshData = useCallback(async () => {
    try {
      const [folderList, count] = await Promise.all([
        invoke<WatchedFolderInfo[]>('get_watched_folders'),
        invoke<number>('get_total_file_count'),
      ]);
      setFolders(folderList);
      setTotalCount(count);
    } catch (err) {
      console.error('[Terra] Failed to fetch folders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReindexAll = async () => {
    setReindexing(true);
    try {
      await invoke<number>('reindex_all');
      await refreshData();
    } catch (err) {
      console.error('[Terra] Failed to reindex all:', err);
    } finally {
      setReindexing(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Listen for FS change and indexing events to refresh counts and show progress
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;
    let unlistenFsChange: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenProgress = await listen<IndexingProgress>('indexing-progress', (event) => {
        setIndexingProgress(event.payload);
        setReindexing(true);
      });

      unlistenDone = await listen<IndexingDone>('indexing-done', () => {
        setIndexingProgress(null);
        setReindexing(false);
        refreshData();
      });

      unlistenFsChange = await listen('terra://fs-change', () => {
        refreshData();
      });
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenDone) unlistenDone();
      if (unlistenFsChange) unlistenFsChange();
    };
  }, [refreshData]);

  const handleAddFolder = async () => {
    setAdding(true);
    try {
      const selectedPath = await invoke<string | null>('pick_folder');
      if (selectedPath) {
        await invoke<WatchedFolderInfo>('add_watched_folder', { path: selectedPath });
        await refreshData();
      }
    } catch (err) {
      console.error('[Terra] Failed to add folder:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveFolder = async (id: string) => {
    try {
      await invoke('remove_watched_folder', { id });
      await refreshData();
    } catch (err) {
      console.error('[Terra] Failed to remove folder:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 text-text-tertiary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          Watched Folders
        </h3>
        <p className="text-xs text-text-tertiary mt-1">
          Terra monitors these folders and indexes documents into the local
          vector database for retrieval.
        </p>
      </div>

      {/* Folder List */}
      <div className="space-y-2">
        {folders.length === 0 ? (
          <div className="text-center py-8 text-sm text-text-tertiary">
            No folders added yet. Click "Add Folder" to get started.
          </div>
        ) : (
          folders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-surface-primary/50 border border-border-subtle group"
            >
              <div className="size-9 rounded-lg bg-surface-tertiary/50 flex items-center justify-center shrink-0">
                <FolderOpen className="size-4 text-text-tertiary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">
                  {folder.name}
                </div>
                <div className="text-xs text-text-tertiary truncate">
                  {folder.path}
                </div>
              </div>
              <div className="text-right shrink-0 mr-2">
                <div className="text-xs text-text-secondary">
                  {folder.fileCount.toLocaleString()} files
                </div>
                <div className="text-[10px] text-text-tertiary">
                  {formatDate(folder.addedAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveFolder(folder.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity size-7 rounded-md flex items-center justify-center hover:bg-status-error/10 text-text-tertiary hover:text-status-error cursor-pointer border-none bg-transparent"
                title="Remove folder"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Folder */}
      <button
        type="button"
        onClick={handleAddFolder}
        disabled={adding}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border-default text-sm text-text-tertiary hover:text-text-secondary hover:border-accent-600/40 hover:bg-accent-600/5 transition-colors duration-150 cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {adding ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        {adding ? 'Selecting...' : 'Add Folder'}
      </button>

      {/* Summary */}
      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <span className="text-xs text-text-tertiary">
          {totalCount.toLocaleString()} total documents indexed
        </span>
        <button
          type="button"
          onClick={handleReindexAll}
          disabled={reindexing}
          className="flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors cursor-pointer bg-transparent border-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`size-3 ${reindexing ? 'animate-spin' : ''}`} />
          {reindexing ? 'Re-indexing...' : 'Re-index all'}
        </button>
      </div>

      {/* Real-time Ingestion Progress Card */}
      {indexingProgress && indexingProgress.total > 0 && (
        <div className="p-3 bg-surface-tertiary/60 border border-border-subtle rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-text-primary flex items-center gap-1.5">
              <RefreshCw className="size-3 text-accent-400 animate-spin flex-shrink-0" />
              Indexing Documents ({indexingProgress.completed} / {indexingProgress.total})
            </span>
            <span className="font-mono text-text-tertiary">
              {Math.round((indexingProgress.completed / indexingProgress.total) * 100)}%
            </span>
          </div>
          {indexingProgress.currentFile && (
            <p className="text-[11px] text-text-tertiary truncate" title={indexingProgress.currentFile}>
              {indexingProgress.currentFile}
            </p>
          )}
          <div className="w-full bg-surface-primary rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-accent-500 h-full transition-all duration-200 ease-out"
              style={{
                width: `${Math.min(100, Math.round((indexingProgress.completed / indexingProgress.total) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}
