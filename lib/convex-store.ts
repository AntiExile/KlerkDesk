import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type {
  ApprovalActionType,
  ApprovalShieldState,
  BoQItem,
  ComplianceDoc,
  ComplianceDocType,
  ComplianceStatus,
  ComplianceSummary,
  ContractorSettings,
  SourceCitation,
  TenderMatch,
} from '@/types';

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function diffDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.floor((to - from) / 86_400_000);
}

/**
 * Enforces MundusMK Compliance Expiry Rules (GEMINI.md Guardrail #2):
 * - CSD reports older than 7 days -> expired
 * - Certified CIPC / ID copies older than 90 days -> expired
 * - Expired Tax PIN / COIDA / B-BBEE -> expired (<= 30 days -> warning)
 */
export function evaluateSingleDoc(
  doc: Omit<
    ComplianceDoc,
    'ageDays' | 'daysUntilExpiry' | 'status' | 'alertReason'
  >
): ComplianceDoc {
  const nowIso = new Date().toISOString();
  const ageDays = Math.max(0, diffDays(doc.issuedAt, nowIso));

  let daysUntilExpiry: number | null = null;
  if (doc.expiresAt) {
    daysUntilExpiry = diffDays(nowIso, doc.expiresAt);
  } else if (doc.maxAgeDays !== null) {
    daysUntilExpiry = doc.maxAgeDays - ageDays;
  }

  let status: ComplianceStatus = 'valid';
  let alertReason: string | null = null;

  if (doc.type === 'csd') {
    const maxAge = doc.maxAgeDays ?? 7;
    daysUntilExpiry = maxAge - ageDays;
    if (ageDays > maxAge) {
      status = 'expired';
      alertReason = `CSD report is ${ageDays} days old (exceeds 7-day limit). Download a fresh report from csd.gov.za.`;
    } else if (ageDays >= 5) {
      status = 'warning';
      alertReason = `CSD report is ${ageDays} days old (${maxAge - ageDays}d left before 7-day limit).`;
    }
  } else if (doc.type === 'cipc' || doc.type === 'certified_id') {
    const maxAge = doc.maxAgeDays ?? 90;
    daysUntilExpiry = maxAge - ageDays;
    if (ageDays > maxAge) {
      status = 'expired';
      alertReason = `Certified copy is ${ageDays} days old (exceeds 90-day SAPS/Commissioner limit).`;
    } else if (daysUntilExpiry <= 15) {
      status = 'warning';
      alertReason = `Certified copy expires in ${daysUntilExpiry} days (90-day certification rule).`;
    }
  } else if (daysUntilExpiry !== null) {
    if (daysUntilExpiry < 0) {
      status = 'expired';
      alertReason = `Expired ${Math.abs(daysUntilExpiry)} days ago. Upload renewed certificate before staging a bid.`;
    } else if (daysUntilExpiry <= 30) {
      status = 'warning';
      alertReason = `Expires in ${daysUntilExpiry} days. Schedule renewal soon.`;
    }
  }

  return {
    ...doc,
    ageDays,
    daysUntilExpiry,
    status,
    alertReason,
  };
}

export function evaluateComplianceSummary(
  rawDocs: ComplianceDoc[]
): ComplianceSummary {
  const docs = rawDocs.map((d) => evaluateSingleDoc(d));
  const blockingAlerts: string[] = [];
  const warningAlerts: string[] = [];

  for (const doc of docs) {
    if (doc.status === 'expired' || doc.status === 'missing') {
      blockingAlerts.push(
        `${doc.shortLabel}: ${doc.alertReason ?? 'Missing required document'}`
      );
    } else if (doc.status === 'warning' && doc.alertReason) {
      warningAlerts.push(`${doc.shortLabel}: ${doc.alertReason}`);
    }
  }

  return {
    docs,
    isBidReady: blockingAlerts.length === 0,
    blockingAlerts,
    warningAlerts,
    lastCheckedAt: new Date().toISOString(),
  };
}

interface LocalConvexFallbackStore {
  complianceDocs: ComplianceDoc[];
  tenders: TenderMatch[];
  boqsByTender: Record<string, BoQItem[]>;
  approvals: ApprovalShieldState[];
  settings: ContractorSettings;
}

const globalForStore = globalThis as unknown as {
  __mundusConvexFallbackStore?: LocalConvexFallbackStore;
};

