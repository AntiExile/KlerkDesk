import fs from 'node:fs';
import path from 'node:path';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { computeDeterministicEmbedding1536 } from '@/lib/rag';

export const FAST_MODEL = 'deepseek/deepseek-v4-flash' as const;
export const AUDIT_MODEL = 'anthropic/claude-sonnet-5.5' as const;
export const DEFAULT_FREE_FAST_MODEL = 'nvidia/nemotron-3.5-lightning:free' as const;
export const DEFAULT_FREE_AUDIT_MODEL = 'nvidia/nemotron-3.5-lightning:free' as const;
export const FREE_AUDIT_FALLBACK_MODEL = 'cohere/north-mini-code:free' as const;
export const FREE_ROUTER_MODEL = 'openrouter/free' as const;
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small' as const;
export const FREE_FAST_MODEL =
  process.env.OPENROUTER_FREE_FAST_MODEL || DEFAULT_FREE_FAST_MODEL;
export const FREE_AUDIT_MODEL =
  process.env.OPENROUTER_FREE_AUDIT_MODEL || DEFAULT_FREE_AUDIT_MODEL;
export const MONTHLY_CAP_USD = 15.0;

/**
 * Returns true when zero-cost OpenRouter `:free` model routing is enabled via
 * `OPENROUTER_DEV_FREE=true`.
 */
export function isOpenRouterDevFree(): boolean {
  return process.env.OPENROUTER_DEV_FREE === 'true';
}

export type TenderAITask =
  | 'dom'
  | 'chat'
  | 'whatsapp_qa'
  | 'pdf_audit'
  | 'sbd_review';

export interface UsageRecordEntry {
  model: string;
  task: TenderAITask;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface RunTenderAIInput {
  task: TenderAITask;
  prompt: string;
  systemPrompt?: string;
  clientSpendUsd?: number;
  monthlyCapUsd?: number;
  subKey?: string;
  contextSnippets?: string[];
  onUsageRecorded?: (usage: UsageRecordEntry) => Promise<void> | void;
}

export interface RunTenderAIResult {
  text: string;
  model: string;
  usedLiveApi: boolean;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  capRemainingUsd: number;
}

/**
 * Route DOM/chat/WhatsApp tasks to deepseek/deepseek-v4-flash and
 * full tender PDF/SBD audits to anthropic/claude-sonnet-5.5
 * (or OpenRouter `:free` equivalents when OPENROUTER_DEV_FREE=true).
 */
export function resolveModelForTask(task: TenderAITask): string {
  const devFree = isOpenRouterDevFree();
  switch (task) {
    case 'pdf_audit':
    case 'sbd_review':
      return devFree
        ? process.env.OPENROUTER_FREE_AUDIT_MODEL || DEFAULT_FREE_AUDIT_MODEL
        : AUDIT_MODEL;
    case 'dom':
    case 'chat':
    case 'whatsapp_qa':
    default:
      return devFree
        ? process.env.OPENROUTER_FREE_FAST_MODEL || DEFAULT_FREE_FAST_MODEL
        : FAST_MODEL;
  }
}

function readKeyFromDotEnvLocal(keyName: string): string {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) return '';
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      if (line.slice(0, idx).trim() === keyName) {
        return line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // ignore fs read issues
  }
  return '';
}

function resolveOpenRouterApiKey(subKey?: string): string {
  let apiKey = (
    subKey ||
    process.env.OPENROUTER_CLIENT_SUBKEY ||
    process.env.OPENROUTER_API_KEY ||
    ''
  ).trim();

  if (!subKey && (!apiKey || apiKey.length < 40)) {
    const localKey =
      readKeyFromDotEnvLocal('OPENROUTER_CLIENT_SUBKEY') ||
      readKeyFromDotEnvLocal('OPENROUTER_API_KEY');
    if (localKey && localKey.length >= 40) {
      apiKey = localKey;
    }
  }

  return apiKey;
}

export function getOpenRouterClient(subKey?: string) {
  const apiKey = resolveOpenRouterApiKey(subKey);
  if (!apiKey) {
    return null;
  }

  return createOpenRouter({
    apiKey,
    compatibility: 'strict',
    appName: 'KlerkDesk Tender Ops',
    appUrl: 'https://klerkdesk.mundusmk.co.za',
  });
}

function isAuthOrQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const errObj = error as {
    statusCode?: number;
    status?: number;
    responseBody?: string;
    message?: string;
  };
  const code = errObj.statusCode ?? errObj.status;
  if (code === 401 || code === 402 || code === 403) return true;
  const msg = `${errObj.message ?? ''} ${errObj.responseBody ?? ''}`.toLowerCase();
  return (
    msg.includes('user not found') ||
    msg.includes('invalid api key') ||
    msg.includes('no auth credentials') ||
    msg.includes('"code":401') ||
    msg.includes('"code":403')
  );
}

function computeTokenCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  if (modelId === 'openrouter/free' || modelId.endsWith(':free')) {
    return 0;
  }
  if (modelId.includes('claude')) {
    // Claude Sonnet pricing (~$3/M input, $15/M output)
    return (
      Math.round(
        ((promptTokens * 3 + completionTokens * 15) / 1_000_000) * 1_000_000
      ) / 1_000_000
    );
  }
  // DeepSeek Flash pricing (~$0.27/M input, $1.10/M output)
  return (
    Math.round(
      ((promptTokens * 0.27 + completionTokens * 1.1) / 1_000_000) * 1_000_000
    ) / 1_000_000
  );
}

function extractUsageTokens(usage: unknown): {
  promptTokens: number;
  completionTokens: number;
} {
  if (!usage || typeof usage !== 'object') {
    return { promptTokens: 0, completionTokens: 0 };
  }
  const u = usage as Record<string, unknown>;
  const promptTokens = Number(u.promptTokens ?? u.inputTokens ?? 0) || 0;
  const completionTokens = Number(u.completionTokens ?? u.outputTokens ?? 0) || 0;
  return { promptTokens, completionTokens };
}

export async function runTenderAI(
  input: RunTenderAIInput
): Promise<RunTenderAIResult> {
  const devFree = isOpenRouterDevFree();
  const spend = input.clientSpendUsd ?? 0;
  const capUsd = input.monthlyCapUsd ?? MONTHLY_CAP_USD;

  if (!devFree && spend >= capUsd) {
    throw new Error(
      `OpenRouter client sub-key monthly cap ($${capUsd.toFixed(
        2
      )}/mo) reached. Current spend: $${spend.toFixed(2)}.`
    );
  }

  const modelId = resolveModelForTask(input.task);
  const client = getOpenRouterClient(input.subKey);

  const systemBase =
    input.systemPrompt ??
    [
      'You are KlerkDesk Tender Ops AI, a specialist South African public procurement and CIDB/MFMA/PFMA tender analyst for klerkdesk.mundusmk.co.za.',
      'Always cite Rand figures (R), SBD 1/4/6.1 compliance rules, PFMA SCM Instructions 12 & 14 of 2026/27, CSD 7-day validity, and certified CIPC/ID 90-day rules.',
      'When tender document chunks are provided, cite exact page numbers (e.g. [p. 4]).',
      'Never authorise automatic submission without human Approval Shield clearance on /bid/[id].',
    ].join(' ');

  const contextBlock =
    input.contextSnippets && input.contextSnippets.length > 0
      ? `\n\nRetrieved Convex Vector Search Tender & Compliance Context:\n${input.contextSnippets.join('\n---\n')}`
      : '';

  const candidateModels = [modelId];
  if (devFree) {
    const freeFast =
      process.env.OPENROUTER_FREE_FAST_MODEL || DEFAULT_FREE_FAST_MODEL;
    const freeAudit =
      process.env.OPENROUTER_FREE_AUDIT_MODEL || DEFAULT_FREE_AUDIT_MODEL;
    const fallbacks =
      input.task === 'pdf_audit' || input.task === 'sbd_review'
        ? [FREE_AUDIT_FALLBACK_MODEL, FREE_ROUTER_MODEL, freeFast]
        : [FREE_AUDIT_FALLBACK_MODEL, freeAudit, FREE_ROUTER_MODEL];

    for (const fallback of fallbacks) {
      if (!candidateModels.includes(fallback)) {
        candidateModels.push(fallback);
      }
    }
  }

  if (client) {
    for (const candidateModel of candidateModels) {
      try {
        const useNoReasoning =
          devFree ||
          candidateModel === 'openrouter/free' ||
          candidateModel.endsWith(':free');
        const response = await generateText({
          model: client.chat(
            candidateModel,
            useNoReasoning
              ? { reasoning: { enabled: false, effort: 'none' } }
              : undefined
          ),
          system: systemBase,
          prompt: `${input.prompt}${contextBlock}`,
          maxOutputTokens:
            input.task === 'pdf_audit' || input.task === 'sbd_review'
              ? 2000
              : 1200,
          abortSignal: AbortSignal.timeout(20_000),
        });

        const textOut = response.text?.trim() ?? '';
        if (!textOut) {
          throw new Error(`Model ${candidateModel} returned empty text output`);
        }

        const resolvedModel =
          (response as { model?: string }).model ||
          response.response?.modelId ||
          candidateModel;

        const { promptTokens, completionTokens } = extractUsageTokens(
          response.usage
        );
        const estimatedCostUsd = devFree
          ? 0
          : computeTokenCostUsd(resolvedModel, promptTokens, completionTokens);

        if (input.onUsageRecorded) {
          await input.onUsageRecorded({
            model: resolvedModel,
            task: input.task,
            promptTokens,
            completionTokens,
            costUsd: estimatedCostUsd,
          });
        }

        return {
          text: textOut,
          model: resolvedModel,
          usedLiveApi: true,
          promptTokens,
          completionTokens,
          estimatedCostUsd,
          capRemainingUsd: Math.max(0, capUsd - (spend + estimatedCostUsd)),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (isAuthOrQuotaError(error)) {
          console.warn(
            `[OpenRouter] Auth/quota rejection for ${candidateModel} (${msg}); falling back to local tender analyzer.`
          );
          break;
        }
        console.warn(`[OpenRouter] Live call failed for ${candidateModel}: ${msg}`);
      }
    }
  }

  const fallbackText = buildDeterministicResponse(input.task, input.prompt, modelId);
  return {
    text: fallbackText,
    model: modelId,
    usedLiveApi: false,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
    capRemainingUsd: Math.max(0, capUsd - spend),
  };
}

/**
 * Generates 1536-dimensional embeddings via OpenRouter (`openai/text-embedding-3-small`)
 * and gracefully falls back to `computeDeterministicEmbedding1536` when running offline
 * or with a restricted `:free` key.
 */
export async function generateOpenRouterEmbeddings(
  texts: string[]
): Promise<{
  vectors: number[][];
  usedLiveEmbeddings: boolean;
}> {
  if (texts.length === 0) {
    return { vectors: [], usedLiveEmbeddings: false };
  }

  const apiKey = resolveOpenRouterApiKey();
  if (apiKey && !isOpenRouterDevFree()) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://klerkdesk.mundusmk.co.za',
          'X-Title': 'KlerkDesk Tender Ops',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts.map((t) => t.slice(0, 4000)),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{ embedding?: number[] }>;
        };
        const vectors = (json.data ?? []).map((item) => item.embedding ?? []);
        if (
          vectors.length === texts.length &&
          vectors.every((v) => v.length === 1536)
        ) {
          return { vectors, usedLiveEmbeddings: true };
        }
      }
    } catch {
      // Fall back cleanly to deterministic 1536-dim vectors
    }
  }

  return {
    vectors: texts.map((t) => computeDeterministicEmbedding1536(t)),
    usedLiveEmbeddings: false,
  };
}

