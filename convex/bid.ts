import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import {
  assertRecordOwnership,
  requireUserId,
} from './authHelpers';

const ApprovalActionTypeValidator = v.union(
  v.literal('submit_etenders'),
  v.literal('send_external_email'),
  v.literal('whatsapp_broadcast')
);

export const getBidWorkspace = query({
  args: { bidId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const [tender, boqItems, docs, rawApprovals, messages] = await Promise.all([
      ctx.db
        .query('tenderMatches')
        .withIndex('by_userId_tenderId', (q) =>
          q.eq('userId', userId).eq('tenderId', args.bidId)
        )
        .first(),
      ctx.db
        .query('boqItems')
        .withIndex('by_userId_tenderId', (q) =>
          q.eq('userId', userId).eq('tenderId', args.bidId)
        )
        .take(200),
      ctx.db
        .query('complianceDocs')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(50),
      ctx.db
        .query('pendingApprovals')
        .withIndex('by_userId_bidId', (q) =>
          q.eq('userId', userId).eq('bidId', args.bidId)
        )
        .take(50),
      ctx.db
        .query('messages')
        .withIndex('by_userId_bidId', (q) =>
          q.eq('userId', userId).eq('bidId', args.bidId)
        )
        .take(100),
    ]);

    const approvals = await Promise.all(
      rawApprovals.map(async (apr) => {
        let mergedPackUrl = apr.mergedPackUrl ?? null;
        if (!mergedPackUrl && apr.mergedPackStorageId) {
          mergedPackUrl = await ctx.storage
            .getUrl(apr.mergedPackStorageId)
            .catch(() => null);
        }
        return {
          ...apr,
          mergedPackUrl: mergedPackUrl ?? undefined,
        };
      })
    );

    return { tender, boqItems, docs, approvals, messages };
  },
});

export const getApprovalById = query({
  args: { approvalId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const approval = await ctx.db
      .query('pendingApprovals')
      .withIndex('by_approvalId', (q) => q.eq('approvalId', args.approvalId))
      .first();

    if (!approval) return null;
    assertRecordOwnership(approval.userId, userId, 'approval');

    let mergedPackUrl = approval.mergedPackUrl ?? null;
    if (!mergedPackUrl && approval.mergedPackStorageId) {
      mergedPackUrl = await ctx.storage
        .getUrl(approval.mergedPackStorageId)
        .catch(() => null);
    }

    return {
      ...approval,
      mergedPackUrl: mergedPackUrl ?? undefined,
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveBoqItems = mutation({
  args: {
    tenderId: v.string(),
    items: v.array(
      v.object({
        itemId: v.string(),
        itemCode: v.string(),
        section: v.string(),
        description: v.string(),
        unit: v.string(),
        quantity: v.number(),
        rateZar: v.number(),
        amountZar: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const tender = await ctx.db
      .query('tenderMatches')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.tenderId)
      )
      .first();
    if (tender) {
      assertRecordOwnership(tender.userId, userId, 'tender match');
    }

    const existing = await ctx.db
      .query('boqItems')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.tenderId)
      )
      .take(200);

    for (const row of existing) {
      assertRecordOwnership(row.userId, userId, 'BoQ item');
      await ctx.db.delete(row._id);
    }

    for (const item of args.items) {
      await ctx.db.insert('boqItems', {
        userId,
        tenderId: args.tenderId,
        ...item,
        amountZar: Math.round(item.quantity * item.rateZar * 100) / 100,
      });
    }
    return args.items.length;
  },
});

export const saveStampedSbdPackage = mutation({
  args: {
    tenderId: v.string(),
    fileName: v.string(),
    base64Pdf: v.string(),
    pageCount: v.number(),
    stampingMethod: v.string(),
    storageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const tender = await ctx.db
      .query('tenderMatches')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.tenderId)
      )
      .first();

    if (!tender) {
      throw new Error(`Tender ${args.tenderId} not found for user`);
    }
    assertRecordOwnership(tender.userId, userId, 'tender match');

    await ctx.db.patch(tender._id, {
      stampedSbdFileName: args.fileName,
      stampedSbdBase64: args.base64Pdf,
      stampedSbdPageCount: args.pageCount,
      stampedSbdMethod: args.stampingMethod,
      stampedSbdStorageId: args.storageId ?? tender.stampedSbdStorageId,
      updatedAt: new Date().toISOString(),
    });
    return tender._id;
  },
});

export const attachTenderReturnablePdfs = mutation({
  args: {
    tenderId: v.string(),
    storageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const tender = await ctx.db
      .query('tenderMatches')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.tenderId)
      )
      .first();
    if (!tender) {
      throw new Error(`Tender ${args.tenderId} not found`);
    }
    assertRecordOwnership(tender.userId, userId, 'tender match');
    await ctx.db.patch(tender._id, {
      returnablePdfStorageIds: args.storageIds,
      updatedAt: new Date().toISOString(),
    });
    return tender._id;
  },
});

