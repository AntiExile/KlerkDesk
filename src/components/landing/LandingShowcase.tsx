'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Lock, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { KlerkMascot } from '@/components/KlerkMascot';
import { resolveTenderMascotVariants } from '@/lib/mascot';

interface DemoThread {
  id: string;
  label: string;
  subtitle: string;
  tenderNumber: string;
  municipality: string;
  userPrompt: string;
  assistantSummary: string;
  boqTotal: string;
  complianceStatus: string;
  complianceOk: boolean;
}

const DEMO_THREADS: DemoThread[] = [
  {
    id: 'george',
    label: 'George — York St Upgrade',
    subtitle: 'Waiting on your yes • R14.9M',
    tenderNumber: 'T/GEO/042/2026',
    municipality: 'George Municipality',
    userPrompt: 'Check compliance blockers and stage our SBD 1, 4 & 6.1 returnables for York Street.',
    assistantSummary:
      'Matched CIDB 6CE PE requirement (96% fit). Stamped SBD 1, SBD 4 & SBD 6.1 (80/20 B-BBEE Level 1 = 20 pts). Net BoQ + 15% VAT reconciled at R 17 077 500.00. Paused at Approval Shield — refresh your 9-day-old CSD report before sign-off.',
    boqTotal: 'R 17 077 500.00',
    complianceStatus: 'CSD older than 7 days • Approval Shield gated',
    complianceOk: false,
  },
  {
    id: 'oudtshoorn',
    label: 'Oudtshoorn — Bulk Water',
    subtitle: 'SBD 1/4/6.1 staged • R8.4M',
    tenderNumber: 'OUD/INF/019/2026',
    municipality: 'Oudtshoorn Municipality',
    userPrompt: 'Summarize compulsory site briefing date and uPVC Class 16 pipe quantities.',
    assistantSummary:
      'Compulsory briefing in 6 days at Oudtshoorn Technical Services. Extracted 1,850 m of 350mm uPVC Class 16 mains & valve chambers into interactive BoQ. Ready for rate verification.',
    boqTotal: 'R 9 683 000.00',
    complianceStatus: 'Tax PIN, COIDA & B-BBEE Level 1 verified',
    complianceOk: true,
  },
  {
    id: 'mosselbay',
    label: 'Mossel Bay — Stormwater',
    subtitle: 'Closes in 24d • R5.0M',
    tenderNumber: 'MSB/TD/088/2026',
    municipality: 'Mossel Bay Municipality',
    userPrompt: 'Send summary to directors on WhatsApp after staging the returnable pack.',
    assistantSummary:
      'Outbound WhatsApp broadcast & eTenders submission are paused in Convex pendingApprovals. Tap Approve below or reply approve_ET-2026-WC-1044 on WhatsApp to confirm.',
    boqTotal: 'R 5 704 000.00',
    complianceStatus: 'Waiting on human Approval Shield confirmation',
    complianceOk: true,
  },
];

