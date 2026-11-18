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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  ArrowUp,
  PanelRight,
  Menu,
  X,
  Square,
  Download,
} from 'lucide-react';
import { useConvexAuth, useQuery } from 'convex/react';
import { Sidebar } from './Sidebar';
import { MessageBubble } from './MessageBubble';
import { TenderScanModal } from './TenderScanModal';
import { CommandPalette } from '@/components/CommandPalette';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { ModelSetupModal } from '@/components/ModelSetupModal';
import { LiveSandboxDrawer } from '@/components/bid/LiveSandboxDrawer';
import { KlerkMascot } from '@/components/KlerkMascot';
import {
  deriveTenderThreadMood,
  deriveWorkspaceMascotMood,
  getTenderMascotVariant,
} from '@/lib/mascot';
import { api } from '@/convex/_generated/api';
import {
  useResolveApprovalShieldMutation,
  useRunPortalScanMutation,
  useTenderWorkspaceQuery,
  useTriggerApprovalShieldMutation,
} from '@/lib/convex-react';
import {
  askTenderQuestionAction,
  getPersistedMessagesAction,
  uploadAndIndexTenderPdfAction,
} from '@/app/actions/chat';
import {
  parseScanPrefsFromRegions,
  TENDER_SECTORS,
  TENDER_SORT_OPTIONS,
  type TenderScanPreferences,
  type TenderSortOption,
} from '@/lib/etenders-live';
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
  initialMessages?: Message[];
  defaultVaultModalOpen?: boolean;
  defaultSandboxDrawerOpen?: boolean;
}

