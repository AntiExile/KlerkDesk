'use server';

import { z } from 'zod';
import { createLiveDesktopSession } from '@/lib/boat';
import { runTenderAI } from '@/lib/openrouter';
import {
  buildMergedSubmissionPack,
  generateStampedSbdPackage,
  type StampedSbdResult,
} from '@/lib/pdf-stamp';
import {
  createPendingApproval,
  getApprovalRecordById,
  getConvexHttpClient,
  getContractorSettings,
  getTenderById,
  listComplianceStorageAttachments,
  recordAiUsage,
  requireAuthenticatedConvex,
  resolvePendingApproval,
  saveStampedSbdForTender,
  searchTenderChunks,
  updateBoqForTender,
  uploadBytesToConvexStorage,
} from '@/lib/convex-store';
import type {
  ApprovalActionType,
  ApprovalShieldState,
  BoatSessionInfo,
  BoQItem,
  ComplianceSummary,
  Message,
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

export interface ResolveApprovalResult {
  approval: ApprovalShieldState | null;
  boatSession: BoatSessionInfo | null;
}

export async function getBidWorkspaceAction(bidId: string): Promise<{
  tender: TenderMatch | null;
  boq: BoQItem[];
  compliance: ComplianceSummary;
  approvals: ApprovalShieldState[];
  messages: Message[];
}> {
  await requireAuthenticatedConvex();
  return getTenderById(bidId);
}

export async function saveBoqItemsAction(
  bidId: string,
  items: BoQItem[]
): Promise<BoQItem[]> {
  await requireAuthenticatedConvex();
  const parsed = z.array(BoqItemSchema).parse(items);
  return updateBoqForTender(bidId, parsed);
}

export async function startBoatSessionAction(
  bidId: string,
  portalUrl: string
): Promise<BoatSessionInfo> {
  await requireAuthenticatedConvex();
  const { tender } = await getTenderById(bidId);
  if (!tender) {
    throw new Error(`Tender ${bidId} not found for authenticated contractor`);
  }
  return createLiveDesktopSession({
    bidId,
    portalUrl: portalUrl || tender.portalUrl || 'https://www.etenders.gov.za',
  });
}

export async function stampSbdFormsAction(params: {
  bidId: string;
  grandTotalZar: number;
}): Promise<StampedSbdResult> {
  await requireAuthenticatedConvex();
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
    companyName: settings.companyName || 'Unnamed Contractor',
    registrationNumber: settings.registrationNumber,
    csdMaaaNumber: settings.csdMaaaNumber,
    taxPinNumber: settings.taxPinNumber,
    cidbGrade: settings.cidbGrade,
    bbbeeLevel: settings.bbbeeLevel,
    grandTotalZar: params.grandTotalZar,
    directors: settings.directors,
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
  await requireAuthenticatedConvex();
  const parsed = TriggerApprovalSchema.parse(payload);
  const { tender } = await getTenderById(parsed.bidId);

  return createPendingApproval({
    bidId: parsed.bidId,
    tenderNumber: parsed.tenderNumber,
    actionType: parsed.actionType as ApprovalActionType,
    totalBidZar: parsed.totalBidZar,
    vatZar: parsed.vatZar,
    grandTotalZar: parsed.grandTotalZar,
    targetResource: parsed.targetResource,
    commandPreview: parsed.commandPreview,
    submissionChannel: tender?.submissionChannel ?? 'etenders_esubmission',
    boatSessionId: parsed.boatSessionId,
  });
}

async function dispatchWhatsappSubmissionConfirmation(params: {
  whatsappNumber: string;
  tenderNumber: string;
  closingDate: string;
  submissionChannel: string;
  mergedPackUrl?: string;
}): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const recipient = params.whatsappNumber.replace(/[^\d+]/g, '');

  if (!phoneNumberId || !accessToken || !recipient) {
    return false;
  }

  const channelText =
    params.submissionChannel === 'etenders_esubmission'
      ? 'National Treasury eTenders Portal (sign in with CSD credentials + CAPTCHA to upload)'
      : params.submissionChannel === 'municipal_email'
        ? 'Official Municipal SCM Email'
        : 'Physical Municipal Tender Box Drop-Off';

  const bodyLines = [
    `KlerkDesk Approval Shield Approved: ${params.tenderNumber}`,
    `Closing Date: ${params.closingDate.slice(0, 10)}`,
    `Submission Channel: ${channelText}`,
    params.mergedPackUrl
      ? `Consolidated Pack PDF (<30MB): ${params.mergedPackUrl}`
      : 'Consolidated Submission Pack staged in Convex Storage.',
  ];

  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { body: bodyLines.join('\n') },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Compliance-safe Approval Shield execution:
 * 1) Validates compliance gates (no expired/missing docs)
 * 2) Merges Cover & Compliance Matrix + Stamped SBD 1/4/6.1 + Compliance Vault files (<30MB)
 * 3) Stores the consolidated PDF pack in Convex `_storage` & attaches signed download URL
 * 4) Dispatches WhatsApp confirmation via Meta Cloud API
 * 5) Opens a contractor-supervised `boat.dev` / Chromium handoff at `https://www.etenders.gov.za`
 *    when `submissionChannel === 'etenders_esubmission'` (no automated state-portal logins).
 */
