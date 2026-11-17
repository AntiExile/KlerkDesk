'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  FileCheck2,
  Lock,
  MessageSquareCheck,
  Pause,
  Play,
  Radar,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  SHOWCASE_SCENARIOS,
  buildQuickReplyResponse,
  filterScenarios,
  getNextScenarioIndex,
  type ShowcaseScenario,
} from './showcase-data';
import { RotatingAutopilotPhrase } from './RotatingAutopilotPhrase';

interface ExtraChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const SCENARIO_ICONS: Record<string, typeof Bot> = {
  'chief-of-staff': Bot,
  'tender-scout': Radar,
  'compliance-guard': FileCheck2,
  'approval-shield': MessageSquareCheck,
};

function BlinkingBotVisor() {
  const prefersReduced = useReducedMotion();

  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center size-10 sm:size-12 rounded-2xl bg-[#141416] border border-emerald-400/25 shadow-lg shadow-emerald-950/30 align-middle mx-1.5"
    >
      <svg
        viewBox="0 0 36 24"
        fill="none"
        className="w-6 h-4 text-emerald-400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="21"
          rx="7"
          stroke="currentColor"
          strokeWidth="2"
          className="text-emerald-400/70"
        />
        <motion.rect
          x="10"
          y="7.5"
          width="4"
          height="9"
          rx="2"
          fill="currentColor"
          animate={
            prefersReduced
              ? undefined
              : { scaleY: [1, 1, 0.12, 1, 1] }
          }
          transition={{
            duration: 3.8,
            repeat: Infinity,
            times: [0, 0.44, 0.48, 0.52, 1],
            ease: 'easeInOut',
          }}
          style={{ transformOrigin: '12px 12px' }}
        />
        <motion.rect
          x="22"
          y="7.5"
          width="4"
          height="9"
          rx="2"
          fill="currentColor"
          animate={
            prefersReduced
              ? undefined
              : { scaleY: [1, 1, 0.12, 1, 1] }
          }
          transition={{
            duration: 3.8,
            repeat: Infinity,
            times: [0, 0.44, 0.48, 0.52, 1],
            ease: 'easeInOut',
          }}
          style={{ transformOrigin: '24px 12px' }}
        />
      </svg>
    </span>
  );
}

