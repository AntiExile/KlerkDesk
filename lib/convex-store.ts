import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { convexAuthNextjsAccessToken } from '@/lib/convexAuth';
import {
  createEmptyComplianceDocs,
  evaluateComplianceSummary,
  evaluateSingleDoc,
  isLegacySeededComplianceDoc,
  isLegacySeededProfile,
} from '@/lib/compliance';
import {
  fetchLiveETendersForPreferences,
  parseScanPrefsFromRegions,
  serializeScanPrefsToRegions,
  type TenderScanPreferences,
  type TenderSectorId,
} from '@/lib/etenders-live';
import { generateOpenRouterEmbeddings, type TenderAITask } from '@/lib/openrouter';
import { chunkPdfPages, extractPdfPagesText } from '@/lib/rag';
import type {
  ApprovalActionType,
  ApprovalShieldState,
  BoQItem,
  ComplianceDoc,
  ComplianceDocType,
  ComplianceSummary,
  ContractorSettings,
  DirectorInfo,
  PlanTier,
  SourceCitation,
  SubmissionChannel,
  TenderMatch,
  UsageSummary,
} from '@/types';

export {
  createEmptyComplianceDocs,
  evaluateComplianceSummary,
  evaluateSingleDoc,
  isLegacySeededComplianceDoc,
  isLegacySeededProfile,
};

const legacyGenerateUploadUrlRef = makeFunctionReference<'mutation'>(
  'tenderOps:generateUploadUrl'
);
const legacyUpsertComplianceDocRef = makeFunctionReference<'mutation'>(
  'tenderOps:upsertComplianceDoc'
);
const legacySaveBoqItemsRef = makeFunctionReference<'mutation'>(
  'tenderOps:saveBoqItems'
);
const legacySaveStampedSbdRef = makeFunctionReference<'mutation'>(
  'tenderOps:saveStampedSbdPackage'
);
const legacyTriggerApprovalRef = makeFunctionReference<'mutation'>(
  'tenderOps:triggerApprovalShield'
);
const legacyResolveApprovalRef = makeFunctionReference<'mutation'>(
  'tenderOps:resolveApprovalShield'
);
const legacyAppendMessageRef = makeFunctionReference<'mutation'>(
  'tenderOps:appendMessage'
);
const legacySearchChunksRef = makeFunctionReference<'action'>(
  'tenderOps:searchChunks'
);

function isUnpushedConvexError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Could not find public function') ||
    message.includes('ArgumentValidationError') ||
    message.includes('extra field')
  );
}

export function getConvexHttpClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url || !url.startsWith('https://') || url.includes('your-deployment')) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
  }
  return new ConvexHttpClient(url);
}

export async function requireAuthenticatedConvex(): Promise<{
  client: ConvexHttpClient;
  user: NonNullable<Awaited<ReturnType<ConvexHttpClient['query']>>> & {
    _id: Id<'users'>;
    username: string | null;
    isDemo: boolean;
    companyName: string;
    registrationNumber: string;
    csdMaaaNumber: string;
    csdNumber: string;
    taxRefNumber: string;
    taxPinNumber: string;
    sarsTcsPin: string;
    bbbeeLevel: string;
    cidbGrade: string;
    municipalRegions: string[];
    preferredRegions: string[];
    sectors: string[];
    whatsappNumber: string;
    whatsappPhone: string;
    planTier: PlanTier;
    directors: DirectorInfo[];
  };
}> {
  const client = getConvexHttpClient();
  const token = await convexAuthNextjsAccessToken().catch(() => null);
  if (!token) {
    throw new Error('Unauthorized: authentication required');
  }

  client.setAuth(token);
  const currentUser = await client.query(api.users.currentUser, {});
  if (!currentUser) {
    throw new Error('Unauthorized: active user session not found');
  }

  return {
    client,
    user: currentUser as Awaited<
      ReturnType<typeof requireAuthenticatedConvex>
    >['user'],
  };
}

