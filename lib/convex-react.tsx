'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  useConvexAuth,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { api } from '@/convex/_generated/api';
import {
  getComplianceVaultAction,
  runPortalScanAction,
  uploadComplianceDocAction,
} from '@/app/actions/compliance';
import {
  getBidWorkspaceAction,
  resolveApprovalShieldAction,
  saveBoqItemsAction,
  stampSbdFormsAction,
  triggerApprovalShieldAction,
} from '@/app/actions/bid';
import {
  createEmptyComplianceDocs,
  DEMO_USERNAME,
  evaluateComplianceSummary,
  isLegacySeededComplianceDoc,
} from '@/lib/compliance';
import type { TenderScanPreferences } from '@/lib/etenders-live';
import type { StampedSbdResult } from '@/lib/pdf-stamp';
import type {
  ApprovalActionType,
  ApprovalShieldState,
  BoQItem,
  ComplianceDoc,
  ComplianceDocType,
  ComplianceSummary,
  Message,
  SubmissionChannel,
  TenderMatch,
  UsageSummary,
} from '@/types';

interface ReactiveWorkspaceSnapshot {
  compliance: ComplianceSummary | null;
  tenders: TenderMatch[];
  boqsByTender: Record<string, BoQItem[]>;
  approvalsByTender: Record<string, ApprovalShieldState[]>;
  messagesByThread: Record<string, Message[]>;
  stagedPdfsByTender: Record<string, StampedSbdResult>;
  usageSummary: UsageSummary | null;
  workspaceSynced: boolean;
}

const listeners = new Set<() => void>();

let clientSnapshot: ReactiveWorkspaceSnapshot = {
  compliance: null,
  tenders: [],
  boqsByTender: {},
  approvalsByTender: {},
  messagesByThread: {},
  stagedPdfsByTender: {},
  usageSummary: null,
  workspaceSynced: false,
};

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function setClientSnapshot(
  updater: (prev: ReactiveWorkspaceSnapshot) => ReactiveWorkspaceSnapshot
) {
  clientSnapshot = updater(clientSnapshot);
  emitChange();
}

export function resetClientWorkspaceSnapshot() {
  clientSnapshot = {
    compliance: evaluateComplianceSummary(createEmptyComplianceDocs()),
    tenders: [],
    boqsByTender: {},
    approvalsByTender: {},
    messagesByThread: {},
    stagedPdfsByTender: {},
    usageSummary: null,
    workspaceSynced: false,
  };
  emitChange();
}

function mapConvexBoqItem(row: {
  itemId: string;
  itemCode: string;
  section: string;
  description: string;
  unit: string;
  quantity: number;
  rateZar: number;
  amountZar: number;
}): BoQItem {
  return {
    id: row.itemId,
    itemCode: row.itemCode,
    section: row.section,
    description: row.description,
    unit: row.unit,
    quantity: row.quantity,
    rateZar: row.rateZar,
    amountZar: row.amountZar,
  };
}

function mapConvexApproval(apr: {
  approvalId: string;
  bidId: string;
  tenderNumber: string;
  actionType: ApprovalActionType;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed';
  totalBidZar: number;
  vatZar: number;
  grandTotalZar: number;
  targetResource: string;
  commandPreview: string;
  complianceVerified: boolean;
  complianceWarnings: string[];
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  boatSessionId?: string | null;
  mergedPackStorageId?: unknown;
  mergedPackUrl?: string;
  submissionChannel?: string;
  whatsappDispatched?: boolean;
}): ApprovalShieldState {
  return {
    id: apr.approvalId,
    bidId: apr.bidId,
    tenderNumber: apr.tenderNumber,
    actionType: apr.actionType,
    status: apr.status,
    totalBidZar: apr.totalBidZar,
    vatZar: apr.vatZar,
    grandTotalZar: apr.grandTotalZar,
    targetResource: apr.targetResource,
    commandPreview: apr.commandPreview,
    complianceVerified: apr.complianceVerified,
    complianceWarnings: apr.complianceWarnings,
    requestedBy: apr.requestedBy,
    requestedAt: apr.requestedAt,
    approvedBy: apr.approvedBy ?? null,
    approvedAt: apr.approvedAt ?? null,
    boatSessionId: apr.boatSessionId ?? null,
    mergedPackStorageId: apr.mergedPackStorageId
      ? String(apr.mergedPackStorageId)
      : undefined,
    mergedPackUrl: apr.mergedPackUrl,
    submissionChannel: apr.submissionChannel,
    whatsappDispatched: apr.whatsappDispatched,
  };
}

