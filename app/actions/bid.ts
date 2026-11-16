'use server';

import { z } from 'zod';
import { createLiveDesktopSession } from '@/lib/boat';
import { runTenderAI } from '@/lib/openrouter';
import { generateStampedSbdPackage, type StampedSbdResult } from '@/lib/pdf-stamp';
import {
  createPendingApproval,
  getContractorSettings,
  getTenderById,
  resolvePendingApproval,
  saveStampedSbdForTender,
  searchTenderChunks,
  updateBoqForTender,
} from '@/lib/convex-store';
import type {
  ApprovalActionType,
  ApprovalShieldState,
  BoatSessionInfo,
  BoQItem,
  ComplianceSummary,
  TenderMatch,
} from '@/types';

const BoqItemSchema = z.object({
  id: z.string(),
  itemCode: z.string(),
  section: z.string(),
  description: z.string(),
  unit: z.string(),
  quantity: z.number().nonnegative(),
  rateZar: z.number().nonnegative(),
  amountZar: z.number().nonnegative(),
});

const TriggerApprovalSchema = z.object({
  bidId: z.string(),
  tenderNumber: z.string(),
  actionType: z.enum([
    'submit_etenders',
    'send_external_email',
    'whatsapp_broadcast',
  ]),
  totalBidZar: z.number().nonnegative(),
  vatZar: z.number().nonnegative(),
  grandTotalZar: z.number().nonnegative(),
  targetResource: z.string(),
  commandPreview: z.string(),
  boatSessionId: z.string().nullable().optional(),
});

export async function getBidWorkspaceAction(bidId: string): Promise<{
  tender: TenderMatch | null;
  boq: BoQItem[];
  compliance: ComplianceSummary;
  approvals: ApprovalShieldState[];
}> {
  return getTenderById(bidId);
}

export async function saveBoqItemsAction(
  bidId: string,
  items: BoQItem[]
): Promise<BoQItem[]> {
  const parsed = z.array(BoqItemSchema).parse(items);
  return updateBoqForTender(bidId, parsed);
}

export async function startBoatSessionAction(
  bidId: string,
  portalUrl: string
): Promise<BoatSessionInfo> {
  return createLiveDesktopSession({ bidId, portalUrl });
}

export async function stampSbdFormsAction(params: {
  bidId: string;
  grandTotalZar: number;
}): Promise<StampedSbdResult> {
  const [{ tender }, settings] = await Promise.all([
    getTenderById(params.bidId),
    getContractorSettings(),
  ]);

  if (!tender) {
    throw new Error(`Tender ${params.bidId} not found`);
  }

  const stamped = await generateStampedSbdPackage({
    tenderId: tender.id,
    tenderNumber: tender.tenderNumber,
    municipality: tender.municipality,
    companyName: settings.companyName,
    registrationNumber: settings.registrationNumber,
    csdMaaaNumber: settings.csdMaaaNumber,
    taxPinNumber: settings.taxPinNumber,
    cidbGrade: settings.cidbGrade,
    bbbeeLevel: settings.bbbeeLevel,
    grandTotalZar: params.grandTotalZar,
  });

  await saveStampedSbdForTender({
    tenderId: tender.id,
    fileName: stamped.fileName,
    base64Pdf: stamped.base64Pdf,
    pageCount: stamped.pageCount,
    stampingMethod: stamped.stampingMethod,
  });

  return stamped;
}

export async function triggerApprovalShieldAction(
  payload: z.input<typeof TriggerApprovalSchema>
): Promise<ApprovalShieldState> {
  const parsed = TriggerApprovalSchema.parse(payload);
  return createPendingApproval({
    bidId: parsed.bidId,
    tenderNumber: parsed.tenderNumber,
    actionType: parsed.actionType as ApprovalActionType,
    totalBidZar: parsed.totalBidZar,
    vatZar: parsed.vatZar,
    grandTotalZar: parsed.grandTotalZar,
    targetResource: parsed.targetResource,
    commandPreview: parsed.commandPreview,
    boatSessionId: parsed.boatSessionId,
  });
}

export async function resolveApprovalShieldAction(params: {
  approvalId: string;
  decision: 'approved' | 'rejected';
  operatorName?: string;
}): Promise<ApprovalShieldState | null> {
  return resolvePendingApproval(params);
}

export async function auditTenderPdfAction(bidId: string): Promise<{
  auditReport: string;
  model: string;
  usedLiveApi: boolean;
}> {
  const [{ tender, compliance }, settings] = await Promise.all([
    getTenderById(bidId),
    getContractorSettings(),
  ]);

  const citations = await searchTenderChunks('SBD BoQ compliance', bidId);

  const prompt = [
    `Perform a full tender compliance and risk audit for ${tender?.tenderNumber ?? bidId} (${tender?.title ?? 'Municipal Tender'}).`,
    `Municipality: ${tender?.municipality ?? 'Western Cape'}. Required CIDB: ${tender?.cidbGrade ?? '6CE'}.`,
    `Contractor CIDB: ${settings.cidbGrade}. Compliance blocking alerts: ${
      compliance.blockingAlerts.length > 0
        ? compliance.blockingAlerts.join('; ')
        : 'None'
    }.`,
  ].join(' ');

  const result = await runTenderAI({
    task: 'pdf_audit',
    prompt,
    clientSpendUsd: settings.openRouterUsedUsd,
    contextSnippets: citations.map((c) => c.textSnippet),
  });

  return {
    auditReport: result.text,
    model: result.model,
    usedLiveApi: result.usedLiveApi,
  };
}