function mapConvexDocsToSummary(
  rows: Array<{
    docId: string;
    docType: string;
    title: string;
    shortLabel: string;
    referenceNumber: string;
    issuedAt: string;
    expiresAt?: string | null;
    maxAgeDays?: number | null;
    fileName: string;
    fileSizeBytes: number;
    storageId?: string | Id<'_storage'>;
  }>,
  isDemo: boolean
): ComplianceSummary {
  const filteredRows = isDemo
    ? rows
    : rows.filter((row) => !isLegacySeededComplianceDoc(row));

  const emptySlots = createEmptyComplianceDocs();
  const byType = new Map<ComplianceDocType, ComplianceDoc>();

  for (const row of filteredRows) {
    const docType = row.docType as ComplianceDocType;
    byType.set(
      docType,
      evaluateSingleDoc({
        id: row.docId,
        type: docType,
        title: row.title,
        shortLabel: row.shortLabel,
        referenceNumber: row.referenceNumber,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt ?? null,
        maxAgeDays: row.maxAgeDays ?? null,
        fileName: row.fileName,
        fileSizeBytes: row.fileSizeBytes,
        storageId: row.storageId ? String(row.storageId) : undefined,
      })
    );
  }

  const merged = emptySlots.map((slot) => byType.get(slot.type) ?? slot);
  return evaluateComplianceSummary(merged);
}

function mapConvexTenderRow(
  row: {
    tenderId: string;
    tenderNumber: string;
    title: string;
    municipality: string;
    region: string;
    cidbGrade: string;
    closingDate: string;
    briefingDate?: string | null;
    briefingCompulsory: boolean;
    estimatedValueZar: number;
    matchScore: number;
    status: 'matched' | 'staging' | 'pending_approval' | 'submitted';
    portalUrl: string;
    submissionChannel?: SubmissionChannel;
    complianceReady: boolean;
    complianceBlocks: string[];
    summary: string;
    sbdFormsRequired: string[];
    stampedSbdFileName?: string;
    stampedSbdBase64?: string;
    stampedSbdStorageId?: string | Id<'_storage'>;
    stampedSbdPageCount?: number;
    stampedSbdMethod?: string;
    publishedDate?: string;
    ocid?: string;
    procurementCategory?: string;
  },
  summary: ComplianceSummary
): TenderMatch {
  return {
    id: row.tenderId,
    tenderNumber: row.tenderNumber,
    title: row.title,
    municipality: row.municipality,
    region: row.region,
    cidbGrade: row.cidbGrade,
    closingDate: row.closingDate,
    briefingDate: row.briefingDate ?? null,
    briefingCompulsory: row.briefingCompulsory,
    estimatedValueZar: row.estimatedValueZar,
    matchScore: row.matchScore,
    status: row.status,
    portalUrl: row.portalUrl,
    submissionChannel: row.submissionChannel ?? 'etenders_esubmission',
    complianceReady: summary.isBidReady,
    complianceBlocks: summary.blockingAlerts,
    summary: row.summary,
    sbdFormsRequired: row.sbdFormsRequired,
    stagedPdfFileName: row.stampedSbdFileName,
    stagedPdfBase64: row.stampedSbdBase64,
    stampedSbdStorageId: row.stampedSbdStorageId
      ? String(row.stampedSbdStorageId)
      : undefined,
    stampedSbdPageCount: row.stampedSbdPageCount,
    stampedSbdMethod: row.stampedSbdMethod,
    publishedDate: row.publishedDate,
    ocid: row.ocid,
    procurementCategory: row.procurementCategory,
  };
}

function mapConvexApprovalRow(row: {
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
  mergedPackStorageId?: Id<'_storage'>;
  mergedPackUrl?: string;
  submissionChannel?: string;
  whatsappDispatched?: boolean;
}): ApprovalShieldState {
  return {
    id: row.approvalId,
    bidId: row.bidId,
    tenderNumber: row.tenderNumber,
    actionType: row.actionType,
    status: row.status,
    totalBidZar: row.totalBidZar,
    vatZar: row.vatZar,
    grandTotalZar: row.grandTotalZar,
    targetResource: row.targetResource,
    commandPreview: row.commandPreview,
    complianceVerified: row.complianceVerified,
    complianceWarnings: row.complianceWarnings,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    boatSessionId: row.boatSessionId ?? null,
    mergedPackStorageId: row.mergedPackStorageId
      ? String(row.mergedPackStorageId)
      : undefined,
    mergedPackUrl: row.mergedPackUrl,
    submissionChannel: row.submissionChannel,
    whatsappDispatched: row.whatsappDispatched,
  };
}