export function LandingShowcase() {
  const [selectedId, setSelectedId] = useState<string>('george');
  const [approvedIds, setApprovedIds] = useState<Record<string, boolean>>({});

  const active =
    DEMO_THREADS.find((t) => t.id === selectedId) ?? DEMO_THREADS[0];
  const isApproved = Boolean(approvedIds[active.id]);
  const threadMascots = resolveTenderMascotVariants(DEMO_THREADS.map((t) => t.id));

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111113] shadow-2xl shadow-black/90 overflow-hidden">
      {/* macOS Window Chrome */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-[#141416] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="size-3 rounded-full bg-[#FF5F57]" />
          <span className="size-3 rounded-full bg-[#FEBC2E]" />
          <span className="size-3 rounded-full bg-[#28C840]" />
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0A0A0B] border border-white/[0.06] text-[11px] font-mono text-zinc-400 truncate">
          <Lock className="size-3 text-emerald-400 shrink-0" />
          <span className="truncate">klerkdesk.mundusmk.co.za/desk</span>
        </div>

        <span className="hidden sm:inline text-[11px] font-medium text-zinc-500 shrink-0">
          Approval Shield
        </span>
      </div>

      {/* App Shell Preview */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] min-h-[390px]">
        {/* Left Sidebar */}
        <div className="border-b md:border-b-0 md:border-r border-white/[0.06] bg-[#0F0F11] p-3 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="rounded-xl bg-[#18181B] border border-white/[0.06] p-3 text-center">
              <div className="mx-auto flex items-center justify-center">
                <KlerkMascot variant="chief" size={56} followCursor={false} />
              </div>
              <div className="mt-1.5 text-xs font-semibold text-zinc-100">
                KlerkDesk • Chief of Staff
              </div>
              <div className="text-[11px] text-zinc-500">
                6CE PE • Western Cape
              </div>
            </div>

            <div className="space-y-1">
              <div className="px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Active Tender Threads
              </div>
              {DEMO_THREADS.map((thread) => {
                const isSelected = thread.id === active.id;
                const mascotVariant = threadMascots[thread.id] ?? 'thread_emerald';
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedId(thread.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-xl border transition-colors cursor-pointer flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-[#1C1C1F] border-white/10'
                        : 'bg-transparent hover:bg-white/[0.03] border-transparent'
                    }`}
                  >
                    <span className="size-7 rounded-lg bg-[#161619] border border-white/[0.07] flex items-center justify-center shrink-0">
                      <KlerkMascot
                        variant={mascotVariant}
                        size={20}
                        followCursor={false}
                        interactiveClick={false}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-100 truncate">
                        {thread.label}
                      </div>
                      <div className="text-[11px] text-zinc-500 tabular-nums truncate mt-0.5">
                        {thread.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-2.5 py-2 rounded-xl bg-[#161619] border border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400">
            <span>Vault Status</span>
            <span className="font-mono text-amber-300">CSD 9d • 1 alert</span>
          </div>
        </div>

        {/* Right Conversation & Approval Shield Pane */}
        <div className="p-5 sm:p-6 flex flex-col justify-between gap-5 bg-[#0C0C0D]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Sparkles className="size-3.5 text-emerald-400" />
                <span className="font-mono text-zinc-200">{active.tenderNumber}</span>
                <span>•</span>
                <span>{active.municipality}</span>
              </div>
              <span className="font-mono text-xs font-semibold text-zinc-100 tabular-nums">
                {active.boqTotal}
              </span>
            </div>

            {/* User Bubble */}
            <div className="flex justify-end">
              <div className="max-w-md rounded-2xl rounded-tr-sm bg-[#1C1C1F] border border-white/10 px-4 py-2.5 text-xs sm:text-sm text-zinc-100">
                {active.userPrompt}
              </div>
            </div>

            {/* Assistant Bubble */}
            <div className="max-w-xl rounded-2xl rounded-tl-sm bg-[#141416] border border-white/[0.07] px-4 py-3 text-xs sm:text-sm text-zinc-300 leading-relaxed tabular-nums">
              {active.assistantSummary}
            </div>

            {/* Approval Shield Card */}
            <div className="rounded-xl bg-[#141416] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {isApproved ? (
                  <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                ) : active.complianceOk ? (
                  <ShieldCheck className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <ShieldAlert className="size-4 text-amber-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-semibold text-zinc-100">
                    {isApproved
                      ? 'Demo Sign-Off Simulated (Approval Shield Cleared)'
                      : `Approval Shield • ${active.tenderNumber}`}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {active.complianceStatus}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setApprovedIds((prev) => ({
                      ...prev,
                      [active.id]: !prev[active.id],
                    }))
                  }
                  className="px-3.5 py-1.5 rounded-full bg-white text-black hover:bg-zinc-200 text-[11px] font-semibold border-none cursor-pointer transition-colors"
                >
                  {isApproved ? 'Reset Preview' : 'Simulate Sign-Off'}
                </button>
                <Link
                  href="/login?demo=true"
                  className="px-3 py-1.5 rounded-full bg-[#1C1C1F] hover:bg-zinc-800 border border-white/10 text-[11px] font-medium text-zinc-200 no-underline transition-colors"
                >
                  Open Live Desk
                </Link>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-white/[0.05]">
            <span>Click threads above to preview live tender workflows</span>
            <span className="font-mono text-zinc-400">SBD 1 / 4 / 6.1 • pdf-lib</span>
          </div>
        </div>
      </div>
    </div>
  );
}