export function HeroKineticSection() {
  const prefersReduced = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [revealStep, setRevealStep] = useState(1);
  const [approvedIds, setApprovedIds] = useState<Record<string, boolean>>({});
  const [extraMessagesByScenario, setExtraMessagesByScenario] = useState<
    Record<string, ExtraChatMessage[]>
  >({});
  const [composerValue, setComposerValue] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const activeScenario: ShowcaseScenario =
    SHOWCASE_SCENARIOS[activeIndex] ?? SHOWCASE_SCENARIOS[0];

  const filteredScenarios = useMemo(
    () => filterScenarios(SHOWCASE_SCENARIOS, searchQuery),
    [searchQuery]
  );

  // Auto-cycle through workflows like the reference videos
  useEffect(() => {
    if (!autoPlay) return;
    const interval = window.setInterval(() => {
      setActiveIndex((prev) =>
        getNextScenarioIndex(prev, SHOWCASE_SCENARIOS.length)
      );
    }, 6500);
    return () => window.clearInterval(interval);
  }, [autoPlay]);

  // Sequential message stream reveal whenever active scenario changes
  useEffect(() => {
    if (prefersReduced) {
      setRevealStep(4);
      return;
    }
    setRevealStep(1);
    const t1 = window.setTimeout(() => setRevealStep(2), 450);
    const t2 = window.setTimeout(() => setRevealStep(3), 950);
    const t3 = window.setTimeout(() => setRevealStep(4), 1450);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [activeScenario.id, prefersReduced]);

  useEffect(() => {
    if (chatScrollRef.current && (extraMessagesByScenario[activeScenario.id]?.length || approvedIds[activeScenario.id])) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    } else if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = 0;
    }
  }, [activeScenario.id, extraMessagesByScenario, approvedIds]);

  const selectScenario = (index: number) => {
    setAutoPlay(false);
    setActiveIndex(index);
  };

  const handleToggleApprove = () => {
    setAutoPlay(false);
    setApprovedIds((prev) => ({
      ...prev,
      [activeScenario.id]: !prev[activeScenario.id],
    }));
  };

  const submitQuickPrompt = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setAutoPlay(false);
    setRevealStep(4);
    const reply = buildQuickReplyResponse(activeScenario, trimmed);
    const ts = Date.now();
    setExtraMessagesByScenario((prev) => ({
      ...prev,
      [activeScenario.id]: [
        ...(prev[activeScenario.id] ?? []),
        { id: `u-${ts}`, role: 'user', text: trimmed },
        { id: `a-${ts}`, role: 'assistant', text: reply },
      ],
    }));
    setComposerValue('');
  };

  const handleComposerSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitQuickPrompt(composerValue);
  };

  const isApproved = Boolean(approvedIds[activeScenario.id]);
  const extraMessages = extraMessagesByScenario[activeScenario.id] ?? [];
  const ActiveBotIcon = SCENARIO_ICONS[activeScenario.id] ?? Bot;

  return (
    <MotionConfig reducedMotion="user">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-8 sm:pt-12 pb-8 px-4 sm:px-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(ellipse_at_top,rgba(52,211,153,0.14),transparent_65%)]"
        />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Announcement Link Bar (Video 2 inspiration) */}
          <div className="mb-5 flex justify-center">
            <Link
              href="/login?demo=true"
              className="group inline-flex items-center gap-2 rounded-full bg-[#121215] hover:bg-[#18181C] border border-white/10 px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs text-zinc-300 no-underline transition-colors whitespace-nowrap"
            >
              <span>KlerkDesk 14-day contractor pilot is live</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                Launch live demo
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>

          {/* Layered Kinetic Wordmark (Video 1 & Video 2 inspiration) */}
          <div className="relative inline-flex items-center justify-center select-none mb-4">
            <motion.span
              aria-hidden="true"
              animate={
                prefersReduced
                  ? undefined
                  : { y: [0, -6, 0], rotate: [-6, -2, -6] }
              }
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
              className="hidden sm:inline-flex absolute -left-16 -top-2 items-center justify-center"
            >
              <BlinkingBotVisor />
            </motion.span>

            <motion.span
              aria-hidden="true"
              animate={
                prefersReduced
                  ? undefined
                  : { y: [0, 6, 0], rotate: [6, 2, 6] }
              }
              transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut' }}
              className="hidden sm:inline-flex absolute -right-14 -bottom-1 size-9 rounded-lg bg-[#141416] border border-white/10 items-center justify-center text-emerald-300/80 shadow-lg"
            >
              <ShieldCheck className="size-4" />
            </motion.span>

            <div className="relative flex flex-col items-center">
              <motion.span
                aria-hidden="true"
                animate={
                  prefersReduced
                    ? undefined
                    : { y: [0, -4, 0], opacity: [0.55, 0.9, 0.55] }
                }
                transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(52,211,153,0.18)] -mb-8 sm:-mb-11"
              >
                KlerkDesk
              </motion.span>
              <motion.span
                aria-hidden="true"
                animate={
                  prefersReduced
                    ? undefined
                    : { y: [0, -2, 0], opacity: [0.7, 1, 0.7] }
                }
                transition={{
                  duration: 4.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 0.25,
                }}
                className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(52,211,153,0.34)] -mb-8 sm:-mb-11"
              >
                KlerkDesk
              </motion.span>
              <span className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-[#34D399]">
                KlerkDesk
              </span>
            </div>
          </div>

          {/* Dynamic Rotating Headline Synced with Showcase Below */}
          <h1 className="relative text-4xl sm:text-6xl font-bold tracking-tight text-white m-0 leading-[1.15] text-balance">
            <span>Your </span>
            <RotatingAutopilotPhrase word={activeScenario.autopilotWord} />
            <span> on autopilot</span>
          </h1>

          <p className="mt-4 text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Autonomous AI teammates with their own cloud desktop, POPIA compliance vault, and human Approval Shield. Built for South African tender procurement and operations teams.
          </p>

          {/* Dual Pill CTAs */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-white text-black hover:bg-zinc-200 px-6 py-2.5 text-sm font-semibold no-underline transition-colors whitespace-nowrap shrink-0"
            >
              <span>Launch KlerkDesk</span>
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login?demo=true"
              className="inline-flex items-center gap-2 rounded-full bg-[#18181B] hover:bg-[#222227] border border-white/10 text-white px-6 py-2.5 text-sm font-medium no-underline transition-colors whitespace-nowrap shrink-0"
            >
              <span>Live Interactive Demo</span>
            </Link>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-zinc-500">
            <span>14-day pilot for SA contractors</span>
            <span aria-hidden="true">·</span>
            <span>Human sign-off before every submission</span>
            <span aria-hidden="true">·</span>
            <span>Powered by MUNDUSMK</span>
          </div>
        </div>
      </section>

      {/* Interactive Cloud Desktop Showcase Frame */}
      <section id="how-it-works" className="scroll-mt-16 px-4 sm:px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-white/10 bg-[#111113] shadow-2xl shadow-black/90 overflow-hidden">
            {/* macOS Window Chrome */}
            <div className="px-4 py-3 border-b border-white/[0.06] bg-[#141416] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-[#FF5F57]" />
                  <span className="size-3 rounded-full bg-[#FEBC2E]" />
                  <span className="size-3 rounded-full bg-[#28C840]" />
                </div>
                <span className="hidden sm:inline text-[11px] font-medium text-zinc-400">
                  This computer · eTenders Sandbox
                </span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0A0A0B] border border-white/[0.06] text-[11px] font-mono text-zinc-400 truncate max-w-[260px] sm:max-w-none">
                <Lock className="size-3 text-emerald-400 shrink-0" />
                <span className="truncate">klerkdesk.mundusmk.co.za/desk</span>
              </div>

              <button
                type="button"
                onClick={() => setAutoPlay((v) => !v)}
                aria-label={autoPlay ? 'Pause live workflow tour' : 'Resume live workflow tour'}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1C1C1F] hover:bg-[#242429] border border-white/10 text-[11px] font-medium text-zinc-200 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                {autoPlay ? (
                  <>
                    <Pause className="size-3 text-emerald-400" />
                    <span>Auto-tour</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3 text-emerald-400" />
                    <span>Resume tour</span>
                  </>
                )}
              </button>
            </div>

            {/* App Shell Preview */}
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-[470px]">
              {/* Left Sidebar (Video 1 Style) */}
              <div className="border-b md:border-b-0 md:border-r border-white/[0.06] bg-[#0F0F11] p-3 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="size-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setAutoPlay(false);
                        setSearchQuery(e.target.value);
                      }}
                      aria-label="Filter active tender bots"
                      placeholder="Search bots or tenders"
                      className="w-full rounded-lg bg-[#161619] border border-white/[0.07] pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-emerald-400/50"
                    />
                  </div>

                  {/* Bots List */}
                  <div className="space-y-1">
                    <div className="px-2 pb-1 flex items-center justify-between text-[11px] font-medium text-zinc-500">
                      <span>Bots</span>
                      <span className="tabular-nums">{filteredScenarios.length}</span>
                    </div>

                    {filteredScenarios.length === 0 ? (
                      <div className="px-2.5 py-4 text-xs text-zinc-500">
                        No workflows match &ldquo;{searchQuery}&rdquo;.
                      </div>
                    ) : (
                      filteredScenarios.map((scenario) => {
                        const globalIdx = SHOWCASE_SCENARIOS.findIndex(
                          (s) => s.id === scenario.id
                        );
                        const isSelected = scenario.id === activeScenario.id;
                        const Icon = SCENARIO_ICONS[scenario.id] ?? Bot;

                        return (
                          <button
                            key={scenario.id}
                            type="button"
                            onClick={() => selectScenario(globalIdx)}
                            className="relative w-full text-left px-2.5 py-2.5 rounded-xl transition-colors cursor-pointer bg-transparent border-0"
                          >
                            {isSelected && (
                              <motion.span
                                layoutId="showcase-active-bot"
                                transition={{
                                  type: 'spring',
                                  stiffness: 380,
                                  damping: 32,
                                }}
                                className="absolute inset-0 rounded-xl bg-[#1C1C1F] border border-white/10"
                              />
                            )}
                            <div className="relative flex items-center gap-2.5">
                              <span
                                className={`size-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-400'
                                    : 'bg-[#161619] border-white/[0.07] text-zinc-400'
                                }`}
                              >
                                <Icon className="size-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-xs font-semibold text-zinc-100 truncate">
                                    {scenario.botName}
                                  </span>
                                  {isSelected && (
                                    <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                                      now
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">
                                  {scenario.sidebarStatus}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="px-3 py-2.5 rounded-xl bg-[#161619] border border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Compliance Vault</span>
                  <span className="font-mono text-amber-300 tabular-nums">
                    CSD 9d · 1 alert
                  </span>
                </div>
              </div>

              {/* Right Conversation & Agent Avatar Strip (Video 2 Style) */}
              <div className="flex flex-col justify-between bg-[#0C0C0D]">
                {/* Top Active Agent Bar + Selectable Bot Avatars */}
                <div className="px-5 py-3.5 border-b border-white/[0.06] bg-[#101012] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="size-8 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <ActiveBotIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {activeScenario.botName}
                        </span>
                        <span className="text-zinc-600" aria-hidden="true">·</span>
                        <span className="text-[11px] font-mono text-zinc-400 truncate">
                          {activeScenario.tenderNumber}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        {activeScenario.municipality} · {activeScenario.modelName}
                      </div>
                    </div>
                  </div>

                  {/* Quick Bot Avatar Switcher Strip */}
                  <div
                    role="tablist"
                    aria-label="Switch active agent teammate"
                    className="flex items-center gap-1.5"
                  >
                    {SHOWCASE_SCENARIOS.map((scenario, idx) => {
                      const Icon = SCENARIO_ICONS[scenario.id] ?? Bot;
                      const selected = idx === activeIndex;
                      return (
                        <button
                          key={scenario.id}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-label={`Select ${scenario.botName}`}
                          onClick={() => selectScenario(idx)}
                          className={`size-8 rounded-full border flex items-center justify-center cursor-pointer transition-all ${
                            selected
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 scale-105'
                              : 'bg-[#18181B] border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                          }`}
                        >
                          <Icon className="size-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Animated Chat Feed */}
                <div
                  ref={chatScrollRef}
                  className="p-5 sm:p-6 space-y-3 max-h-[450px] overflow-y-auto"
                >
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{activeScenario.timestampLabel}</span>
                    <span className="font-mono text-zinc-200 font-semibold tabular-nums">
                      {activeScenario.boqTotal}
                    </span>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeScenario.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-3.5"
                    >
                      {/* Step 1: Agent Opening */}
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.24 }}
                        className="max-w-xl rounded-2xl rounded-tl-sm bg-[#161619] border border-white/[0.08] px-4 py-3 text-xs sm:text-sm text-zinc-200 leading-relaxed tabular-nums"
                      >
                        {activeScenario.agentOpening}
                      </motion.div>

                      {/* Step 2: User Follow-up */}
                      {revealStep >= 2 && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.24 }}
                          className="flex justify-end"
                        >
                          <div className="max-w-md rounded-2xl rounded-tr-sm bg-[#242429] border border-white/15 px-4 py-2.5 text-xs sm:text-sm text-white">
                            {activeScenario.userFollowUp}
                          </div>
                        </motion.div>
                      )}

                      {/* Step 3: Typing indicator before checklist */}
                      {revealStep === 3 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-[#161619] border border-white/[0.06] px-3.5 py-2.5"
                          aria-label="Agent is preparing checklist"
                        >
                          <span className="size-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.2s]" />
                          <span className="size-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.1s]" />
                          <span className="size-1.5 rounded-full bg-zinc-400 animate-bounce" />
                        </motion.div>
                      )}

                      {/* Step 4: Agent Checklist + Interactive Approval Shield Card */}
                      {revealStep >= 4 && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.26 }}
                          className="space-y-3"
                        >
                          <div className="max-w-xl rounded-2xl rounded-tl-sm bg-[#161619] border border-white/[0.08] px-4 py-3 space-y-2.5">
                            <p className="text-xs sm:text-sm text-zinc-300 m-0">
                              {activeScenario.agentChecklistIntro}
                            </p>
                            <div className="space-y-1.5">
                              {activeScenario.checklist.map((row) => (
                                <div
                                  key={row.label}
                                  className="flex items-start gap-2 text-xs text-zinc-200 tabular-nums"
                                >
                                  {row.status === 'ok' ? (
                                    <Check className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                  ) : (
                                    <ShieldAlert className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
                                  )}
                                  <span>
                                    <strong className="font-medium text-white">
                                      {row.label}
                                    </strong>{' '}
                                    <span className="text-zinc-400">
                                      · {row.detail}
                                    </span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Approval Shield Action Card (Video 2 "Needs your OK" pattern) */}
                          <div className="max-w-xl rounded-xl bg-[#141416] border border-white/12 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              {isApproved ? (
                                <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                              ) : (
                                <ShieldCheck className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-[11px] font-mono text-zinc-400">
                                  {isApproved ? 'Executed' : 'Needs your OK'}
                                </div>
                                <div className="text-xs font-semibold text-white truncate">
                                  {isApproved
                                    ? activeScenario.approval.approvedTitle
                                    : activeScenario.approval.title}
                                </div>
                                <div className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                                  {activeScenario.approval.detail}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={handleToggleApprove}
                                className="px-3.5 py-1.5 rounded-full bg-white text-black hover:bg-zinc-200 text-xs font-semibold border-0 cursor-pointer transition-colors whitespace-nowrap"
                              >
                                {isApproved
                                  ? 'Reset'
                                  : activeScenario.approval.primaryCta}
                              </button>
                              <Link
                                href="/login?demo=true"
                                className="px-3 py-1.5 rounded-full bg-[#1C1C1F] hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-200 no-underline transition-colors whitespace-nowrap"
                              >
                                {activeScenario.approval.secondaryCta}
                              </Link>
                            </div>
                          </div>

                          {isApproved && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="max-w-xl rounded-2xl rounded-tl-sm bg-emerald-500/10 border border-emerald-400/25 px-4 py-2.5 text-xs text-emerald-200 leading-relaxed"
                            >
                              {activeScenario.approval.approvedMessage}
                            </motion.div>
                          )}
                        </motion.div>
                      )}

                      {/* Visitor-sent extra messages */}
                      {extraMessages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={
                            msg.role === 'user'
                              ? 'flex justify-end'
                              : 'flex justify-start'
                          }
                        >
                          <div
                            className={
                              msg.role === 'user'
                                ? 'max-w-md rounded-2xl rounded-tr-sm bg-[#242429] border border-white/15 px-4 py-2 text-xs text-white'
                                : 'max-w-xl rounded-2xl rounded-tl-sm bg-[#161619] border border-white/[0.08] px-4 py-2.5 text-xs text-zinc-200 leading-relaxed tabular-nums'
                            }
                          >
                            {msg.text}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Interactive Quick-Prompt Bar */}
                <div className="px-5 py-3 border-t border-white/[0.06] bg-[#101012] space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeScenario.quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submitQuickPrompt(prompt)}
                        className="px-2.5 py-1 rounded-md bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] text-[11px] text-zinc-300 cursor-pointer transition-colors whitespace-nowrap"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={handleComposerSubmit}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={composerValue}
                      onChange={(e) => {
                        setAutoPlay(false);
                        setComposerValue(e.target.value);
                      }}
                      aria-label={`Ask ${activeScenario.botName} a question`}
                      placeholder={`Ask ${activeScenario.botName} about ${activeScenario.tenderNumber}...`}
                      className="flex-1 rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50"
                    />
                    <button
                      type="submit"
                      aria-label="Send demo message"
                      className="size-8 rounded-xl bg-white text-black hover:bg-zinc-200 flex items-center justify-center border-0 cursor-pointer transition-colors shrink-0"
                    >
                      <Send className="size-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
