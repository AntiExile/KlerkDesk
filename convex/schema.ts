import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    companyName: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    csdMaaaNumber: v.optional(v.string()),
    taxPinNumber: v.optional(v.string()),
    bbbeeLevel: v.optional(v.string()),
    cidbGrade: v.optional(v.string()),
    municipalRegions: v.optional(v.array(v.string())),
    whatsappNumber: v.optional(v.string()),
    createdAt: v.optional(v.string()),
    lastSignInAt: v.optional(v.string()),
  }),

  complianceDocs: defineTable({
    userId: v.optional(v.id('users')),
    docId: v.string(),
    docType: v.union(
      v.literal('csd'),
      v.literal('tax_pin'),
      v.literal('coida'),
      v.literal('bbbee'),
      v.literal('cipc'),
      v.literal('certified_id')
    ),
    title: v.string(),
    shortLabel: v.string(),
    referenceNumber: v.string(),
    storageId: v.optional(v.union(v.id('_storage'), v.string())),
    fileName: v.string(),
    fileSizeBytes: v.number(),
    issuedAt: v.string(),
    expiresAt: v.optional(v.union(v.string(), v.null())),
    ageDays: v.number(),
    maxAgeDays: v.optional(v.union(v.number(), v.null())),
    daysUntilExpiry: v.optional(v.union(v.number(), v.null())),
    status: v.union(
      v.literal('valid'),
      v.literal('warning'),
      v.literal('expired'),
      v.literal('missing')
    ),
    alertReason: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_doc_type', ['userId', 'docType'])
    .index('by_doc_type', ['docType'])
    .index('by_status', ['status']),

  tenderMatches: defineTable({
    userId: v.optional(v.id('users')),
    tenderId: v.string(),
    tenderNumber: v.string(),
    title: v.string(),
    municipality: v.string(),
    region: v.string(),
    cidbGrade: v.string(),
    closingDate: v.string(),
    briefingDate: v.optional(v.union(v.string(), v.null())),
    briefingCompulsory: v.boolean(),
    estimatedValueZar: v.number(),
    matchScore: v.number(),
    status: v.union(
      v.literal('matched'),
      v.literal('staging'),
      v.literal('pending_approval'),
      v.literal('submitted')
    ),
    portalUrl: v.string(),
    complianceReady: v.boolean(),
    complianceBlocks: v.array(v.string()),
    summary: v.string(),
    sbdFormsRequired: v.array(v.string()),
    stampedSbdStorageId: v.optional(v.union(v.id('_storage'), v.string())),
    stampedSbdFileName: v.optional(v.string()),
    stampedSbdBase64: v.optional(v.string()),
    stampedSbdPageCount: v.optional(v.number()),
    stampedSbdMethod: v.optional(v.string()),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_tender_id', ['userId', 'tenderId'])
    .index('by_tender_id', ['tenderId']),

  boqItems: defineTable({
    userId: v.optional(v.id('users')),
    tenderId: v.string(),
    itemId: v.string(),
    itemCode: v.string(),
    section: v.string(),
    description: v.string(),
    unit: v.string(),
    quantity: v.number(),
    rateZar: v.number(),
    amountZar: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_tender_id', ['userId', 'tenderId'])
    .index('by_tender_id', ['tenderId']),

  messages: defineTable({
    userId: v.optional(v.id('users')),
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
    createdAt: v.string(),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_bid_id', ['userId', 'bidId'])
    .index('by_bid_id', ['bidId']),

  pendingApprovals: defineTable({
    userId: v.optional(v.id('users')),
    approvalId: v.string(),
    bidId: v.string(),
    tenderNumber: v.string(),
    actionType: v.union(
      v.literal('submit_etenders'),
      v.literal('send_external_email'),
      v.literal('whatsapp_broadcast')
    ),
    status: v.union(
      v.literal('pending_approval'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('executed')
    ),
    totalBidZar: v.number(),
    vatZar: v.number(),
    grandTotalZar: v.number(),
    targetResource: v.string(),
    commandPreview: v.string(),
    complianceVerified: v.boolean(),
    complianceWarnings: v.array(v.string()),
    requestedBy: v.string(),
    requestedAt: v.string(),
    approvedBy: v.optional(v.union(v.string(), v.null())),
    approvedAt: v.optional(v.union(v.string(), v.null())),
    boatSessionId: v.optional(v.union(v.string(), v.null())),
    stagedPdfFileName: v.optional(v.string()),
    stagedPdfBase64: v.optional(v.string()),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_bid_id', ['userId', 'bidId'])
    .index('by_bid_id', ['bidId'])
    .index('by_status', ['status'])
    .index('by_approval_id', ['approvalId']),

  tenderChunks: defineTable({
    tenderId: v.string(),
    sourceTitle: v.string(),
    filePath: v.string(),
    textSnippet: v.string(),
    fileType: v.string(),
    embedding: v.array(v.float64()),
  })
    .index('by_tender_id', ['tenderId'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['tenderId'],
    }),
});