export async function uploadBytesToConvexStorage(
  client: ConvexHttpClient,
  bytes: Uint8Array,
  contentType: string
): Promise<Id<'_storage'>> {
  let uploadUrl: string;
  try {
    uploadUrl = await client.mutation(api.bid.generateUploadUrl, {});
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    uploadUrl = await client.mutation(legacyGenerateUploadUrlRef, {});
  }

  const blob = new Blob([Uint8Array.from(bytes)], { type: contentType });
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadRes.ok) {
    throw new Error(`Convex Storage upload failed (${uploadRes.status})`);
  }
  const json = (await uploadRes.json()) as { storageId?: string };
  if (!json.storageId) {
    throw new Error('Convex Storage upload returned empty storageId');
  }
  return json.storageId as Id<'_storage'>;
}

export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const { client, user } = await requireAuthenticatedConvex();
  try {
    const rows = await client.query(api.compliance.getComplianceVault, {});
    return mapConvexDocsToSummary(rows, user.isDemo);
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    const ws = await client.query(api.tenderOps.getWorkspaceState, {});
    return mapConvexDocsToSummary(ws.docs, user.isDemo);
  }
}

export async function listComplianceStorageAttachments() {
  const { client } = await requireAuthenticatedConvex();
  try {
    return await client.query(api.compliance.listComplianceStorageUrls, {});
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    return [];
  }
}

export async function upsertComplianceDoc(input: {
  type: ComplianceDocType;
  referenceNumber: string;
  issuedAt: string;
  expiresAt?: string | null;
  fileName: string;
  fileSizeBytes: number;
  storageId: string;
}): Promise<ComplianceSummary> {
  const { client } = await requireAuthenticatedConvex();
  if (!input.storageId || input.storageId.length < 10) {
    throw new Error('A valid Convex _storage upload is required.');
  }

  try {
    await client.mutation(api.compliance.saveComplianceDocument, {
      storageId: input.storageId as Id<'_storage'>,
      docType: input.type,
      referenceNumber: input.referenceNumber,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt ?? null,
    });
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    await client.mutation(legacyUpsertComplianceDocRef, {
      docType: input.type,
      referenceNumber: input.referenceNumber,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt ?? null,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      storageId: input.storageId,
    });
  }

  return getComplianceSummary();
}

export async function getTenderMatches(): Promise<TenderMatch[]> {
  const { client, user } = await requireAuthenticatedConvex();
  try {
    const [rows, docs] = await Promise.all([
      client.query(api.tenders.listTenderMatches, {}),
      client.query(api.compliance.getComplianceVault, {}),
    ]);
    const summary = mapConvexDocsToSummary(docs, user.isDemo);
    return rows.map((row) => mapConvexTenderRow(row, summary));
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    const ws = await client.query(api.tenderOps.getWorkspaceState, {});
    const summary = mapConvexDocsToSummary(ws.docs, user.isDemo);
    return ws.tenders.map((row) => mapConvexTenderRow(row, summary));
  }
}

async function safeUpdateProfile(
  client: ConvexHttpClient,
  fullPayload: Parameters<ConvexHttpClient['mutation']>[1]
) {
  try {
    await client.mutation(api.users.updateProfile, fullPayload);
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    const p = fullPayload as Record<string, unknown>;
    await client.mutation(api.users.updateProfile, {
      companyName: p.companyName as string | undefined,
      csdMaaaNumber: p.csdMaaaNumber as string | undefined,
      taxPinNumber: p.taxPinNumber as string | undefined,
      bbbeeLevel: p.bbbeeLevel as string | undefined,
      cidbGrade: p.cidbGrade as string | undefined,
      municipalRegions: p.municipalRegions as string[] | undefined,
      whatsappNumber: p.whatsappNumber as string | undefined,
    });
  }
}

