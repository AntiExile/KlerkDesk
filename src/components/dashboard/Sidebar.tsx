'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Inbox,
  Sparkles,
  FileUp,
  MonitorPlay,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { formatMillionsRand, formatShortClosingDate, getShortTenderLabel } from '@/lib/format';
import type { ComplianceSummary, TenderMatch } from '@/types';

interface SidebarProps {
  compliance: ComplianceSummary;
  tenders: TenderMatch[];
  activeBidId?: string;
  onOpenSettings: () => void;
  onOpenVaultModal: () => void;
  onOpenCommandPalette: () => void;
  onOpenLiveSandbox: () => void;
  onTriggerNewScan: () => void;
}

const TENDER_GEOMETRIC_STYLES = [
  'bg-amber-500/15 text-amber-300 border-amber-400/20',
  'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  'bg-sky-500/15 text-sky-300 border-sky-400/20',
  'bg-violet-500/15 text-violet-300 border-violet-400/20',
];

function getTenderThreadSubtitle(tender: TenderMatch, idx: number): string {
  const value = formatMillionsRand(tender.estimatedValueZar);
  if (tender.status === 'submitted') {
    return `Submitted • ${value}`;
  }
  if (idx === 0 || tender.status === 'staging' || tender.status === 'pending_approval') {
    return `Waiting on your yes • ${value}`;
  }
  if (idx === 1) {
    return `SBD 1/4/6.1 staged • ${value}`;
  }
  return `Closes ${formatShortClosingDate(tender.closingDate)} • ${value}`;
}

