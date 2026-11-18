'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ShieldCheck,
  FileUp,
  MonitorPlay,
  Settings,
  Scale,
  Sparkles,
} from 'lucide-react';

import { getShortTenderLabel, formatSpacedRand } from '@/lib/format';
import type { TenderMatch } from '@/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  activeTender?: TenderMatch;
  onSelectTender?: (tenderId: string) => void;
  onOpenComplianceUploader?: () => void;
  onOpenSettings?: () => void;
  onAskPrompt?: (prompt: string) => void;
  onOpenLiveSandbox?: () => void;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  shortcut?: string;
}

function buildQuickActions(activeTender?: TenderMatch): QuickAction[] {
  return [
    {
      id: 'upload-compliance',
      title: 'Open Compliance Vault',
      description: 'Review or upload CSD (7d), CIPC/ID (90d), Tax PIN, COIDA & B-BBEE',
      icon: <ShieldCheck className="size-4" />,
      shortcut: 'A',
    },
    {
      id: 'open-bid',
      title: activeTender
        ? `Inspect ${getShortTenderLabel(activeTender)}`
        : 'Open Contractor Onboarding',
      description: activeTender
        ? `Open ${formatSpacedRand(activeTender.estimatedValueZar)} bid, BoQ pricing & Approval Shield`
        : 'Configure company registration, MAAA number & procurement sectors',
      icon: <FileUp className="size-4" />,
      shortcut: 'B',
    },
    {
      id: 'live-sandbox',
      title: 'Toggle Live Browser Sandbox',
      description: 'Slide open the managed Chromium/Ubuntu desktop & Stagehand trace',
      icon: <MonitorPlay className="size-4" />,
    },
    {
      id: 'audit-sbd',
      title: 'Run Full PDF Audit (Claude Sonnet 5.5)',
      description: 'Check mandatory SBD 1/4/6.1 returnables and Compliance Vault blocks',
      icon: <Scale className="size-4" />,
      shortcut: 'C',
    },
    {
      id: 'ask-compliance',
      title: 'Ask KlerkDesk About Active Bids',
      description: 'Query DeepSeek v4 Flash on municipal deadlines and compliance flags',
      icon: <Sparkles className="size-4" />,
    },
    {
      id: 'settings',
      title: 'Contractor & Region Settings',
      description: 'Configure CIDB grade, directors, WhatsApp & $15/mo OpenRouter cap',
      icon: <Settings className="size-4" />,
      shortcut: '⌘,',
    },
  ];
}

export function CommandPalette({
  isOpen,
  onClose,
  activeTender,
  onSelectTender,
  onOpenComplianceUploader,
  onOpenSettings,
  onAskPrompt,
  onOpenLiveSandbox,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions = buildQuickActions(activeTender);
  const filtered = quickActions.filter(
    (action) =>
      action.title.toLowerCase().includes(query.toLowerCase()) ||
      action.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const handleSelect = useCallback(
    (action: QuickAction) => {
      switch (action.id) {
        case 'open-bid':
          if (activeTender) {
            if (onSelectTender) {
              onSelectTender(activeTender.id);
            } else {
              router.push(`/bid/${activeTender.id}`);
            }
          } else {
            router.push('/onboarding');
          }
          break;
        case 'upload-compliance':
          onOpenComplianceUploader?.();
          break;
        case 'live-sandbox':
          onOpenLiveSandbox?.();
          break;
        case 'settings':
          onOpenSettings?.();
          break;
        case 'audit-sbd':
          onAskPrompt?.(
            activeTender
              ? `Run a full tender PDF audit on ${activeTender.tenderNumber} and verify SBD 1, SBD 4, SBD 6.1 compliance.`
              : 'Audit our active Compliance Vault documents against SBD 1, SBD 4, and SBD 6.1 requirements.'
          );
          break;
        case 'ask-compliance':
          onAskPrompt?.(
            'Summarize the blocking compliance docs and closing dates from our active tenders.'
          );
          break;
      }
      onClose();
    },
    [
      activeTender,
      onAskPrompt,
      onClose,
      onOpenComplianceUploader,
      onOpenLiveSandbox,
      onOpenSettings,
      onSelectTender,
      router,
    ]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

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
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="fixed z-50 top-[18%] left-1/2 -translate-x-1/2 w-full max-w-[560px] px-4"
          >
            <div className="bg-[#141416] border border-white/10 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden">
              <div className="flex items-center gap-3 px-4 border-b border-white/[0.06]">
                <Search className="size-4 text-zinc-500 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Jump to Compliance Vault, George bid, or sandbox..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-100 placeholder:text-zinc-500 py-3.5 h-12"
                />
                <kbd className="hidden sm:inline-flex text-[10px] font-mono text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.08]">
                  ESC
                </kbd>
              </div>

              <div className="max-h-[320px] overflow-y-auto p-1.5">
                {filtered.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-zinc-500">
                    No matching actions
                  </div>
                ) : (
                  filtered.map((action, index) => (
                    <button
                      type="button"
                      key={action.id}
                      onClick={() => handleSelect(action)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                        text-left transition-colors duration-100
                        cursor-pointer border-none
                        ${
                          index === selectedIndex
                            ? 'bg-white/[0.08] text-zinc-100'
                            : 'bg-transparent text-zinc-300 hover:bg-white/[0.04]'
                        }
                      `}
                    >
                      <div className="size-8 rounded-lg bg-[#1C1C1F] border border-white/[0.06] flex items-center justify-center shrink-0 text-zinc-300">
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {action.title}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          {action.description}
                        </div>
                      </div>
                      {action.shortcut && (
                        <kbd className="text-[10px] font-mono text-zinc-400 bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.08] shrink-0">
                          {action.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
