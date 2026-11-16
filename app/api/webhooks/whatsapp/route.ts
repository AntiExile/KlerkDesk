import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runTenderAI } from '@/lib/openrouter';
import {
  createPendingApproval,
  getComplianceSummary,
  getContractorSettings,
  getTenderMatches,
} from '@/lib/convex-store';

const MetaWebhookSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: z
                .object({
                  messaging_product: z.string().optional(),
                  metadata: z
                    .object({
                      phone_number_id: z.string().optional(),
                    })
                    .optional(),
                  messages: z
                    .array(
                      z.object({
                        id: z.string().optional(),
                        from: z.string(),
                        type: z.string().optional(),
                        text: z
                          .object({
                            body: z.string(),
                          })
                          .optional(),
                      })
                    )
                    .optional(),
                })
                .optional(),
            })
          )
          .optional(),
      })
    )
    .optional(),
});

/**
 * Verifies Meta WhatsApp Cloud API `X-Hub-Signature-256` HMAC-SHA256 header
 * using `crypto.timingSafeEqual` so spoofed replies cannot forge contractor approvals.
 */
function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', appSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

  const receivedBuf = Buffer.from(signatureHeader, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (receivedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * Meta WhatsApp Cloud API webhook verification challenge.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken =
    process.env.WHATSAPP_VERIFY_TOKEN || 'mundus-tender-ops-verify';

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json(
    { error: 'WhatsApp webhook verification failed' },
    { status: 403 }
  );
}

/**
 * Handles inbound Meta WhatsApp Cloud API messages for tender alerts & contractor Q&A.
 * Enforces X-Hub-Signature-256 verification and the Approval Shield.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('x-hub-signature-256');
    const configuredSecret = process.env.WHATSAPP_APP_SECRET;

    if (configuredSecret || process.env.NODE_ENV === 'production') {
      if (!configuredSecret) {
        return NextResponse.json(
          { error: 'WHATSAPP_APP_SECRET is not configured on the server' },
          { status: 500 }
        );
      }

      if (!verifyWhatsAppSignature(rawBody, signatureHeader, configuredSecret)) {
        return NextResponse.json(
          { error: 'Invalid or missing X-Hub-Signature-256 signature' },
          { status: 401 }
        );
      }
    } else if (signatureHeader) {
      if (
        !verifyWhatsAppSignature(
          rawBody,
          signatureHeader,
          'dev-whatsapp-app-secret'
        )
      ) {
        return NextResponse.json(
          { error: 'Invalid X-Hub-Signature-256 signature' },
          { status: 401 }
        );
      }
    }

    const parsedJson: unknown = JSON.parse(rawBody);
    const parsed = MetaWebhookSchema.safeParse(parsedJson);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Meta WhatsApp webhook payload' },
        { status: 400 }
      );
    }

    const messages =
      parsed.data.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

    if (messages.length === 0) {
      return NextResponse.json({ status: 'ignored', reason: 'no_messages' });
    }

    const inbound = messages[0];
    const textBody = inbound.text?.body?.trim() ?? '';
    const sender = inbound.from;

    const [compliance, tenders, settings] = await Promise.all([
      getComplianceSummary(),
      getTenderMatches(),
      getContractorSettings(),
    ]);

    const topTender = tenders[0];
    const normalized = textBody.toLowerCase();

    let approvalRecordId: string | null = null;
    if (
      normalized.includes('submit') ||
      normalized.includes('broadcast') ||
      normalized.includes('send')
    ) {
      const approval = await createPendingApproval({
        bidId: topTender?.id ?? 'ET-2026-WC-0842',
        tenderNumber: topTender?.tenderNumber ?? 'T/GEO/042/2026',
        actionType: normalized.includes('broadcast')
          ? 'whatsapp_broadcast'
          : 'submit_etenders',
        totalBidZar: topTender?.estimatedValueZar ?? 14_850_000,
        vatZar: (topTender?.estimatedValueZar ?? 14_850_000) * 0.15,
        grandTotalZar: (topTender?.estimatedValueZar ?? 14_850_000) * 1.15,
        targetResource: `WhatsApp request from ${sender}`,
        commandPreview: `whatsapp.intent("${textBody.slice(0, 80)}") // blocked by Approval Shield`,
        requestedBy: `WhatsApp (${sender})`,
      });
      approvalRecordId = approval.id;
    }

    const aiReply = await runTenderAI({
      task: 'whatsapp_qa',
      prompt: textBody || 'Give me my compliance & tender status.',
      clientSpendUsd: settings.openRouterUsedUsd,
      contextSnippets: [
        `Compliance Ready: ${compliance.isBidReady}. Blocking Alerts: ${compliance.blockingAlerts.join('; ') || 'None'}`,
        `Top Tender: ${topTender?.tenderNumber} (${topTender?.municipality}, closes ${topTender?.closingDate.slice(0, 10)})`,
        approvalRecordId
          ? `Approval Shield record ${approvalRecordId} created — sign off at /bid/${topTender?.id ?? 'ET-2026-WC-0842'}`
          : '',
      ].filter(Boolean),
    });

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    let dispatchedToMeta = false;
    if (phoneNumberId && accessToken && sender) {
      const metaRes = await fetch(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: sender,
            type: 'text',
            text: { body: aiReply.text },
          }),
        }
      );
      dispatchedToMeta = metaRes.ok;
    }

    return NextResponse.json({
      status: 'processed',
      sender,
      model: aiReply.model,
      reply: aiReply.text,
      approvalShieldTriggered: Boolean(approvalRecordId),
      approvalRecordId,
      dispatchedToMeta,
    });
  } catch (error) {
    console.error('[WhatsApp Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal webhook error' },
      { status: 500 }
    );
  }
}
