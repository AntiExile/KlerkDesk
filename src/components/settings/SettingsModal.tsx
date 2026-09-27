import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, Cpu } from 'lucide-react';
import { DataSyncTab } from './DataSyncTab';
import { AIEngineTab } from './AIEngineTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenModelSetup?: () => void;
}

type TabId = 'data-sync' | 'ai-engine';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'data-sync', label: 'Data Sync', icon: <Database className="size-4" /> },
  { id: 'ai-engine', label: 'AI Engine', icon: <Cpu className="size-4" /> },
];

export function SettingsModal({ isOpen, onClose, onOpenModelSetup }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('data-sync');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[680px] mx-4"
          >
            <div className="bg-surface-secondary border border-border-default rounded-xl shadow-2xl shadow-black/40 overflow-hidden max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
                <h2 className="text-base font-semibold text-text-primary">
                  Settings
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="size-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary transition-colors cursor-pointer border-none bg-transparent"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Tab Bar */}
              <div className="flex gap-1 px-5 pt-3 border-b border-border-subtle shrink-0">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      relative flex items-center gap-2 px-3 py-2 text-sm font-medium
                      rounded-t-lg transition-colors duration-150
                      cursor-pointer border-none bg-transparent
                      ${activeTab === tab.id
                        ? 'text-text-primary'
                        : 'text-text-tertiary hover:text-text-secondary'
                      }
                    `}
                  >
                    {tab.icon}
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="settings-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500 rounded-full"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {activeTab === 'data-sync' && <DataSyncTab />}
                {activeTab === 'ai-engine' && <AIEngineTab onOpenModelSetup={onOpenModelSetup} />}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
