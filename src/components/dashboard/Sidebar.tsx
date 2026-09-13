import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Settings,
  FileText,
  Scale,
  Receipt,
} from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { IconButton } from '@/components/ui/IconButton';

interface SidebarProps {
  onOpenSettings: () => void;
}

interface FolderItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  children?: { id: string; name: string }[];
}

const mockFolders: FolderItem[] = [
  {
    id: 'invoices',
    name: 'Invoices',
    icon: <Receipt className="size-4" />,
    children: [
      { id: 'inv-2024', name: '2024' },
      { id: 'inv-2025', name: '2025' },
    ],
  },
  {
    id: 'contracts',
    name: 'Client Contracts',
    icon: <Scale className="size-4" />,
    children: [
      { id: 'con-active', name: 'Active' },
      { id: 'con-archived', name: 'Archived' },
    ],
  },
  {
    id: 'tax',
    name: 'Tax Returns',
    icon: <FileText className="size-4" />,
  },
];

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['invoices'])
  );
  const [syncStatus, setSyncStatus] = useState<'synced' | 'indexing'>('synced');
  const [docCount, setDocCount] = useState<number>(0);

  const refreshCount = useCallback(async () => {
    try {
      const count = await invoke<number>('get_total_file_count');
      setDocCount(count);
    } catch {
      // Silently ignore — count stays at last known value
    }
  }, []);

  // Load initial count
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // Listen for FS changes: flash "Indexing" status, then refresh count
  useEffect(() => {
    const unlisten = listen('mundusai://fs-change', () => {
      setSyncStatus('indexing');
      refreshCount().then(() => {
        // Show "indexing" briefly, then switch back to "synced"
        setTimeout(() => setSyncStatus('synced'), 1500);
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshCount]);

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
          {mockFolders.map((folder) => {
            const isExpanded = expandedFolders.has(folder.id);
            const hasChildren = folder.children && folder.children.length > 0;

            return (
              <div key={folder.id}>
                <button
                  onClick={() => toggleFolder(folder.id)}
                  className={`
                    w-full flex items-center gap-2 px-2 py-1.5 rounded-md
                    text-sm text-text-secondary
                    hover:text-text-primary hover:bg-surface-tertiary/50
                    transition-colors duration-150 cursor-pointer
                    bg-transparent border-none text-left
                  `}
                >
                  <span className="text-text-tertiary shrink-0">
                    {hasChildren ? (
                      isExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )
                    ) : (
                      <span className="inline-block size-3.5" />
                    )}
                  </span>
                  <span className="text-text-tertiary shrink-0">{folder.icon}</span>
                  <span className="truncate">{folder.name}</span>
                </button>

                {/* Children */}
                {hasChildren && isExpanded && (
                  <div className="ml-5 pl-3 border-l border-border-subtle space-y-0.5 mt-0.5">
                    {folder.children!.map((child) => (
                      <button
                        key={child.id}
                        className={`
                          w-full flex items-center gap-2 px-2 py-1 rounded-md
                          text-sm text-text-tertiary
                          hover:text-text-secondary hover:bg-surface-tertiary/30
                          transition-colors duration-150 cursor-pointer
                          bg-transparent border-none text-left
                        `}
                      >
                        <Folder className="size-3.5 shrink-0" />
                        <span className="truncate">{child.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
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