function mapConvexMessage(row: {
  _id: unknown;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  contentType: 'text' | 'code' | 'table' | 'markdown';
  modelUsed?: string;
  sources?: Array<{
    sourceTitle?: string;
    filePath: string;
    textSnippet: string;
    pageNumber?: number;
    score?: number;
  }>;
}): Message {
  const id = String(row._id);
  return {
    id,
    role: row.role,
    content: row.content,
    timestamp: new Date(row.createdAt),
    contentType: row.contentType,
    modelUsed: row.modelUsed,
    sources: row.sources?.map((s, idx) => ({
      id: `${id}-src-${idx}`,
      sourceTitle: s.sourceTitle,
      filePath: s.filePath,
      textSnippet: s.textSnippet,
      pageNumber: s.pageNumber,
      score: s.score,
    })),
  };
}

function subscribeSnapshot(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getClientSnapshot() {
  return clientSnapshot;
}

interface LiveConvexMutators {
  generateComplianceUploadUrl: () => Promise<string>;
  saveBoq: (args: {
    tenderId: string;
    items: Array<{
      itemId: string;
      itemCode: string;
      section: string;
      description: string;
      unit: string;
      quantity: number;
      rateZar: number;
      amountZar: number;
    }>;
  }) => Promise<unknown>;
  saveStamp: (args: {
    tenderId: string;
    fileName: string;
    base64Pdf: string;
    pageCount: number;
    stampingMethod: string;
  }) => Promise<unknown>;
  triggerApproval: (args: {
    approvalId: string;
    bidId: string;
    tenderNumber: string;
    actionType: ApprovalActionType;
    totalBidZar: number;
    vatZar: number;
    grandTotalZar: number;
    targetResource: string;
    commandPreview: string;
    complianceVerified: boolean;
    complianceWarnings: string[];
    requestedBy: string;
    boatSessionId?: string | null;
  }) => Promise<unknown>;
}

let liveConvexMutators: LiveConvexMutators | null = null;

/**
 * Unconditionally mounts Convex `useQuery` and `useMutation` hooks when
 * `NEXT_PUBLIC_CONVEX_URL` is configured, syncing authenticated Convex data
 * into the shared reactive workspace store.
 */
function ConvexLiveBridge() {
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useConvexQuery(
    api.users.currentUser,
    isAuthenticated ? {} : 'skip'
  );
  const liveState = useConvexQuery(
    api.tenderOps.getWorkspaceState,
    isAuthenticated ? {} : 'skip'
  );
  const legacyGenerateUploadUrlRef = useMemo(
    () => makeFunctionReference<'mutation'>('tenderOps:generateUploadUrl'),
    []
  );
  const ensureDemoSeed = useConvexMutation(api.users.ensureDemoSeed);
  const generateComplianceUploadUrl = useConvexMutation(
    api.compliance.generateComplianceUploadUrl
  );
  const legacyGenerateUploadUrl = useConvexMutation(legacyGenerateUploadUrlRef);
  const saveBoq = useConvexMutation(api.bid.saveBoqItems);
  const saveStamp = useConvexMutation(api.bid.saveStampedSbdPackage);
  const triggerApproval = useConvexMutation(api.bid.triggerApprovalShield);

  const seededForUserRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextUserId = currentUser?._id ? String(currentUser._id) : null;
    if (activeUserIdRef.current && activeUserIdRef.current !== nextUserId) {
      seededForUserRef.current = false;
      resetClientWorkspaceSnapshot();
    }
    activeUserIdRef.current = nextUserId;
  }, [currentUser?._id]);

  useEffect(() => {
    const isDemoAccount =
      currentUser?.username?.trim().toLowerCase() === DEMO_USERNAME;
    if (
      isAuthenticated &&
      isDemoAccount &&
      liveState &&
      liveState.docs.length === 0 &&
      !seededForUserRef.current
    ) {
      seededForUserRef.current = true;
      void ensureDemoSeed({}).catch(() => {
        seededForUserRef.current = false;
      });
    }
  }, [isAuthenticated, currentUser?.username, liveState, ensureDemoSeed]);

  useEffect(() => {
    liveConvexMutators = {
      generateComplianceUploadUrl: async () => {
        try {
          return await generateComplianceUploadUrl({});
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err ?? '');
          if (msg.includes('Could not find public function')) {
            return await legacyGenerateUploadUrl({});
          }
          throw err;
        }
      },
      saveBoq: (args) => saveBoq(args),
      saveStamp: (args) => saveStamp(args),
      triggerApproval: (args) => triggerApproval(args),
    };
    return () => {
      liveConvexMutators = null;
    };
  }, [generateComplianceUploadUrl, legacyGenerateUploadUrl, saveBoq, saveStamp, triggerApproval]);

  useEffect(() => {
    if (!isAuthenticated || !liveState || currentUser === undefined) return;
    const isDemoAccount =
      currentUser?.username?.trim().toLowerCase() === DEMO_USERNAME;

    const filteredLiveDocs = isDemoAccount
      ? liveState.docs
      : liveState.docs.filter((d) => !isLegacySeededComplianceDoc(d));

    const emptySlots = createEmptyComplianceDocs();
    const mappedByType = new Map<ComplianceDocType, ComplianceDoc>();
    for (const d of filteredLiveDocs) {
      const docType = d.docType as ComplianceDocType;
      mappedByType.set(docType, {
        id: d.docId,
        type: docType,
        title: d.title,
        shortLabel: d.shortLabel,
        referenceNumber: d.referenceNumber,
        storageId: d.storageId ? String(d.storageId) : undefined,
        fileName: d.fileName,
        fileSizeBytes: d.fileSizeBytes,
        issuedAt: d.issuedAt,
        expiresAt: d.expiresAt ?? null,
        ageDays: d.ageDays,
        maxAgeDays: d.maxAgeDays ?? null,
        daysUntilExpiry: d.daysUntilExpiry ?? null,
        status: d.status,
        alertReason: d.alertReason ?? null,
      });
    }

    const mergedDocs = emptySlots.map(
      (slot) => mappedByType.get(slot.type) ?? slot
    );
    const evaluatedSummary = evaluateComplianceSummary(mergedDocs);

    const mappedTenders: TenderMatch[] = liveState.tenders.map((t) => ({
      id: t.tenderId,
      tenderNumber: t.tenderNumber,
      title: t.title,
      municipality: t.municipality,
      region: t.region,
      cidbGrade: t.cidbGrade,
      closingDate: t.closingDate,
      briefingDate: t.briefingDate ?? null,
      briefingCompulsory: t.briefingCompulsory,
      estimatedValueZar: t.estimatedValueZar,
      matchScore: t.matchScore,
      status: t.status,
      portalUrl: t.portalUrl,
      submissionChannel:
        (t.submissionChannel as SubmissionChannel | undefined) ??
        'etenders_esubmission',
      complianceReady: evaluatedSummary.isBidReady,
      complianceBlocks: evaluatedSummary.blockingAlerts,
      summary: t.summary,
      sbdFormsRequired: t.sbdFormsRequired,
      stagedPdfFileName: t.stampedSbdFileName,
      stagedPdfBase64: t.stampedSbdBase64,
      stampedSbdStorageId: t.stampedSbdStorageId
        ? String(t.stampedSbdStorageId)
        : undefined,
      stampedSbdPageCount: t.stampedSbdPageCount,
      stampedSbdMethod: t.stampedSbdMethod,
      publishedDate: t.publishedDate,
      ocid: t.ocid,
      procurementCategory: t.procurementCategory,
    }));

    const groupedApprovals: Record<string, ApprovalShieldState[]> = {};
    for (const apr of liveState.approvals) {
      const mapped = mapConvexApproval(apr);
      if (!groupedApprovals[apr.bidId]) {
        groupedApprovals[apr.bidId] = [];
      }
      groupedApprovals[apr.bidId].push(mapped);
    }
    for (const key of Object.keys(groupedApprovals)) {
      groupedApprovals[key].sort((a, b) =>
        b.requestedAt.localeCompare(a.requestedAt)
      );
    }

    const groupedBoqs: Record<string, BoQItem[]> = {};
    for (const item of liveState.boqItems) {
      if (!groupedBoqs[item.tenderId]) {
        groupedBoqs[item.tenderId] = [];
      }
      groupedBoqs[item.tenderId].push(mapConvexBoqItem(item));
    }

    const groupedMessages: Record<string, Message[]> = {};
    for (const msg of liveState.messages) {
      const threadKey = msg.bidId || '__desk__';
      if (!groupedMessages[threadKey]) {
        groupedMessages[threadKey] = [];
      }
      groupedMessages[threadKey].push(mapConvexMessage(msg));
    }

    setClientSnapshot((prev) => ({
      ...prev,
      compliance: evaluatedSummary,
      tenders: mappedTenders,
      boqsByTender:
        Object.keys(groupedBoqs).length > 0
          ? { ...prev.boqsByTender, ...groupedBoqs }
          : prev.boqsByTender,
      approvalsByTender:
        Object.keys(groupedApprovals).length > 0
          ? { ...prev.approvalsByTender, ...groupedApprovals }
          : prev.approvalsByTender,
      messagesByThread:
        Object.keys(groupedMessages).length > 0
          ? { ...prev.messagesByThread, ...groupedMessages }
          : prev.messagesByThread,
      usageSummary: liveState.usageSummary ?? prev.usageSummary,
      workspaceSynced: true,
    }));
  }, [isAuthenticated, liveState, currentUser]);

  return null;
}

const rawConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexUrl =
  rawConvexUrl &&
  rawConvexUrl.startsWith('https://') &&
  !rawConvexUrl.includes('your-deployment')
    ? rawConvexUrl
    : undefined;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (convexUrl) {
    return (
      <>
        <ConvexLiveBridge />
        {children}
      </>
    );
  }

  return <>{children}</>;
}

export function useHydrateConvexWorkspace(params: {
  compliance: ComplianceSummary;
  tenders: TenderMatch[];
  bidId?: string;
  boq?: BoQItem[];
  approvals?: ApprovalShieldState[];
  messages?: Message[];
}) {
  useEffect(() => {
    const hydrateBidKey = params.bidId ?? params.tenders[0]?.id;
    const threadKey = hydrateBidKey || '__desk__';
    setClientSnapshot((prev) => ({
      ...prev,
      compliance: prev.compliance ?? params.compliance,
      tenders: prev.tenders.length > 0 ? prev.tenders : params.tenders,
      boqsByTender:
        hydrateBidKey && params.boq && !prev.boqsByTender[hydrateBidKey]
          ? { ...prev.boqsByTender, [hydrateBidKey]: params.boq }
          : prev.boqsByTender,
      approvalsByTender:
        hydrateBidKey &&
        params.approvals &&
        !prev.approvalsByTender[hydrateBidKey]
          ? { ...prev.approvalsByTender, [hydrateBidKey]: params.approvals }
          : prev.approvalsByTender,
      messagesByThread:
        params.messages && !prev.messagesByThread[threadKey]
          ? { ...prev.messagesByThread, [threadKey]: params.messages }
          : prev.messagesByThread,
    }));
  }, [
    params.approvals,
    params.bidId,
    params.boq,
    params.compliance,
    params.messages,
    params.tenders,
  ]);
}

