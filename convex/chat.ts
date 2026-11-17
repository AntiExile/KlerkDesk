import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  action,
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import {
  assertRecordOwnership,
  getCurrentYearMonth,
  PLAN_MONTHLY_CAP_USD,
  requireUserId,
} from './authHelpers';

const SourceCitationValidator = v.object({
  sourceTitle: v.optional(v.string()),
  filePath: v.string(),
  textSnippet: v.string(),
  pageNumber: v.optional(v.number()),
  score: v.optional(v.number()),
});

export const listMessages = query({
  args: {
    bidId: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.bidId) {
      const rows = await ctx.db
        .query('messages')
        .withIndex('by_userId_bidId', (q) =>
          q.eq('userId', userId).eq('bidId', args.bidId!)
        )
        .order('desc')
        .take(100);
      return rows.reverse();
    }
    if (args.threadId) {
      const rows = await ctx.db
        .query('messages')
        .withIndex('by_userId_threadId', (q) =>
          q.eq('userId', userId).eq('threadId', args.threadId!)
        )
        .order('desc')
        .take(100);
      return rows.reverse();
    }
    const rows = await ctx.db
      .query('messages')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .take(100);
    return rows.reverse();
  },
});

export const appendMessage = mutation({
  args: {
    bidId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    contentType: v.union(
      v.literal('text'),
      v.literal('code'),
      v.literal('table'),
      v.literal('markdown')
    ),
    modelUsed: v.optional(v.string()),
    approvalId: v.optional(v.string()),
    sources: v.optional(v.array(SourceCitationValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert('messages', {
      userId,
      threadId: args.threadId ?? args.bidId,
      bidId: args.bidId,
      role: args.role,
      content: args.content,
      contentType: args.contentType,
      modelUsed: args.modelUsed,
      approvalId: args.approvalId,
      sources: args.sources,
      createdAt: new Date().toISOString(),
    });
  },
});

export const appendMessageInternal = internalMutation({
  args: {
    userId: v.id('users'),
    bidId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    contentType: v.union(
      v.literal('text'),
      v.literal('code'),
      v.literal('table'),
      v.literal('markdown')
    ),
    modelUsed: v.optional(v.string()),
    approvalId: v.optional(v.string()),
    sources: v.optional(v.array(SourceCitationValidator)),
  },
  handler: async (ctx, args) => {
    const { userId, ...rest } = args;
    return await ctx.db.insert('messages', {
      userId,
      threadId: rest.threadId ?? rest.bidId,
      bidId: rest.bidId,
      role: rest.role,
      content: rest.content,
      contentType: rest.contentType,
      modelUsed: rest.modelUsed,
      approvalId: rest.approvalId,
      sources: rest.sources,
      createdAt: new Date().toISOString(),
    });
  },
});

export const insertTenderChunks = mutation({
  args: {
    tenderId: v.string(),
    chunks: v.array(
      v.object({
        sourceTitle: v.string(),
        filePath: v.string(),
        pageNumber: v.number(),
        text: v.string(),
        fileType: v.string(),
        storageId: v.optional(v.id('_storage')),
        embedding: v.array(v.float64()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.chunks.length === 0) return 0;

    const firstFilePath = args.chunks[0].filePath;
    const existing = await ctx.db
      .query('tenderChunks')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.tenderId)
      )
      .take(400);

    for (const row of existing) {
      if (row.filePath === firstFilePath) {
        assertRecordOwnership(row.userId, userId, 'tender chunk');
        await ctx.db.delete(row._id);
      }
    }

    let inserted = 0;
    for (const chunk of args.chunks) {
      if (chunk.embedding.length !== 1536) {
        throw new Error(
          `Expected 1536-dim embedding for tenderChunks, got ${chunk.embedding.length}`
        );
      }
      await ctx.db.insert('tenderChunks', {
        userId,
        tenderId: args.tenderId,
        sourceTitle: chunk.sourceTitle,
        filePath: chunk.filePath,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        textSnippet: chunk.text.slice(0, 320),
        fileType: chunk.fileType,
        storageId: chunk.storageId,
        embedding: chunk.embedding,
      });
      inserted += 1;
    }

    return inserted;
  },
});

export const hydrateTenderChunksInternal = internalQuery({
  args: {
    ids: v.array(v.id('tenderChunks')),
    userId: v.id('users'),
    tenderId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hydrated: Array<{
      id: string;
      sourceTitle: string;
      filePath: string;
      pageNumber: number;
      text: string;
      textSnippet: string;
      fileType: string;
      tenderId: string;
    }> = [];

    for (const id of args.ids) {
      const doc = await ctx.db.get('tenderChunks', id);
      if (!doc || doc.userId !== args.userId) continue;
      if (args.tenderId && doc.tenderId !== args.tenderId) continue;

      const textBody = doc.text ?? doc.textSnippet ?? '';
      hydrated.push({
        id: String(doc._id),
        sourceTitle: doc.sourceTitle,
        filePath: doc.filePath,
        pageNumber: doc.pageNumber ?? 1,
        text: textBody,
        textSnippet: doc.textSnippet ?? textBody.slice(0, 320),
        fileType: doc.fileType,
        tenderId: doc.tenderId,
      });
    }

    return hydrated;
  },
});

export const searchTenderChunks = action({
  args: {
    tenderId: v.optional(v.string()),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.embedding.length !== 1536) {
      return [];
    }

    const hits = await ctx.vectorSearch('tenderChunks', 'by_embedding', {
      vector: args.embedding,
      limit: Math.min(24, Math.max(8, (args.limit ?? 6) * 3)),
      filter: (q) => q.eq('userId', userId),
    });

    if (hits.length === 0) return [];

    const scoreById = new Map<string, number>();
    for (const hit of hits) {
      scoreById.set(String(hit._id), hit._score);
    }

    const hydrated: Array<{
      id: string;
      sourceTitle: string;
      filePath: string;
      pageNumber: number;
      text: string;
      textSnippet: string;
      fileType: string;
      tenderId: string;
    }> = await ctx.runQuery(internal.chat.hydrateTenderChunksInternal, {
      ids: hits.map((h) => h._id),
      userId,
      tenderId: args.tenderId,
    });

    const ranked = hydrated
      .map((item) => ({
        ...item,
        score: scoreById.get(item.id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    return ranked.slice(0, args.limit ?? 6);
  },
});

export const recordUsageLedger = mutation({
  args: {
    month: v.optional(v.string()),
    model: v.string(),
    task: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const month = args.month ?? getCurrentYearMonth();
    return await ctx.db.insert('usageLedger', {
      userId,
      month,
      model: args.model,
      task: args.task,
      promptTokens: Math.max(0, Math.round(args.promptTokens)),
      completionTokens: Math.max(0, Math.round(args.completionTokens)),
      costUsd: Math.max(0, Math.round(args.costUsd * 1_000_000) / 1_000_000),
      createdAt: new Date().toISOString(),
    });
  },
});

export const recordUsageLedgerInternal = internalMutation({
  args: {
    userId: v.id('users'),
    month: v.optional(v.string()),
    model: v.string(),
    task: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const month = args.month ?? getCurrentYearMonth();
    return await ctx.db.insert('usageLedger', {
      userId: args.userId,
      month,
      model: args.model,
      task: args.task,
      promptTokens: Math.max(0, Math.round(args.promptTokens)),
      completionTokens: Math.max(0, Math.round(args.completionTokens)),
      costUsd: Math.max(0, Math.round(args.costUsd * 1_000_000) / 1_000_000),
      createdAt: new Date().toISOString(),
    });
  },
});

export const getMonthlyUsageSummary = query({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const month = args.month ?? getCurrentYearMonth();

    const [entries, profile] = await Promise.all([
      ctx.db
        .query('usageLedger')
        .withIndex('by_userId_month', (q) =>
          q.eq('userId', userId).eq('month', month)
        )
        .take(1000),
      ctx.db
        .query('contractorProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .first(),
    ]);

    const planTier = profile?.planTier ?? 'starter';
    const capUsd = PLAN_MONTHLY_CAP_USD[planTier];
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;

    for (const entry of entries) {
      promptTokens += entry.promptTokens;
      completionTokens += entry.completionTokens;
      costUsd += entry.costUsd;
    }

    return {
      month,
      promptTokens,
      completionTokens,
      costUsd: Math.round(costUsd * 10000) / 10000,
      capUsd,
      planTier,
    };
  },
});

export const getWhatsappUserWorkspaceInternal = internalQuery({
  args: { userId: v.id('users'), month: v.string() },
  handler: async (ctx, args) => {
    const [docs, tenders, approvals, usageRows, profile] = await Promise.all([
      ctx.db
        .query('complianceDocs')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .take(50),
      ctx.db
        .query('tenderMatches')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .take(50),
      ctx.db
        .query('pendingApprovals')
        .withIndex('by_userId_status', (q) =>
          q.eq('userId', args.userId).eq('status', 'pending_approval')
        )
        .take(20),
      ctx.db
        .query('usageLedger')
        .withIndex('by_userId_month', (q) =>
          q.eq('userId', args.userId).eq('month', args.month)
        )
        .take(500),
      ctx.db
        .query('contractorProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .first(),
    ]);

    let costUsd = 0;
    for (const row of usageRows) costUsd += row.costUsd;

    return {
      docs,
      tenders,
      approvals,
      costUsd,
      planTier: profile?.planTier ?? 'starter',
      companyName: profile?.companyName ?? '',
    };
  },
});

interface WhatsappWorkspaceSnapshot {
  docs: Array<{
    docType: string;
    shortLabel: string;
    status: string;
    alertReason?: string | null;
  }>;
  tenders: Array<{
    tenderId: string;
    tenderNumber: string;
    municipality: string;
    closingDate: string;
    estimatedValueZar: number;
    portalUrl: string;
    submissionChannel?: string;
    complianceReady: boolean;
    complianceBlocks: string[];
  }>;
  approvals: Array<{ approvalId: string; status: string }>;
  costUsd: number;
  planTier: 'starter' | 'pro' | 'ops';
  companyName: string;
}

type ResolveWhatsappResult =
  | {
      linked: false;
      onboardingUrl: string;
    }
  | {
      linked: true;
      userId: Id<'users'>;
      companyName: string;
      whatsappPhone: string;
      targetBidId: string;
      targetTenderNumber: string;
      approvalRecordId: string | null;
      docs: WhatsappWorkspaceSnapshot['docs'];
      topTender: WhatsappWorkspaceSnapshot['tenders'][number] | null;
      costUsd: number;
      capUsd: number;
    };

export const resolveWhatsappSenderAction = action({
  args: {
    internalSecret: v.string(),
    senderPhone: v.string(),
    inboundContent: v.string(),
    buttonBidId: v.optional(v.string()),
    buttonAction: v.optional(v.union(v.literal('approve'), v.literal('skip'))),
  },
  handler: async (ctx, args): Promise<ResolveWhatsappResult> => {
    const expectedSecret =
      env.KLERK_INTERNAL_SECRET ?? env.WHATSAPP_APP_SECRET ?? '';
    if (expectedSecret && args.internalSecret !== expectedSecret) {
      throw new Error('Unauthorized internal webhook dispatch');
    }

    const matchedUser: {
      userId: Id<'users'>;
      companyName: string;
      whatsappPhone: string;
      cidbGrade: string;
      planTier: 'starter' | 'pro' | 'ops';
    } | null = await ctx.runQuery(
      internal.users.findUserByWhatsappPhoneInternal,
      { whatsappPhone: args.senderPhone }
    );

    if (!matchedUser) {
      return {
        linked: false,
        onboardingUrl: 'https://klerkdesk.mundusmk.co.za/onboarding',
      };
    }

    const month = getCurrentYearMonth();
    const workspace: WhatsappWorkspaceSnapshot = await ctx.runQuery(
      internal.chat.getWhatsappUserWorkspaceInternal,
      { userId: matchedUser.userId, month }
    );

    const tenders = workspace.tenders;
    const requestedBid = args.buttonBidId
      ? tenders.find(
          (t: { tenderId: string }) =>
            t.tenderId.toLowerCase() === args.buttonBidId!.toLowerCase()
        ) ?? tenders[0]
      : tenders[0];

    const targetBidId = requestedBid?.tenderId ?? args.buttonBidId ?? 'general';
    const targetTenderNumber =
      requestedBid?.tenderNumber ?? args.buttonBidId ?? 'Unassigned Tender';

    let approvalRecordId: string | null = null;
    if (args.buttonAction === 'approve' && requestedBid) {
      approvalRecordId = `apr-wa-${Date.now().toString(36)}`;
      const est = requestedBid.estimatedValueZar || 0;
      await ctx.runMutation(internal.bid.createSystemPendingApprovalInternal, {
        userId: matchedUser.userId,
        approvalId: approvalRecordId,
        bidId: requestedBid.tenderId,
        tenderNumber: requestedBid.tenderNumber,
        actionType: 'submit_etenders',
        totalBidZar: est,
        vatZar: Math.round(est * 0.15 * 100) / 100,
        grandTotalZar: Math.round(est * 1.15 * 100) / 100,
        targetResource: requestedBid.portalUrl,
        commandPreview: `whatsapp.interactive("approve_${requestedBid.tenderId}") // paused in pending_approval — approve at /bid/${requestedBid.tenderId}`,
        complianceVerified: requestedBid.complianceReady,
        complianceWarnings: requestedBid.complianceBlocks,
        requestedBy: `WhatsApp (${matchedUser.whatsappPhone})`,
        submissionChannel: requestedBid.submissionChannel,
      });
    }

    await ctx.runMutation(internal.chat.appendMessageInternal, {
      userId: matchedUser.userId,
      bidId: targetBidId,
      role: 'user',
      content: `[WhatsApp ${matchedUser.whatsappPhone}] ${args.inboundContent}`,
      contentType: 'text',
      approvalId: approvalRecordId ?? undefined,
    });

    return {
      linked: true as const,
      userId: matchedUser.userId,
      companyName: matchedUser.companyName || workspace.companyName,
      whatsappPhone: matchedUser.whatsappPhone,
      targetBidId,
      targetTenderNumber,
      approvalRecordId,
      docs: workspace.docs,
      topTender: requestedBid ?? null,
      costUsd: workspace.costUsd,
      capUsd: PLAN_MONTHLY_CAP_USD[workspace.planTier as 'starter' | 'pro' | 'ops'],
    };
  },
});

export const persistWhatsappReplyAction = action({
  args: {
    internalSecret: v.string(),
    userId: v.id('users'),
    bidId: v.string(),
    replyText: v.string(),
    modelUsed: v.string(),
    approvalId: v.optional(v.string()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expectedSecret =
      env.KLERK_INTERNAL_SECRET ?? env.WHATSAPP_APP_SECRET ?? '';
    if (expectedSecret && args.internalSecret !== expectedSecret) {
      throw new Error('Unauthorized internal webhook dispatch');
    }

    await ctx.runMutation(internal.chat.appendMessageInternal, {
      userId: args.userId,
      bidId: args.bidId,
      role: 'assistant',
      content: args.replyText,
      contentType: 'markdown',
      modelUsed: args.modelUsed,
      approvalId: args.approvalId,
    });

    if (
      (args.promptTokens ?? 0) > 0 ||
      (args.completionTokens ?? 0) > 0 ||
      (args.costUsd ?? 0) > 0
    ) {
      await ctx.runMutation(internal.chat.recordUsageLedgerInternal, {
        userId: args.userId,
        model: args.modelUsed,
        task: 'whatsapp_qa',
        promptTokens: args.promptTokens ?? 0,
        completionTokens: args.completionTokens ?? 0,
        costUsd: args.costUsd ?? 0,
      });
    }
    return true;
  },
});
