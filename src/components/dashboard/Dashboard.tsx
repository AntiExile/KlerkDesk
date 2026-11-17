'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus,
  ArrowUp,
  PanelRight,
  Menu,
  X,
  Square,
  Download,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MessageBubble } from './MessageBubble';
import { CommandPalette } from '@/components/CommandPalette';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { ModelSetupModal } from '@/components/ModelSetupModal';
import { LiveSandboxDrawer } from '@/components/bid/LiveSandboxDrawer';
import {
  useResolveApprovalShieldMutation,
  useTenderWorkspaceQuery,
  useTriggerApprovalShieldMutation,
} from '@/lib/convex-react';
import { askTenderQuestionAction } from '@/app/actions/chat';
import {
  formatSpacedRand,
  getShortTenderLabel,
} from '@/lib/format';
import type {
  ApprovalShieldState,
  BoQItem,
  ComplianceDocType,
  ComplianceSummary,
  Message,
  TenderMatch,
} from '@/types';

interface DashboardProps {
  initialCompliance: ComplianceSummary;
  initialTenders: TenderMatch[];
  activeTender?: TenderMatch;
  initialBoq?: BoQItem[];
  initialApprovals?: ApprovalShieldState[];
  defaultVaultModalOpen?: boolean;
  defaultSandboxDrawerOpen?: boolean;
}

