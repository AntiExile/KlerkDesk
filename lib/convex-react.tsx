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
import { api } from '@/convex/_generated/api';
import {
  getComplianceVaultAction,
  refreshCsdReportAction,
  uploadComplianceDocAction,
} from '@/app/actions/compliance';
import {
  getBidWorkspaceAction,
  resolveApprovalShieldAction,
  saveBoqItemsAction,
  stampSbdFormsAction,
  triggerApprovalShieldAction,
} from '@/app/actions/bid';
import type { StampedSbdResult } from '@/lib/pdf-stamp';
import type {
  ApprovalActionType,
  ApprovalShieldState,
  BoQItem,
  ComplianceDoc,
  ComplianceDocType,
  ComplianceSummary,
  TenderMatch,
} from '@/types';

interface ReactiveWorkspaceSnapshot {
  compliance: ComplianceSummary | null;
  tenders: TenderMatch[];
  boqsByTender: Record<string, BoQItem[]>;
  approvalsByTender: Record<string, ApprovalShieldState[]>;
  stagedPdfsByTender: Record<string, StampedSbdResult>;
}

const listeners = new Set<() => void>();

let clientSnapshot: ReactiveWorkspaceSnapshot = {
  compliance: null,
  tenders: [],
  boqsByTender: {},
  approvalsByTender: {},
  stagedPdfsByTender: {},
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
  upsertDoc: (args: {
    docType: ComplianceDocType;
    referenceNumber: string;
    issuedAt: string;
    expiresAt: string | null;
    fileName: string;
    fileSizeBytes: number;
    storageId?: string;
  }) => Promise<unknown>;
  refreshCsd: () => Promise<unknown>;
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
  resolveApproval: (args: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    operatorName?: string;
  }) => Promise<unknown>;
}

let liveConvexMutators: LiveConvexMutators | null = null;

/**
 * Unconditionally mounts Convex `useQuery` and `useMutation` hooks when
 * `NEXT_PUBLIC_CONVEX_URL` is configured, syncing live Convex database
 * updates into the shared reactive workspace store.
 */
function ConvexLiveBridge() {
  const { isAuthenticated } = useConvexAuth();
  const liveState = useConvexQuery(api.tenderOps.getWorkspaceState, {});
  const ensureDemoSeed = useConvexMutation(api.users.ensureDemoSeed);
  const upsertDoc = useConvexMutation(api.tenderOps.upsertComplianceDoc);
  const refreshCsd = useConvexMutation(api.tenderOps.refreshCsdReport);
  const saveBoq = useConvexMutation(api.tenderOps.saveBoqItems);
  const saveStamp = useConvexMutation(api.tenderOps.saveStampedSbdPackage);
  const triggerApproval = useConvexMutation(api.tenderOps.triggerApprovalShield);
  const resolveApproval = useConvexMutation(api.tenderOps.resolveApprovalShield);
  const seededForUserRef = useRef(false);

  useEffect(() => {
    if (
      isAuthenticated &&
      liveState &&
      liveState.docs.length === 0 &&
      !seededForUserRef.current
    ) {
      seededForUserRef.current = true;
      void ensureDemoSeed({}).catch(() => {
        seededForUserRef.current = false;
      });
    }
  }, [isAuthenticated, liveState, ensureDemoSeed]);

  useEffect(() => {
    liveConvexMutators = {
      upsertDoc: (args) => upsertDoc(args),
      refreshCsd: () => refreshCsd({}),
      saveBoq: (args) => saveBoq(args),
      saveStamp: (args) => saveStamp(args),
      triggerApproval: (args) => triggerApproval(args),
      resolveApproval: (args) => resolveApproval(args),
    };
    return () => {
      liveConvexMutators = null;
    };
  }, [upsertDoc, refreshCsd, saveBoq, saveStamp, triggerApproval, resolveApproval]);

  useEffect(() => {
    if (!liveState) return;
    if (liveState.docs.length > 0) {
      const mappedDocs: ComplianceDoc[] = liveState.docs.map((d) => ({
        id: d.docId,
        type: d.docType as ComplianceDocType,
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
      }));

      const blockingAlerts = mappedDocs
        .filter((d) => d.status === 'expired' || d.status === 'missing')
        .map((d) => `${d.shortLabel}: ${d.alertReason ?? 'Missing'}`);
      const warningAlerts = mappedDocs
        .filter((d) => d.status === 'warning' && d.alertReason)
        .map((d) => `${d.shortLabel}: ${d.alertReason}`);

      setClientSnapshot((prev) => ({
        ...prev,
        compliance: {
          docs: mappedDocs,
          isBidReady: blockingAlerts.length === 0,
          blockingAlerts,
          warningAlerts,
          lastCheckedAt: new Date().toISOString(),
        },
      }));
    }
  }, [liveState]);

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
}) {
  useEffect(() => {
    setClientSnapshot((prev) => ({
      ...prev,
      compliance: prev.compliance ?? params.compliance,
      tenders: prev.tenders.length > 0 ? prev.tenders : params.tenders,
      boqsByTender:
        params.bidId && params.boq && !prev.boqsByTender[params.bidId]
          ? { ...prev.boqsByTender, [params.bidId]: params.boq }
          : prev.boqsByTender,
      approvalsByTender:
        params.bidId &&
        params.approvals &&
        !prev.approvalsByTender[params.bidId]
          ? { ...prev.approvalsByTender, [params.bidId]: params.approvals }
          : prev.approvalsByTender,
    }));
  }, [params.approvals, params.bidId, params.boq, params.compliance, params.tenders]);
}