export function useComplianceVaultQuery(
  fallback: ComplianceSummary
): ComplianceSummary {
  const store = useSyncExternalStore(
    subscribeSnapshot,
    getClientSnapshot,
    getClientSnapshot
  );
  return store.compliance ?? fallback;
}

export function useUsageSummaryQuery(): UsageSummary | null {
  const store = useSyncExternalStore(
    subscribeSnapshot,
    getClientSnapshot,
    getClientSnapshot
  );
  return store.usageSummary;
}

export function useTenderWorkspaceQuery(params: {
  bidId?: string;
  initialCompliance: ComplianceSummary;
  initialTenders: TenderMatch[];
  initialBoq?: BoQItem[];
  initialApprovals?: ApprovalShieldState[];
  initialMessages?: Message[];
}) {
  const store = useSyncExternalStore(
    subscribeSnapshot,
    getClientSnapshot,
    getClientSnapshot
  );
  const { isAuthenticated } = useConvexAuth();
  const initialBidIdRef = useRef(params.bidId);

  useHydrateConvexWorkspace({
    compliance: params.initialCompliance,
    tenders: params.initialTenders,
    bidId: initialBidIdRef.current,
    boq: params.initialBoq,
    approvals: params.initialApprovals,
    messages: params.initialMessages,
  });

  const activeTenders =
    store.tenders.length > 0 ? store.tenders : params.initialTenders;
  const bidKey = params.bidId ?? activeTenders[0]?.id ?? '';
  const bidWorkspace = useConvexQuery(
    api.bid.getBidWorkspace,
    isAuthenticated && bidKey ? { bidId: bidKey } : 'skip'
  );

  return useMemo(() => {
    const threadKey = bidKey || '__desk__';
    const initialTargetKey =
      initialBidIdRef.current ?? params.initialTenders[0]?.id ?? '__desk__';
    const isInitialTarget = threadKey === initialTargetKey;
    const liveBoq = bidWorkspace?.boqItems
      ? bidWorkspace.boqItems.map(mapConvexBoqItem)
      : undefined;
    const liveApprovals = bidWorkspace?.approvals
      ? bidWorkspace.approvals
          .map(mapConvexApproval)
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      : undefined;
    const liveMessages = bidWorkspace?.messages
      ? bidWorkspace.messages.map(mapConvexMessage)
      : undefined;

    const cachedMessages =
      liveMessages ??
      store.messagesByThread[threadKey] ??
      (isInitialTarget ? params.initialMessages : undefined);

    return {
      compliance: store.compliance ?? params.initialCompliance,
      tenders: activeTenders,
      boqItems: bidKey
        ? (liveBoq ??
          store.boqsByTender[bidKey] ??
          (isInitialTarget ? params.initialBoq : undefined) ??
          [])
        : [],
      approvals: bidKey
        ? (liveApprovals ??
          store.approvalsByTender[bidKey] ??
          (isInitialTarget ? params.initialApprovals : undefined) ??
          [])
        : [],
      messages: cachedMessages ?? [],
      messagesHydrated: Boolean(
        liveMessages !== undefined ||
          store.messagesByThread[threadKey] !== undefined ||
          store.workspaceSynced ||
          (isInitialTarget && params.initialMessages !== undefined)
      ),
      stagedPdf: bidKey ? (store.stagedPdfsByTender[bidKey] ?? null) : null,
      usageSummary: store.usageSummary,
    };
  }, [
    activeTenders,
    bidKey,
    bidWorkspace,
    params.initialApprovals,
    params.initialBoq,
    params.initialCompliance,
    params.initialMessages,
    params.initialTenders,
    store,
  ]);
}