export function Dashboard({
  initialCompliance,
  initialTenders,
  activeTender,
  initialBoq = [],
  initialApprovals = [],
  defaultVaultModalOpen = false,
  defaultSandboxDrawerOpen = false,
}: DashboardProps) {
  const router = useRouter();
  const {
    compliance,
    tenders,
    boqItems: liveBoqItems,
    approvals,
    stagedPdf,
  } = useTenderWorkspaceQuery({
    bidId: activeTender?.id,
    initialCompliance,
    initialTenders,
    initialBoq,
    initialApprovals,
  });

  const triggerApproval = useTriggerApprovalShieldMutation();
  const resolveApproval = useResolveApprovalShieldMutation();

  const selectedTender =
    tenders.find((t) => t.id === activeTender?.id) ?? activeTender ?? tenders[0];
  const [boqItems, setBoqItems] = useState<BoQItem[]>(
    liveBoqItems.length > 0 ? liveBoqItems : initialBoq
  );

  useEffect(() => {
    if (liveBoqItems.length > 0) {
      setBoqItems(liveBoqItems);
    }
  }, [liveBoqItems]);

  const [isVaultOpen, setIsVaultOpen] = useState(defaultVaultModalOpen);
  const [vaultDocType, setVaultDocType] = useState<ComplianceDocType | null>(null);
  const [isSandboxOpen, setIsSandboxOpen] = useState(defaultSandboxDrawerOpen);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null);

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openVault = useCallback((docType: ComplianceDocType | null = null) => {
    setVaultDocType(docType);
    setIsVaultOpen(true);
  }, []);

  const sendConversationalPrompt = useCallback(
    async (promptText: string, mode: 'chat' | 'pdf_audit' = 'chat') => {
      const trimmed = promptText.trim();
      if (!trimmed || isStreaming) return;

      setIsStreaming(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        contentType: 'text',
      };

      const aiMsgId = crypto.randomUUID();
      const pendingAi: Message = {
        id: aiMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        contentType: 'markdown',
        isThinking: true,
      };

      setMessages((prev) => [...prev, userMsg, pendingAi]);
      setInput('');
      setDroppedFileName(null);

      setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);

      try {
        const res = await askTenderQuestionAction({
          prompt: trimmed,
          bidId: selectedTender?.id,
          mode,
        });

        let shieldApprovalId: string | undefined;
        if (res.requiresApprovalShield && selectedTender) {
          const subtotal =
            boqItems.length > 0
              ? boqItems.reduce((s, r) => s + r.quantity * r.rateZar, 0)
              : selectedTender.estimatedValueZar;
          const vat = Math.round(subtotal * 0.15 * 100) / 100;
          const grand = Math.round((subtotal + vat) * 100) / 100;

          const created = await triggerApproval({
            bidId: selectedTender.id,
            tenderNumber: selectedTender.tenderNumber,
            actionType: 'submit_etenders',
            totalBidZar: subtotal,
            vatZar: vat,
            grandTotalZar: grand,
            targetResource: selectedTender.portalUrl,
            commandPreview: `stagehand.submitBid({ tender: "${selectedTender.tenderNumber}", total: "${formatSpacedRand(grand)}" })`,
          });
          shieldApprovalId = created.id;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content: res.answer,
                  isThinking: false,
                  thinkingSteps: res.thinkingSteps,
                  thinkingDuration: res.durationMs,
                  sources: res.sources,
                  modelUsed: res.model,
                  actionApproval: shieldApprovalId
                    ? {
                        id: shieldApprovalId,
                        title: `Approval Shield — ${selectedTender?.tenderNumber}`,
                        description:
                          'Paused in Convex pendingApprovals. Sign off when ready.',
                        targetResource: selectedTender?.portalUrl,
                        riskLevel: compliance.isBidReady ? 'low' : 'high',
                        confidenceScore: 0.96,
                        status: 'pending',
                      }
                    : undefined,
                }
              : m
          )
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content:
                    err instanceof Error
                      ? `Could not reach OpenRouter: ${err.message}`
                      : 'Unable to process request.',
                  isThinking: false,
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    },
    [boqItems, compliance.isBidReady, isStreaming, selectedTender]
  );

  // Global keyboard shortcuts (⌘K, ⌘,, and A / B / C quick choices when idle)
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (
        isTyping ||
        isVaultOpen ||
        isCommandPaletteOpen ||
        isSettingsOpen ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        openVault('csd');
      } else if (key === 'b') {
        e.preventDefault();
        if (activeTender) {
          setIsSandboxOpen(true);
        } else {
          router.push(`/bid/${selectedTender?.id ?? 'ET-2026-WC-0842'}`);
        }
      } else if (key === 'c') {
        e.preventDefault();
        sendConversationalPrompt(
          `Run a full tender PDF audit on ${selectedTender?.tenderNumber ?? 'T/GEO/042/2026'} and check SBD 1/4/6.1.`,
          'pdf_audit'
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTender,
    isCommandPaletteOpen,
    isSettingsOpen,
    isVaultOpen,
    openVault,
    router,
    selectedTender,
    sendConversationalPrompt,
  ]);

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendConversationalPrompt(input);
    }
  };

  const handleDropPdf = (e: DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsDraggingPdf(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setDroppedFileName(file.name);
      sendConversationalPrompt(
        `Audit uploaded tender PDF "${file.name}" against SBD 1/4/6.1 and our Compliance Vault.`,
        'pdf_audit'
      );
    }
  };

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDroppedFileName(file.name);
      sendConversationalPrompt(
        `Audit uploaded tender PDF "${file.name}" against SBD 1/4/6.1 and our Compliance Vault.`,
        'pdf_audit'
      );
    }
  };

  const csdDoc = compliance.docs.find((d) => d.type === 'csd');
  const cipcDoc = compliance.docs.find((d) => d.type === 'cipc');
  const hasComplianceHold = !compliance.isBidReady;

  const bubble3Copy = hasComplianceHold
    ? `Hold up on submission though — your CSD report is ${csdDoc?.ageDays ?? 9} days old and certified CIPC is ${cipcDoc?.ageDays ?? 96} days old. Everything else is staged and waiting on your yes.`
    : `All 6 compliance docs are green. Your George bid (${formatSpacedRand(14_850_000)}) is staged and waiting on your yes.`;

  const choiceCards = [
    {
      key: 'A',
      title: hasComplianceHold
        ? 'Review & upload CSD + CIPC in Compliance Vault'
        : 'Inspect verified Compliance Vault (all 6 docs valid)',
      subtitle: hasComplianceHold
        ? 'CSD exceeds 7-day rule • CIPC exceeds 90-day rule'
        : 'Tax PIN, CSD, COIDA, B-BBEE, CIPC & IDs active',
      onClick: () => openVault(hasComplianceHold ? 'csd' : null),
    },
    {
      key: 'B',
      title: 'Inspect George — York St Upgrade BoQ & Approval Shield',
      subtitle: `Waiting on your yes • ${formatSpacedRand(14_850_000)} • CIDB 6CE`,
      onClick: () => {
        if (activeTender) {
          setIsSandboxOpen(true);
        } else {
          router.push(`/bid/${selectedTender?.id ?? 'ET-2026-WC-0842'}`);
        }
      },
    },
    {
      key: 'C',
      title: 'Run Claude Sonnet 5.5 audit on SBD 1 / 4 / 6.1 returnables',
      subtitle: 'Checks compulsory clauses, PPR 2022 80/20 points & BoQ VAT',
      onClick: () =>
        sendConversationalPrompt(
          `Run a full tender PDF audit on ${selectedTender?.tenderNumber ?? 'T/GEO/042/2026'} and verify SBD 1, SBD 4, and SBD 6.1.`,
          'pdf_audit'
        ),
    },
  ];

  const bubbleSpring = {
    type: 'spring' as const,
    stiffness: 400,
    damping: 34,
  };

  return (
    <div className="flex h-dvh w-full bg-[#0C0C0D] text-zinc-100 overflow-hidden">
      {/* Desktop Minimalist Left Sidebar (240px) */}
      <div className="hidden md:flex h-full">
        <Sidebar
          compliance={compliance}
          tenders={tenders}
          activeBidId={activeTender?.id}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenVaultModal={() => openVault(null)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenLiveSandbox={() => setIsSandboxOpen(true)}
          onTriggerNewScan={() =>
            sendConversationalPrompt(
              'Scan eTenders OCDS API and Western Cape municipal portals for fresh 6CE civil opportunities.'
            )
          }
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden flex bg-black/70 backdrop-blur-sm"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            className="h-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar
              compliance={compliance}
              tenders={tenders}
              activeBidId={activeTender?.id}
              onOpenSettings={() => {
                setMobileSidebarOpen(false);
                setIsSettingsOpen(true);
              }}
              onOpenVaultModal={() => {
                setMobileSidebarOpen(false);
                openVault(null);
              }}
              onOpenCommandPalette={() => {
                setMobileSidebarOpen(false);
                setIsCommandPaletteOpen(true);
              }}
              onOpenLiveSandbox={() => {
                setMobileSidebarOpen(false);
                setIsSandboxOpen(true);
              }}
              onTriggerNewScan={() => {
                setMobileSidebarOpen(false);
                sendConversationalPrompt(
                  'Scan eTenders OCDS API and Western Cape municipal portals for fresh 6CE civil opportunities.'
                );
              }}
            />
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close sidebar"
              className="absolute top-3 right-[-42px] size-8 rounded-full bg-[#18181B] border border-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Centered Stream Canvas (70%+ negative space around max-w-2xl) */}
      <div className="flex-1 flex flex-col min-w-0 h-dvh relative">
        {/* Top Header Strip */}
        <header className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-[88px]">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open menu"
              className="md:hidden size-8 rounded-full bg-[#18181B] border border-white/[0.06] flex items-center justify-center text-zinc-400 cursor-pointer"
            >
              <Menu className="size-4" />
            </button>
          </div>

          {/* Centered Active Bot / Tender Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#141416] border border-white/[0.06] text-xs font-medium text-zinc-200 truncate max-w-[280px] sm:max-w-md">
            <span
              className={`size-1.5 rounded-full shrink-0 ${
                compliance.isBidReady ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="truncate">
              {activeTender
                ? `KlerkDesk • ${getShortTenderLabel(activeTender)}`
                : 'KlerkDesk'}
            </span>
          </div>

          {/* Right Router / Sandbox Pill & Drawer Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#141416] border border-white/[0.06] text-[11px] text-zinc-400">
              {isSandboxOpen ? (
                <>
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span>Live Sandbox • 60fps</span>
                </>
              ) : (
                <span>Claude Sonnet 5.5</span>
              )}
            </span>

            <button
              type="button"
              onClick={() => setIsSandboxOpen((v) => !v)}
              aria-label="Toggle live browser & BoQ drawer"
              title="Toggle live browser & BoQ drawer"
              className={`size-8 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                isSandboxOpen
                  ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                  : 'bg-[#141416] hover:bg-[#1C1C1F] text-zinc-400 hover:text-zinc-100 border-white/[0.06]'
              }`}
            >
              <PanelRight className="size-3.5" />
            </button>
          </div>
        </header>

        {/* Centered Conversational Stream */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-28">
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Stacked Narrative Chief-of-Staff Bubbles */}
            <div className="space-y-2.5">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={bubbleSpring}
                className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
              >
                Morning. I scanned eTenders and 4 Western Cape municipalities at 06:30.
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...bubbleSpring, delay: 0.05 }}
                className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
              >
                2 high-match tenders fit your CIDB 6CE PE profile: York Street Stormwater in George (
                <span className="font-mono tabular-nums text-zinc-100">R 14 850 000</span>
                , closes 27 Nov) and Oudtshoorn Bulk Water (
                <span className="font-mono tabular-nums text-zinc-100">R 8 420 000</span>
                , closes 4 Dec).
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...bubbleSpring, delay: 0.1 }}
                className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
              >
                {activeTender ? (
                  <>
                    You’re looking at{' '}
                    <span className="font-medium text-zinc-100">
                      {getShortTenderLabel(activeTender)}
                    </span>{' '}
                    (<span className="font-mono">{activeTender.tenderNumber}</span>).{' '}
                    {bubble3Copy}
                  </>
                ) : (
                  bubble3Copy
                )}
              </motion.div>
            </div>

            {/* Inline Action Pills Beneath Bubbles */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...bubbleSpring, delay: 0.14 }}
              className="flex flex-wrap items-center gap-2 pt-1"
            >
              <button
                type="button"
                onClick={() => openVault('csd')}
                className="px-3.5 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium border-none cursor-pointer transition-colors"
              >
                {hasComplianceHold ? 'Review & Upload CSD' : 'Open Compliance Vault'}
              </button>

              <button
                type="button"
                onClick={() =>
                  activeTender
                    ? setIsSandboxOpen(true)
                    : router.push(`/bid/${selectedTender?.id ?? 'ET-2026-WC-0842'}`)
                }
                className="px-3.5 py-1.5 rounded-full bg-[#1C1C1F] hover:bg-zinc-800 text-zinc-200 text-xs font-medium border border-white/[0.08] cursor-pointer transition-colors"
              >
                Inspect George Bid
              </button>

              <button
                type="button"
                onClick={() => setIsSandboxOpen((v) => !v)}
                className="px-3.5 py-1.5 rounded-full bg-[#1C1C1F] hover:bg-zinc-800 text-zinc-200 text-xs font-medium border border-white/[0.08] cursor-pointer transition-colors"
              >
                View Live Browser
              </button>

              {stagedPdf && (
                <button
                  type="button"
                  onClick={() => {
                    const bytes = Uint8Array.from(atob(stagedPdf.base64Pdf), (c) =>
                      c.charCodeAt(0)
                    );
                    const blob = new Blob([bytes], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = stagedPdf.fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium border border-emerald-500/25 cursor-pointer transition-colors"
                >
                  <Download className="size-3" />
                  <span>{stagedPdf.fileName}</span>
                </button>
              )}

              {approvals[0] && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium ${
                    approvals[0].status === 'executed'
                      ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                      : approvals[0].status === 'rejected'
                        ? 'bg-rose-500/15 border-rose-500/25 text-rose-300'
                        : 'bg-amber-500/15 border-amber-500/25 text-amber-200'
                  }`}
                >
                  Approval Shield: {approvals[0].status}
                </span>
              )}
            </motion.div>

            {/* Single-Column Interactive Choice Cards (A, B, C) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...bubbleSpring, delay: 0.18 }}
              className="max-w-xl space-y-1.5 pt-1"
            >
              {choiceCards.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={choice.onClick}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 rounded-2xl bg-[#141416] hover:bg-[#1C1C1F] border border-white/[0.06] hover:border-white/[0.12] text-left transition-colors cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-200 group-hover:text-white truncate">
                      {choice.title}
                    </div>
                    <div className="text-[11.5px] text-zinc-500 truncate tabular-nums mt-0.5">
                      {choice.subtitle}
                    </div>
                  </div>
                  <kbd className="size-6 rounded-md bg-[#1C1C1F] group-hover:bg-zinc-800 border border-white/[0.08] flex items-center justify-center font-mono text-[11px] text-zinc-400 shrink-0">
                    {choice.key}
                  </kbd>
                </button>
              ))}
            </motion.div>

            {/* Live Conversational Q&A Messages */}
            {messages.length > 0 && (
              <div className="space-y-4 pt-3">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onApproveAction={async (messageId, actionId) => {
                      if (actionId && selectedTender) {
                        await resolveApproval({
                          bidId: selectedTender.id,
                          approvalId: actionId,
                          decision: 'approved',
                        });
                      }
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === messageId && m.actionApproval
                            ? {
                                ...m,
                                actionApproval: {
                                  ...m.actionApproval,
                                  status: 'approved',
                                },
                              }
                            : m
                        )
                      );
                    }}
                    onRejectAction={async (messageId, actionId) => {
                      if (actionId && selectedTender) {
                        await resolveApproval({
                          bidId: selectedTender.id,
                          approvalId: actionId,
                          decision: 'rejected',
                        });
                      }
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === messageId && m.actionApproval
                            ? {
                                ...m,
                                actionApproval: {
                                  ...m.actionApproval,
                                  status: 'rejected',
                                },
                              }
                            : m
                        )
                      );
                    }}
                  />
                ))}
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        </main>

        {/* Floating Bottom Composer Pill */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-5 pt-6 px-4 sm:px-6 bg-gradient-to-t from-[#0C0C0D] via-[#0C0C0D]/90 to-transparent">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendConversationalPrompt(input);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingPdf(true);
            }}
            onDragLeave={() => setIsDraggingPdf(false)}
            onDrop={handleDropPdf}
            className={`pointer-events-auto max-w-2xl mx-auto rounded-full bg-[#18181B] border px-2.5 py-1.5 flex items-center gap-2 shadow-2xl shadow-black/80 transition-colors ${
              isDraggingPdf ? 'border-white/35 bg-[#1C1C1F]' : 'border-white/10'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFilePick}
              className="sr-only"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Drop or attach tender PDF"
              aria-label="Attach tender PDF"
              className="size-8 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border-none flex items-center justify-center text-zinc-400 hover:text-zinc-100 cursor-pointer transition-colors shrink-0"
            >
              <Plus className="size-4" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={
                droppedFileName
                  ? `Auditing ${droppedFileName}...`
                  : 'Message KlerkDesk or drop a tender PDF...'
              }
              className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-100 placeholder:text-zinc-500 px-1"
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={() => setIsStreaming(false)}
                aria-label="Stop"
                className="size-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-none flex items-center justify-center cursor-pointer shrink-0"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                className={`size-8 rounded-full border-none flex items-center justify-center transition-all shrink-0 ${
                  input.trim()
                    ? 'bg-zinc-100 hover:bg-white text-zinc-950 cursor-pointer'
                    : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
                }`}
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Slide-Over Live Browser, BoQ & Approval Shield Drawer */}
      {selectedTender && (
        <LiveSandboxDrawer
          isOpen={isSandboxOpen}
          onClose={() => setIsSandboxOpen(false)}
          tender={selectedTender}
          boqItems={
            boqItems.length > 0
              ? boqItems
              : [
                  {
                    id: 'fallback-1',
                    itemCode: '1300',
                    section: 'Section 1: Preliminary & General',
                    description: 'Site establishment, OHS & traffic accommodation',
                    unit: 'Sum',
                    quantity: 1,
                    rateZar: 1_150_000,
                    amountZar: 1_150_000,
                  },
                  {
                    id: 'fallback-2',
                    itemCode: '4202',
                    section: 'Section 4: Asphalt Surfacing',
                    description: 'Medium asphalt wearing course (40mm)',
                    unit: 'm²',
                    quantity: 18_500,
                    rateZar: 315,
                    amountZar: 5_827_500,
                  },
                ]
          }
          onBoqChange={setBoqItems}
          compliance={compliance}
          approvals={approvals}
          stagedPdf={stagedPdf}
          onOpenVaultModal={() => openVault('csd')}
        />
      )}

      {/* MausBot "Apps Connector" Compliance Vault Modal */}
      <ModelSetupModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        compliance={compliance}
        initialDocType={vaultDocType}
      />

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenComplianceUploader={() => openVault('csd')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLiveSandbox={() => setIsSandboxOpen(true)}
        onAskPrompt={(prompt) => sendConversationalPrompt(prompt, 'pdf_audit')}
      />

      {/* Contractor & OpenRouter Settings Modal (⌘,) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenModelSetup={() => {
          setIsSettingsOpen(false);
          openVault('csd');
        }}
      />
    </div>
  );
}