function createSeedStore(): LocalConvexFallbackStore {
  const seedDocs: ComplianceDoc[] = [
    evaluateSingleDoc({
      id: 'doc-csd',
      type: 'csd',
      title: 'Central Supplier Database (CSD) Summary Report',
      shortLabel: 'CSD Report',
      referenceNumber: 'MAAA0948215',
      issuedAt: daysAgoIso(9),
      expiresAt: null,
      maxAgeDays: 7,
      fileName: 'CSD_Report_MAAA0948215.pdf',
      fileSizeBytes: 428_120,
      storageId: 'kg2c8sd948215seed',
    }),
    evaluateSingleDoc({
      id: 'doc-tax-pin',
      type: 'tax_pin',
      title: 'SARS Tax Compliance Status (TCS) PIN',
      shortLabel: 'Tax PIN',
      referenceNumber: 'TCS-8841209341',
      issuedAt: daysAgoIso(180),
      expiresAt: daysFromNowIso(185),
      maxAgeDays: null,
      fileName: 'SARS_Tax_PIN_2026.pdf',
      fileSizeBytes: 219_400,
      storageId: 'kg2tax884120seed',
    }),
    evaluateSingleDoc({
      id: 'doc-coida',
      type: 'coida',
      title: 'COIDA Letter of Good Standing (Compensation Fund)',
      shortLabel: 'COIDA',
      referenceNumber: 'COIDA-WC-2026-4419',
      issuedAt: daysAgoIso(346),
      expiresAt: daysFromNowIso(19),
      maxAgeDays: null,
      fileName: 'COIDA_Good_Standing_2026.pdf',
      fileSizeBytes: 312_880,
      storageId: 'kg2coida4419seed',
    }),
    evaluateSingleDoc({
      id: 'doc-bbbee',
      type: 'bbbee',
      title: 'B-BBEE SANAS Verification Certificate (Level 1)',
      shortLabel: 'B-BBEE',
      referenceNumber: 'BBBEE-L1-77102',
      issuedAt: daysAgoIso(155),
      expiresAt: daysFromNowIso(210),
      maxAgeDays: null,
      fileName: 'BBBEE_Level1_Certificate.pdf',
      fileSizeBytes: 518_900,
      storageId: 'kg2bbbee77102seed',
    }),
    evaluateSingleDoc({
      id: 'doc-cipc',
      type: 'cipc',
      title: 'CIPC Company Registration (CoR 14.3 Certified)',
      shortLabel: 'CIPC',
      referenceNumber: '2018/419022/07',
      issuedAt: daysAgoIso(96),
      expiresAt: null,
      maxAgeDays: 90,
      fileName: 'CIPC_CoR14_3_Certified.pdf',
      fileSizeBytes: 894_110,
      storageId: 'kg2cipc419022seed',
    }),
    evaluateSingleDoc({
      id: 'doc-ids',
      type: 'certified_id',
      title: 'Certified Director ID Copies (SAPS Stamped)',
      shortLabel: 'Certified IDs',
      referenceNumber: 'ID-CERT-WC-8192',
      issuedAt: daysAgoIso(42),
      expiresAt: null,
      maxAgeDays: 90,
      fileName: 'Directors_Certified_IDs.pdf',
      fileSizeBytes: 642_040,
      storageId: 'kg2ids8192seed',
    }),
  ];

  const summary = evaluateComplianceSummary(seedDocs);

  const tenders: TenderMatch[] = [
    {
      id: 'ET-2026-WC-0842',
      tenderNumber: 'T/GEO/042/2026',
      title: 'Rehabilitation of York Street & Stormwater Culvert Upgrades — Phase 2',
      municipality: 'George Municipality',
      region: 'George',
      cidbGrade: '6CE',
      closingDate: daysFromNowIso(11),
      briefingDate: daysFromNowIso(3),
      briefingCompulsory: true,
      estimatedValueZar: 14_850_000,
      matchScore: 96,
      status: 'staging',
      portalUrl: 'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-WC-0842',
      complianceReady: summary.isBidReady,
      complianceBlocks: summary.blockingAlerts,
      summary:
        'Asphalt resurfacing (4.2 km), kerbing, precast stormwater box culverts, and traffic accommodation within George CBD. Requires CIDB 6CE or higher, SBD 1/4/6.1, and compulsory site clarification attendance.',
      sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1', 'MBD 8', 'MBD 9'],
    },
    {
      id: 'ET-2026-WC-0911',
      tenderNumber: 'OUD/INF/019/2026',
      title: 'Oudtshoorn Bulk Water Pipeline Replacement & Pump Station Civil Works',
      municipality: 'Oudtshoorn Municipality',
      region: 'Oudtshoorn',
      cidbGrade: '5CE',
      closingDate: daysFromNowIso(18),
      briefingDate: daysFromNowIso(6),
      briefingCompulsory: true,
      estimatedValueZar: 8_420_000,
      matchScore: 92,
      status: 'matched',
      portalUrl: 'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-WC-0911',
      complianceReady: summary.isBidReady,
      complianceBlocks: summary.blockingAlerts,
      summary:
        'Supply, trenching, and hydrostatic testing of 350mm uPVC Class 16 bulk water mains with concrete valve chambers and telemetry plinths.',
      sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
    },
    {
      id: 'ET-2026-WC-1044',
      tenderNumber: 'MSB/TD/088/2026',
      title: 'Mossel Bay Kwanonqaba Stormwater Attenuation & Concrete Lined Channels',
      municipality: 'Mossel Bay Municipality',
      region: 'Mossel Bay',
      cidbGrade: '4CE',
      closingDate: daysFromNowIso(24),
      briefingDate: null,
      briefingCompulsory: false,
      estimatedValueZar: 4_960_000,
      matchScore: 89,
      status: 'matched',
      portalUrl: 'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-WC-1044',
      complianceReady: summary.isBidReady,
      complianceBlocks: summary.blockingAlerts,
      summary:
        'Gabion erosion protection, reinforced concrete trapezoidal drainage channels, and inlet headwalls.',
      sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
    },
    {
      id: 'ET-2026-CPT-2201',
      tenderNumber: 'COCT/221Q/2025-26',
      title: 'City of Cape Town Area South Civil Concrete Plinths & Cable Ducting',
      municipality: 'City of Cape Town',
      region: 'Cape Town',
      cidbGrade: '6CE',
      closingDate: daysFromNowIso(29),
      briefingDate: daysFromNowIso(9),
      briefingCompulsory: false,
      estimatedValueZar: 19_200_000,
      matchScore: 84,
      status: 'matched',
      portalUrl: 'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-CPT-2201',
      complianceReady: summary.isBidReady,
      complianceBlocks: summary.blockingAlerts,
      summary:
        '36-month term tender for substation civil earthworks, security boundary walls, and HDPE electrical sleeve trenches.',
      sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
    },
  ];

  const defaultBoq: BoQItem[] = [
    {
      id: 'boq-1',
      itemCode: '1300',
      section: 'Section 1: Preliminary & General',
      description: 'Site establishment, OHS file, traffic accommodation & CIDB board',
      unit: 'Sum',
      quantity: 1,
      rateZar: 1_150_000,
      amountZar: 1_150_000,
    },
    {
      id: 'boq-2',
      itemCode: '3401',
      section: 'Section 3: Earthworks & Layerworks',
      description: 'Mill existing asphalt (50mm) & stabilize G5 subbase (150mm)',
      unit: 'm²',
      quantity: 18_500,
      rateZar: 245,
      amountZar: 4_532_500,
    },
    {
      id: 'boq-3',
      itemCode: '4202',
      section: 'Section 4: Asphalt Surfacing',
      description: 'Continuously graded medium asphalt wearing course (40mm thick)',
      unit: 'm²',
      quantity: 18_500,
      rateZar: 315,
      amountZar: 5_827_500,
    },
    {
      id: 'boq-4',
      itemCode: '5104',
      section: 'Section 5: Stormwater Culverts',
      description: 'Supply & lay 900x600mm precast concrete box culverts incl. bedding',
      unit: 'm',
      quantity: 420,
      rateZar: 4_850,
      amountZar: 2_037_000,
    },
    {
      id: 'boq-5',
      itemCode: '6109',
      section: 'Section 6: Kerbing & Ancillary',
      description: 'Precast concrete Fig 3 barrier kerbing & storm catchpits',
      unit: 'm',
      quantity: 1_450,
      rateZar: 410,
      amountZar: 594_500,
    },
    {
      id: 'boq-6',
      itemCode: '9001',
      section: 'Section 9: Provisional Sums',
      description: 'Community Liaison Officer (CLO) & SMME local labour allowance',
      unit: 'Prov Sum',
      quantity: 1,
      rateZar: 450_000,
      amountZar: 450_000,
    },
  ];

  const boqsByTender: Record<string, BoQItem[]> = {
    'ET-2026-WC-0842': defaultBoq,
    'ET-2026-WC-0911': defaultBoq.map((item, idx) => ({
      ...item,
      id: `oud-${idx + 1}`,
      rateZar: Math.round(item.rateZar * 0.62),
      amountZar: Math.round(item.rateZar * 0.62 * item.quantity),
    })),
    'ET-2026-WC-1044': defaultBoq.map((item, idx) => ({
      ...item,
      id: `msb-${idx + 1}`,
      rateZar: Math.round(item.rateZar * 0.38),
      amountZar: Math.round(item.rateZar * 0.38 * item.quantity),
    })),
    'ET-2026-CPT-2201': defaultBoq.map((item, idx) => ({
      ...item,
      id: `cpt-${idx + 1}`,
      rateZar: Math.round(item.rateZar * 1.25),
      amountZar: Math.round(item.rateZar * 1.25 * item.quantity),
    })),
  };

  const settings: ContractorSettings = {
    companyName: 'Karoo Civil & Infrastructure (Pty) Ltd',
    registrationNumber: '2018/419022/07',
    csdMaaaNumber: 'MAAA0948215',
    taxPinNumber: 'TCS-8841209341',
    bbbeeLevel: 'Level 1 (135% Procurement Recognition)',
    cidbGrade: '6CE PE',
    municipalRegions: ['George', 'Oudtshoorn', 'Mossel Bay', 'Cape Town'],
    whatsappNumber: '+27825550148',
    openRouterSubKeyCapUsd: 15,
    openRouterUsedUsd: 4.18,
    preferredFastModel: 'deepseek/deepseek-v4-flash',
    preferredAuditModel: 'anthropic/claude-sonnet-5.5',
  };

  return {
    complianceDocs: seedDocs,
    tenders,
    boqsByTender,
    approvals: [],
    settings,
  };
}

