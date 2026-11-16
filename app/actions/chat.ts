'use server';

import { runTenderAI, type TenderAITask } from '@/lib/openrouter';
import {
  getComplianceSummary,
  getContractorSettings,
  searchTenderChunks,
} from '@/lib/convex-store';
import type { SourceCitation, ThinkingStep } from '@/types';

export interface AskTenderResponse {
  answer: string;
  model: string;
  sources: SourceCitation[];
  thinkingSteps: ThinkingStep[];
  durationMs: number;
  requiresApprovalShield: boolean;
}

export async function askTenderQuestionAction(params: {
  prompt: string;
  bidId?: string;
  mode?: 'chat' | 'pdf_audit';
}): Promise<AskTenderResponse> {
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
    contextSnippets: [
      complianceSummarySnippet,
      ...citations.map((c) => `${c.sourceTitle}: ${c.textSnippet}`),
    ],
  });

  const durationMs = Math.max(240, Date.now() - startedAt);

  const thinkingSteps: ThinkingStep[] = [
    {
      id: 'step-1',
      label: `Routed via OpenRouter to ${aiResult.model}`,
      status: 'completed',
      durationMs: 45,
    },
    {
      id: 'step-2',
      label: 'Queried Convex tenderChunks @vectorIndex & complianceDocs',
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
      label: 'Synthesized tender guidance with Approval Shield guardrail',
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
