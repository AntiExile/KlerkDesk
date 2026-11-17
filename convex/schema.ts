import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const DirectorLinkedEnterpriseValidator = v.object({
  enterpriseName: v.string(),
  csdNumber: v.string(),
  status: v.string(),
});

export const DirectorValidator = v.object({
  fullName: v.string(),
  idNumber: v.string(),
  isOrganOfStateEmployee: v.boolean(),
  organOfStateDetails: v.optional(v.string()),
  linkedCsdEnterprises: v.array(DirectorLinkedEnterpriseValidator),
});

export const PlanTierValidator = v.union(
  v.literal('starter'),
  v.literal('pro'),
  v.literal('ops')
);

export const ComplianceDocTypeValidator = v.union(
  v.literal('csd'),
  v.literal('tax_pin'),
  v.literal('coida'),
  v.literal('bbbee'),
  v.literal('cipc'),
  v.literal('certified_id')
);

export default defineSchema({
  users: defineTable({
    companyName: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    csdMaaaNumber: v.optional(v.string()),
    taxPinNumber: v.optional(v.string()),
    taxRefNumber: v.optional(v.string()),
    sarsTcsPin: v.optional(v.string()),
    bbbeeLevel: v.optional(v.string()),
    cidbGrade: v.optional(v.string()),
    municipalRegions: v.optional(v.array(v.string())),
    preferredRegions: v.optional(v.array(v.string())),
    sectors: v.optional(v.array(v.string())),
    whatsappNumber: v.optional(v.string()),
    whatsappPhone: v.optional(v.string()),
    planTier: v.optional(PlanTierValidator),
    directors: v.optional(v.array(DirectorValidator)),
    createdAt: v.optional(v.string()),
    lastSignInAt: v.optional(v.string()),
  }).index('by_whatsappPhone', ['whatsappPhone']),

  contractorProfiles: defineTable({
    userId: v.id('users'),
    companyName: v.string(),
    registrationNumber: v.string(),
    csdNumber: v.string(),
    taxRefNumber: v.string(),
    sarsTcsPin: v.string(),
    cidbGrade: v.string(),
    bbbeeLevel: v.string(),
    preferredRegions: v.array(v.string()),
    sectors: v.array(v.string()),
    whatsappPhone: v.string(),
    planTier: PlanTierValidator,
    directors: v.array(DirectorValidator),
    updatedAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_whatsappPhone', ['whatsappPhone']),

  complianceDocs: defineTable({
    userId: v.optional(v.id('users')),
    docId: v.string(),
    docType: ComplianceDocTypeValidator,
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
    .index('by_userId', ['userId'])
    .index('by_userId_docType', ['userId', 'docType'])
    .index('by_doc_type', ['docType'])
    .index('by_status', ['status']),

  tenderMatches: defineTable({
    userId: v.optional(v.id('users')),
    tenderId: v.string(),
    tenderNumber: v.string(),
    ocid: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    procurementCategory: v.optional(v.string()),
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
    submissionChannel: v.optional(
      v.union(
        v.literal('etenders_esubmission'),
        v.literal('municipal_email'),
        v.literal('tender_box')
      )
    ),
    complianceReady: v.boolean(),
    complianceBlocks: v.array(v.string()),
    summary: v.string(),
    sbdFormsRequired: v.array(v.string()),
    stampedSbdStorageId: v.optional(v.union(v.id('_storage'), v.string())),
    stampedSbdFileName: v.optional(v.string()),
    stampedSbdBase64: v.optional(v.string()),
    stampedSbdPageCount: v.optional(v.number()),
    stampedSbdMethod: v.optional(v.string()),
    returnablePdfStorageIds: v.optional(v.array(v.id('_storage'))),
    updatedAt: v.optional(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_tenderRef', ['userId', 'tenderNumber'])
    .index('by_userId_tenderId', ['userId', 'tenderId'])
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
    .index('by_userId', ['userId'])
    .index('by_userId_tenderId', ['userId', 'tenderId'])
    .index('by_tender_id', ['tenderId']),

  messages: defineTable({
    userId: v.optional(v.id('users')),
    threadId: v.optional(v.string()),
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
    sources: v.optional(
      v.array(
        v.object({
          sourceTitle: v.optional(v.string()),
          filePath: v.string(),
          textSnippet: v.string(),
          pageNumber: v.optional(v.number()),
          score: v.optional(v.number()),
        })
      )
    ),
    createdAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_threadId', ['userId', 'threadId'])
    .index('by_userId_bidId', ['userId', 'bidId'])
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
    mergedPackStorageId: v.optional(v.id('_storage')),
    mergedPackUrl: v.optional(v.string()),
    submissionChannel: v.optional(v.string()),
    whatsappDispatched: v.optional(v.boolean()),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_status', ['userId', 'status'])
    .index('by_userId_bidId', ['userId', 'bidId'])
    .index('by_bid_id', ['bidId'])
    .index('by_status', ['status'])
    .index('by_approvalId', ['approvalId']),

  tenderChunks: defineTable({
    userId: v.optional(v.id('users')),
    tenderId: v.string(),
    sourceTitle: v.string(),
    filePath: v.string(),
    pageNumber: v.optional(v.number()),
    text: v.optional(v.string()),
    textSnippet: v.optional(v.string()),
    fileType: v.string(),
    storageId: v.optional(v.id('_storage')),
    embedding: v.array(v.float64()),
  })
    .index('by_userId_tenderId', ['userId', 'tenderId'])
    .index('by_tender_id', ['tenderId'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['userId', 'tenderId'],
    }),

  regulatoryRules: defineTable({
    ruleKey: v.string(),
    title: v.string(),
    sourceUrl: v.string(),
    effectiveDate: v.string(),
    summary: v.string(),
    fetchedAt: v.string(),
  })
    .index('by_effectiveDate', ['effectiveDate'])
    .index('by_ruleKey', ['ruleKey']),

  usageLedger: defineTable({
    userId: v.id('users'),
    month: v.string(),
    model: v.string(),
    task: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    costUsd: v.number(),
    createdAt: v.string(),
  }).index('by_userId_month', ['userId', 'month']),
});