export function useUploadComplianceMutation() {
  return useCallback(
    async (payload: {
      type: ComplianceDocType;
      referenceNumber: string;
      issuedAt: string;
      expiresAt?: string | null;
      fileName: string;
      fileSizeBytes: number;
      file?: File | null;
      storageId?: string;
    }) => {
      let resolvedStorageId = payload.storageId;

      if (payload.file && !resolvedStorageId) {
        if (!liveConvexMutators) {
          throw new Error(
            'Convex Storage upload session unavailable — please refresh and retry.'
          );
        }
        const uploadUrl =
          await liveConvexMutators.generateComplianceUploadUrl();
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': payload.file.type || 'application/pdf',
          },
          body: payload.file,
        });
        if (!uploadRes.ok) {
          throw new Error(
            `Failed to upload file to Convex Storage (${uploadRes.status})`
          );
        }
        const json = (await uploadRes.json()) as { storageId?: string };
        if (!json.storageId) {
          throw new Error('Convex Storage returned no storageId');
        }
        resolvedStorageId = json.storageId;
      }

      if (!resolvedStorageId) {
        throw new Error(
          'Please select a PDF or certified image file to upload into Convex Storage.'
        );
      }

      const summary = await uploadComplianceDocAction({
        type: payload.type,
        referenceNumber: payload.referenceNumber,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt ?? null,
        fileName: payload.file?.name ?? payload.fileName,
        fileSizeBytes: payload.file?.size ?? payload.fileSizeBytes,
        storageId: resolvedStorageId,
      });

      const vault = await getComplianceVaultAction();
      setClientSnapshot((prev) => ({
        ...prev,
        compliance: summary,
        tenders: vault.tenders,
      }));
      return summary;
    },
    []
  );
}

