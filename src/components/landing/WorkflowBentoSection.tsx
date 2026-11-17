'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Clock,
  FileCheck2,
  Lock,
  MessageSquareCheck,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

interface WorkflowSpec {
  id: string;
  step: string;
  title: string;
  summary: string;
  metricLabel: string;
  metricValue: string;
  rows: Array<{ label: string; value: string; state: 'ok' | 'warn' }>;
}

const WORKFLOW_SPECS: WorkflowSpec[] = [
  {
    id: 'scan',
    step: '01.',
    title: '06:30 SAST Portal Scans',
    summary:
      'Monitors eTenders OCDS & Western Cape municipal feeds every morning and ranks opportunities against your CIDB grade.',
    metricLabel: 'Daily Match Scan',
    metricValue: '4 Active Bids · R 47.4M',
    rows: [
      { label: 'George · T/GEO/042/2026 (6CE)', value: '96% fit · R 14.9M', state: 'ok' },
      { label: 'Oudtshoorn · OUD/INF/019 (5CE)', value: '92% fit · R 8.4M', state: 'ok' },
      { label: 'Mossel Bay · MSB/TD/088 (4CE)', value: '89% fit · R 5.0M', state: 'ok' },
    ],
  },
  {
    id: 'vault',
    step: '02.',
    title: 'Compliance Vault Expiry Rules',
    summary:
      'Enforces South African public procurement freshness thresholds automatically before any bid is staged.',
    metricLabel: 'POPIA Isolated Storage',
    metricValue: '6 Mandatory Docs',
    rows: [
      { label: 'CSD Report MAAA0948215', value: '7-day rule · 9d old (refresh)', state: 'warn' },
      { label: 'CIPC CoR 14.3 & Certified IDs', value: '90-day SAPS rule tracked', state: 'warn' },
      { label: 'Tax PIN, COIDA & B-BBEE Level 1', value: 'Verified & current', state: 'ok' },
    ],
  },
  {
    id: 'sbd',
    step: '03.',
    title: 'Deterministic SBD 1, 4 & 6.1 Stamping',
    summary:
      'Reconciles Bill of Quantities unit rates with 15% VAT and stamps official National Treasury returnable PDFs via pdf-lib.',
    metricLabel: 'Bid Room Automation',
    metricValue: '12-Page Pack Ready',
    rows: [
      { label: 'SBD 1 Invitation to Bid', value: 'Stamped with CSD & Tax PIN', state: 'ok' },
      { label: 'SBD 4 Bidder Disclosure', value: 'Director declarations locked', state: 'ok' },
      { label: 'SBD 6.1 Preference Points', value: '80/20 B-BBEE Level 1 = 20 pts', state: 'ok' },
    ],
  },
  {
    id: 'shield',
    step: '04.',
    title: 'WhatsApp & Web Approval Shield',
    summary:
      'Every eTenders upload, outbound email, or WhatsApp broadcast pauses in pending_approval until an authenticated director confirms.',
    metricLabel: 'Zero Unapproved Actions',
    metricValue: 'Human Sign-Off Gate',
    rows: [
      { label: 'Convex pendingApprovals record', value: 'Written before browser action', state: 'ok' },
      { label: 'Cloud Desktop Sandbox', value: 'noEnv: true · 10-min TTL', state: 'ok' },
      { label: 'HMAC-SHA256 WhatsApp Webhook', value: 'One-tap director confirmation', state: 'ok' },
    ],
  },
];

const SHIELD_STAGES = [
  {
    id: 'extract',
    label: '01. Extract & Stamp',
    title: 'BoQ & SBD Returnables Stamped',
    detail:
      'Agents extract tender schedules via unpdf, pre-fill rates in tabular ZAR, and stamp SBD 1/4/6.1 without touching live portal credentials.',
  },
  {
    id: 'vault',
    label: '02. Vault Check',
    title: '7-Day CSD & 90-Day CIPC Gate',
    detail:
      'Compliance Vault blocks staging automatically if CSD > 7 days, CIPC/IDs > 90 days, or Tax PIN / COIDA certificates are expired.',
  },
  {
    id: 'pending',
    label: '03. pending_approval',
    title: 'Execution Halts at Approval Shield',
    detail:
      'A cryptographic pending_approval record is written to Convex and dispatched to the Bid Room and director WhatsApp.',
  },
  {
    id: 'signoff',
    label: '04. Director Sign-Off',
    title: 'Authenticated Release on eTenders',
    detail:
      'Only after an authenticated operator clicks Approve in /bid/[id] or confirms via signed WhatsApp webhook does submission proceed.',
  },
];