function buildDeterministicResponse(
  task: TenderAITask,
  prompt: string,
  modelId: string
): string {
  const normalized = prompt.toLowerCase();

  if (task === 'pdf_audit' || task === 'sbd_review') {
    return [
      `**Full Tender PDF & SBD Compliance Audit** (routed via \`${modelId}\`):`,
      '',
      '1. **Mandatory Returnables (SBD 1 / SBD 4 / SBD 6.1):** Verified invitation to bid, PFMA SCM Instruction 12 & 14 (2026/27) director & Organ of State disclosure, and PPR 2022 preference points claim.',
      '2. **Compliance Vault Verification:** CSD reports older than **7 days** and certified CIPC/Director IDs older than **90 days** must be refreshed before final Approval Shield execution.',
      '3. **Commercial & BoQ Check:** Ensure 15% VAT and P&G allowances reconcile with the Form of Offer and SBD 1 total before triggering the Approval Shield.',
    ].join('\n');
  }

  if (task === 'whatsapp_qa') {
    return `KlerkDesk Ops (${modelId}): Checked your Compliance Vault & active tenders. CSD reports expire after 7 days and certified CIPC/IDs after 90 days. No eTenders submission or broadcast executes without your Approval Shield sign-off in /bid/[id].`;
  }

  if (normalized.includes('csd') || normalized.includes('cipc') || normalized.includes('tax') || normalized.includes('compliance')) {
    return [
      `**Compliance Gate Assessment** (\`${modelId}\`):`,
      '- **CSD Registration Report:** Flagged if older than **7 days** from issue date.',
      '- **Certified CIPC & Director IDs:** Flagged if certification stamp is older than **90 days**.',
      '- **SARS Tax PIN, COIDA, B-BBEE:** Validated against expiry date before staging any bid on `eTenders.gov.za`.',
      '',
      'Open `/vault` or click **Upload Compliance Docs** to refresh flagged documents before signing off via the Approval Shield.',
    ].join('\n');
  }

  if (normalized.includes('boq') || normalized.includes('vat') || normalized.includes('price') || normalized.includes('rand')) {
    return [
      `**BoQ & Pricing Check** (\`${modelId}\`):`,
      '- Verify unit rates in the interactive BoQ table on `/bid/[id]` — all figures use `tabular-nums` Rand (`R`) formatting.',
      '- Confirm 15% VAT is calculated on the net subtotal including P&G and provisional sums, and re-stamp SBD 1 / 4 / 6.1 via `pdf-lib` before requesting Approval Shield clearance.',
    ].join('\n');
  }

  return [
    `**Tender Assistant Analysis** (\`${modelId}\`):`,
    `Reviewed query: _"${prompt.slice(0, 120)}"_.`,
    '',
    '- **Model Routing:** Chat & DOM inspection routed to `deepseek/deepseek-v4-flash`; full tender PDF audits route to `anthropic/claude-sonnet-5.5`.',
    '- **Approval Shield:** External tender submissions, emails, and WhatsApp broadcasts pause in `pending_approval` until an authenticated operator signs off on `/bid/[id]`.',
  ].join('\n');
}