export async function triggerPortalTenderScan(
  inputPrefs?: TenderScanPreferences
): Promise<TenderMatch[]> {
  const { client, user } = await requireAuthenticatedConvex();
  const [compliance, settings] = await Promise.all([
    getComplianceSummary(),
    getContractorSettings(),
  ]);

  if (inputPrefs) {
    const encodedRegions = serializeScanPrefsToRegions(
      settings.municipalRegions,
      inputPrefs
    );
    await safeUpdateProfile(client, {
      cidbGrade: inputPrefs.cidbGrade || settings.cidbGrade,
      municipalRegions: encodedRegions,
      preferredRegions: inputPrefs.provinces,
      sectors: inputPrefs.sectors,
    });
  }

  const savedPrefs = settings.scanPreferences;
  const activePrefs: TenderScanPreferences = inputPrefs ??
    (savedPrefs
      ? {
          sectors: (savedPrefs.sectors as TenderSectorId[]) ?? ['civil_roads'],
          provinces: savedPrefs.provinces ?? ['All South Africa'],
          tenderType: savedPrefs.tenderType ?? 'all',
          sortBy: savedPrefs.sortBy ?? 'best_match',
          cidbGrade: savedPrefs.cidbGrade ?? settings.cidbGrade ?? '',
          customKeywords: savedPrefs.customKeywords ?? '',
          configuredAt: savedPrefs.configuredAt ?? new Date().toISOString(),
        }
      : {
          sectors:
            user.sectors?.length
              ? (user.sectors as TenderSectorId[])
              : ['civil_roads', 'building_construction'],
          provinces:
            user.preferredRegions?.length
              ? user.preferredRegions
              : ['All South Africa'],
          tenderType: 'all',
          sortBy: 'best_match',
          cidbGrade: settings.cidbGrade || '',
          customKeywords: '',
          configuredAt: new Date().toISOString(),
        });

  const liveResult = await fetchLiveETendersForPreferences(
    activePrefs,
    compliance,
    settings.municipalRegions
  );

  if (liveResult.tenders.length === 0) {
    return getTenderMatches();
  }

  const boqGroups = Object.entries(liveResult.boqsByTender).map(
    ([tenderId, items]) => ({
      tenderId,
      items: items.map((i) => ({
        itemId: i.id,
        itemCode: i.itemCode,
        section: i.section,
        description: i.description,
        unit: i.unit,
        quantity: i.quantity,
        rateZar: i.rateZar,
        amountZar: i.amountZar,
      })),
    })
  );

  try {
    await client.mutation(api.tenders.saveTenderMatches, {
      tenders: liveResult.tenders.map((t) => ({
        tenderId: t.id,
        tenderNumber: t.tenderNumber,
        ocid: t.ocid,
        publishedDate: t.publishedDate,
        procurementCategory: t.procurementCategory,
        title: t.title,
        municipality: t.municipality,
        region: t.region,
        cidbGrade: t.cidbGrade,
        closingDate: t.closingDate,
        briefingDate: t.briefingDate,
        briefingCompulsory: t.briefingCompulsory,
        estimatedValueZar: t.estimatedValueZar,
        matchScore: t.matchScore,
        status: t.status,
        portalUrl: t.portalUrl,
        submissionChannel: t.submissionChannel ?? 'etenders_esubmission',
        complianceReady: t.complianceReady,
        complianceBlocks: t.complianceBlocks,
        summary: t.summary,
        sbdFormsRequired: t.sbdFormsRequired,
      })),
      boqGroups,
      replaceActive: true,
    });
    return getTenderMatches();
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    return liveResult.tenders;
  }
}

