import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { components } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';

const AuthMethodValidator = v.union(
  v.object({ name: v.literal('usernamePassword'), profile: v.object({}) }),
  v.object({ name: v.literal('usernamePasskey'), profile: v.object({}) })
);

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * Seeds starter compliance docs, active municipal tenders, BoQ lines, and an
 * onboarding assistant message scoped to `userId` so newly registered contractors
 * and demo sessions immediately see KlerkDesk in action.
 */
export async function seedDemoWorkspaceForUser(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<void> {
  const existingDoc = await ctx.db
    .query('complianceDocs')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .first();

  if (!existingDoc) {
    const starterDocs = [
      {
        docId: 'doc-csd',
        docType: 'csd' as const,
        title: 'Central Supplier Database (CSD) Summary Report',
        shortLabel: 'CSD Report',
        referenceNumber: 'MAAA0948215',
        fileName: 'CSD_Report_MAAA0948215.pdf',
        fileSizeBytes: 428_120,
        issuedAt: daysAgoIso(9),
        expiresAt: null,
        ageDays: 9,
        maxAgeDays: 7,
        daysUntilExpiry: -2,
        status: 'expired' as const,
        alertReason:
          'CSD report is 9 days old (exceeds 7-day limit). Download a fresh report from csd.gov.za.',
      },
      {
        docId: 'doc-tax-pin',
        docType: 'tax_pin' as const,
        title: 'SARS Tax Compliance Status (TCS) PIN',
        shortLabel: 'Tax PIN',
        referenceNumber: 'TCS-8841209341',
        fileName: 'SARS_Tax_PIN_2026.pdf',
        fileSizeBytes: 219_400,
        issuedAt: daysAgoIso(180),
        expiresAt: daysFromNowIso(185),
        ageDays: 180,
        maxAgeDays: null,
        daysUntilExpiry: 185,
        status: 'valid' as const,
        alertReason: null,
      },
      {
        docId: 'doc-coida',
        docType: 'coida' as const,
        title: 'COIDA Letter of Good Standing (Compensation Fund)',
        shortLabel: 'COIDA',
        referenceNumber: 'COIDA-WC-2026-4419',
        fileName: 'COIDA_Good_Standing_2026.pdf',
        fileSizeBytes: 312_880,
        issuedAt: daysAgoIso(346),
        expiresAt: daysFromNowIso(19),
        ageDays: 346,
        maxAgeDays: null,
        daysUntilExpiry: 19,
        status: 'warning' as const,
        alertReason: 'Expires in 19 days. Schedule renewal soon.',
      },
      {
        docId: 'doc-bbbee',
        docType: 'bbbee' as const,
        title: 'B-BBEE SANAS Verification Certificate (Level 1)',
        shortLabel: 'B-BBEE',
        referenceNumber: 'BBBEE-L1-77102',
        fileName: 'BBBEE_Level1_Certificate.pdf',
        fileSizeBytes: 518_900,
        issuedAt: daysAgoIso(155),
        expiresAt: daysFromNowIso(210),
        ageDays: 155,
        maxAgeDays: null,
        daysUntilExpiry: 210,
        status: 'valid' as const,
        alertReason: null,
      },
      {
        docId: 'doc-cipc',
        docType: 'cipc' as const,
        title: 'CIPC Company Registration (CoR 14.3 Certified)',
        shortLabel: 'CIPC',
        referenceNumber: '2018/419022/07',
        fileName: 'CIPC_CoR14_3_Certified.pdf',
        fileSizeBytes: 894_110,
        issuedAt: daysAgoIso(96),
        expiresAt: null,
        ageDays: 96,
        maxAgeDays: 90,
        daysUntilExpiry: -6,
        status: 'expired' as const,
        alertReason:
          'Certified copy is 96 days old (exceeds 90-day SAPS/Commissioner limit).',
      },
      {
        docId: 'doc-ids',
        docType: 'certified_id' as const,
        title: 'Certified Director ID Copies (SAPS Stamped)',
        shortLabel: 'Certified IDs',
        referenceNumber: 'ID-CERT-WC-8192',
        fileName: 'Directors_Certified_IDs.pdf',
        fileSizeBytes: 642_040,
        issuedAt: daysAgoIso(42),
        expiresAt: null,
        ageDays: 42,
        maxAgeDays: 90,
        daysUntilExpiry: 48,
        status: 'valid' as const,
        alertReason: null,
      },
    ];

    for (const doc of starterDocs) {
      await ctx.db.insert('complianceDocs', {
        userId,
        ...doc,
      });
    }
  }

  const existingTender = await ctx.db
    .query('tenderMatches')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .first();

  if (!existingTender) {
    const starterTenders = [
      {
        tenderId: 'ET-2026-WC-0842',
        tenderNumber: 'T/GEO/042/2026',
        title:
          'Rehabilitation of York Street & Stormwater Culvert Upgrades — Phase 2',
        municipality: 'George Municipality',
        region: 'George',
        cidbGrade: '6CE',
        closingDate: daysFromNowIso(11),
        briefingDate: daysFromNowIso(3),
        briefingCompulsory: true,
        estimatedValueZar: 14_850_000,
        matchScore: 96,
        status: 'staging' as const,
        portalUrl:
          'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-WC-0842',
        complianceReady: false,
        complianceBlocks: [
          'CSD Report exceeds 7-day freshness rule',
          'CIPC CoR 14.3 exceeds 90-day certification rule',
        ],
        summary:
          'Asphalt resurfacing (4.2 km), kerbing, precast stormwater box culverts, and traffic accommodation within George CBD. Requires CIDB 6CE or higher, SBD 1/4/6.1, and compulsory site clarification attendance.',
        sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1', 'MBD 8', 'MBD 9'],
      },
      {
        tenderId: 'ET-2026-WC-0911',
        tenderNumber: 'OUD/INF/019/2026',
        title:
          'Oudtshoorn Bulk Water Pipeline Replacement & Pump Station Civil Works',
        municipality: 'Oudtshoorn Municipality',
        region: 'Oudtshoorn',
        cidbGrade: '5CE',
        closingDate: daysFromNowIso(18),
        briefingDate: daysFromNowIso(6),
        briefingCompulsory: true,
        estimatedValueZar: 8_420_000,
        matchScore: 92,
        status: 'matched' as const,
        portalUrl:
          'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-WC-0911',
        complianceReady: false,
        complianceBlocks: [
          'CSD Report exceeds 7-day freshness rule',
          'CIPC CoR 14.3 exceeds 90-day certification rule',
        ],
        summary:
          'Supply, trenching, and hydrostatic testing of 350mm uPVC Class 16 bulk water mains with concrete valve chambers and telemetry plinths.',
        sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
      },
      {
        tenderId: 'ET-2026-WC-1044',
        tenderNumber: 'MSB/TD/088/2026',
        title:
          'Mossel Bay Kwanonqaba Stormwater Attenuation & Concrete Lined Channels',
        municipality: 'Mossel Bay Municipality',
        region: 'Mossel Bay',
        cidbGrade: '4CE',
        closingDate: daysFromNowIso(24),
        briefingDate: null,
        briefingCompulsory: false,
        estimatedValueZar: 4_960_000,
        matchScore: 89,
        status: 'matched' as const,
        portalUrl:
          'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-WC-1044',
        complianceReady: false,
        complianceBlocks: [
          'CSD Report exceeds 7-day freshness rule',
          'CIPC CoR 14.3 exceeds 90-day certification rule',
        ],
        summary:
          'Gabion erosion protection, reinforced concrete trapezoidal drainage channels, and inlet headwalls.',
        sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
      },
      {
        tenderId: 'ET-2026-CPT-2201',
        tenderNumber: 'COCT/221Q/2025-26',
        title:
          'City of Cape Town Area South Civil Concrete Plinths & Cable Ducting',
        municipality: 'City of Cape Town',
        region: 'Cape Town',
        cidbGrade: '6CE',
        closingDate: daysFromNowIso(29),
        briefingDate: daysFromNowIso(9),
        briefingCompulsory: false,
        estimatedValueZar: 19_200_000,
        matchScore: 84,
        status: 'matched' as const,
        portalUrl:
          'https://www.etenders.gov.za/Home/opportunities?id=ET-2026-CPT-2201',
        complianceReady: false,
        complianceBlocks: [
          'CSD Report exceeds 7-day freshness rule',
          'CIPC CoR 14.3 exceeds 90-day certification rule',
        ],
        summary:
          '36-month term tender for substation civil earthworks, security boundary walls, and HDPE electrical sleeve trenches.',
        sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
      },
    ];

    for (const tender of starterTenders) {
      await ctx.db.insert('tenderMatches', {
        userId,
        ...tender,
      });
    }

    const starterBoq = [
      {
        itemId: 'boq-1',
        itemCode: '1300',
        section: 'Section 1: Preliminary & General',
        description:
          'Site establishment, OHS file, traffic accommodation & CIDB board',
        unit: 'Sum',
        quantity: 1,
        rateZar: 1_150_000,
        amountZar: 1_150_000,
      },
      {
        itemId: 'boq-2',
        itemCode: '3401',
        section: 'Section 3: Earthworks & Layerworks',
        description:
          'Mill existing asphalt (50mm) & stabilize G5 subbase (150mm)',
        unit: 'm²',
        quantity: 18_500,
        rateZar: 245,
        amountZar: 4_532_500,
      },
      {
        itemId: 'boq-3',
        itemCode: '4202',
        section: 'Section 4: Asphalt Surfacing',
        description:
          'Continuously graded medium asphalt wearing course (40mm thick)',
        unit: 'm²',
        quantity: 18_500,
        rateZar: 315,
        amountZar: 5_827_500,
      },
      {
        itemId: 'boq-4',
        itemCode: '5104',
        section: 'Section 5: Stormwater Culverts',
        description:
          'Supply & lay 900x600mm precast concrete box culverts incl. bedding',
        unit: 'm',
        quantity: 420,
        rateZar: 4_850,
        amountZar: 2_037_000,
      },
      {
        itemId: 'boq-5',
        itemCode: '6109',
        section: 'Section 6: Kerbing & Ancillary',
        description: 'Precast concrete Fig 3 barrier kerbing & storm catchpits',
        unit: 'm',
        quantity: 1_450,
        rateZar: 410,
        amountZar: 594_500,
      },
      {
        itemId: 'boq-6',
        itemCode: '9001',
        section: 'Section 9: Provisional Sums',
        description:
          'Community Liaison Officer (CLO) & SMME local labour allowance',
        unit: 'Prov Sum',
        quantity: 1,
        rateZar: 450_000,
        amountZar: 450_000,
      },
    ];

    for (const item of starterBoq) {
      await ctx.db.insert('boqItems', {
        userId,
        tenderId: 'ET-2026-WC-0842',
        ...item,
      });
    }
  }

  const existingMessage = await ctx.db
    .query('messages')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .first();

  if (!existingMessage) {
    await ctx.db.insert('messages', {
      userId,
      bidId: 'ET-2026-WC-0842',
      role: 'assistant',
      content:
        'Welcome to **KlerkDesk**. Morning OCDS & municipal scans matched **T/GEO/042/2026** (George Municipality, R14.85M). Refresh your CSD (7-day rule) and CIPC (90-day rule) in the Compliance Vault before approving final submission.',
      contentType: 'markdown',
      modelUsed: 'openrouter/free',
      createdAt: new Date().toISOString(),
    });
  }
}

export const createUser = internalMutation({
  args: {
    method: AuthMethodValidator,
  },
  returns: v.id('users'),
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const userId = await ctx.db.insert('users', {
      companyName: 'Karoo Civil & Infrastructure (Pty) Ltd',
      registrationNumber: '2018/419022/07',
      csdMaaaNumber: 'MAAA0948215',
      taxPinNumber: 'TCS-8841209341',
      bbbeeLevel: 'Level 1 (135% Procurement Recognition)',
      cidbGrade: '6CE PE',
      municipalRegions: ['George', 'Oudtshoorn', 'Mossel Bay', 'Cape Town'],
      whatsappNumber: '+27825550148',
      createdAt: now,
      lastSignInAt: now,
    });

    await seedDemoWorkspaceForUser(ctx, userId);
    return userId;
  },
});