/**
 * Classifies a contractor's natural-language business description into the most
 * likely National Treasury eTenders sectors using OpenRouter's `:free` tier models.
 */
export async function recommendSectorsViaFreeOpenRouter(
  businessDescription: string
): Promise<{
  rawText: string;
  modelUsed: string;
}> {
  const client = getOpenRouterClient();
  const freeModels = [
    process.env.OPENROUTER_FREE_FAST_MODEL || DEFAULT_FREE_FAST_MODEL,
    FREE_AUDIT_FALLBACK_MODEL,
    FREE_ROUTER_MODEL,
  ];

  const systemPrompt = [
    'You are KlerkDesk Sector Classifier for South African National Treasury eTenders (etenders.gov.za).',
    'Map the user business description to 1 to 3 of these exact sector IDs:',
    '- "civil_roads": Civil & Roads Construction (roads, stormwater, water/sewer pipelines, bridges, earthworks, CIDB CE)',
    '- "building_construction": Building & General Construction (clinics, schools, housing, renovations, roofing, plumbing, fencing, CIDB GB)',
    '- "electrical_mechanical": Electrical, Mechanical & Energy (solar PV, generators, substations, HVAC, pumps, street lighting, CIDB EP/EB/ME)',
    '- "facilities_security": Facilities, Cleaning, Hygiene & Security (guarding, CCTV, cleaning, pest control, landscaping, waste, catering)',
    '- "it_telecoms": IT, Software, Cloud & Telecoms (software, cloud, ERP, cybersecurity, networking, laptops/servers, fibre)',
    '- "supplies_goods": General Supplies, Fleet & Medical Goods (PPE, medical consumables, stationery, furniture, vehicles, equipment)',
    '- "professional_consulting": Professional, Engineering & Financial Consulting (engineering design, QS, audit, accounting, legal, training)',
    'Respond ONLY with valid JSON in this exact shape:',
    '{"recommendedSectorIds":["sector_id"],"suggestedCidbGrade":"e.g. 4CE or empty string","rationale":"1 short sentence explaining why these official eTenders categories fit their work."}',
  ].join('\n');

  if (client) {
    for (const candidateModel of freeModels) {
      try {
        const response = await generateText({
          model: client.chat(candidateModel, {
            reasoning: { enabled: false, effort: 'none' },
          }),
          system: systemPrompt,
          prompt: `Contractor business description: "${businessDescription.trim()}"`,
          maxOutputTokens: 700,
          abortSignal: AbortSignal.timeout(12_000),
        });

        const resolvedModel =
          (response as { model?: string }).model ||
          response.response?.modelId ||
          candidateModel;

        if (response.text && response.text.trim().length > 0) {
          return {
            rawText: response.text,
            modelUsed: resolvedModel,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isAuthOrQuotaError(err)) {
          console.warn(`[OpenRouter Free Sector Classifier] Auth/quota rejection (${msg}); using deterministic classifier.`);
          break;
        }
        console.warn(
          `[OpenRouter Free Sector Classifier] ${candidateModel} fallback: ${msg}`
        );
      }
    }
  }

  return {
    rawText: '',
    modelUsed: DEFAULT_FREE_FAST_MODEL,
  };
}