export async function getTenderById(id: string): Promise<{
  tender: TenderMatch | null;
  boq: BoQItem[];
  compliance: ComplianceSummary;
  approvals: ApprovalShieldState[];
}> {
  const { client, user } = await requireAuthenticatedConvex();
  try {
    const workspace = await client.query(api.bid.getBidWorkspace, { bidId: id });
    const compliance = mapConvexDocsToSummary(workspace.docs, user.isDemo);

    const tender = workspace.tender
      ? mapConvexTenderRow(workspace.tender, compliance)
      : null;

    const boq: BoQItem[] = workspace.boqItems.map((b) => ({
      id: b.itemId,
      itemCode: b.itemCode,
      section: b.section,
      description: b.description,
      unit: b.unit,
      quantity: b.quantity,
      rateZar: b.rateZar,
      amountZar: b.amountZar,
    }));

    const approvals: ApprovalShieldState[] = workspace.approvals
      .map(mapConvexApprovalRow)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

    return { tender, boq, compliance, approvals };
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    const ws = await client.query(api.tenderOps.getWorkspaceState, {
      bidId: id,
    });
    const compliance = mapConvexDocsToSummary(ws.docs, user.isDemo);
    const tenderRow = ws.tenders.find((t) => t.tenderId === id) ?? null;
    const tender = tenderRow ? mapConvexTenderRow(tenderRow, compliance) : null;
    const boq: BoQItem[] = ws.boqItems.map((b) => ({
      id: b.itemId,
      itemCode: b.itemCode,
      section: b.section,
      description: b.description,
      unit: b.unit,
      quantity: b.quantity,
      rateZar: b.rateZar,
      amountZar: b.amountZar,
    }));
    const approvals: ApprovalShieldState[] = ws.approvals
      .map(mapConvexApprovalRow)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return { tender, boq, compliance, approvals };
  }
}

export async function updateBoqForTender(
  tenderId: string,
  items: BoQItem[]
): Promise<BoQItem[]> {
  const { client } = await requireAuthenticatedConvex();
  const normalized = items.map((item) => ({
    ...item,
    amountZar: Math.round(item.quantity * item.rateZar * 100) / 100,
  }));

  const payload = {
    tenderId,
    items: normalized.map((i) => ({
      itemId: i.id,
      itemCode: i.itemCode,
      section: i.section,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      rateZar: i.rateZar,
      amountZar: i.amountZar,
    })),
  };

  try {
    await client.mutation(api.bid.saveBoqItems, payload);
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    await client.mutation(legacySaveBoqItemsRef, payload);
  }

  return normalized;
}

export async function saveStampedSbdForTender(params: {
  tenderId: string;
  fileName: string;
  base64Pdf: string;
  pageCount: number;
  stampingMethod: string;
}) {
  const { client } = await requireAuthenticatedConvex();
  const bytes = Buffer.from(params.base64Pdf, 'base64');
  const storageId = await uploadBytesToConvexStorage(
    client,
    new Uint8Array(bytes),
    'application/pdf'
  );

  try {
    await client.mutation(api.bid.saveStampedSbdPackage, {
      tenderId: params.tenderId,
      fileName: params.fileName,
      base64Pdf: params.base64Pdf,
      pageCount: params.pageCount,
      stampingMethod: params.stampingMethod,
      storageId,
    });
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    await client.mutation(legacySaveStampedSbdRef, {
      tenderId: params.tenderId,
      fileName: params.fileName,
      base64Pdf: params.base64Pdf,
      pageCount: params.pageCount,
      stampingMethod: params.stampingMethod,
    });
  }

  return storageId;
}

/**
 * Mandatory Approval Shield Guardrail:
 * Writes a `pending_approval` record to Convex (`pendingApprovals`) before any
 * eTenders.gov.za submission, external email, or WhatsApp broadcast can execute.
 */
