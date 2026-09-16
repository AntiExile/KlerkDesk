import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  FolderOpen,
  Trash2,
  Plus,
  Loader2,
  Settings,
  Filter,
  MessageSquare,
  Pencil,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { IconButton } from '@/components/ui/IconButton';
import type { ConversationSummary } from '@/types';

interface SidebarProps {
  onOpenSettings: () => void;
  activeFolderPaths: string[];
  onToggleFolder: (path: string) => void;
  onFolderRemoved: (path: string) => void;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
}

interface WatchedFolderInfo {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  fileCount: number;
}

/** Format a timestamp as a relative label. */
function relativeTime(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function Sidebar({
  onOpenSettings,
  activeFolderPaths,
  onToggleFolder,
  onFolderRemoved,
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
}: SidebarProps) {
  const [folders, setFolders] = useState<WatchedFolderInfo[]>([]);
  const [docCount, setDocCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'indexing'>('synced');
  const [adding, setAdding] = useState(false);

  // ── Collapsible Section State ──
  const [isFoldersExpanded, setIsFoldersExpanded] = useState(true);
  const [isConversationsExpanded, setIsConversationsExpanded] = useState(true);

  // ── Inline rename state ──
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Folder data fetching ──
  const refreshData = useCallback(async () => {
    try {
      const [folderList, count] = await Promise.all([
        invoke<WatchedFolderInfo[]>('get_watched_folders'),
        invoke<number>('get_total_file_count'),
      ]);
      setFolders(folderList);
      setDocCount(count);
    } catch (err) {
      console.error('[Terra] Failed to refresh sidebar data:', err);
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  useEffect(() => {
    const unlisten = listen('terra://fs-change', () => {
      setSyncStatus('indexing');
      refreshData().then(() => {
        setTimeout(() => setSyncStatus('synced'), 1500);
      });
    });
    return () => { unlisten.then((fn) => fn()); };
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

  const handleRemoveFolder = async (e: React.MouseEvent, id: string, path: string) => {
    e.stopPropagation();
    try {
      await invoke('remove_watched_folder', { id });
      onFolderRemoved(path);
      await refreshData();
    } catch (err) {
      console.error('[Terra] Failed to remove folder:', err);
    }
  };

  // ── Rename helpers ──
  const startRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
    // Focus the input after it renders
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameConversation(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
  };

  const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteConversation(id);
  };

  const activeFilterCount = activeFolderPaths.length;

  return (
    <aside className="w-[var(--sidebar-width)] h-full flex flex-col bg-surface-secondary border-r border-border-default shrink-0">
      {/* App Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border-subtle drag-region">
        <div className="flex items-center gap-2.5 no-drag">
          <div className="size-6 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">T</span>
          </div>
          <span className="text-sm font-semibold text-text-primary tracking-tight">
            Terra
          </span>
        </div>
        <div className="no-drag">
          <IconButton tooltip="New Chat" size="sm" onClick={onNewConversation}>
            <Plus className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* Scrollable main area: Folders + Conversations */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        
        {/* ── Synced Folders Section ── */}
        <div>
          <button
            type="button"
            onClick={() => setIsFoldersExpanded(!isFoldersExpanded)}
            className="w-full px-2 mb-1 flex items-center justify-between cursor-pointer hover:bg-surface-tertiary/50 rounded py-1 transition-colors border-none bg-transparent"
          >
            <div className="flex items-center gap-1.5">
              {isFoldersExpanded ? (
                <ChevronDown className="size-3 text-text-tertiary" />
              ) : (
                <ChevronRight className="size-3 text-text-tertiary" />
              )}
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Synced Folders
              </span>
            </div>
            {folders.length > 0 && (
              <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                <Filter className="size-2.5" />
                {activeFilterCount === 0
                  ? 'All folders'
                  : `Filtering ${activeFilterCount}`}
              </span>
            )}
          </button>

          {isFoldersExpanded && (
            <>
              <nav className="space-y-0.5">
                {folders.length === 0 && !adding ? (
                  <div className="px-2 py-4 text-center text-xs text-text-tertiary">
                    No folders synced yet.
                  </div>
                ) : (
                  folders.map((folder) => {
                    const isActive = activeFolderPaths.includes(folder.path);

                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => onToggleFolder(folder.path)}
                        className={`
                          group w-full flex items-center gap-2 px-2 py-1.5 rounded-md
                          text-sm transition-colors duration-150 cursor-pointer
                          border-none text-left
                          ${isActive
                            ? 'bg-accent-600/10 text-text-primary border-l-2 border-l-accent-500 pl-1.5'
                            : 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-tertiary/50'
                          }
                        `}
                      >
                        <FolderOpen
                          className={`size-4 shrink-0 ${isActive ? 'text-accent-400' : 'text-text-tertiary'}`}
                        />
                        <span className="truncate flex-1" title={folder.path}>
                          {folder.name}
                        </span>
                        <span
                          className={`text-[10px] tabular-nums shrink-0 group-hover:hidden ${
                            isActive ? 'text-accent-400/70' : 'text-text-tertiary'
                          }`}
                        >
                          {folder.fileCount.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveFolder(e, folder.id, folder.path)}
                          className="hidden group-hover:flex size-5 rounded items-center justify-center hover:bg-status-error/10 text-text-tertiary hover:text-status-error transition-colors cursor-pointer border-none bg-transparent shrink-0"
                          title="Remove folder"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </button>
                    );
                  })
                )}
              </nav>

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
            </>
          )}
        </div>

        {/* ── Conversations Section ── */}
        <div>
          <button
            type="button"
            onClick={() => setIsConversationsExpanded(!isConversationsExpanded)}
            className="w-full px-2 mb-1 flex items-center gap-1.5 cursor-pointer hover:bg-surface-tertiary/50 rounded py-1 transition-colors border-none bg-transparent"
          >
            {isConversationsExpanded ? (
              <ChevronDown className="size-3 text-text-tertiary" />
            ) : (
              <ChevronRight className="size-3 text-text-tertiary" />
            )}
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Conversations
            </span>
          </button>
          
          {isConversationsExpanded && (
            <nav className="space-y-0.5">
              {conversations.map((convo) => {
                const isActive = convo.id === activeConversationId;
                const isRenaming = convo.id === renamingId;

                return (
                  <button
                    key={convo.id}
                    type="button"
                    onClick={() => onSelectConversation(convo.id)}
                    className={`
                      group w-full flex items-center gap-2 px-2 py-1.5 rounded-md
                      text-sm transition-colors duration-150 cursor-pointer
                      border-none text-left
                      ${isActive
                        ? 'bg-accent-600/10 text-text-primary'
                        : 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-tertiary/50'
                      }
                    `}
                  >
                    <MessageSquare
                      className={`size-3.5 shrink-0 ${isActive ? 'text-accent-400' : 'text-text-tertiary'}`}
                    />

                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-surface-tertiary/50 border border-border-default rounded px-1.5 py-0.5 text-sm text-text-primary outline-none focus:border-accent-500"
                      />
                    ) : (
                      <>
                        <span className="truncate flex-1 min-w-0" title={convo.title}>
                          {convo.title}
                        </span>
                        <span className="text-[10px] text-text-tertiary shrink-0 group-hover:hidden">
                          {relativeTime(convo.updatedAt)}
                        </span>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => startRename(e, convo.id, convo.title)}
                            className="size-5 rounded flex items-center justify-center hover:bg-surface-tertiary text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer border-none bg-transparent"
                            title="Rename"
                          >
                            <Pencil className="size-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteConversation(e, convo.id)}
                            className="size-5 rounded flex items-center justify-center hover:bg-status-error/10 text-text-tertiary hover:text-status-error transition-colors cursor-pointer border-none bg-transparent"
                            title="Delete"
                          >
                            <Trash2 className="size-2.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

      </div>

      {/* Bottom Bar: Sync Status + Settings */}
      <div className="px-3 py-3 border-t border-border-subtle space-y-2">
        <div className="flex items-center gap-2 px-1">
          <StatusDot
            status={syncStatus === 'synced' ? 'success' : 'warning'}
            pulse={syncStatus === 'indexing'}
          />
          <span className="text-xs text-text-tertiary">
            {syncStatus === 'synced'
              ? 'Ready'
              : 'Indexing documents...'}
          </span>
        </div>
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-text-tertiary">
            {docCount.toLocaleString()} documents indexed
          </span>
          <IconButton tooltip="Settings" size="sm" onClick={onOpenSettings}>
            <Settings className="size-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
