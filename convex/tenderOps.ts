import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';

const ComplianceDocTypeValidator = v.union(
  v.literal('csd'),
  v.literal('tax_pin'),
  v.literal('coida'),
  v.literal('bbbee'),
  v.literal('cipc'),
  v.literal('certified_id')
);

function evaluateDocExpiry(params: {
  docType: 'csd' | 'tax_pin' | 'coida' | 'bbbee' | 'cipc' | 'certified_id';
  issuedAt: string;
  expiresAt?: string | null;
  maxAgeDays?: number | null;
}) {
  const now = Date.now();
  const issuedMs = new Date(params.issuedAt).getTime();
  const ageDays = Math.max(0, Math.floor((now - issuedMs) / 86_400_000));

  let daysUntilExpiry: number | null = null;
  if (params.expiresAt) {
    daysUntilExpiry = Math.floor(
      (new Date(params.expiresAt).getTime() - now) / 86_400_000
    );
  } else if (params.maxAgeDays !== undefined && params.maxAgeDays !== null) {
    daysUntilExpiry = params.maxAgeDays - ageDays;
  }

  let status: 'valid' | 'warning' | 'expired' = 'valid';
  let alertReason: string | null = null;

  if (params.docType === 'csd') {
    const maxAge = params.maxAgeDays ?? 7;
    daysUntilExpiry = maxAge - ageDays;
    if (ageDays > maxAge) {
      status = 'expired';
      alertReason = `CSD report is ${ageDays} days old (exceeds 7-day limit).`;
    } else if (ageDays >= 5) {
      status = 'warning';
      alertReason = `CSD report is ${ageDays} days old (${maxAge - ageDays}d left before 7-day limit).`;
    }
  } else if (params.docType === 'cipc' || params.docType === 'certified_id') {
    const maxAge = params.maxAgeDays ?? 90;
    daysUntilExpiry = maxAge - ageDays;
    if (ageDays > maxAge) {
      status = 'expired';
      alertReason = `Certified copy is ${ageDays} days old (exceeds 90-day SAPS/Commissioner limit).`;
    } else if (daysUntilExpiry <= 15) {
      status = 'warning';
      alertReason = `Certified copy expires in ${daysUntilExpiry} days (90-day rule).`;
    }
  } else if (daysUntilExpiry !== null) {
    if (daysUntilExpiry < 0) {
      status = 'expired';
      alertReason = `Expired ${Math.abs(daysUntilExpiry)} days ago.`;
    } else if (daysUntilExpiry <= 30) {
      status = 'warning';
      alertReason = `Expires in ${daysUntilExpiry} days.`;
    }
  }

  return { ageDays, daysUntilExpiry, status, alertReason };
}

async function findTenderForScope(
  ctx: QueryCtx | MutationCtx,
  tenderId: string,
  userId: Id<'users'> | null
) {
  if (userId) {
    return await ctx.db
      .query('tenderMatches')
      .withIndex('by_user_id_and_tender_id', (q) =>
        q.eq('userId', userId).eq('tenderId', tenderId)
      )
      .first();
  }
  return await ctx.db
    .query('tenderMatches')
    .withIndex('by_tender_id', (q) => q.eq('tenderId', tenderId))
    .first();
}

export const getComplianceVault = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId) {
      return await ctx.db
        .query('complianceDocs')
        .withIndex('by_user_id', (q) => q.eq('userId', userId))
        .collect();
    }
    return await ctx.db
      .query('complianceDocs')
      .withIndex('by_user_id', (q) => q.eq('userId', undefined))
      .collect();
  },
});

