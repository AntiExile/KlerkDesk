import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  query,
} from './_generated/server';
import {
  evaluateComplianceDocExpiry,
  getCurrentYearMonth,
  PLAN_MONTHLY_CAP_USD,
} from './authHelpers';

/**
 * Unified reactive workspace snapshot for `ConvexLiveBridge`.
 * Uses exact camelCase schema indexes (`by_userId`, `by_userId_bidId`, etc.).
 * Returns empty arrays when unauthenticated so public/login views stay clean.
 */
export const getWorkspaceState = query({
  args: { bidId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        docs: [],
        tenders: [],
        boqItems: [],
        approvals: [],
        messages: [],
        usageSummary: null,
        regulatoryRules: [],
      };
    }

    const month = getCurrentYearMonth();

    const [docs, tenders, rawApprovals, messages, boqItems, usageEntries, profile, regulatoryRules] =
      await Promise.all([
        ctx.db
          .query('complianceDocs')
          .withIndex('by_userId', (q) => q.eq('userId', userId))
          .take(50),
        ctx.db
          .query('tenderMatches')
          .withIndex('by_userId', (q) => q.eq('userId', userId))
          .take(100),
        args.bidId
          ? ctx.db
              .query('pendingApprovals')
              .withIndex('by_userId_bidId', (q) =>
                q.eq('userId', userId).eq('bidId', args.bidId!)
              )
              .take(50)
          : ctx.db
              .query('pendingApprovals')
              .withIndex('by_userId', (q) => q.eq('userId', userId))
              .take(50),
        args.bidId
          ? ctx.db
              .query('messages')
              .withIndex('by_userId_bidId', (q) =>
                q.eq('userId', userId).eq('bidId', args.bidId!)
              )
              .order('desc')
              .take(200)
          : ctx.db
              .query('messages')
              .withIndex('by_userId', (q) => q.eq('userId', userId))
              .order('desc')
              .take(200),
        args.bidId
          ? ctx.db
              .query('boqItems')
              .withIndex('by_userId_tenderId', (q) =>
                q.eq('userId', userId).eq('tenderId', args.bidId!)
              )
              .take(200)
          : ctx.db
              .query('boqItems')
              .withIndex('by_userId', (q) => q.eq('userId', userId))
              .take(500),
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
        ctx.db
          .query('regulatoryRules')
          .withIndex('by_effectiveDate')
          .order('desc')
          .take(10),
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

    const planTier = profile?.planTier ?? 'starter';
    const capUsd = PLAN_MONTHLY_CAP_USD[planTier];
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    for (const row of usageEntries) {
      promptTokens += row.promptTokens;
      completionTokens += row.completionTokens;
      costUsd += row.costUsd;
    }

    return {
      docs,
      tenders,
      boqItems,
      approvals,
      messages: [...messages].reverse(),
      usageSummary: {
        month,
        promptTokens,
        completionTokens,
        costUsd: Math.round(costUsd * 10000) / 10000,
        capUsd,
        planTier,
      },
      regulatoryRules,
    };
  },
});

/**
 * Scheduled daily compliance watchdog via convex/crons.ts (05:00 UTC / 07:00 SAST).
 * Iterates per authenticated contractor `userId` — zero hardcoded fallback IDs or phones.
 */
export const runDailyComplianceExpiryCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query('contractorProfiles').take(250);
    let remindersCreated = 0;

    for (const profile of profiles) {
      const userId: Id<'users'> = profile.userId;
      const docs = await ctx.db
        .query('complianceDocs')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(50);

      const blockingAlerts: string[] = [];
      for (const doc of docs) {
        const evaluated = evaluateComplianceDocExpiry({
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
          blockingAlerts.push(`${doc.shortLabel}: ${evaluated.alertReason}`);
        }
      }

      if (blockingAlerts.length === 0) continue;

      const [topTender, existingPending] = await Promise.all([
        ctx.db
          .query('tenderMatches')
          .withIndex('by_userId', (q) => q.eq('userId', userId))
          .first(),
        ctx.db
          .query('pendingApprovals')
          .withIndex('by_userId_status', (q) =>
            q.eq('userId', userId).eq('status', 'pending_approval')
          )
          .first(),
      ]);

      if (!topTender || !profile.whatsappPhone) continue;
      if (existingPending?.actionType === 'whatsapp_broadcast') continue;

      const est = topTender.estimatedValueZar || 0;
      await ctx.db.insert('pendingApprovals', {
        userId,
        approvalId: `apr-cron-${Date.now().toString(36)}-${String(userId).slice(-4)}`,
        bidId: topTender.tenderId,
        tenderNumber: topTender.tenderNumber,
        actionType: 'whatsapp_broadcast',
        status: 'pending_approval',
        totalBidZar: est,
        vatZar: Math.round(est * 0.15 * 100) / 100,
        grandTotalZar: Math.round(est * 1.15 * 100) / 100,
        targetResource: profile.whatsappPhone,
        commandPreview: `whatsapp.complianceReminder(${JSON.stringify(blockingAlerts)})`,
        complianceVerified: false,
        complianceWarnings: blockingAlerts,
        requestedBy: 'convex/crons.ts (daily-compliance-expiry-reminders)',
        requestedAt: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
        submissionChannel: 'whatsapp_broadcast',
      });
      remindersCreated += 1;
    }

    return { checkedProfiles: profiles.length, remindersCreated };
  },
});