export async function resolveApprovalShieldAction(params: {
  approvalId: string;
  decision: 'approved' | 'rejected';
  operatorName?: string;
}): Promise<ResolveApprovalResult> {
  const { client } = await requireAuthenticatedConvex();

  if (params.decision === 'rejected') {
    const rejected = await resolvePendingApproval(params);
    return { approval: rejected, boatSession: null };
  }

  const existingApproval = await getApprovalRecordById(params.approvalId);
  if (!existingApproval) {
    throw new Error(`Approval record ${params.approvalId} not found`);
  }

  const [{ tender, compliance }, settings, vaultAttachments] = await Promise.all([
    getTenderById(existingApproval.bidId),
    getContractorSettings(),
    listComplianceStorageAttachments(),
  ]);

  if (!tender) {
    throw new Error(`Tender ${existingApproval.bidId} not found`);
  }

  if (!compliance.isBidReady) {
    throw new Error(
      `Compliance gate blocked approval: ${compliance.blockingAlerts.join('; ')}`
    );
  }

  let stampedBytes: Uint8Array;
  if (tender.stagedPdfBase64) {
    stampedBytes = new Uint8Array(
      Buffer.from(tender.stagedPdfBase64, 'base64')
    );
  } else {
    const freshStamp = await generateStampedSbdPackage({
      tenderId: tender.id,
      tenderNumber: tender.tenderNumber,
      municipality: tender.municipality,
      companyName: settings.companyName || 'Unnamed Contractor',
      registrationNumber: settings.registrationNumber,
      csdMaaaNumber: settings.csdMaaaNumber,
      taxPinNumber: settings.taxPinNumber,
      cidbGrade: settings.cidbGrade,
      bbbeeLevel: settings.bbbeeLevel,
      grandTotalZar: existingApproval.grandTotalZar,
      directors: settings.directors,
    });
    stampedBytes = new Uint8Array(Buffer.from(freshStamp.base64Pdf, 'base64'));
    await saveStampedSbdForTender({
      tenderId: tender.id,
      fileName: freshStamp.fileName,
      base64Pdf: freshStamp.base64Pdf,
      pageCount: freshStamp.pageCount,
      stampingMethod: freshStamp.stampingMethod,
    });
  }

  const downloadedAttachments = await Promise.all(
    vaultAttachments.map(async (att) => {
      let bytes: Uint8Array | undefined;
      let contentType: string | undefined;
      if (att.url) {
        try {
          const res = await fetch(att.url, {
            signal: AbortSignal.timeout(12_000),
          });
          if (res.ok) {
            contentType = res.headers.get('content-type') ?? undefined;
            bytes = new Uint8Array(await res.arrayBuffer());
          }
        } catch {
          bytes = undefined;
        }
      }
      return {
        title: att.title,
        shortLabel: att.shortLabel,
        referenceNumber: att.referenceNumber,
        status: att.status,
        fileName: att.fileName,
        bytes,
        contentType,
      };
    })
  );

  const submissionChannel = tender.submissionChannel ?? 'etenders_esubmission';
  const merged = await buildMergedSubmissionPack({
    tenderNumber: tender.tenderNumber,
    tenderTitle: tender.title,
    municipality: tender.municipality,
    closingDate: tender.closingDate,
    submissionChannel,
    companyName: settings.companyName || 'Unnamed Contractor',
    registrationNumber: settings.registrationNumber,
    csdMaaaNumber: settings.csdMaaaNumber,
    taxPinNumber: settings.taxPinNumber,
    cidbGrade: settings.cidbGrade,
    bbbeeLevel: settings.bbbeeLevel,
    grandTotalZar: existingApproval.grandTotalZar,
    stampedSbdBytes: stampedBytes,
    complianceAttachments: downloadedAttachments,
    directors: settings.directors,
  });

  const mergedPackStorageId = await uploadBytesToConvexStorage(
    client,
    merged.pdfBytes,
    'application/pdf'
  );

  let boatSession: BoatSessionInfo | null = null;
  if (submissionChannel === 'etenders_esubmission') {
    boatSession = await createLiveDesktopSession({
      bidId: tender.id,
      portalUrl: 'https://www.etenders.gov.za',
    });
  }

  // First commit resolves signed `mergedPackUrl` from Convex `_storage`
  let committed = await resolvePendingApproval({
    approvalId: params.approvalId,
    decision: 'approved',
    operatorName: params.operatorName,
    mergedPackStorageId,
    submissionChannel,
    whatsappDispatched: false,
    boatSessionId: boatSession?.sessionId ?? existingApproval.boatSessionId,
  });

  const whatsappDispatched = await dispatchWhatsappSubmissionConfirmation({
    whatsappNumber: settings.whatsappNumber,
    tenderNumber: tender.tenderNumber,
    closingDate: tender.closingDate,
    submissionChannel,
    mergedPackUrl: committed?.mergedPackUrl,
  });

  if (whatsappDispatched && committed) {
    committed = await resolvePendingApproval({
      approvalId: params.approvalId,
      decision: 'approved',
      operatorName: params.operatorName,
      mergedPackStorageId,
      submissionChannel,
      whatsappDispatched: true,
      boatSessionId: boatSession?.sessionId ?? existingApproval.boatSessionId,
    });
  }

  return {
    approval: committed,
    boatSession,
  };
}

export async function auditTenderPdfAction(bidId: string): Promise<{
  auditReport: string;
  model: string;
  usedLiveApi: boolean;
}> {
  await requireAuthenticatedConvex();
  const [{ tender, compliance }, settings] = await Promise.all([
    getTenderById(bidId),
    getContractorSettings(),
  ]);

  if (!tender) {
    throw new Error(`Tender ${bidId} not found`);
  }

  const citations = await searchTenderChunks('SBD BoQ compliance', bidId);

  const prompt = [
    `Perform a full tender compliance and risk audit for ${tender.tenderNumber} (${tender.title}).`,
    `Municipality: ${tender.municipality}. Required CIDB: ${tender.cidbGrade}.`,
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
    monthlyCapUsd: settings.openRouterSubKeyCapUsd,
    contextSnippets: citations.map(
      (c) => `[p.${c.pageNumber ?? 1}] ${c.sourceTitle}: ${c.textSnippet}`
    ),
    onUsageRecorded: async (usage) => {
      await recordAiUsage(usage);
    },
  });

  return {
    auditReport: result.text,
    model: result.model,
    usedLiveApi: result.usedLiveApi,
  };
}

// Keep unused helper reference clean if imported elsewhere
export { getConvexHttpClient };