export function Sidebar({
  compliance,
  tenders,
  activeBidId,
  onOpenSettings,
  onOpenVaultModal,
  onOpenCommandPalette,
  onOpenLiveSandbox,
  onTriggerNewScan,
}: SidebarProps) {
  const pathname = usePathname();
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const quickMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setQuickMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [quickMenuOpen]);

  const attentionCount = compliance.blockingAlerts.length;
  const vaultChips = [
    { key: 'tax_pin', label: 'Tax' },
    { key: 'csd', label: 'CSD' },
    { key: 'coida', label: 'COIDA' },
    { key: 'bbbee', label: 'B-BBEE' },
  ] as const;

  return (
    <aside className="w-[240px] h-dvh flex flex-col bg-[#111113] border-r border-white/[0.06] shrink-0 select-none">
      {/* Top Bar: Search (⌘K) + Quick Action (+) */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex-1 h-8 px-2.5 rounded-lg bg-[#18181B]/90 hover:bg-[#1C1C1F] border border-white/[0.06] flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Search className="size-3.5 text-zinc-500" />
            <span>Search</span>
          </span>
          <kbd className="font-mono text-[10px] text-zinc-500">⌘K</kbd>
        </button>

        <div className="relative" ref={quickMenuRef}>
          <button
            type="button"
            onClick={() => setQuickMenuOpen((v) => !v)}
            aria-expanded={quickMenuOpen}
            aria-label="Quick actions"
            className="size-8 rounded-lg bg-[#18181B]/90 hover:bg-[#1C1C1F] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <Plus className="size-3.5" />
          </button>

          <AnimatePresence>
            {quickMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                className="absolute left-0 top-10 z-40 w-52 rounded-xl bg-[#18181B] border border-white/10 shadow-2xl shadow-black/70 p-1.5 space-y-0.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    onTriggerNewScan();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:bg-white/[0.06] text-left border-none bg-transparent cursor-pointer"
                >
                  <Sparkles className="size-3.5 text-zinc-400" />
                  <span>New tender scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    onOpenVaultModal();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:bg-white/[0.06] text-left border-none bg-transparent cursor-pointer"
                >
                  <FileUp className="size-3.5 text-zinc-400" />
                  <span>Upload compliance doc</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    onOpenLiveSandbox();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:bg-white/[0.06] text-left border-none bg-transparent cursor-pointer"
                >
                  <MonitorPlay className="size-3.5 text-zinc-400" />
                  <span>Open live sandbox</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Primary Nav: Single Inbox / Vault Row */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onOpenVaultModal}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
            pathname === '/vault'
              ? 'bg-[#1C1C1F] text-zinc-100 border-white/[0.08]'
              : 'bg-transparent hover:bg-white/[0.04] text-zinc-300 border-transparent'
          }`}
        >
          <span className="flex items-center gap-2">
            <Inbox className="size-3.5 text-zinc-400" />
            <span>Inbox / Vault</span>
          </span>
          {attentionCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-white/[0.08] text-zinc-200 font-mono text-[10px] tabular-nums">
              {attentionCount}
            </span>
          )}
        </button>
      </div>

      {/* Pinned Chief of Staff Hero Card */}
      <div className="px-3 pb-4">
        <Link
          href="/"
          className="block rounded-2xl bg-[#18181B]/80 hover:bg-[#1C1C1F] border border-white/[0.06] p-3.5 text-center transition-colors no-underline"
        >
          <div className="relative mx-auto size-9 rounded-xl bg-gradient-to-b from-zinc-700/60 to-zinc-900 border border-white/10 flex items-center justify-center shadow-inner">
            <span className="text-xs font-semibold tracking-tight text-zinc-100">
              M
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[#18181B] ${
                compliance.isBidReady ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>
          <div className="mt-2 text-xs font-medium text-zinc-100">
            Mundus Ops
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Chief of Staff • 6CE PE
          </div>
        </Link>
      </div>

      {/* Active Tender Threads ("Waiting on your yes" Pattern) */}
      <div className="flex-1 overflow-y-auto px-2.5 space-y-0.5">
        <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
          Tender Threads
        </div>

        {tenders.map((tender, idx) => {
          const isCurrent = activeBidId === tender.id || pathname === `/bid/${tender.id}`;
          const geometricStyle =
            TENDER_GEOMETRIC_STYLES[idx % TENDER_GEOMETRIC_STYLES.length];
          const subtitle = getTenderThreadSubtitle(tender, idx);

          return (
            <Link
              key={tender.id}
              href={`/bid/${tender.id}`}
              className={`flex items-start gap-2.5 px-2.5 py-2 rounded-xl transition-colors no-underline ${
                isCurrent
                  ? 'bg-[#1C1C1F] border border-white/[0.07]'
                  : 'hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span
                className={`mt-0.5 size-6 rounded-lg border flex items-center justify-center shrink-0 text-[10px] font-semibold ${geometricStyle}`}
              >
                {idx % 2 === 0 ? '◆' : '●'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {getShortTenderLabel(tender)}
                </div>
                <div className="text-[11px] text-zinc-500 truncate tabular-nums mt-0.5">
                  {subtitle}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Bottom Footer Bar: WM Initials + Sleek Compliance Vault Pill */}
      <div className="p-2.5 border-t border-white/[0.06] flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSettings}
          title="Contractor profile & settings"
          className="size-8 rounded-full bg-[#1C1C1F] hover:bg-zinc-800 border border-white/[0.08] flex items-center justify-center text-[11px] font-semibold text-zinc-200 shrink-0 cursor-pointer transition-colors"
        >
          WM
        </button>

        <button
          type="button"
          onClick={onOpenVaultModal}
          className="flex-1 h-8 px-2.5 rounded-full bg-[#18181B] hover:bg-[#1C1C1F] border border-white/[0.06] flex items-center justify-between gap-1.5 cursor-pointer transition-colors min-w-0"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300 truncate">
            <ShieldCheck className="size-3 text-zinc-400 shrink-0" />
            <span className="truncate">Vault</span>
          </span>
          <span className="flex items-center gap-1 shrink-0" aria-label="Tax, CSD, COIDA, B-BBEE status">
            {vaultChips.map((chip) => {
              const doc = compliance.docs.find((d) => d.type === chip.key);
              const color =
                doc?.status === 'valid'
                  ? 'bg-emerald-400'
                  : doc?.status === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-rose-400';
              return (
                <span
                  key={chip.key}
                  title={`${chip.label}: ${doc?.status ?? 'missing'}`}
                  className={`size-1.5 rounded-full ${color}`}
                />
              );
            })}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="size-8 rounded-full bg-transparent hover:bg-white/[0.05] border-none flex items-center justify-center text-zinc-500 hover:text-zinc-200 shrink-0 cursor-pointer transition-colors"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