export async function createPendingApproval(input: {
  bidId: string;
  tenderNumber: string;
  actionType: ApprovalActionType;
  totalBidZar: number;
  vatZar: number;
  grandTotalZar: number;
  targetResource: string;
  commandPreview: string;
  submissionChannel?: string;
  boatSessionId?: string | null;
  requestedBy?: string;
}): Promise<ApprovalShieldState> {
  const { client, user } = await requireAuthenticatedConvex();
  const compliance = await getComplianceSummary();
  const approvalId = `apr-${Date.now().toString(36)}`;
  const requestedBy =
    input.requestedBy ?? user.username ?? 'Authenticated Operator';

  try {
    await client.mutation(api.bid.triggerApprovalShield, {
      approvalId,
      bidId: input.bidId,
      tenderNumber: input.tenderNumber,
      actionType: input.actionType,
      totalBidZar: input.totalBidZar,
      vatZar: input.vatZar,
      grandTotalZar: input.grandTotalZar,
      targetResource: input.targetResource,
      commandPreview: input.commandPreview,
      complianceVerified: compliance.isBidReady,
      complianceWarnings: [
        ...compliance.blockingAlerts,
        ...compliance.warningAlerts,
      ],
      requestedBy,
      submissionChannel: input.submissionChannel,
      boatSessionId: input.boatSessionId ?? null,
    });

    const saved = await client.query(api.bid.getApprovalById, { approvalId });
    if (!saved) {
      throw new Error('Failed to create pendingApproval record in Convex');
    }
    return mapConvexApprovalRow(saved);
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    await client.mutation(legacyTriggerApprovalRef, {
      approvalId,
      bidId: input.bidId,
      tenderNumber: input.tenderNumber,
      actionType: input.actionType,
      totalBidZar: input.totalBidZar,
      vatZar: input.vatZar,
      grandTotalZar: input.grandTotalZar,
      targetResource: input.targetResource,
      commandPreview: input.commandPreview,
      complianceVerified: compliance.isBidReady,
      complianceWarnings: [
        ...compliance.blockingAlerts,
        ...compliance.warningAlerts,
      ],
      requestedBy,
      boatSessionId: input.boatSessionId ?? null,
    });
    return {
      id: approvalId,
      bidId: input.bidId,
      tenderNumber: input.tenderNumber,
      actionType: input.actionType,
      status: 'pending_approval',
      totalBidZar: input.totalBidZar,
      vatZar: input.vatZar,
      grandTotalZar: input.grandTotalZar,
      targetResource: input.targetResource,
      commandPreview: input.commandPreview,
      complianceVerified: compliance.isBidReady,
      complianceWarnings: [
        ...compliance.blockingAlerts,
        ...compliance.warningAlerts,
      ],
      requestedBy,
      requestedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      boatSessionId: input.boatSessionId ?? null,
      submissionChannel: input.submissionChannel,
    };
  }
}

export async function getApprovalRecordById(
  approvalId: string
): Promise<ApprovalShieldState | null> {
  const { client } = await requireAuthenticatedConvex();
  try {
    const record = await client.query(api.bid.getApprovalById, { approvalId });
    return record ? mapConvexApprovalRow(record) : null;
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    const ws = await client.query(api.tenderOps.getWorkspaceState, {});
    const found = ws.approvals.find((a) => a.approvalId === approvalId);
    return found ? mapConvexApprovalRow(found) : null;
  }
}

export async function resolvePendingApproval(input: {
  approvalId: string;
  decision: 'approved' | 'rejected';
  operatorName?: string;
  mergedPackStorageId?: Id<'_storage'>;
  submissionChannel?: string;
  whatsappDispatched?: boolean;
  boatSessionId?: string | null;
}): Promise<ApprovalShieldState | null> {
  const { client, user } = await requireAuthenticatedConvex();
  const operatorName =
    input.operatorName ?? user.username ?? 'Authenticated Director';

  try {
    const updated = await client.mutation(api.bid.resolveApprovalShield, {
      approvalId: input.approvalId,
      decision: input.decision,
      operatorName,
      mergedPackStorageId: input.mergedPackStorageId,
      submissionChannel: input.submissionChannel,
      whatsappDispatched: input.whatsappDispatched,
      boatSessionId: input.boatSessionId,
    });
    return updated ? mapConvexApprovalRow(updated) : null;
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    await client.mutation(legacyResolveApprovalRef, {
      approvalId: input.approvalId,
      decision: input.decision,
      operatorName,
    });
    const ws = await client.query(api.tenderOps.getWorkspaceState, {});
    const found = ws.approvals.find((a) => a.approvalId === input.approvalId);
    return found ? mapConvexApprovalRow(found) : null;
  }
}