export const onSignIn = internalMutation({
  args: {
    method: AuthMethodValidator,
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      lastSignInAt: new Date().toISOString(),
    });
    await seedDemoWorkspaceForUser(ctx, args.userId);
    return null;
  },
});

export const ensureDemoSeed = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    await seedDemoWorkspaceForUser(ctx, userId);
    return true;
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const [user, username] = await Promise.all([
      ctx.db.get('users', userId),
      ctx.runQuery(components.authUsername.public.getUsername, { userId }),
    ]);

    if (!user) return null;

    return {
      _id: user._id,
      username: username ?? null,
      companyName:
        user.companyName ?? 'Karoo Civil & Infrastructure (Pty) Ltd',
      registrationNumber: user.registrationNumber ?? '2018/419022/07',
      csdMaaaNumber: user.csdMaaaNumber ?? 'MAAA0948215',
      taxPinNumber: user.taxPinNumber ?? 'TCS-8841209341',
      bbbeeLevel: user.bbbeeLevel ?? 'Level 1 (135% Procurement Recognition)',
      cidbGrade: user.cidbGrade ?? '6CE PE',
      municipalRegions: user.municipalRegions ?? [
        'George',
        'Oudtshoorn',
        'Mossel Bay',
        'Cape Town',
      ],
      whatsappNumber: user.whatsappNumber ?? '+27825550148',
    };
  },
});