export function useComplianceVaultQuery(fallback: ComplianceSummary): ComplianceSummary {
  const store = useSyncExternalStore(
    subscribeSnapshot,
    getClientSnapshot,
    getClientSnapshot
  );
  return store.compliance ?? fallback;
}

export function useTenderWorkspaceQuery(params: {
  bidId?: string;
  initialCompliance: ComplianceSummary;
  initialTenders: TenderMatch[];
  initialBoq?: BoQItem[];
  initialApprovals?: ApprovalShieldState[];
}) {
  const store = useSyncExternalStore(
    subscribeSnapshot,
    getClientSnapshot,
    getClientSnapshot
  );

  useHydrateConvexWorkspace({
    compliance: params.initialCompliance,
    tenders: params.initialTenders,
    bidId: params.bidId,
    boq: params.initialBoq,
    approvals: params.initialApprovals,
  });

  return useMemo(() => {
    const bidKey =
      params.bidId ?? params.initialTenders[0]?.id ?? 'ET-2026-WC-0842';
    return {
      compliance: store.compliance ?? params.initialCompliance,
      tenders: store.tenders.length > 0 ? store.tenders : params.initialTenders,
      boqItems: store.boqsByTender[bidKey] ?? params.initialBoq ?? [],
      approvals:
        store.approvalsByTender[bidKey] ?? params.initialApprovals ?? [],
      stagedPdf: store.stagedPdfsByTender[bidKey] ?? null,
    };
  }, [
    params.bidId,
    params.initialApprovals,
    params.initialBoq,
    params.initialCompliance,
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
      storageId?: string;
    }) => {
      if (liveConvexMutators) {
        try {
          await liveConvexMutators.upsertDoc({
            docType: payload.type,
            referenceNumber: payload.referenceNumber,
            issuedAt: payload.issuedAt,
            expiresAt: payload.expiresAt ?? null,
            fileName: payload.fileName,
            fileSizeBytes: payload.fileSizeBytes,
            storageId: payload.storageId,
          });
        } catch (err) {
          console.warn('[Convex] Live mutation fallback:', err);
        }
      }

      const summary = await uploadComplianceDocAction(payload);
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

export function useRefreshCsdMutation() {
  return useCallback(async () => {
    if (liveConvexMutators) {
      try {
        await liveConvexMutators.refreshCsd();
      } catch (err) {
        console.warn('[Convex] Live refreshCsd fallback:', err);
      }
    }

    const summary = await refreshCsdReportAction();
    const vault = await getComplianceVaultAction();
    setClientSnapshot((prev) => ({
      ...prev,
      compliance: summary,
      tenders: vault.tenders,
    }));
    return summary;
  }, []);
}

export function useSaveBoqMutation() {
  return useCallback(async (bidId: string, items: BoQItem[]) => {
    const saved = await saveBoqItemsAction(bidId, items);
    if (liveConvexMutators) {
      try {
        await liveConvexMutators.saveBoq({
          tenderId: bidId,
          items: saved.map((i) => ({
            itemId: i.id,
            itemCode: i.itemCode,
            section: i.section,
            description: i.description,
            unit: i.unit,
            quantity: i.quantity,
            rateZar: i.rateZar,
            amountZar: i.amountZar,
          })),
        });
      } catch (err) {
        console.warn('[Convex] Live saveBoq fallback:', err);
      }
    }

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
      if (liveConvexMutators) {
        try {
          await liveConvexMutators.saveStamp({
            tenderId: params.bidId,
            fileName: result.fileName,
            base64Pdf: result.base64Pdf,
            pageCount: result.pageCount,
            stampingMethod: result.stampingMethod,
          });
        } catch (err) {
          console.warn('[Convex] Live saveStamp fallback:', err);
        }
      }

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
      if (liveConvexMutators) {
        try {
          await liveConvexMutators.triggerApproval({
            approvalId: created.id,
            bidId: created.bidId,
            tenderNumber: created.tenderNumber,
            actionType: created.actionType,
            totalBidZar: created.totalBidZar,
            vatZar: created.vatZar,
            grandTotalZar: created.grandTotalZar,
            targetResource: created.targetResource,
            commandPreview: created.commandPreview,
            complianceVerified: created.complianceVerified,
            complianceWarnings: created.complianceWarnings,
            requestedBy: created.requestedBy,
            boatSessionId: created.boatSessionId,
          });
        } catch (err) {
          console.warn('[Convex] Live triggerApproval fallback:', err);
        }
      }

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
      const updated = await resolveApprovalShieldAction({
        approvalId: params.approvalId,
        decision: params.decision,
        operatorName: params.operatorName,
      });

      if (liveConvexMutators) {
        try {
          await liveConvexMutators.resolveApproval({
            approvalId: params.approvalId,
            decision: params.decision,
            operatorName: params.operatorName,
          });
        } catch (err) {
          console.warn('[Convex] Live resolveApproval fallback:', err);
        }
      }

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
      return updated;
    },
    []
  );
}