function getFallbackStore(): LocalConvexFallbackStore {
  if (!globalForStore.__mundusConvexFallbackStore) {
    globalForStore.__mundusConvexFallbackStore = createSeedStore();
  }
  return globalForStore.__mundusConvexFallbackStore;
}

export function getConvexHttpClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const client = getConvexHttpClient();
  if (client) {
    try {
      const rows = await client.query(api.tenderOps.getComplianceVault, {});
      if (Array.isArray(rows) && rows.length > 0) {
        const mapped: ComplianceDoc[] = rows.map((row) =>
          evaluateSingleDoc({
            id: row.docId,
            type: row.docType as ComplianceDocType,
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
        return evaluateComplianceSummary(mapped);
      }
    } catch (err) {
      console.warn('[Convex] complianceDocs query fallback:', err);
    }
  }

  return evaluateComplianceSummary(getFallbackStore().complianceDocs);
}

export async function upsertComplianceDoc(input: {
  type: ComplianceDocType;
  referenceNumber: string;
  issuedAt: string;
  expiresAt?: string | null;
  fileName: string;
  fileSizeBytes: number;
  storageId?: string;
}): Promise<ComplianceSummary> {
  const store = getFallbackStore();
  const existing = store.complianceDocs.find((d) => d.type === input.type);

  const defaultMeta: Record<
    ComplianceDocType,
    { title: string; shortLabel: string; maxAgeDays: number | null }
  > = {
    csd: {
      title: 'Central Supplier Database (CSD) Summary Report',
      shortLabel: 'CSD Report',
      maxAgeDays: 7,
    },
    tax_pin: {
      title: 'SARS Tax Compliance Status (TCS) PIN',
      shortLabel: 'Tax PIN',
      maxAgeDays: null,
    },
    coida: {
      title: 'COIDA Letter of Good Standing (Compensation Fund)',
      shortLabel: 'COIDA',
      maxAgeDays: null,
    },
    bbbee: {
      title: 'B-BBEE SANAS Verification Certificate (Level 1)',
      shortLabel: 'B-BBEE',
      maxAgeDays: null,
    },
    cipc: {
      title: 'CIPC Company Registration (CoR 14.3 Certified)',
      shortLabel: 'CIPC',
      maxAgeDays: 90,
    },
    certified_id: {
      title: 'Certified Director ID Copies (SAPS Stamped)',
      shortLabel: 'Certified IDs',
      maxAgeDays: 90,
    },
  };

  const meta = defaultMeta[input.type];
  const storageId =
    input.storageId ?? existing?.storageId ?? `kg2${input.type}${Date.now().toString(36)}`;

  const updated = evaluateSingleDoc({
    id: existing?.id ?? `doc-${input.type}`,
    type: input.type,
    title: existing?.title ?? meta.title,
    shortLabel: existing?.shortLabel ?? meta.shortLabel,
    referenceNumber: input.referenceNumber,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt ?? null,
    maxAgeDays: meta.maxAgeDays,
    fileName: input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    storageId,
  });

  store.complianceDocs = store.complianceDocs.some((d) => d.type === input.type)
    ? store.complianceDocs.map((d) => (d.type === input.type ? updated : d))
    : [...store.complianceDocs, updated];

  const summary = evaluateComplianceSummary(store.complianceDocs);
  store.tenders = store.tenders.map((t) => ({
    ...t,
    complianceReady: summary.isBidReady,
    complianceBlocks: summary.blockingAlerts,
  }));

  const client = getConvexHttpClient();
  if (client) {
    try {
      await client.mutation(api.tenderOps.upsertComplianceDoc, {
        docType: updated.type,
        referenceNumber: updated.referenceNumber,
        issuedAt: updated.issuedAt,
        expiresAt: updated.expiresAt,
        fileName: updated.fileName,
        fileSizeBytes: updated.fileSizeBytes,
        storageId: updated.storageId,
      });
    } catch (err) {
      console.warn('[Convex] upsertComplianceDoc mutation fallback:', err);
    }
  }

  return summary;
}

export async function getTenderMatches(): Promise<TenderMatch[]> {
  const store = getFallbackStore();
  const summary = await getComplianceSummary();
  return store.tenders.map((t) => ({
    ...t,
    complianceReady: summary.isBidReady,
    complianceBlocks: summary.blockingAlerts,
  }));
}

export async function getTenderById(id: string): Promise<{
  tender: TenderMatch | null;
  boq: BoQItem[];
  compliance: ComplianceSummary;
  approvals: ApprovalShieldState[];
}> {
  const store = getFallbackStore();
  const compliance = await getComplianceSummary();
  const found =
    store.tenders.find((t) => t.id === id) ?? store.tenders[0] ?? null;

  if (!found) {
    return { tender: null, boq: [], compliance, approvals: [] };
  }

  const tender: TenderMatch = {
    ...found,
    complianceReady: compliance.isBidReady,
    complianceBlocks: compliance.blockingAlerts,
  };

  return {
    tender,
    boq: store.boqsByTender[found.id] ?? [],
    compliance,
    approvals: store.approvals.filter((a) => a.bidId === found.id),
  };
}

export async function updateBoqForTender(
  tenderId: string,
  items: BoQItem[]
): Promise<BoQItem[]> {
  const store = getFallbackStore();
  const normalized = items.map((item) => ({
    ...item,
    amountZar: Math.round(item.quantity * item.rateZar * 100) / 100,
  }));
  store.boqsByTender[tenderId] = normalized;

  const client = getConvexHttpClient();
  if (client) {
    try {
      await client.mutation(api.tenderOps.saveBoqItems, {
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
      });
    } catch (err) {
      console.warn('[Convex] saveBoqItems mutation fallback:', err);
    }
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
  const store = getFallbackStore();
  store.tenders = store.tenders.map((t) =>
    t.id === params.tenderId
      ? {
          ...t,
          stagedPdfFileName: params.fileName,
          stagedPdfBase64: params.base64Pdf,
          stampedSbdPageCount: params.pageCount,
          stampedSbdMethod: params.stampingMethod,
        }
      : t
  );

  const client = getConvexHttpClient();
  if (client) {
    try {
      await client.mutation(api.tenderOps.saveStampedSbdPackage, params);
    } catch (err) {
      console.warn('[Convex] saveStampedSbdPackage mutation fallback:', err);
    }
  }
}

/**
 * Mandatory Approval Shield Guardrail (GEMINI.md Guardrail #1):
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
  boatSessionId?: string | null;
  requestedBy?: string;
}): Promise<ApprovalShieldState> {
  const compliance = await getComplianceSummary();
  const store = getFallbackStore();

  const record: ApprovalShieldState = {
    id: `apr-${Date.now().toString(36)}`,
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
    requestedBy: input.requestedBy ?? 'Operator (tender.mundusmk.co.za)',
    requestedAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
    boatSessionId: input.boatSessionId ?? null,
  };

  store.approvals = [record, ...store.approvals];
  store.tenders = store.tenders.map((t) =>
    t.id === input.bidId ? { ...t, status: 'pending_approval' } : t
  );

  const client = getConvexHttpClient();
  if (client) {
    try {
      await client.mutation(api.tenderOps.triggerApprovalShield, {
        approvalId: record.id,
        bidId: record.bidId,
        tenderNumber: record.tenderNumber,
        actionType: record.actionType,
        totalBidZar: record.totalBidZar,
        vatZar: record.vatZar,
        grandTotalZar: record.grandTotalZar,
        targetResource: record.targetResource,
        commandPreview: record.commandPreview,
        complianceVerified: record.complianceVerified,
        complianceWarnings: record.complianceWarnings,
        requestedBy: record.requestedBy,
        boatSessionId: record.boatSessionId,
      });
    } catch (err) {
      console.warn('[Convex] triggerApprovalShield mutation fallback:', err);
    }
  }

  return record;
}

export async function resolvePendingApproval(input: {
  approvalId: string;
  decision: 'approved' | 'rejected';
  operatorName?: string;
}): Promise<ApprovalShieldState | null> {
  const store = getFallbackStore();
  const target = store.approvals.find((a) => a.id === input.approvalId);
  if (!target) return null;

  const nextStatus = input.decision === 'approved' ? 'executed' : 'rejected';
  const updated: ApprovalShieldState = {
    ...target,
    status: nextStatus,
    approvedBy: input.operatorName ?? 'Authenticated Director',
    approvedAt: new Date().toISOString(),
  };

  store.approvals = store.approvals.map((a) =>
    a.id === input.approvalId ? updated : a
  );

  if (input.decision === 'approved') {
    store.tenders = store.tenders.map((t) =>
      t.id === target.bidId ? { ...t, status: 'submitted' } : t
    );
  }

  const client = getConvexHttpClient();
  if (client) {
    try {
      await client.mutation(api.tenderOps.resolveApprovalShield, {
        approvalId: updated.id,
        decision: input.decision,
        operatorName: updated.approvedBy ?? undefined,
      });
    } catch (err) {
      console.warn('[Convex] resolveApprovalShield mutation fallback:', err);
    }
  }

  return updated;
}

export async function searchTenderChunks(
  query: string,
  bidId?: string
): Promise<SourceCitation[]> {
  const normalized = query.toLowerCase();
  const citations: SourceCitation[] = [
    {
      id: 'chunk-sbd',
      sourceTitle: `${bidId ?? 'ET-2026-WC-0842'} — Section A: Eligibility & SBD Returnables`,
      filePath: `convex://tenderChunks/${bidId ?? 'ET-2026-WC-0842'}/Section_A_SBD.pdf`,
      textSnippet:
        'Bidders must submit completed SBD 1, SBD 4 (Bidder Disclosure), SBD 6.1 (80/20 preference points), valid SARS Tax PIN, COIDA Good Standing, and CSD report generated within 7 days of closing.',
      fileType: 'pdf',
      characterCount: 194,
      score: 0.96,
    },
    {
      id: 'chunk-boq',
      sourceTitle: `${bidId ?? 'ET-2026-WC-0842'} — Pricing Schedule & BoQ`,
      filePath: `convex://tenderChunks/${bidId ?? 'ET-2026-WC-0842'}/BoQ_Schedule_Rev2.xlsx`,
      textSnippet:
        'All unit rates must be entered in South African Rand (ZAR) excluding VAT. Section 1 P&G capped at 12% of measured works; 15% VAT must be added on the Summary Page.',
      fileType: 'xlsx',
      characterCount: 171,
      score: 0.91,
    },
  ];

  if (
    normalized.includes('csd') ||
    normalized.includes('cipc') ||
    normalized.includes('compliance')
  ) {
    citations.unshift({
      id: 'chunk-vault',
      sourceTitle: 'MundusMK Compliance Vault Guardrail Policy',
      filePath: 'convex://complianceDocs/policy/SA_Compliance_Rules.md',
      textSnippet:
        'CSD reports older than 7 days and certified CIPC/ID copies older than 90 days automatically block eTenders submission until refreshed.',
      fileType: 'md',
      characterCount: 138,
      score: 0.98,
    });
  }

  return citations;
}

export async function getContractorSettings(): Promise<ContractorSettings> {
  return getFallbackStore().settings;
}

export async function updateContractorSettings(
  patch: Partial<ContractorSettings>
): Promise<ContractorSettings> {
  const store = getFallbackStore();
  store.settings = {
    ...store.settings,
    ...patch,
  };
  return store.settings;
}
