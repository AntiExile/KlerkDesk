import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  FolderOpen,
  Trash2,
  Plus,
  Loader2,
  Settings,
} from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { IconButton } from '@/components/ui/IconButton';

interface SidebarProps {
  onOpenSettings: () => void;
}

interface WatchedFolderInfo {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  fileCount: number;
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const [folders, setFolders] = useState<WatchedFolderInfo[]>([]);
  const [docCount, setDocCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'indexing'>('synced');
  const [adding, setAdding] = useState(false);

  // ── Fetch folders + total count from the backend ──
  const refreshData = useCallback(async () => {
    try {
      const [folderList, count] = await Promise.all([
        invoke<WatchedFolderInfo[]>('get_watched_folders'),
        invoke<number>('get_total_file_count'),
      ]);
      setFolders(folderList);
      setDocCount(count);
    } catch (err) {
      console.error('[MundusAI] Failed to refresh sidebar data:', err);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // React to filesystem changes — flash indexing status, then refresh
  useEffect(() => {
    const unlisten = listen('mundusai://fs-change', () => {
      setSyncStatus('indexing');
      refreshData().then(() => {
        setTimeout(() => setSyncStatus('synced'), 1500);
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshData]);

  // ── Add a folder via the native OS picker ──
  const handleAddFolder = async () => {
    setAdding(true);
    try {
      const selectedPath = await invoke<string | null>('pick_folder');
      if (selectedPath) {
        await invoke<WatchedFolderInfo>('add_watched_folder', { path: selectedPath });
        await refreshData();
      }
    } catch (err) {
      console.error('[MundusAI] Failed to add folder:', err);
    } finally {
      setAdding(false);
    }
  };

  // ── Remove a folder ──
  const handleRemoveFolder = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // prevent any parent click handlers
    try {
      await invoke('remove_watched_folder', { id });
      await refreshData();
    } catch (err) {
      console.error('[MundusAI] Failed to remove folder:', err);
    }
  };

  return (
    <aside className="w-[var(--sidebar-width)] h-full flex flex-col bg-surface-secondary border-r border-border-default shrink-0">
      {/* App Header */}
      <div className="h-12 flex items-center px-4 border-b border-border-subtle drag-region">
        <div className="flex items-center gap-2.5 no-drag">
          <div className="size-6 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <span className="text-sm font-semibold text-text-primary tracking-tight">
            MundusAI
          </span>
        </div>
      </div>

      {/* Synced Folders */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="px-2 mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            Synced Folders
          </span>
        </div>

        <nav className="space-y-0.5">
          {folders.length === 0 && !adding ? (
            <div className="px-2 py-6 text-center text-xs text-text-tertiary">
              No folders synced yet.
              <br />
              Add one to start indexing documents.
            </div>
          ) : (
            folders.map((folder) => (
              <div
                key={folder.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary/50 transition-colors duration-150"
              >
                <FolderOpen className="size-4 text-text-tertiary shrink-0" />
                <span className="truncate flex-1" title={folder.path}>
                  {folder.name}
                </span>
                <span className="text-[10px] text-text-tertiary tabular-nums shrink-0 group-hover:hidden">
                  {folder.fileCount.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveFolder(e, folder.id)}
                  className="hidden group-hover:flex size-5 rounded items-center justify-center hover:bg-status-error/10 text-text-tertiary hover:text-status-error transition-colors cursor-pointer border-none bg-transparent shrink-0"
                  title="Remove folder"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))
          )}
        </nav>

        {/* Add Folder Button */}
        <button
          type="button"
          onClick={handleAddFolder}
          disabled={adding}
          className="mt-1 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-text-tertiary hover:text-text-secondary hover:bg-surface-tertiary/30 transition-colors duration-150 cursor-pointer bg-transparent border-none text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? (
            <Loader2 className="size-4 animate-spin shrink-0" />
          ) : (
            <Plus className="size-4 shrink-0" />
          )}
          <span>{adding ? 'Selecting...' : 'Add Folder'}</span>
        </button>
      </div>

      {/* Bottom Bar: Sync Status + Settings */}
      <div className="px-3 py-3 border-t border-border-subtle space-y-2">
        {/* Sync Status */}
        <div className="flex items-center gap-2 px-1">
          <StatusDot
            status={syncStatus === 'synced' ? 'success' : 'warning'}
            pulse={syncStatus === 'indexing'}
          />
          <span className="text-xs text-text-tertiary">
            {syncStatus === 'synced'
              ? 'Vector DB synced'
              : 'Indexing documents...'}
          </span>
        </div>

        {/* Settings */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-text-tertiary">
            {docCount.toLocaleString()} documents indexed
          </span>
          <IconButton
            tooltip="Settings"
            size="sm"
            onClick={onOpenSettings}
          >
            <Settings className="size-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
