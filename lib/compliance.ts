import type {
  ComplianceDoc,
  ComplianceStatus,
  ComplianceSummary,
} from '@/types';

export const DEMO_USERNAME = 'demo@mundusmk.co.za';

const LEGACY_SEEDED_DOC_FILENAMES = new Set([
  'CSD_Report_MAAA0948215_2026_02.pdf',
  'SARS_TaxPin_9482014829.pdf',
  'COIDA_LoGS_2026.pdf',
  'BBBEE_Level1_Affidavit_2026.pdf',
  'CIPC_CoR14_3_KarooCivil.pdf',
  'Certified_IDs_Directors_2025.pdf',
  'CSD_Report_MAAA0948215.pdf',
  'SARS_Tax_PIN_2026.pdf',
  'COIDA_Good_Standing_2026.pdf',
  'BBBEE_Level1_Certificate.pdf',
  'CIPC_CoR14_3_Certified.pdf',
  'Directors_Certified_IDs.pdf',
]);

const LEGACY_SEEDED_DOC_REFS = new Set([
  'MAAA0948215',
  'TCS-8841209341',
  '9482014829',
  'COIDA-WC-2026-4419',
  'CF-9900418273',
  'BBBEE-L1-77102',
  'SWORN-AFF-2026-011',
  '2018/419022/07',
  'ID-CERT-WC-8192',
  'SAPS-GEO-2025-11',
]);

export function isLegacySeededComplianceDoc(doc: {
  fileName: string;
  referenceNumber: string;
}): boolean {
  return (
    LEGACY_SEEDED_DOC_FILENAMES.has(doc.fileName) &&
    LEGACY_SEEDED_DOC_REFS.has(doc.referenceNumber)
  );
}

export function isLegacySeededProfile(
  profile:
    | {
        companyName?: string | null;
        csdMaaaNumber?: string | null;
        username?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (profile.username?.trim().toLowerCase() === DEMO_USERNAME) return false;
  return (
    profile.companyName === 'Karoo Civil & Infrastructure (Pty) Ltd' &&
    profile.csdMaaaNumber === 'MAAA0948215'
  );
}

function diffDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.floor((to - from) / 86_400_000);
}

export function createEmptyComplianceDocs(): ComplianceDoc[] {
  const nowIso = new Date().toISOString();
  return [
    {
      id: 'doc-csd',
      type: 'csd',
      title: 'Central Supplier Database (CSD) Summary Report',
      shortLabel: 'CSD Report',
      referenceNumber: 'Not uploaded',
      issuedAt: nowIso,
      expiresAt: null,
      ageDays: 0,
      maxAgeDays: 7,
      daysUntilExpiry: null,
      status: 'missing',
      alertReason: 'Document not uploaded yet',
      fileName: '',
      fileSizeBytes: 0,
    },
    {
      id: 'doc-tax-pin',
      type: 'tax_pin',
      title: 'SARS Tax Compliance Status (TCS) PIN',
      shortLabel: 'Tax PIN',
      referenceNumber: 'Not uploaded',
      issuedAt: nowIso,
      expiresAt: null,
      ageDays: 0,
      maxAgeDays: null,
      daysUntilExpiry: null,
      status: 'missing',
      alertReason: 'Document not uploaded yet',
      fileName: '',
      fileSizeBytes: 0,
    },
    {
      id: 'doc-coida',
      type: 'coida',
      title: 'COIDA Letter of Good Standing (Compensation Fund)',
      shortLabel: 'COIDA',
      referenceNumber: 'Not uploaded',
      issuedAt: nowIso,
      expiresAt: null,
      ageDays: 0,
      maxAgeDays: null,
      daysUntilExpiry: null,
      status: 'missing',
      alertReason: 'Document not uploaded yet',
      fileName: '',
      fileSizeBytes: 0,
    },
    {
      id: 'doc-bbbee',
      type: 'bbbee',
      title: 'B-BBEE SANAS Verification Certificate / Sworn Affidavit',
      shortLabel: 'B-BBEE',
      referenceNumber: 'Not uploaded',
      issuedAt: nowIso,
      expiresAt: null,
      ageDays: 0,
      maxAgeDays: null,
      daysUntilExpiry: null,
      status: 'missing',
      alertReason: 'Document not uploaded yet',
      fileName: '',
      fileSizeBytes: 0,
    },
    {
      id: 'doc-cipc',
      type: 'cipc',
      title: 'CIPC Company Registration (CoR 14.3 Certified)',
      shortLabel: 'CIPC',
      referenceNumber: 'Not uploaded',
      issuedAt: nowIso,
      expiresAt: null,
      ageDays: 0,
      maxAgeDays: 90,
      daysUntilExpiry: null,
      status: 'missing',
      alertReason: 'Document not uploaded yet',
      fileName: '',
      fileSizeBytes: 0,
    },
    {
      id: 'doc-ids',
      type: 'certified_id',
      title: 'Certified Director ID Copies (SAPS Stamped)',
      shortLabel: 'Certified IDs',
      referenceNumber: 'Not uploaded',
      issuedAt: nowIso,
      expiresAt: null,
      ageDays: 0,
      maxAgeDays: 90,
      daysUntilExpiry: null,
      status: 'missing',
      alertReason: 'Document not uploaded yet',
      fileName: '',
      fileSizeBytes: 0,
    },
  ];
}

/**
 * Enforces MundusMK Compliance Expiry Rules (GEMINI.md Guardrail #2):
 * - Missing documents remain `missing` until uploaded
 * - CSD reports older than 7 days -> expired
 * - Certified CIPC / ID copies older than 90 days -> expired
 * - Expired Tax PIN / COIDA / B-BBEE -> expired (<= 30 days -> warning)
 */
export function evaluateSingleDoc(
  doc: Omit<
    ComplianceDoc,
    'ageDays' | 'daysUntilExpiry' | 'status' | 'alertReason'
  > & {
    status?: ComplianceStatus;
    alertReason?: string | null;
  }
): ComplianceDoc {
  if (
    doc.status === 'missing' ||
    doc.referenceNumber === 'Not uploaded' ||
    !doc.fileName
  ) {
    return {
      ...doc,
      ageDays: 0,
      daysUntilExpiry: null,
      status: 'missing',
      alertReason: doc.alertReason ?? 'Document not uploaded yet',
    };
  }

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