export async function indexPdfIntoTenderChunks(params: {
  tenderId: string;
  fileName: string;
  bytes: Uint8Array;
  fileType?: string;
}): Promise<{
  chunkCount: number;
  pageCount: number;
  storageId: Id<'_storage'>;
  sampleText: string;
}> {
  const { client } = await requireAuthenticatedConvex();
  const storageId = await uploadBytesToConvexStorage(
    client,
    params.bytes,
    'application/pdf'
  );

  const pages = await extractPdfPagesText(params.bytes);
  const chunks = chunkPdfPages(pages, 800, 120);
  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      pageCount: pages.length,
      storageId,
      sampleText: '',
    };
  }

  const boundedChunks = chunks.slice(0, 80);
  const { vectors } = await generateOpenRouterEmbeddings(
    boundedChunks.map((c) => c.text)
  );

  try {
    await client.mutation(api.chat.insertTenderChunks, {
      tenderId: params.tenderId,
      chunks: boundedChunks.map((c, idx) => ({
        sourceTitle: `${params.fileName} (Page ${c.pageNumber})`,
        filePath: `convex://tenderChunks/${params.tenderId}/${params.fileName}`,
        pageNumber: c.pageNumber,
        text: c.text,
        fileType: params.fileType ?? 'pdf',
        storageId,
        embedding: vectors[idx],
      })),
    });
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
  }

  return {
    chunkCount: boundedChunks.length,
    pageCount: pages.length,
    storageId,
    sampleText: boundedChunks
      .slice(0, 4)
      .map((c) => `[p.${c.pageNumber}] ${c.text}`)
      .join('\n'),
  };
}

export async function searchTenderChunks(
  query: string,
  bidId?: string
): Promise<SourceCitation[]> {
  const { client } = await requireAuthenticatedConvex();
  const { vectors } = await generateOpenRouterEmbeddings([query]);
  const embedding = vectors[0];
  if (!embedding || embedding.length !== 1536) return [];

  let hits: Array<{
    id: string;
    sourceTitle: string;
    filePath: string;
    textSnippet: string;
    pageNumber: number;
    fileType: string;
    text: string;
    score: number;
  }> = [];

  try {
    hits = await client.action(api.chat.searchTenderChunks, {
      tenderId: bidId,
      embedding,
      limit: 6,
    });
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    hits = (await client.action(legacySearchChunksRef, {
      embedding,
      limit: 6,
    })) as typeof hits;
  }

  return hits.map((h) => ({
    id: h.id,
    sourceTitle: h.sourceTitle,
    filePath: h.filePath,
    textSnippet: h.textSnippet,
    pageNumber: h.pageNumber,
    fileType: h.fileType,
    characterCount: (h.text ?? h.textSnippet ?? '').length,
    score: h.score,
  }));
}

export async function getMonthlyUsageSummary(): Promise<UsageSummary> {
  const { client, user } = await requireAuthenticatedConvex();
  try {
    return await client.query(api.chat.getMonthlyUsageSummary, {});
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    return {
      month: new Date().toISOString().slice(0, 7),
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      capUsd: 15,
      planTier: user.planTier ?? 'starter',
    };
  }
}

export async function recordAiUsage(params: {
  model: string;
  task: TenderAITask;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}): Promise<void> {
  const { client } = await requireAuthenticatedConvex();
  try {
    await client.mutation(api.chat.recordUsageLedger, {
      model: params.model,
      task: params.task,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      costUsd: params.costUsd,
    });
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
  }
}

export async function getContractorSettings(): Promise<ContractorSettings> {
  const { user } = await requireAuthenticatedConvex();
  const usage = await getMonthlyUsageSummary();

  const isLegacy =
    !user.isDemo &&
    isLegacySeededProfile({
      username: user.username,
      companyName: user.companyName,
      csdMaaaNumber: user.csdMaaaNumber,
    });

  const parsedRegions = parseScanPrefsFromRegions(
    isLegacy ? [] : user.municipalRegions,
    isLegacy ? '' : user.cidbGrade
  );

  const rawPin = isLegacy ? '' : (user.sarsTcsPin || user.taxPinNumber || '');
  const maskedPin =
    rawPin && !rawPin.includes('•')
      ? `${rawPin.toUpperCase().startsWith('TCS-') ? 'TCS-' : ''}••••${rawPin.slice(-4)}`
      : rawPin;

  return {
    companyName: isLegacy ? '' : (user.companyName ?? ''),
    registrationNumber: isLegacy ? '' : (user.registrationNumber ?? ''),
    csdMaaaNumber: isLegacy ? '' : (user.csdMaaaNumber ?? ''),
    taxRefNumber: isLegacy ? '' : (user.taxRefNumber ?? ''),
    taxPinNumber: maskedPin,
    bbbeeLevel: isLegacy ? '' : (user.bbbeeLevel ?? ''),
    cidbGrade: isLegacy ? '' : (user.cidbGrade ?? ''),
    municipalRegions: parsedRegions.municipalRegions,
    sectors: user.sectors ?? [],
    whatsappNumber: isLegacy ? '' : (user.whatsappPhone || user.whatsappNumber || ''),
    planTier: user.planTier ?? 'starter',
    directors: isLegacy ? [] : (user.directors ?? []),
    openRouterSubKeyCapUsd: usage.capUsd,
    openRouterUsedUsd: usage.costUsd,
    preferredFastModel: 'deepseek/deepseek-v4-flash',
    preferredAuditModel: 'anthropic/claude-sonnet-5.5',
    scanPreferences: parsedRegions.scanPreferences,
  };
}