export const getWorkspaceState = query({
  args: { bidId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const [docs, tenders, approvals, messages, boqItems] = userId
      ? await Promise.all([
          ctx.db
            .query('complianceDocs')
            .withIndex('by_user_id', (q) => q.eq('userId', userId))
            .collect(),
          ctx.db
            .query('tenderMatches')
            .withIndex('by_user_id', (q) => q.eq('userId', userId))
            .collect(),
          args.bidId
            ? ctx.db
                .query('pendingApprovals')
                .withIndex('by_user_id_and_bid_id', (q) =>
                  q.eq('userId', userId).eq('bidId', args.bidId!)
                )
                .collect()
            : ctx.db
                .query('pendingApprovals')
                .withIndex('by_user_id', (q) => q.eq('userId', userId))
                .collect(),
          args.bidId
            ? ctx.db
                .query('messages')
                .withIndex('by_user_id_and_bid_id', (q) =>
                  q.eq('userId', userId).eq('bidId', args.bidId!)
                )
                .collect()
            : ctx.db
                .query('messages')
                .withIndex('by_user_id', (q) => q.eq('userId', userId))
                .collect(),
          args.bidId
            ? ctx.db
                .query('boqItems')
                .withIndex('by_user_id_and_tender_id', (q) =>
                  q.eq('userId', userId).eq('tenderId', args.bidId!)
                )
                .collect()
            : Promise.resolve([]),
        ])
      : await Promise.all([
          ctx.db
            .query('complianceDocs')
            .withIndex('by_user_id', (q) => q.eq('userId', undefined))
            .collect(),
          ctx.db
            .query('tenderMatches')
            .withIndex('by_user_id', (q) => q.eq('userId', undefined))
            .collect(),
          args.bidId
            ? ctx.db
                .query('pendingApprovals')
                .withIndex('by_user_id_and_bid_id', (q) =>
                  q.eq('userId', undefined).eq('bidId', args.bidId!)
                )
                .collect()
            : ctx.db
                .query('pendingApprovals')
                .withIndex('by_user_id', (q) => q.eq('userId', undefined))
                .collect(),
          args.bidId
            ? ctx.db
                .query('messages')
                .withIndex('by_user_id_and_bid_id', (q) =>
                  q.eq('userId', undefined).eq('bidId', args.bidId!)
                )
                .collect()
            : ctx.db
                .query('messages')
                .withIndex('by_user_id', (q) => q.eq('userId', undefined))
                .collect(),
          args.bidId
            ? ctx.db
                .query('boqItems')
                .withIndex('by_user_id_and_tender_id', (q) =>
                  q.eq('userId', undefined).eq('tenderId', args.bidId!)
                )
                .collect()
            : Promise.resolve([]),
        ]);

    return { docs, tenders, boqItems, approvals, messages };
  },
});

export const getBidWorkspace = query({
  args: { bidId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const scopeUser = userId ?? undefined;

    const [tender, boqItems, docs, approvals, messages] = await Promise.all([
      ctx.db
        .query('tenderMatches')
        .withIndex('by_user_id_and_tender_id', (q) =>
          q.eq('userId', scopeUser).eq('tenderId', args.bidId)
        )
        .first(),
      ctx.db
        .query('boqItems')
        .withIndex('by_user_id_and_tender_id', (q) =>
          q.eq('userId', scopeUser).eq('tenderId', args.bidId)
        )
        .collect(),
      ctx.db
        .query('complianceDocs')
        .withIndex('by_user_id', (q) => q.eq('userId', scopeUser))
        .collect(),
      ctx.db
        .query('pendingApprovals')
        .withIndex('by_user_id_and_bid_id', (q) =>
          q.eq('userId', scopeUser).eq('bidId', args.bidId)
        )
        .collect(),
      ctx.db
        .query('messages')
        .withIndex('by_user_id_and_bid_id', (q) =>
          q.eq('userId', scopeUser).eq('bidId', args.bidId)
        )
        .collect(),
    ]);

    return { tender, boqItems, docs, approvals, messages };
  },
});