export function useRunPortalScanMutation() {
  return useCallback(async (preferences?: TenderScanPreferences) => {
    const tenders = await runPortalScanAction(preferences);
    setClientSnapshot((prev) => ({
      ...prev,
      tenders,
    }));
    return tenders;
  }, []);
}

export function useSaveBoqMutation() {
  return useCallback(async (bidId: string, items: BoQItem[]) => {
    const saved = await saveBoqItemsAction(bidId, items);
    setClientSnapshot((prev) => ({
      ...prev,
      boqsByTender: { ...prev.boqsByTender, [bidId]: saved },
    }));
    return saved;
  }, []);
}

export function useStampSbdMutation() {
  return useCallback(
    async (params: { bidId: string; grandTotalZar: number }) => {
      const result = await stampSbdFormsAction(params);
      setClientSnapshot((prev) => ({
        ...prev,
        stagedPdfsByTender: {
          ...prev.stagedPdfsByTender,
          [params.bidId]: result,
        },
        tenders: prev.tenders.map((t) =>
          t.id === params.bidId
            ? {
                ...t,
                stagedPdfFileName: result.fileName,
                stagedPdfBase64: result.base64Pdf,
                stampedSbdPageCount: result.pageCount,
                stampedSbdMethod: result.stampingMethod,
              }
            : t
        ),
      }));
      return result;
    },
    []
  );
}

export function useTriggerApprovalShieldMutation() {
  return useCallback(
    async (payload: {
      bidId: string;
      tenderNumber: string;
      actionType: ApprovalActionType;
      totalBidZar: number;
      vatZar: number;
      grandTotalZar: number;
      targetResource: string;
      commandPreview: string;
      boatSessionId?: string | null;
    }) => {
      const created = await triggerApprovalShieldAction(payload);
      const fresh = await getBidWorkspaceAction(payload.bidId);
      setClientSnapshot((prev) => ({
        ...prev,
        approvalsByTender: {
          ...prev.approvalsByTender,
          [payload.bidId]: fresh.approvals,
        },
        tenders: prev.tenders.map((t) =>
          t.id === payload.bidId ? { ...t, status: 'pending_approval' } : t
        ),
      }));
      return created;
    },
    []
  );
}

export function useResolveApprovalShieldMutation() {
  return useCallback(
    async (params: {
      bidId: string;
      approvalId: string;
      decision: 'approved' | 'rejected';
      operatorName?: string;
    }) => {
      const result = await resolveApprovalShieldAction({
        approvalId: params.approvalId,
        decision: params.decision,
        operatorName: params.operatorName,
      });

      const fresh = await getBidWorkspaceAction(params.bidId);
      setClientSnapshot((prev) => ({
        ...prev,
        approvalsByTender: {
          ...prev.approvalsByTender,
          [params.bidId]: fresh.approvals,
        },
        tenders: prev.tenders.map((t) =>
          t.id === params.bidId && params.decision === 'approved'
            ? { ...t, status: 'submitted' }
            : t
        ),
      }));
      return result;
    },
    []
  );
}