export async function updateContractorSettings(
  patch: Partial<ContractorSettings>
): Promise<ContractorSettings> {
  const { client } = await requireAuthenticatedConvex();
  const current = await getContractorSettings();

  const cleanRegions = (
    patch.municipalRegions ?? current.municipalRegions
  ).filter((r) => !r.startsWith('__klerk_'));

  const existingPrefs = current.scanPreferences;
  const regionsForConvex = existingPrefs
    ? serializeScanPrefsToRegions(cleanRegions, {
        sectors: (existingPrefs.sectors as TenderSectorId[]) ?? ['civil_roads'],
        provinces: existingPrefs.provinces ?? ['All South Africa'],
        tenderType: existingPrefs.tenderType ?? 'all',
        sortBy: existingPrefs.sortBy ?? 'best_match',
        cidbGrade: patch.cidbGrade ?? existingPrefs.cidbGrade ?? current.cidbGrade ?? '',
        customKeywords: existingPrefs.customKeywords ?? '',
        configuredAt: existingPrefs.configuredAt ?? new Date().toISOString(),
      })
    : cleanRegions;

  await safeUpdateProfile(client, {
    companyName: patch.companyName,
    registrationNumber: patch.registrationNumber,
    csdMaaaNumber: patch.csdMaaaNumber,
    csdNumber: patch.csdMaaaNumber,
    taxRefNumber: patch.taxRefNumber,
    taxPinNumber: patch.taxPinNumber,
    sarsTcsPin: patch.taxPinNumber,
    bbbeeLevel: patch.bbbeeLevel,
    cidbGrade: patch.cidbGrade,
    municipalRegions: regionsForConvex,
    preferredRegions: cleanRegions,
    sectors: patch.sectors,
    whatsappNumber: patch.whatsappNumber,
    whatsappPhone: patch.whatsappNumber,
    planTier: patch.planTier,
    directors: patch.directors,
  });

  return getContractorSettings();
}

export async function appendConvexMessage(input: {
  bidId?: string;
  role: 'user' | 'assistant';
  content: string;
  contentType?: 'text' | 'code' | 'table' | 'markdown';
  modelUsed?: string;
  approvalId?: string;
  sources?: SourceCitation[];
}): Promise<void> {
  const { client } = await requireAuthenticatedConvex();
  try {
    await client.mutation(api.chat.appendMessage, {
      bidId: input.bidId,
      role: input.role,
      content: input.content,
      contentType: input.contentType ?? 'text',
      modelUsed: input.modelUsed,
      approvalId: input.approvalId,
      sources: input.sources?.map((s) => ({
        sourceTitle: s.sourceTitle,
        filePath: s.filePath,
        textSnippet: s.textSnippet,
        pageNumber: s.pageNumber,
        score: s.score,
      })),
    });
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    await client.mutation(legacyAppendMessageRef, {
      bidId: input.bidId,
      role: input.role,
      content: input.content,
      contentType: input.contentType ?? 'text',
      modelUsed: input.modelUsed,
      approvalId: input.approvalId,
    });
  }
}

export async function listConvexMessages(bidId?: string) {
  const { client } = await requireAuthenticatedConvex();
  try {
    return await client.query(api.chat.listMessages, { bidId });
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    const ws = await client.query(api.tenderOps.getWorkspaceState, {
      bidId,
    });
    return ws.messages;
  }
}

export async function listRegulatoryRules() {
  const { client } = await requireAuthenticatedConvex();
  try {
    return await client.query(api.tenders.listRegulatoryRules, {});
  } catch (err) {
    if (!isUnpushedConvexError(err)) throw err;
    return [];
  }
}