export function Dashboard({
  initialCompliance,
  initialTenders,
  activeTender,
  initialBoq = [],
  initialApprovals = [],
  initialMessages = [],
  defaultVaultModalOpen = false,
  defaultSandboxDrawerOpen = false,
}: DashboardProps) {
  const router = useRouter();
  const [activeBidId, setActiveBidId] = useState<string | null>(
    activeTender?.id ?? null
  );

  useEffect(() => {
    setActiveBidId(activeTender?.id ?? null);
  }, [activeTender?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/bid\/([^/?#]+)/);
      if (match?.[1]) {
        setActiveBidId(decodeURIComponent(match[1]));
        setIsSandboxOpen(true);
      } else {
        setActiveBidId(null);
        setIsSandboxOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const {
    compliance,
    tenders,
    boqItems: liveBoqItems,
    approvals,
    messages: workspaceMessages,
    messagesHydrated,
    stagedPdf,
  } = useTenderWorkspaceQuery({
    bidId: activeBidId ?? undefined,
    initialCompliance,
    initialTenders,
    initialBoq,
    initialApprovals,
    initialMessages,
  });

  const triggerApproval = useTriggerApprovalShieldMutation();
  const resolveApproval = useResolveApprovalShieldMutation();
  const runPortalScan = useRunPortalScanMutation();

  const resolvedActiveTender = activeBidId
    ? tenders.find((t) => t.id === activeBidId) ??
      (activeTender?.id === activeBidId ? activeTender : undefined)
    : undefined;
  const selectedTender = resolvedActiveTender ?? tenders[0];
  const currentThreadKey = selectedTender?.id ?? '__desk__';
  const [boqItems, setBoqItems] = useState<BoQItem[]>(liveBoqItems);

  useEffect(() => {
    setBoqItems(liveBoqItems);
  }, [liveBoqItems]);

  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(
    api.users.currentUser,
    isAuthenticated ? {} : 'skip'
  );
  const [isVaultOpen, setIsVaultOpen] = useState(defaultVaultModalOpen);
  const [vaultDocType, setVaultDocType] = useState<ComplianceDocType | null>(null);
  const [isSandboxOpen, setIsSandboxOpen] = useState(defaultSandboxDrawerOpen);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [savedScanPrefs, setSavedScanPrefs] =
    useState<TenderScanPreferences | null>(null);
  const [isSortingTenders, setIsSortingTenders] = useState(false);
  const [isPortalScanning, setIsPortalScanning] = useState(false);
  const [justApproved, setJustApproved] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const approvalPulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (approvalPulseTimerRef.current !== null) {
        window.clearTimeout(approvalPulseTimerRef.current);
      }
    };
  }, []);

  const triggerApprovedPulse = useCallback(() => {
    setJustApproved(true);
    if (approvalPulseTimerRef.current !== null) {
      window.clearTimeout(approvalPulseTimerRef.current);
    }
    approvalPulseTimerRef.current = window.setTimeout(() => {
      approvalPulseTimerRef.current = null;
      setJustApproved(false);
    }, 3000);
  }, []);

  useEffect(() => {
    const userId = currentUser?._id ? String(currentUser._id) : null;
    const fromConvex = parseScanPrefsFromRegions(
      currentUser?.municipalRegions,
      currentUser?.cidbGrade
    ).scanPreferences;

    if (fromConvex) {
      setSavedScanPrefs(fromConvex);
      if (userId && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            `klerk_scan_prefs_${userId}`,
            JSON.stringify(fromConvex)
          );
        } catch {
          // ignore storage quota errors
        }
      }
      return;
    }

    if (userId && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(`klerk_scan_prefs_${userId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as TenderScanPreferences;
          if (Array.isArray(parsed.sectors) && parsed.sectors.length > 0) {
            setSavedScanPrefs(parsed);
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }, [currentUser?._id, currentUser?.cidbGrade, currentUser?.municipalRegions]);

  const messagesCacheRef = useRef<Record<string, Message[]>>({});
  const fetchedThreadsRef = useRef<Set<string>>(new Set());
  const prevThreadKeyRef = useRef<string>(currentThreadKey);
  const activeThreadKeyRef = useRef<string>(currentThreadKey);
  activeThreadKeyRef.current = currentThreadKey;

  const [messages, setMessagesState] = useState<Message[]>(() => {
    if (initialMessages.length > 0) {
      messagesCacheRef.current[currentThreadKey] = initialMessages;
      return initialMessages;
    }
    return workspaceMessages;
  });
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null);

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateThreadMessages = useCallback(
    (
      threadKey: string,
      updater: Message[] | ((prev: Message[]) => Message[])
    ) => {
      const base =
        messagesCacheRef.current[threadKey] ??
        (activeThreadKeyRef.current === threadKey ? messagesRef.current : []);
      const next = typeof updater === 'function' ? updater(base) : updater;
      messagesCacheRef.current[threadKey] = next;
      if (activeThreadKeyRef.current === threadKey) {
        setMessagesState(next);
      }
    },
    []
  );

  const setMessages = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      updateThreadMessages(activeThreadKeyRef.current, updater);
    },
    [updateThreadMessages]
  );

  const handleSelectTender = useCallback(
    (nextBidId: string | null, options?: { openSandbox?: boolean }) => {
      if (nextBidId === activeBidId) {
        if (options?.openSandbox) {
          setIsSandboxOpen(true);
        }
        return;
      }

      const previousBidId = activeBidId;
      setActiveBidId(nextBidId);

      if (nextBidId === null) {
        setIsSandboxOpen(false);
      } else if (options?.openSandbox !== undefined) {
        setIsSandboxOpen(options.openSandbox);
      } else if (previousBidId === null) {
        setIsSandboxOpen(true);
      }

      if (typeof window !== 'undefined') {
        const nextPath = nextBidId
          ? `/bid/${encodeURIComponent(nextBidId)}`
          : '/desk';
        if (window.location.pathname !== nextPath) {
          window.history.pushState({ bidId: nextBidId }, '', nextPath);
        }
      }
    },
    [activeBidId]
  );

  useEffect(() => {
    const threadSwitched = prevThreadKeyRef.current !== currentThreadKey;
    prevThreadKeyRef.current = currentThreadKey;
    const cached = messagesCacheRef.current[currentThreadKey];

    if (threadSwitched) {
      if (cached) {
        setMessagesState(cached);
        return;
      }
      if (messagesHydrated) {
        messagesCacheRef.current[currentThreadKey] = workspaceMessages;
        setMessagesState(workspaceMessages);
        return;
      }
      setMessagesState([]);
    } else if (
      !isStreaming &&
      workspaceMessages.length > 0 &&
      (!cached || workspaceMessages.length > cached.length)
    ) {
      const merged = workspaceMessages.map((wm, idx) => {
        const existing = cached?.[idx];
        if (
          existing &&
          existing.role === wm.role &&
          existing.content === wm.content
        ) {
          return {
            ...wm,
            thinkingSteps: existing.thinkingSteps ?? wm.thinkingSteps,
            thinkingDuration: existing.thinkingDuration ?? wm.thinkingDuration,
            actionApproval: existing.actionApproval ?? wm.actionApproval,
          };
        }
        return wm;
      });
      messagesCacheRef.current[currentThreadKey] = merged;
      setMessagesState(merged);
      return;
    }

    if (
      !isAuthenticated ||
      messagesHydrated ||
      cached ||
      fetchedThreadsRef.current.has(currentThreadKey)
    ) {
      return;
    }

    fetchedThreadsRef.current.add(currentThreadKey);
    const targetBidId = selectedTender?.id;
    const targetKey = currentThreadKey;
    let cancelled = false;

    void getPersistedMessagesAction(targetBidId)
      .then((persisted) => {
        if (!cancelled) {
          messagesCacheRef.current[targetKey] = persisted;
          if (activeThreadKeyRef.current === targetKey) {
            setMessagesState(persisted);
          }
        }
      })
      .catch(() => {
        fetchedThreadsRef.current.delete(targetKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentThreadKey,
    isAuthenticated,
    isStreaming,
    messagesHydrated,
    selectedTender?.id,
    workspaceMessages,
  ]);

  const openVault = useCallback((docType: ComplianceDocType | null = null) => {
    setVaultDocType(docType);
    setIsVaultOpen(true);
  }, []);

  const sendConversationalPrompt = useCallback(
    async (promptText: string, mode: 'chat' | 'pdf_audit' = 'chat') => {
      const trimmed = promptText.trim();
      if (!trimmed || isStreaming) return;

      const requestThreadKey = activeThreadKeyRef.current;
      const targetTender = selectedTender;
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

      updateThreadMessages(requestThreadKey, (prev) => [
        ...prev,
        userMsg,
        pendingAi,
      ]);
      setInput('');
      setDroppedFileName(null);

      setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);

      try {
        const res = await askTenderQuestionAction({
          prompt: trimmed,
          bidId: targetTender?.id,
          mode,
        });

        let shieldApprovalId: string | undefined;
        if (res.requiresApprovalShield && targetTender) {
          const subtotal =
            boqItems.length > 0
              ? boqItems.reduce((s, r) => s + r.quantity * r.rateZar, 0)
              : targetTender.estimatedValueZar;
          const vat = Math.round(subtotal * 0.15 * 100) / 100;
          const grand = Math.round((subtotal + vat) * 100) / 100;

          const created = await triggerApproval({
            bidId: targetTender.id,
            tenderNumber: targetTender.tenderNumber,
            actionType: 'submit_etenders',
            totalBidZar: subtotal,
            vatZar: vat,
            grandTotalZar: grand,
            targetResource: targetTender.portalUrl,
            commandPreview: `stagehand.submitBid({ tender: "${targetTender.tenderNumber}", total: "${formatSpacedRand(grand)}" })`,
          });
          shieldApprovalId = created.id;
        }

        updateThreadMessages(requestThreadKey, (prev) =>
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
                        title: `Approval Shield — ${targetTender?.tenderNumber}`,
                        description:
                          'Paused in Convex pendingApprovals. Sign off when ready.',
                        targetResource: targetTender?.portalUrl,
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
        updateThreadMessages(requestThreadKey, (prev) =>
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
    [
      boqItems,
      compliance.isBidReady,
      isStreaming,
      selectedTender,
      triggerApproval,
      updateThreadMessages,
    ]
  );

  const executePortalScanWithPreferences = useCallback(
    async (prefs: TenderScanPreferences) => {
      setSavedScanPrefs(prefs);
      const userId = currentUser?._id ? String(currentUser._id) : 'local';
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            `klerk_scan_prefs_${userId}`,
            JSON.stringify(prefs)
          );
        } catch {
          // ignore storage quota errors
        }
      }

      setIsPortalScanning(true);
      let matched: TenderMatch[] = [];
      try {
        matched = await runPortalScan(prefs);
      } finally {
        setIsPortalScanning(false);
      }
      const sectorNames = prefs.sectors
        .map((id) => TENDER_SECTORS.find((s) => s.id === id)?.shortLabel ?? id)
        .join(', ');
      const provinceNames = prefs.provinces.join(', ');
      void sendConversationalPrompt(
        `Scanned live National Treasury eTenders for ${sectorNames} opportunities in ${provinceNames} (${matched.length} matching tenders pulled into Klerk Desks). Summarize the top match and required returnables.`
      );
    },
    [currentUser?._id, runPortalScan, sendConversationalPrompt]
  );

  const handleTriggerPortalScan = useCallback(async () => {
    if (!savedScanPrefs) {
      setIsScanModalOpen(true);
      return;
    }
    await executePortalScanWithPreferences(savedScanPrefs);
  }, [executePortalScanWithPreferences, savedScanPrefs]);

  const handleChangeSortOrder = useCallback(
    async (nextSort: TenderSortOption) => {
      if (!savedScanPrefs) {
        setIsScanModalOpen(true);
        return;
      }
      const updatedPrefs: TenderScanPreferences = {
        ...savedScanPrefs,
        sortBy: nextSort,
        configuredAt: new Date().toISOString(),
      };
      setSavedScanPrefs(updatedPrefs);
      const userId = currentUser?._id ? String(currentUser._id) : 'local';
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            `klerk_scan_prefs_${userId}`,
            JSON.stringify(updatedPrefs)
          );
        } catch {
          // ignore storage quota errors
        }
      }
      setIsSortingTenders(true);
      try {
        await runPortalScan(updatedPrefs);
      } finally {
        setIsSortingTenders(false);
      }
    },
    [currentUser?._id, runPortalScan, savedScanPrefs]
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
        openVault(null);
      } else if (key === 'b') {
        e.preventDefault();
        if (tenders.length === 0) {
          router.push('/onboarding');
        } else if (resolvedActiveTender) {
          setIsSandboxOpen(true);
        } else if (selectedTender) {
          handleSelectTender(selectedTender.id, { openSandbox: true });
        }
      } else if (key === 'c') {
        e.preventDefault();
        if (tenders.length === 0) {
          void handleTriggerPortalScan();
        } else {
          void sendConversationalPrompt(
            `Run a full tender PDF audit on ${selectedTender?.tenderNumber ?? 'T/GEO/042/2026'} and check SBD 1/4/6.1.`,
            'pdf_audit'
          );
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleSelectTender,
    handleTriggerPortalScan,
    isCommandPaletteOpen,
    isSettingsOpen,
    isVaultOpen,
    openVault,
    resolvedActiveTender,
    router,
    selectedTender,
    sendConversationalPrompt,
    tenders.length,
  ]);

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendConversationalPrompt(input);
    }
  };

  const uploadTenderPdfFile = useCallback(
    async (file: File) => {
      if (isStreaming) return;
      const requestThreadKey = activeThreadKeyRef.current;
      const targetTenderId = selectedTender?.id;
      setDroppedFileName(file.name);
      setIsStreaming(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: `Upload & vector-index tender PDF: ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`,
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

      updateThreadMessages(requestThreadKey, (prev) => [
        ...prev,
        userMsg,
        pendingAi,
      ]);
      setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);

      try {
        const formData = new FormData();
        formData.append('file', file);
        if (targetTenderId) {
          formData.append('bidId', targetTenderId);
        }

        const res = await uploadAndIndexTenderPdfAction(formData);
        updateThreadMessages(requestThreadKey, (prev) =>
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
                }
              : m
          )
        );
      } catch (err) {
        updateThreadMessages(requestThreadKey, (prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content:
                    err instanceof Error
                      ? `Could not index tender PDF "${file.name}": ${err.message}`
                      : `Could not index tender PDF "${file.name}".`,
                  isThinking: false,
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        setDroppedFileName(null);
        setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    },
    [isStreaming, selectedTender?.id, updateThreadMessages]
  );

  const handleDropPdf = (e: DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsDraggingPdf(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void uploadTenderPdfFile(file);
    }
  };

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void uploadTenderPdfFile(file);
    }
  };

  const uploadedDocsCount = compliance.docs.filter(
    (d) => d.status !== 'missing'
  ).length;
  const csdDoc = compliance.docs.find((d) => d.type === 'csd');
  const cipcDoc = compliance.docs.find((d) => d.type === 'cipc');
  const hasComplianceHold = !compliance.isBidReady;
  const hasActiveTenders = tenders.length > 0;

  const bubble3Copy = hasComplianceHold
    ? uploadedDocsCount === 0
      ? 'Your Compliance Vault currently has 0 of 6 statutory documents uploaded. Add your CSD, SARS Tax PIN, COIDA, B-BBEE, CIPC, and Certified IDs whenever you are ready.'
      : `Hold up on submission though — ${(
          compliance.blockingAlerts[0] ??
          `your CSD report is ${csdDoc?.ageDays ?? 9} days old and certified CIPC is ${cipcDoc?.ageDays ?? 96} days old`
        ).replace(/\.+$/, '')}.`
    : `All 6 compliance docs are green. ${
        selectedTender
          ? `Your ${getShortTenderLabel(selectedTender)} bid (${formatSpacedRand(selectedTender.estimatedValueZar)}) is staged and waiting on your yes.`
          : 'Your workspace is bid-ready for new tenders.'
      }`;

  const choiceCards = hasActiveTenders
    ? [
        {
          key: 'A',
          title: hasComplianceHold
            ? 'Review & upload documents in Compliance Vault'
            : 'Inspect verified Compliance Vault (all 6 docs valid)',
          subtitle: hasComplianceHold
            ? `${uploadedDocsCount}/6 uploaded • CSD 7-day rule & CIPC 90-day rule`
            : 'Tax PIN, CSD, COIDA, B-BBEE, CIPC & IDs active',
          onClick: () => openVault(hasComplianceHold ? 'csd' : null),
        },
        {
          key: 'B',
          title: `Inspect ${selectedTender ? getShortTenderLabel(selectedTender) : 'Active Bid'} BoQ & Approval Shield`,
          subtitle: `Waiting on your yes • ${formatSpacedRand(selectedTender?.estimatedValueZar ?? 14_850_000)} • CIDB ${selectedTender?.cidbGrade ?? '6CE'}`,
          onClick: () => {
            if (resolvedActiveTender) {
              setIsSandboxOpen(true);
            } else if (selectedTender) {
              handleSelectTender(selectedTender.id, { openSandbox: true });
            }
          },
        },
        {
          key: 'C',
          title: 'Run Claude Sonnet 5.5 audit on SBD 1 / 4 / 6.1 returnables',
          subtitle: 'Checks compulsory clauses, PPR 2022 80/20 points & BoQ VAT',
          onClick: () =>
            void sendConversationalPrompt(
              `Run a full tender PDF audit on ${selectedTender?.tenderNumber ?? 'T/GEO/042/2026'} and verify SBD 1, SBD 4, and SBD 6.1.`,
              'pdf_audit'
            ),
        },
      ]
    : [
        {
          key: 'A',
          title: 'Upload statutory documents in your Compliance Vault',
          subtitle: `${uploadedDocsCount} of 6 uploaded • CSD Report, SARS Tax PIN, COIDA, B-BBEE, CIPC & IDs`,
          onClick: () => openVault(null),
        },
        {
          key: 'B',
          title: 'Complete Contractor Profile & Onboarding Setup',
          subtitle: 'Set company legal name, MAAA number, CIDB grading & target municipalities',
          onClick: () => router.push('/onboarding'),
        },
        {
          key: 'C',
          title: 'Scan eTenders & Municipal Portals for matching bids',
          subtitle: 'Populate your Klerk Desks with live South African opportunities',
          onClick: () => void handleTriggerPortalScan(),
        },
      ];

  const workspaceMood = deriveWorkspaceMascotMood({
    compliance,
    isScanning: isStreaming || isSortingTenders || isPortalScanning,
    approvals,
    justApproved,
  });

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
          activeBidId={resolvedActiveTender?.id ?? null}
          workspaceMood={workspaceMood}
          sortBy={savedScanPrefs?.sortBy ?? 'best_match'}
          isResorting={isSortingTenders}
          onChangeSortBy={(nextSort) => void handleChangeSortOrder(nextSort)}
          onSelectTender={(bidId) => handleSelectTender(bidId)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenVaultModal={() => openVault(null)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenLiveSandbox={() => setIsSandboxOpen(true)}
          onTriggerNewScan={() => void handleTriggerPortalScan()}
          onOpenSectorPreferences={() => setIsScanModalOpen(true)}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 md:hidden flex bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="h-full relative will-change-transform"
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar
                compliance={compliance}
                tenders={tenders}
                activeBidId={resolvedActiveTender?.id ?? null}
                workspaceMood={workspaceMood}
                sortBy={savedScanPrefs?.sortBy ?? 'best_match'}
                isResorting={isSortingTenders}
                onChangeSortBy={(nextSort) => void handleChangeSortOrder(nextSort)}
                onSelectTender={(bidId) => {
                  setMobileSidebarOpen(false);
                  handleSelectTender(bidId);
                }}
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
                  void handleTriggerPortalScan();
                }}
                onOpenSectorPreferences={() => {
                  setMobileSidebarOpen(false);
                  setIsScanModalOpen(true);
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Centered Stream Canvas (70%+ negative space around max-w-2xl) */}
      <div className="flex-1 flex flex-col min-w-0 h-dvh relative">
        {/* Minimalist Top Header Strip */}
        <header className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-[40px]">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open menu"
              className="md:hidden size-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400 cursor-pointer"
            >
              <Menu className="size-4" />
            </button>
          </div>

          {/* Clean Centered Title */}
          <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 truncate max-w-[280px] sm:max-w-md">
            <KlerkMascot
              variant={
                resolvedActiveTender
                  ? getTenderMascotVariant(
                      resolvedActiveTender.id,
                      tenders.map((t) => t.id)
                    )
                  : 'chief'
              }
              size={resolvedActiveTender ? 28 : 32}
              followCursor={false}
              mood={
                resolvedActiveTender
                  ? deriveTenderThreadMood(resolvedActiveTender.status)
                  : workspaceMood
              }
            />
            <span className="truncate">
              {resolvedActiveTender
                ? `KlerkDesk · ${getShortTenderLabel(resolvedActiveTender)}`
                : 'KlerkDesk'}
            </span>
          </div>

          {/* Right Drawer Toggle */}
          <div className="flex items-center justify-end gap-2 min-w-[40px] shrink-0">
            {selectedTender && (
              <button
                type="button"
                onClick={() => setIsSandboxOpen((v) => !v)}
                aria-label="Toggle live browser & BoQ drawer"
                title="Toggle live browser & BoQ drawer"
                className={`size-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                  isSandboxOpen
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                    : 'bg-transparent hover:bg-white/[0.05] text-zinc-400 hover:text-zinc-100 border-white/[0.08]'
                }`}
              >
                <PanelRight className="size-3.5" />
              </button>
            )}
          </div>
        </header>

        {/* Centered Conversational Stream */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-28">
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Stacked Narrative Chief-of-Staff Bubbles */}
            <div className="space-y-2.5">
              {hasActiveTenders ? (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={bubbleSpring}
                    className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
                  >
                    Live scan active on National Treasury eTenders &amp; OCDS
                    {savedScanPrefs?.provinces?.length
                      ? ` (${savedScanPrefs.provinces.join(', ')})`
                      : ' (All South Africa)'}
                    . Ordered by{' '}
                    <span className="text-zinc-100 font-medium">
                      {TENDER_SORT_OPTIONS.find(
                        (o) => o.id === (savedScanPrefs?.sortBy ?? 'best_match')
                      )?.label ?? 'Best Sector Match'}
                    </span>
                    .
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...bubbleSpring, delay: 0.05 }}
                    className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
                  >
                    <span className="font-mono tabular-nums text-zinc-100">
                      {tenders.length}
                    </span>{' '}
                    live {tenders.length === 1 ? 'tender fits' : 'tenders fit'} your{' '}
                    {savedScanPrefs?.cidbGrade || currentUser?.cidbGrade || 'configured'}{' '}
                    profile
                    {tenders[0] ? (
                      <>
                        : <span className="text-zinc-100 font-medium">{tenders[0].title}</span> (
                        <span className="font-mono tabular-nums text-zinc-100">
                          {formatSpacedRand(tenders[0].estimatedValueZar)}
                        </span>
                        , closes{' '}
                        {new Date(tenders[0].closingDate).toLocaleDateString('en-ZA', {
                          day: '2-digit',
                          month: 'short',
                        })}
                        )
                        {tenders[1] ? (
                          <>
                            {' '}
                            and <span className="text-zinc-100 font-medium">{tenders[1].title}</span> (
                            <span className="font-mono tabular-nums text-zinc-100">
                              {formatSpacedRand(tenders[1].estimatedValueZar)}
                            </span>
                            , closes{' '}
                            {new Date(tenders[1].closingDate).toLocaleDateString('en-ZA', {
                              day: '2-digit',
                              month: 'short',
                            })}
                            )
                          </>
                        ) : null}
                        .
                      </>
                    ) : (
                      '.'
                    )}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...bubbleSpring, delay: 0.1 }}
                    className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
                  >
                    {resolvedActiveTender ? (
                      <>
                        You’re looking at{' '}
                        <span className="font-medium text-zinc-100">
                          {getShortTenderLabel(resolvedActiveTender)}
                        </span>{' '}
                        (<span className="font-mono">{resolvedActiveTender.tenderNumber}</span>).{' '}
                        {bubble3Copy}
                      </>
                    ) : (
                      bubble3Copy
                    )}
                  </motion.div>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={bubbleSpring}
                    className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
                  >
                    Welcome to KlerkDesk. Your workspace starts clean with no pre-loaded tender threads or compliance files.
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...bubbleSpring, delay: 0.05 }}
                    className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
                  >
                    Your Compliance Vault currently has{' '}
                    <span className="font-mono tabular-nums text-zinc-100">
                      {uploadedDocsCount} of 6
                    </span>{' '}
                    statutory documents uploaded. You can upload your CSD report, SARS Tax PIN, COIDA, B-BBEE, CIPC CoR 14.3, and Certified IDs now or add them later whenever you’re ready to stage a bid.
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...bubbleSpring, delay: 0.1 }}
                    className="max-w-xl bg-[#1C1C1F] border border-white/[0.06] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed text-zinc-200"
                  >
                    To start a tender thread, drop a tender PDF into the composer below or run a live portal scan.
                  </motion.div>
                </>
              )}
            </div>

            {stagedPdf && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...bubbleSpring, delay: 0.14 }}
                className="pt-1"
              >
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/25 cursor-pointer transition-colors"
                >
                  <Download className="size-3.5" />
                  <span>Download {stagedPdf.fileName}</span>
                </button>
              </motion.div>
            )}

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
                      triggerApprovedPulse();
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
          boqItems={boqItems}
          onBoqChange={setBoqItems}
          compliance={compliance}
          approvals={approvals}
          stagedPdf={stagedPdf}
          onOpenVaultModal={() => openVault('csd')}
          onApprovalResolved={(decision) => {
            if (decision === 'approved') {
              triggerApprovedPulse();
            }
          }}
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
        activeTender={selectedTender}
        onSelectTender={(bidId) => handleSelectTender(bidId, { openSandbox: true })}
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

      {/* First-Time Sector Tailoring & Live eTenders Scan Modal */}
      <TenderScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        initialPreferences={savedScanPrefs}
        defaultCidbGrade={currentUser?.cidbGrade || ''}
        onConfirmScan={executePortalScanWithPreferences}
      />
    </div>
  );
}
