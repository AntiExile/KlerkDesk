import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalQuery, mutation, query } from './_generated/server';
import {
  assertRecordOwnership,
  evaluateComplianceDocExpiry,
  requireUserId,
} from './authHelpers';
import { ComplianceDocTypeValidator } from './schema';

const DOC_DEFAULTS: Record<
  'csd' | 'tax_pin' | 'coida' | 'bbbee' | 'cipc' | 'certified_id',
  { title: string; shortLabel: string; maxAgeDays: number | null }
> = {
  csd: {
    title: 'Central Supplier Database (CSD) Summary Report',
    shortLabel: 'CSD Report',
    maxAgeDays: 7,
  },
  tax_pin: {
    title: 'SARS Tax Compliance Status (TCS) PIN',
    shortLabel: 'Tax PIN',
    maxAgeDays: null,
  },
  coida: {
    title: 'COIDA Letter of Good Standing (Compensation Fund)',
    shortLabel: 'COIDA',
    maxAgeDays: null,
  },
  bbbee: {
    title: 'B-BBEE SANAS Verification Certificate / Sworn Affidavit',
    shortLabel: 'B-BBEE',
    maxAgeDays: null,
  },
  cipc: {
    title: 'CIPC Company Registration (CoR 14.3 Certified)',
    shortLabel: 'CIPC',
    maxAgeDays: 90,
  },
  certified_id: {
    title: 'Certified Director ID Copies (SAPS Stamped)',
    shortLabel: 'Certified IDs',
    maxAgeDays: 90,
  },
};

export const generateComplianceUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveComplianceDocument = mutation({
  args: {
    storageId: v.id('_storage'),
    docType: ComplianceDocTypeValidator,
    referenceNumber: v.string(),
    fileName: v.string(),
    fileSizeBytes: v.number(),
    issuedAt: v.string(),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const storageMetadata = await ctx.db.system.get('_storage', args.storageId);
    if (!storageMetadata) {
      throw new Error('Uploaded file not found in Convex Storage');
    }

    const existing = await ctx.db
      .query('complianceDocs')
      .withIndex('by_userId_docType', (q) =>
        q.eq('userId', userId).eq('docType', args.docType)
      )
      .first();

    const meta = DOC_DEFAULTS[args.docType];
    const evaluated = evaluateComplianceDocExpiry({
      docType: args.docType,
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt ?? null,
      maxAgeDays: meta.maxAgeDays,
    });

    const payload = {
      userId,
      docId: existing?.docId ?? `doc-${args.docType}`,
      docType: args.docType,
      title: existing?.title ?? meta.title,
      shortLabel: existing?.shortLabel ?? meta.shortLabel,
      referenceNumber: args.referenceNumber.trim(),
      storageId: args.storageId,
      fileName: args.fileName,
      fileSizeBytes: storageMetadata.size ?? args.fileSizeBytes,
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt ?? null,
      ageDays: evaluated.ageDays,
      maxAgeDays: meta.maxAgeDays,
      daysUntilExpiry: evaluated.daysUntilExpiry,
      status: evaluated.status,
      alertReason: evaluated.alertReason,
    };

    if (existing) {
      assertRecordOwnership(existing.userId, userId, 'compliance document');
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert('complianceDocs', payload);
  },
});

export const getComplianceDocumentUrl = query({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const docs = await ctx.db
      .query('complianceDocs')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(50);

    const owned = docs.some(
      (doc) => doc.storageId && String(doc.storageId) === String(args.storageId)
    );
    if (!owned) {
      throw new Error('Forbidden: storage object does not belong to user');
    }

    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getComplianceVault = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Unauthorized: authentication required');
    }
    return await ctx.db
      .query('complianceDocs')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(50);
  },
});

export const listComplianceStorageUrls = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const docs = await ctx.db
      .query('complianceDocs')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(50);

    const resolved: Array<{
      docType: string;
      shortLabel: string;
      title: string;
      referenceNumber: string;
      fileName: string;
      status: string;
      issuedAt: string;
      expiresAt: string | null;
      url: string | null;
    }> = [];

    for (const doc of docs) {
      let url: string | null = null;
      if (doc.storageId && typeof doc.storageId === 'string' && !doc.storageId.startsWith('kg2')) {
        try {
          url = await ctx.storage.getUrl(doc.storageId as Id<'_storage'>);
        } catch {
          url = null;
        }
      }
      resolved.push({
        docType: doc.docType,
        shortLabel: doc.shortLabel,
        title: doc.title,
        referenceNumber: doc.referenceNumber,
        fileName: doc.fileName,
        status: doc.status,
        issuedAt: doc.issuedAt,
        expiresAt: doc.expiresAt ?? null,
        url,
      });
    }

    return resolved;
  },
});

export const listComplianceDocsForUserInternal = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('complianceDocs')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(50);
  },
});