export const updateProfile = mutation({
  args: {
    companyName: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    csdMaaaNumber: v.optional(v.string()),
    taxPinNumber: v.optional(v.string()),
    bbbeeLevel: v.optional(v.string()),
    cidbGrade: v.optional(v.string()),
    municipalRegions: v.optional(v.array(v.string())),
    whatsappNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Unauthorized: please sign in to update profile');
    }

    const patch: Record<string, unknown> = {};
    if (args.companyName !== undefined) patch.companyName = args.companyName;
    if (args.registrationNumber !== undefined)
      patch.registrationNumber = args.registrationNumber;
    if (args.csdMaaaNumber !== undefined)
      patch.csdMaaaNumber = args.csdMaaaNumber;
    if (args.taxPinNumber !== undefined) patch.taxPinNumber = args.taxPinNumber;
    if (args.bbbeeLevel !== undefined) patch.bbbeeLevel = args.bbbeeLevel;
    if (args.cidbGrade !== undefined) patch.cidbGrade = args.cidbGrade;
    if (args.municipalRegions !== undefined)
      patch.municipalRegions = args.municipalRegions;
    if (args.whatsappNumber !== undefined)
      patch.whatsappNumber = args.whatsappNumber;

    await ctx.db.patch(userId, patch);
    return await ctx.db.get('users', userId);
  },
});
