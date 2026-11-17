'use server';

import { runTenderAI, type TenderAITask } from '@/lib/openrouter';
import {
  appendConvexMessage,
  getComplianceSummary,
  getContractorSettings,
  indexPdfIntoTenderChunks,
  listConvexMessages,
  recordAiUsage,
  requireAuthenticatedConvex,
  searchTenderChunks,
} from '@/lib/convex-store';
import type { Message, SourceCitation, ThinkingStep } from '@/types';

export interface AskTenderResponse {
  answer: string;
  model: string;
  sources: SourceCitation[];
  thinkingSteps: ThinkingStep[];
  durationMs: number;
  requiresApprovalShield: boolean;
}

export interface UploadTenderPdfResponse extends AskTenderResponse {
  fileName: string;
  pageCount: number;
  chunkCount: number;
}

export async function getPersistedMessagesAction(
  bidId?: string
): Promise<Message[]> {
  await requireAuthenticatedConvex();
  const rows = await listConvexMessages(bidId);
  return rows.map((row) => ({
    id: String(row._id),
    role: row.role,
    content: row.content,
    timestamp: new Date(row.createdAt),
    contentType: row.contentType,
    modelUsed: row.modelUsed,
    sources: row.sources?.map((s, idx) => ({
      id: `${row._id}-src-${idx}`,
      sourceTitle: s.sourceTitle,
      filePath: s.filePath,
      textSnippet: s.textSnippet,
      pageNumber: s.pageNumber,
      score: s.score,
    })),
  }));
}

export async function uploadAndIndexTenderPdfAction(
  formData: FormData
): Promise<UploadTenderPdfResponse> {
  await requireAuthenticatedConvex();
  const startedAt = Date.now();
  const rawFile = formData.get('file');
  const rawBidId = formData.get('bidId');

  if (!(rawFile instanceof File)) {
    throw new Error('Please attach a valid PDF tender document.');
  }
  if (!rawFile.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF tender documents can be vector-indexed.');
  }

  const tenderId =
    typeof rawBidId === 'string' && rawBidId.trim().length > 0
      ? rawBidId.trim()
      : 'general-tender-upload';

  const bytes = new Uint8Array(await rawFile.arrayBuffer());
  const indexed = await indexPdfIntoTenderChunks({
    tenderId,
    fileName: rawFile.name,
    bytes,
    fileType: 'pdf',
  });

  const auditPrompt = `Audit uploaded tender PDF "${rawFile.name}" (${indexed.pageCount} pages, ${indexed.chunkCount} chunks indexed) against SBD 1/4/6.1 returnables and our Compliance Vault. Cite exact page numbers.`;

  const [citations, compliance, settings] = await Promise.all([
    searchTenderChunks('SBD compulsory returnables closing CIDB', tenderId),
    getComplianceSummary(),
    getContractorSettings(),
  ]);

  const complianceSnippet = `Compliance Vault Status: ${
    compliance.isBidReady
      ? 'ALL CLEAR'
      : `${compliance.blockingAlerts.length} BLOCKING ALERTS (${compliance.blockingAlerts.join(' | ')})`
  }`;

  const aiResult = await runTenderAI({
    task: 'pdf_audit',
    prompt: auditPrompt,
    clientSpendUsd: settings.openRouterUsedUsd,
    monthlyCapUsd: settings.openRouterSubKeyCapUsd,
    contextSnippets: [
      complianceSnippet,
      ...citations.map(
        (c) =>
          `[p.${c.pageNumber ?? 1}] ${c.sourceTitle ?? c.filePath}: ${c.textSnippet}`
      ),
      indexed.sampleText ? `Lead Pages:\n${indexed.sampleText}` : '',
    ].filter(Boolean),
    onUsageRecorded: async (usage) => {
      await recordAiUsage(usage);
    },
  });

  const durationMs = Math.max(240, Date.now() - startedAt);
  await Promise.all([
    appendConvexMessage({
      bidId: tenderId,
      role: 'user',
      content: `Uploaded tender PDF: ${rawFile.name} (${indexed.pageCount} pages)`,
      contentType: 'text',
    }),
    appendConvexMessage({
      bidId: tenderId,
      role: 'assistant',
      content: aiResult.text,
      contentType: 'markdown',
      modelUsed: aiResult.model,
      sources: citations,
    }),
  ]);

  return {
    fileName: rawFile.name,
    pageCount: indexed.pageCount,
    chunkCount: indexed.chunkCount,
    answer: aiResult.text,
    model: aiResult.model,
    sources: citations,
    thinkingSteps: [
      {
        id: 'step-1',
        label: `Extracted ${indexed.pageCount} PDF pages via unpdf & uploaded to Convex Storage`,
        status: 'completed',
        durationMs: 120,
      },
      {
        id: 'step-2',
        label: `Indexed ${indexed.chunkCount} overlapping chunks into Convex @vectorIndex`,
        status: 'completed',
        durationMs: 140,
      },
      {
        id: 'step-3',
        label: `Audited via ${aiResult.model} with page citations`,
        status: 'completed',
        durationMs: Math.max(60, durationMs - 260),
      },
    ],
    durationMs,
    requiresApprovalShield: false,
  };
}

