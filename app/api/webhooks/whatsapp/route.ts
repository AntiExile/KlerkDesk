import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runTenderAI } from '@/lib/openrouter';
import {
  appendConvexMessage,
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
                        interactive: z
                          .object({
                            type: z.string().optional(),
                            button_reply: z
                              .object({
                                id: z.string(),
                                title: z.string().optional(),
                              })
                              .optional(),
                            list_reply: z
                              .object({
                                id: z.string(),
                                title: z.string().optional(),
                              })
                              .optional(),
                          })
                          .optional(),
                        button: z
                          .object({
                            payload: z.string().optional(),
                            text: z.string().optional(),
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
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
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
    const interactiveReplyId =
      inbound.interactive?.button_reply?.id?.trim() ??
      inbound.interactive?.list_reply?.id?.trim() ??
      inbound.button?.payload?.trim() ??
      '';
    const interactiveReplyTitle =
      inbound.interactive?.button_reply?.title?.trim() ??
      inbound.interactive?.list_reply?.title?.trim() ??
      inbound.button?.text?.trim() ??
      '';
    const inboundContent = interactiveReplyId
      ? `${interactiveReplyTitle || interactiveReplyId} (${interactiveReplyId})`
      : textBody;
    const sender = inbound.from;

    const [compliance, tenders, settings] = await Promise.all([
      getComplianceSummary(),
      getTenderMatches(),
      getContractorSettings(),
    ]);

    const topTender = tenders[0];
    const buttonCandidate = (interactiveReplyId || textBody).trim();
    const buttonMatch = /^(approve|skip)_([A-Za-z0-9-]+)$/i.exec(buttonCandidate);

    let approvalRecordId: string | null = null;
    let targetBidId = topTender?.id ?? 'ET-2026-WC-0842';
    let interactiveAction: string | null = null;
    let replyText = '';
    let replyModel = 'approval-shield';

    if (buttonMatch) {
      const action = buttonMatch[1].toLowerCase() as 'approve' | 'skip';
      const requestedBidId = buttonMatch[2];
      const matchedTender =
        tenders.find(
          (t) => t.id.toLowerCase() === requestedBidId.toLowerCase()
        ) ?? topTender;
      targetBidId = matchedTender?.id ?? requestedBidId;
      interactiveAction = `${action}_${targetBidId}`;

      if (action === 'approve') {
        const estimatedZar = matchedTender?.estimatedValueZar ?? 14_850_000;
        const approval = await createPendingApproval({
          bidId: targetBidId,
          tenderNumber: matchedTender?.tenderNumber ?? targetBidId,
          actionType: 'submit_etenders',
          totalBidZar: estimatedZar,
          vatZar: estimatedZar * 0.15,
          grandTotalZar: estimatedZar * 1.15,
          targetResource: `WhatsApp interactive reply from ${sender}`,
          commandPreview: `whatsapp.interactive("${interactiveAction}") // staged in pending_approval — awaiting human sign-off on /bid/${targetBidId}`,
          requestedBy: `WhatsApp (${sender})`,
        });
        approvalRecordId = approval.id;

        const complianceNote = compliance.isBidReady
          ? 'Compliance Vault verified.'
          : `Compliance Alerts (${compliance.blockingAlerts.length}): ${compliance.blockingAlerts.join('; ')}`;

        replyText = `Staged ${matchedTender?.tenderNumber ?? targetBidId} in Approval Shield (${approval.id}). No bid is auto-submitted via WhatsApp — complete final confirmation at /bid/${targetBidId}. ${complianceNote}`;
      } else {
        replyText = `Skipped ${matchedTender?.tenderNumber ?? targetBidId} (${targetBidId}). No submission was staged or sent.`;
      }
    } else {
      const normalized = textBody.toLowerCase();
      if (
        normalized.includes('submit') ||
        normalized.includes('broadcast') ||
        normalized.includes('send')
      ) {
        const approval = await createPendingApproval({
          bidId: targetBidId,
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
        prompt: inboundContent || 'Give me my compliance & tender status.',
        clientSpendUsd: settings.openRouterUsedUsd,
        contextSnippets: [
          `Compliance Ready: ${compliance.isBidReady}. Blocking Alerts: ${compliance.blockingAlerts.join('; ') || 'None'}`,
          `Top Tender: ${topTender?.tenderNumber} (${topTender?.municipality}, closes ${topTender?.closingDate.slice(0, 10)})`,
          approvalRecordId
            ? `Approval Shield record ${approvalRecordId} created — sign off at /bid/${targetBidId}`
            : '',
        ].filter(Boolean),
      });

      replyText = aiReply.text;
      replyModel = aiReply.model;
    }

    await appendConvexMessage({
      bidId: targetBidId,
      role: 'user',
      content: `[WhatsApp ${sender}] ${inboundContent || '(empty)'}`,
      contentType: 'text',
      approvalId: approvalRecordId ?? undefined,
    });

    await appendConvexMessage({
      bidId: targetBidId,
      role: 'assistant',
      content: replyText,
      contentType: 'markdown',
      modelUsed: replyModel,
      approvalId: approvalRecordId ?? undefined,
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
            text: { body: replyText },
          }),
        }
      );
      dispatchedToMeta = metaRes.ok;
    }

    return NextResponse.json({
      status: 'processed',
      sender,
      bidId: targetBidId,
      interactiveAction,
      model: replyModel,
      reply: replyText,
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
