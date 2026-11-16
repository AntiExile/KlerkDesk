'use server';

import { z } from 'zod';
import {
  getComplianceSummary,
  getTenderMatches,
  upsertComplianceDoc,
} from '@/lib/convex-store';
import type { ComplianceDocType, ComplianceSummary, TenderMatch } from '@/types';

const UploadComplianceSchema = z.object({
  type: z.enum([
    'csd',
    'tax_pin',
    'coida',
    'bbbee',
    'cipc',
    'certified_id',
  ]),
  referenceNumber: z.string().min(2),
  issuedAt: z.string().min(4),
  expiresAt: z.string().nullable().optional(),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative(),
});

export async function getComplianceVaultAction(): Promise<{
  compliance: ComplianceSummary;
  tenders: TenderMatch[];
}> {
  const [compliance, tenders] = await Promise.all([
    getComplianceSummary(),
    getTenderMatches(),
  ]);
  return { compliance, tenders };
}

export async function uploadComplianceDocAction(
  payload: z.input<typeof UploadComplianceSchema>
): Promise<ComplianceSummary> {
  const parsed = UploadComplianceSchema.parse(payload);
  return upsertComplianceDoc({
    type: parsed.type as ComplianceDocType,
    referenceNumber: parsed.referenceNumber,
    issuedAt: new Date(parsed.issuedAt).toISOString(),
    expiresAt: parsed.expiresAt
      ? new Date(parsed.expiresAt).toISOString()
      : null,
    fileName: parsed.fileName,
    fileSizeBytes: parsed.fileSizeBytes,
  });
}

export async function refreshCsdReportAction(): Promise<ComplianceSummary> {
  const today = new Date().toISOString();
  return upsertComplianceDoc({
    type: 'csd',
    referenceNumber: 'MAAA0948215',
    issuedAt: today,
    expiresAt: null,
    fileName: `CSD_Report_MAAA0948215_${today.slice(0, 10)}.pdf`,
    fileSizeBytes: 441_200,
  });
}

export async function validateBidComplianceAction(): Promise<ComplianceSummary> {
  return getComplianceSummary();
}