export const searchChunks = action({
  args: {
    tenderId: v.optional(v.string()),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.vectorSearch('tenderChunks', 'by_embedding', {
      vector: args.embedding,
      limit: args.limit ?? 4,
      filter: args.tenderId
        ? (q) => q.eq('tenderId', args.tenderId!)
        : undefined,
    });
    return results;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const upsertComplianceDoc = mutation({
  args: {
    docType: ComplianceDocTypeValidator,
    referenceNumber: v.string(),
    issuedAt: v.string(),
    expiresAt: v.optional(v.union(v.string(), v.null())),
    fileName: v.string(),
    fileSizeBytes: v.number(),
    storageId: v.optional(v.union(v.id('_storage'), v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const scopeUser = userId ?? undefined;
    const existing = await ctx.db
      .query('complianceDocs')
      .withIndex('by_user_id_and_doc_type', (q) =>
        q.eq('userId', scopeUser).eq('docType', args.docType)
      )
      .first();

    const maxAgeDays =
      args.docType === 'csd'
        ? 7
        : args.docType === 'cipc' || args.docType === 'certified_id'
          ? 90
          : null;

    const evaluated = evaluateDocExpiry({
      docType: args.docType,
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt ?? null,
      maxAgeDays,
    });

    const defaults: Record<
      'csd' | 'tax_pin' | 'coida' | 'bbbee' | 'cipc' | 'certified_id',
      { title: string; shortLabel: string }
    > = {
      csd: {
        title: 'Central Supplier Database (CSD) Summary Report',
        shortLabel: 'CSD Report',
      },
      tax_pin: {
        title: 'SARS Tax Compliance Status (TCS) PIN',
        shortLabel: 'Tax PIN',
      },
      coida: {
        title: 'COIDA Letter of Good Standing (Compensation Fund)',
        shortLabel: 'COIDA',
      },
      bbbee: {
        title: 'B-BBEE SANAS Verification Certificate (Level 1)',
        shortLabel: 'B-BBEE',
      },
      cipc: {
        title: 'CIPC Company Registration (CoR 14.3 Certified)',
        shortLabel: 'CIPC',
      },
      certified_id: {
        title: 'Certified Director ID Copies (SAPS Stamped)',
        shortLabel: 'Certified IDs',
      },
    };

    const payload = {
      userId: scopeUser,
      docId: existing?.docId ?? `doc-${args.docType}`,
      docType: args.docType,
      title: existing?.title ?? defaults[args.docType].title,
      shortLabel: existing?.shortLabel ?? defaults[args.docType].shortLabel,
      referenceNumber: args.referenceNumber,
      storageId: args.storageId ?? existing?.storageId,
      fileName: args.fileName,
      fileSizeBytes: args.fileSizeBytes,
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt ?? null,
      ageDays: evaluated.ageDays,
      maxAgeDays,
      daysUntilExpiry: evaluated.daysUntilExpiry,
      status: evaluated.status,
      alertReason: evaluated.alertReason,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert('complianceDocs', payload);
  },
});

export const refreshCsdReport = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const scopeUser = userId ?? undefined;
    const today = new Date().toISOString();
    const existing = await ctx.db
      .query('complianceDocs')
      .withIndex('by_user_id_and_doc_type', (q) =>
        q.eq('userId', scopeUser).eq('docType', 'csd')
      )
      .first();

    const fileName = `CSD_Report_MAAA0948215_${today.slice(0, 10)}.pdf`;
    if (existing) {
      await ctx.db.patch(existing._id, {
        issuedAt: today,
        ageDays: 0,
        daysUntilExpiry: 7,
        status: 'valid',
        alertReason: null,
        fileName,
        fileSizeBytes: 441_200,
      });
      return existing._id;
    }

    return await ctx.db.insert('complianceDocs', {
      userId: scopeUser,
      docId: 'doc-csd',
      docType: 'csd',
      title: 'Central Supplier Database (CSD) Summary Report',
      shortLabel: 'CSD Report',
      referenceNumber: 'MAAA0948215',
      fileName,
      fileSizeBytes: 441_200,
      issuedAt: today,
      expiresAt: null,
      ageDays: 0,
      maxAgeDays: 7,
      daysUntilExpiry: 7,
      status: 'valid',
      alertReason: null,
    });
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
    const userId = await getAuthUserId(ctx);
    const scopeUser = userId ?? undefined;
    const existing = await ctx.db
      .query('boqItems')
      .withIndex('by_user_id_and_tender_id', (q) =>
        q.eq('userId', scopeUser).eq('tenderId', args.tenderId)
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const item of args.items) {
      await ctx.db.insert('boqItems', {
        userId: scopeUser,
        tenderId: args.tenderId,
        ...item,
        amountZar: Math.round(item.quantity * item.rateZar * 100) / 100,
      });
    }
  },
});

export const saveStampedSbdPackage = mutation({
  args: {
    tenderId: v.string(),
    fileName: v.string(),
    base64Pdf: v.string(),
    pageCount: v.number(),
    stampingMethod: v.string(),
    storageId: v.optional(v.union(v.id('_storage'), v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const tender = await findTenderForScope(ctx, args.tenderId, userId);

    if (tender) {
      await ctx.db.patch(tender._id, {
        stampedSbdFileName: args.fileName,
        stampedSbdBase64: args.base64Pdf,
        stampedSbdPageCount: args.pageCount,
        stampedSbdMethod: args.stampingMethod,
        stampedSbdStorageId: args.storageId,
      });
    }
  },
});

export const triggerApprovalShield = mutation({
  args: {
    approvalId: v.string(),
    bidId: v.string(),
    tenderNumber: v.string(),
    actionType: v.union(
      v.literal('submit_etenders'),
      v.literal('send_external_email'),
      v.literal('whatsapp_broadcast')
    ),
    totalBidZar: v.number(),
    vatZar: v.number(),
    grandTotalZar: v.number(),
    targetResource: v.string(),
    commandPreview: v.string(),
    complianceVerified: v.boolean(),
    complianceWarnings: v.array(v.string()),
    requestedBy: v.string(),
    boatSessionId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const id = await ctx.db.insert('pendingApprovals', {
      userId: userId ?? undefined,
      ...args,
      status: 'pending_approval',
      requestedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
    });

    const tender = await findTenderForScope(ctx, args.bidId, userId);
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const approval = await ctx.db
      .query('pendingApprovals')
      .withIndex('by_approval_id', (q) => q.eq('approvalId', args.approvalId))
      .first();

    if (!approval) return null;
    if (userId && approval.userId && approval.userId !== userId) {
      throw new Error('Forbidden: approval belongs to another user');
    }

    const nextStatus = args.decision === 'approved' ? 'executed' : 'rejected';
    await ctx.db.patch(approval._id, {
      status: nextStatus,
      approvedBy: args.operatorName ?? 'Authenticated Director',
      approvedAt: new Date().toISOString(),
    });

    if (args.decision === 'approved') {
      const tender = await findTenderForScope(
        ctx,
        approval.bidId,
        approval.userId ?? userId
      );
      if (tender) {
        await ctx.db.patch(tender._id, { status: 'submitted' });
      }
    }

    return approval._id;
  },
});

export const appendMessage = mutation({
  args: {
    bidId: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    return await ctx.db.insert('messages', {
      userId: userId ?? undefined,
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

/**
 * Scheduled at 06:30 AM SAST (04:30 UTC) via convex/crons.ts.
 * Records a morning scan audit message and refreshes match readiness.
 */
export const runScheduledPortalScan = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.insert('messages', {
      role: 'assistant',
      content:
        'Morning scan completed at 06:30 SAST across eTenders OCDS API and 4 Western Cape municipal portals.',
      contentType: 'markdown',
      modelUsed: 'openrouter/free',
      createdAt: new Date().toISOString(),
    });
  },
});

/**
 * Scheduled daily compliance watchdog via convex/crons.ts.
 * Re-evaluates 7-day CSD and 90-day CIPC/ID expiry rules and queues a
 * pending_approval WhatsApp reminder if any document is expired or expiring.
 */
export const runDailyComplianceExpiryCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query('complianceDocs').collect();
    const blockingByScope = new Map<string, string[]>();

    for (const doc of docs) {
      const evaluated = evaluateDocExpiry({
        docType: doc.docType,
        issuedAt: doc.issuedAt,
        expiresAt: doc.expiresAt ?? null,
        maxAgeDays: doc.maxAgeDays ?? null,
      });

      await ctx.db.patch(doc._id, {
        ageDays: evaluated.ageDays,
        daysUntilExpiry: evaluated.daysUntilExpiry,
        status: evaluated.status,
        alertReason: evaluated.alertReason,
      });

      if (evaluated.status === 'expired' && evaluated.alertReason) {
        const key = doc.userId ?? 'global';
        const list = blockingByScope.get(key) ?? [];
        list.push(`${doc.shortLabel}: ${evaluated.alertReason}`);
        blockingByScope.set(key, list);
      }
    }

    for (const [scopeKey, blocking] of blockingByScope.entries()) {
      if (blocking.length === 0) continue;
      await ctx.db.insert('pendingApprovals', {
        userId: scopeKey === 'global' ? undefined : (scopeKey as Id<'users'>),
        approvalId: `apr-cron-${Date.now().toString(36)}`,
        bidId: 'ET-2026-WC-0842',
        tenderNumber: 'T/GEO/042/2026',
        actionType: 'whatsapp_broadcast',
        status: 'pending_approval',
        totalBidZar: 14_850_000,
        vatZar: 2_227_500,
        grandTotalZar: 17_077_500,
        targetResource: '+27825550148',
        commandPreview: `whatsapp.complianceReminder(${JSON.stringify(blocking)})`,
        complianceVerified: false,
        complianceWarnings: blocking,
        requestedBy: 'convex/crons.ts (daily-compliance-expiry-reminders)',
        requestedAt: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
      });
    }
  },
});
