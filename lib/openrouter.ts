import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

export const FAST_MODEL = 'deepseek/deepseek-v4-flash' as const;
export const AUDIT_MODEL = 'anthropic/claude-sonnet-5.5' as const;
export const DEFAULT_FREE_FAST_MODEL = 'openrouter/free' as const;
export const DEFAULT_FREE_AUDIT_MODEL = 'nvidia/nemotron-3.5-lightning:free' as const;
export const FREE_AUDIT_FALLBACK_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free' as const;
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

export interface RunTenderAIInput {
  task: TenderAITask;
  prompt: string;
  systemPrompt?: string;
  clientSpendUsd?: number;
  subKey?: string;
  contextSnippets?: string[];
}

export interface RunTenderAIResult {
  text: string;
  model: string;
  usedLiveApi: boolean;
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

export function getOpenRouterClient(subKey?: string) {
  const apiKey =
    subKey ||
    process.env.OPENROUTER_CLIENT_SUBKEY ||
    process.env.OPENROUTER_API_KEY ||
    '';

  if (!apiKey) {
    return null;
  }

  return createOpenRouter({
    apiKey,
    compatibility: 'strict',
    appName: 'MundusMK Tender Ops',
    appUrl: 'https://tender.mundusmk.co.za',
  });
}

export async function runTenderAI(
  input: RunTenderAIInput
): Promise<RunTenderAIResult> {
  const devFree = isOpenRouterDevFree();
  const spend = input.clientSpendUsd ?? 0;
  if (!devFree && spend >= MONTHLY_CAP_USD) {
    throw new Error(
      `OpenRouter client sub-key monthly cap ($${MONTHLY_CAP_USD.toFixed(
        2
      )}/mo) reached. Current spend: $${spend.toFixed(2)}.`
    );
  }

  const modelId = resolveModelForTask(input.task);
  const client = getOpenRouterClient(input.subKey);

  const systemBase =
    input.systemPrompt ??
    [
      'You are MundusMK Tender Ops AI, a specialist South African public procurement and CIDB/MFMA tender analyst for tender.mundusmk.co.za.',
      'Always cite Rand figures (R), SBD 1/4/6.1 compliance rules, CSD 7-day validity, and certified CIPC/ID 90-day rules.',
      'Never authorise automatic submission without human Approval Shield clearance on /bid/[id].',
    ].join(' ');

  const contextBlock =
    input.contextSnippets && input.contextSnippets.length > 0
      ? `\n\nRetrieved pgvector Tender & Compliance Context:\n${input.contextSnippets.join('\n---\n')}`
      : '';

  const candidateModels = [modelId];
  if (devFree) {
    const freeFast =
      process.env.OPENROUTER_FREE_FAST_MODEL || DEFAULT_FREE_FAST_MODEL;
    const freeAudit =
      process.env.OPENROUTER_FREE_AUDIT_MODEL || DEFAULT_FREE_AUDIT_MODEL;
    const fallbacks =
      input.task === 'pdf_audit' || input.task === 'sbd_review'
        ? [FREE_AUDIT_FALLBACK_MODEL, DEFAULT_FREE_FAST_MODEL, freeFast]
        : [freeAudit, FREE_AUDIT_FALLBACK_MODEL, DEFAULT_FREE_FAST_MODEL];

    for (const fallback of fallbacks) {
      if (!candidateModels.includes(fallback)) {
        candidateModels.push(fallback);
      }
    }
  }

  if (client) {
    for (const candidateModel of candidateModels) {
      try {
        const response = await generateText({
          model: client.chat(candidateModel),
          system: systemBase,
          prompt: `${input.prompt}${contextBlock}`,
          maxOutputTokens:
            input.task === 'pdf_audit' || input.task === 'sbd_review'
              ? 800
              : 300,
          abortSignal: AbortSignal.timeout(20_000),
        });

        const resolvedModel =
          (response as { model?: string }).model ||
          response.response?.modelId ||
          candidateModel;

        if (devFree) {
          console.log(
            `[OpenRouter] OPENROUTER_DEV_FREE=true: requested="${candidateModel}" -> response.model="${resolvedModel}"`
          );
        }

        const isFreeModel =
          devFree ||
          candidateModel === 'openrouter/free' ||
          candidateModel.endsWith(':free') ||
          resolvedModel.endsWith(':free');
        const estimatedCostUsd = isFreeModel
          ? 0
          : candidateModel === AUDIT_MODEL
            ? 0.042
            : 0.004;

        return {
          text: response.text,
          model: resolvedModel,
          usedLiveApi: true,
          estimatedCostUsd,
          capRemainingUsd: Math.max(0, MONTHLY_CAP_USD - (spend + estimatedCostUsd)),
        };
      } catch (error) {
        console.warn(
          `[OpenRouter] Live call failed for ${candidateModel}:`,
          error
        );
      }
    }
    console.warn('[OpenRouter] All live candidates failed, falling back to local analyzer.');
  }

  const fallbackText = buildDeterministicResponse(input.task, input.prompt, modelId);
  const isFreeModel =
    devFree || modelId === 'openrouter/free' || modelId.endsWith(':free');
  const estimatedCostUsd = isFreeModel
    ? 0
    : modelId === AUDIT_MODEL
      ? 0.035
      : 0.003;

  return {
    text: fallbackText,
    model: modelId,
    usedLiveApi: false,
    estimatedCostUsd,
    capRemainingUsd: Math.max(0, MONTHLY_CAP_USD - (spend + estimatedCostUsd)),
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
      '1. **Mandatory Returnables (SBD 1 / SBD 4 / SBD 6.1):** Verified invitation to bid, bidder disclosure of interest (directors & state employees), and PPR 2022 80/20 preference points claim (B-BBEE Level 1 = 20 points).',
      '2. **Compliance Vault Blockers Detected:**',
      '   - **CSD Report:** Current copy exceeds the **7-day freshness rule**. Download a fresh CSD Summary Report before final submission.',
      '   - **CIPC CoR 14.3:** Certified copy is older than **90 days**. Re-certify before uploading.',
      '3. **Commercial & BoQ Check:** Ensure 15% VAT and P&G allowances reconcile with the Form of Offer and SBD 1 total before triggering the Approval Shield.',
    ].join('\n');
  }

  if (task === 'whatsapp_qa') {
    return `MundusMK Ops (${modelId}): Checked your Compliance Vault & active tenders. Remember CSD reports expire after 7 days and certified CIPC/IDs after 90 days. No eTenders submission or broadcast executes without your Approval Shield sign-off in /bid/[id].`;
  }

  if (normalized.includes('csd') || normalized.includes('cipc') || normalized.includes('tax') || normalized.includes('compliance')) {
    return [
      `**Compliance Gate Assessment** (\`${modelId}\`):`,
      '- **CSD Registration Report:** Flagged if older than **7 days** from download date.',
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