export const triggerApprovalShield = mutation({
  args: {
    approvalId: v.string(),
    bidId: v.string(),
    tenderNumber: v.string(),
    actionType: ApprovalActionTypeValidator,
    totalBidZar: v.number(),
    vatZar: v.number(),
    grandTotalZar: v.number(),
    targetResource: v.string(),
    commandPreview: v.string(),
    complianceVerified: v.boolean(),
    complianceWarnings: v.array(v.string()),
    requestedBy: v.string(),
    submissionChannel: v.optional(v.string()),
    boatSessionId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const tender = await ctx.db
      .query('tenderMatches')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.bidId)
      )
      .first();
    if (tender) {
      assertRecordOwnership(tender.userId, userId, 'tender match');
    }

    const id = await ctx.db.insert('pendingApprovals', {
      userId,
      approvalId: args.approvalId,
      bidId: args.bidId,
      tenderNumber: args.tenderNumber,
      actionType: args.actionType,
      status: 'pending_approval',
      totalBidZar: args.totalBidZar,
      vatZar: args.vatZar,
      grandTotalZar: args.grandTotalZar,
      targetResource: args.targetResource,
      commandPreview: args.commandPreview,
      complianceVerified: args.complianceVerified,
      complianceWarnings: args.complianceWarnings,
      requestedBy: args.requestedBy,
      requestedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      boatSessionId: args.boatSessionId ?? null,
      submissionChannel:
        args.submissionChannel ??
        tender?.submissionChannel ??
        'etenders_esubmission',
    });

    if (tender) {
      await ctx.db.patch(tender._id, { status: 'pending_approval' });
    }

    return id;
  },
});

export const resolveApprovalShield = mutation({
  args: {
    approvalId: v.string(),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    operatorName: v.optional(v.string()),
    mergedPackStorageId: v.optional(v.id('_storage')),
    submissionChannel: v.optional(v.string()),
    whatsappDispatched: v.optional(v.boolean()),
    boatSessionId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const approval = await ctx.db
      .query('pendingApprovals')
      .withIndex('by_approvalId', (q) => q.eq('approvalId', args.approvalId))
      .first();

    if (!approval) return null;
    assertRecordOwnership(approval.userId, userId, 'pending approval');

    let mergedPackUrl: string | undefined = approval.mergedPackUrl;
    if (args.mergedPackStorageId) {
      const storageMeta = await ctx.db.system.get(
        '_storage',
        args.mergedPackStorageId
      );
      if (!storageMeta) {
        throw new Error('Merged submission pack not found in Convex Storage');
      }
      const signedUrl = await ctx.storage.getUrl(args.mergedPackStorageId);
      if (signedUrl) {
        mergedPackUrl = signedUrl;
      }
    }

    const nextStatus = args.decision === 'approved' ? 'executed' : 'rejected';
    const approvedBy = args.operatorName ?? 'Authenticated Director';
    const approvedAt = new Date().toISOString();

    await ctx.db.patch(approval._id, {
      status: nextStatus,
      approvedBy,
      approvedAt,
      mergedPackStorageId:
        args.mergedPackStorageId ?? approval.mergedPackStorageId,
      mergedPackUrl,
      submissionChannel:
        args.submissionChannel ??
        approval.submissionChannel ??
        'etenders_esubmission',
      whatsappDispatched:
        args.whatsappDispatched ?? approval.whatsappDispatched ?? false,
      boatSessionId:
        args.boatSessionId !== undefined
          ? args.boatSessionId
          : approval.boatSessionId,
    });

    if (args.decision === 'approved') {
      const tender = await ctx.db
        .query('tenderMatches')
        .withIndex('by_userId_tenderId', (q) =>
          q.eq('userId', userId).eq('tenderId', approval.bidId)
        )
        .first();
      if (tender) {
        assertRecordOwnership(tender.userId, userId, 'tender match');
        await ctx.db.patch(tender._id, { status: 'submitted' });
      }
    }

    const updated = await ctx.db.get('pendingApprovals', approval._id);
    return updated
      ? {
          ...updated,
          mergedPackUrl,
        }
      : null;
  },
});

export const createSystemPendingApprovalInternal = internalMutation({
  args: {
    userId: v.id('users'),
    approvalId: v.string(),
    bidId: v.string(),
    tenderNumber: v.string(),
    actionType: ApprovalActionTypeValidator,
    totalBidZar: v.number(),
    vatZar: v.number(),
    grandTotalZar: v.number(),
    targetResource: v.string(),
    commandPreview: v.string(),
    complianceVerified: v.boolean(),
    complianceWarnings: v.array(v.string()),
    requestedBy: v.string(),
    submissionChannel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ...rest } = args;
    const id = await ctx.db.insert('pendingApprovals', {
      userId,
      ...rest,
      status: 'pending_approval',
      requestedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
    });

    const tender = await ctx.db
      .query('tenderMatches')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.bidId)
      )
      .first();
    if (tender) {
      await ctx.db.patch(tender._id, { status: 'pending_approval' });
    }
    return id;
  },
});