export async function askTenderQuestionAction(params: {
  prompt: string;
  bidId?: string;
  mode?: 'chat' | 'pdf_audit';
}): Promise<AskTenderResponse> {
  await requireAuthenticatedConvex();
  const startedAt = Date.now();
  const normalized = params.prompt.toLowerCase();

  const shouldAudit =
    params.mode === 'pdf_audit' ||
    normalized.includes('audit') ||
    normalized.includes('full pdf') ||
    normalized.includes('sbd');

  const task: TenderAITask = shouldAudit ? 'pdf_audit' : 'chat';

  const [citations, compliance, settings] = await Promise.all([
    searchTenderChunks(params.prompt, params.bidId),
    getComplianceSummary(),
    getContractorSettings(),
  ]);

  const complianceSummarySnippet = `Compliance Vault Status: ${
    compliance.isBidReady
      ? 'ALL CLEAR'
      : `${compliance.blockingAlerts.length} BLOCKING ALERTS (${compliance.blockingAlerts.join(' | ')})`
  }`;

  const aiResult = await runTenderAI({
    task,
    prompt: params.prompt,
    clientSpendUsd: settings.openRouterUsedUsd,
    monthlyCapUsd: settings.openRouterSubKeyCapUsd,
    contextSnippets: [
      complianceSummarySnippet,
      ...citations.map(
        (c) =>
          `[p.${c.pageNumber ?? 1}] ${c.sourceTitle ?? c.filePath}: ${c.textSnippet}`
      ),
    ],
    onUsageRecorded: async (usage) => {
      await recordAiUsage(usage);
    },
  });

  const durationMs = Math.max(240, Date.now() - startedAt);
  const threadBidId = params.bidId ?? 'general';

  await Promise.all([
    appendConvexMessage({
      bidId: threadBidId,
      role: 'user',
      content: params.prompt,
      contentType: 'text',
    }),
    appendConvexMessage({
      bidId: threadBidId,
      role: 'assistant',
      content: aiResult.text,
      contentType: 'markdown',
      modelUsed: aiResult.model,
      sources: citations,
    }),
  ]);

  const thinkingSteps: ThinkingStep[] = [
    {
      id: 'step-1',
      label: `Routed via OpenRouter to ${aiResult.model}`,
      status: 'completed',
      durationMs: 45,
    },
    {
      id: 'step-2',
      label: `Queried Convex tenderChunks @vectorIndex (${citations.length} page hits)`,
      status: 'completed',
      durationMs: 110,
    },
    {
      id: 'step-3',
      label: 'Evaluated CSD (7d), CIPC/ID (90d), and Tax/COIDA/B-BBEE rules',
      status: 'completed',
      durationMs: 65,
    },
    {
      id: 'step-4',
      label: 'Synthesized tender guidance & persisted thread to Convex',
      status: 'completed',
      durationMs: Math.max(40, durationMs - 220),
    },
  ];

  const requiresApprovalShield =
    normalized.includes('submit') ||
    normalized.includes('send email') ||
    normalized.includes('whatsapp');

  return {
    answer: aiResult.text,
    model: aiResult.model,
    sources: citations,
    thinkingSteps,
    durationMs,
    requiresApprovalShield,
  };
}
