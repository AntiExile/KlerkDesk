'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Cpu } from 'lucide-react';
import { DataSyncTab } from './DataSyncTab';
import { AIEngineTab } from './AIEngineTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenModelSetup?: () => void;
}

type TabId = 'contractor-profile' | 'ai-sandbox';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'contractor-profile', label: 'Contractor & Regions', icon: <Building2 className="size-3.5" /> },
  { id: 'ai-sandbox', label: 'OpenRouter & boat.dev', icon: <Cpu className="size-3.5" /> },
];

export function SettingsModal({ isOpen, onClose, onOpenModelSetup }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('contractor-profile');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[680px] px-4"
          >
            <div className="bg-[#141416] border border-white/10 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                <h2 className="text-sm font-semibold text-zinc-100 m-0">
                  KlerkDesk Settings
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="size-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer border-none bg-transparent"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex gap-1 px-5 pt-2.5 border-b border-white/[0.06] shrink-0">
                {TABS.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      relative flex items-center gap-2 px-3 py-2 text-xs font-medium
                      transition-colors duration-150
                      cursor-pointer border-none bg-transparent
                      ${activeTab === tab.id ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}
                    `}
                  >
                    {tab.icon}
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="settings-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200 rounded-full"
                        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {activeTab === 'contractor-profile' && <DataSyncTab />}
                {activeTab === 'ai-sandbox' && (
                  <AIEngineTab onOpenModelSetup={onOpenModelSetup} />
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