export function WorkflowBentoSection() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('scan');
  const [selectedStageId, setSelectedStageId] = useState<string>('pending');

  const activeWorkflow =
    WORKFLOW_SPECS.find((w) => w.id === selectedWorkflowId) ?? WORKFLOW_SPECS[0];
  const activeStage =
    SHIELD_STAGES.find((s) => s.id === selectedStageId) ?? SHIELD_STAGES[2];

  return (
    <MotionConfig reducedMotion="user">
      {/* Asymmetric Interactive Workflows Bento */}
      <section id="workflows" className="scroll-mt-16 px-4 sm:px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-medium text-emerald-400 mb-2">
              Autonomous Tender Ops &amp; Back-Office Workflows
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white m-0 text-balance">
              Built for zero missed tenders and zero expired certificates
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Selector Column (5 cols) */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-2">
              {WORKFLOW_SPECS.map((spec) => {
                const isSelected = spec.id === activeWorkflow.id;
                return (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => setSelectedWorkflowId(spec.id)}
                    className={`relative w-full text-left rounded-xl p-4 border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#141416] border-white/15'
                        : 'bg-[#0F0F11] hover:bg-[#141416]/70 border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-white">
                          <span className="font-mono text-emerald-400 mr-2">
                            {spec.step}
                          </span>
                          {spec.title}
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed m-0">
                          {spec.summary}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Animated Stage Column (7 cols) */}
            <div className="lg:col-span-7 rounded-2xl bg-[#111113] border border-white/10 p-6 sm:p-7 flex flex-col justify-between gap-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeWorkflow.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/[0.06]">
                    <div>
                      <div className="text-xs text-zinc-400">
                        {activeWorkflow.metricLabel}
                      </div>
                      <div className="text-lg font-semibold text-white tabular-nums mt-0.5">
                        {activeWorkflow.metricValue}
                      </div>
                    </div>
                    <Link
                      href="/login?demo=true"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 no-underline transition-colors whitespace-nowrap"
                    >
                      <span>Open in Live Desk</span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>

                  <div className="space-y-2.5">
                    {activeWorkflow.rows.map((row) => (
                      <div
                        key={row.label}
                        className="rounded-xl bg-[#0C0C0D] border border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {row.state === 'ok' ? (
                            <Check className="size-4 text-emerald-400 shrink-0" />
                          ) : (
                            <ShieldAlert className="size-4 text-amber-400 shrink-0" />
                          )}
                          <span className="text-xs sm:text-sm font-medium text-zinc-100 truncate">
                            {row.label}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-zinc-400 tabular-nums shrink-0">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <span>South African Public Procurement · eTenders OCDS</span>
                <span className="font-mono text-zinc-400">
                  Convex + OpenRouter + pdf-lib
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Security & Approval Shield Pipeline */}
      <section id="security" className="scroll-mt-16 px-4 sm:px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto rounded-2xl bg-[#111113] border border-white/10 p-6 sm:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-400">
                <ShieldCheck className="size-4" />
                <span>POPIA Compliant · Mandatory Approval Shield</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white m-0">
                Agents prepare the bid. Directors hold the submit key.
              </h2>
            </div>

            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5 text-emerald-400" />
                <span>User-scoped Vault</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5 text-emerald-400" />
                <span>10-min sandbox TTL</span>
              </span>
            </div>
          </div>

          {/* Interactive 4-Step Pipeline Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {SHIELD_STAGES.map((stage) => {
              const active = stage.id === activeStage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`text-left rounded-xl px-3.5 py-3 border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1C1C1F] border-emerald-400/40 text-white'
                      : 'bg-[#0C0C0D] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="text-xs font-mono text-emerald-400">
                    {stage.label}
                  </div>
                  <div className="text-xs font-semibold mt-1 truncate">
                    {stage.title}
                  </div>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeStage.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl bg-[#0C0C0D] border border-white/[0.08] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="text-sm font-semibold text-white">
                  {activeStage.title}
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed m-0">
                  {activeStage.detail}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 text-xs font-mono text-zinc-300">
                <FileCheck2 className="size-4 text-emerald-400" />
                <span>noEnv: true</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </MotionConfig>
  );
}
