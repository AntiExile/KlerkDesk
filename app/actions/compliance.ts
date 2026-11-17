'use server';

import { z } from 'zod';
import {
  getComplianceSummary,
  getTenderMatches,
  requireAuthenticatedConvex,
  triggerPortalTenderScan,
  upsertComplianceDoc,
} from '@/lib/convex-store';
import {
  parseAISectorRecommendation,
  type SectorRecommendationResult,
  type TenderScanPreferences,
} from '@/lib/etenders-live';
import { recommendSectorsViaFreeOpenRouter } from '@/lib/openrouter';
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
  storageId: z.string().min(10, 'Convex File Storage upload ID is required'),
});

export async function getComplianceVaultAction(): Promise<{
  compliance: ComplianceSummary;
  tenders: TenderMatch[];
}> {
  await requireAuthenticatedConvex();
  const [compliance, tenders] = await Promise.all([
    getComplianceSummary(),
    getTenderMatches(),
  ]);
  return { compliance, tenders };
}

export async function uploadComplianceDocAction(
  payload: z.input<typeof UploadComplianceSchema>
): Promise<ComplianceSummary> {
  await requireAuthenticatedConvex();
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
    storageId: parsed.storageId,
  });
}

export async function runPortalScanAction(
  preferences?: TenderScanPreferences
): Promise<TenderMatch[]> {
  await requireAuthenticatedConvex();
  return triggerPortalTenderScan(preferences);
}

export async function recommendTenderSectorsAction(
  businessDescription: string
): Promise<SectorRecommendationResult> {
  await requireAuthenticatedConvex();
  const trimmed = businessDescription.trim();
  if (!trimmed) {
    throw new Error('Please describe what your business does first.');
  }
  const { rawText, modelUsed } =
    await recommendSectorsViaFreeOpenRouter(trimmed);
  return parseAISectorRecommendation(rawText, trimmed, modelUsed);
}

export async function validateBidComplianceAction(): Promise<ComplianceSummary> {
  await requireAuthenticatedConvex();
  return getComplianceSummary();
}
