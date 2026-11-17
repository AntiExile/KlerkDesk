import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { components } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import {
  assertNoPortalPasswordField,
  DEMO_USERNAME,
  maskSarsTcsPin,
  normalizeZaPhone,
  requireUserId,
} from './authHelpers';
import { DirectorValidator, PlanTierValidator } from './schema';

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
 * Isolated demo sandbox seeder strictly restricted to `demo@mundusmk.co.za`.
 * Real contractor accounts start cleanly with empty Compliance Vault, Tender Threads,
 * and Contractor Profile until they upload or scan live data.
 */
export async function seedDemoWorkspaceForUser(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<void> {
  const existingProfile = await ctx.db
    .query('contractorProfiles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first();

  if (!existingProfile) {
    const demoDirectors = [
      {
        fullName: 'Willem Johannes van der Merwe',
        idNumber: '7804125184089',
        isOrganOfStateEmployee: false,
        linkedCsdEnterprises: [
          {
            enterpriseName: 'Karoo Civil & Infrastructure (Pty) Ltd',
            csdNumber: 'MAAA0948215',
            status: 'Active',
          },
        ],
      },
    ];
    await ctx.db.insert('contractorProfiles', {
      userId,
      companyName: 'Karoo Civil & Infrastructure (Pty) Ltd',
      registrationNumber: '2018/419022/07',
      csdNumber: 'MAAA0948215',
      taxRefNumber: '9482014829',
      sarsTcsPin: maskSarsTcsPin('TCS-8841209341'),
      cidbGrade: '6CE PE',
      bbbeeLevel: 'Level 1 (135% Procurement Recognition)',
      preferredRegions: ['George', 'Oudtshoorn', 'Mossel Bay', 'Cape Town'],
      sectors: ['civil_roads', 'building_construction'],
      whatsappPhone: '+27825550148',
      planTier: 'starter',
      directors: demoDirectors,
      updatedAt: new Date().toISOString(),
    });
    await ctx.db.patch(userId, {
      companyName: 'Karoo Civil & Infrastructure (Pty) Ltd',
      registrationNumber: '2018/419022/07',
      csdMaaaNumber: 'MAAA0948215',
      taxRefNumber: '9482014829',
      sarsTcsPin: maskSarsTcsPin('TCS-8841209341'),
      bbbeeLevel: 'Level 1 (135% Procurement Recognition)',
      cidbGrade: '6CE PE',
      preferredRegions: ['George', 'Oudtshoorn', 'Mossel Bay', 'Cape Town'],
      municipalRegions: ['George', 'Oudtshoorn', 'Mossel Bay', 'Cape Town'],
      sectors: ['civil_roads', 'building_construction'],
      whatsappPhone: '+27825550148',
      whatsappNumber: '+27825550148',
      planTier: 'starter',
      directors: demoDirectors,
    });
  }

  const existingDoc = await ctx.db
    .query('complianceDocs')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
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
        referenceNumber: 'TCS-••••9341',
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
    .withIndex('by_userId', (q) => q.eq('userId', userId))
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
        submissionChannel: 'etenders_esubmission' as const,
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
        submissionChannel: 'etenders_esubmission' as const,
        complianceReady: false,
        complianceBlocks: [
          'CSD Report exceeds 7-day freshness rule',
          'CIPC CoR 14.3 exceeds 90-day certification rule',
        ],
        summary:
          'Supply, trenching, and hydrostatic testing of 350mm uPVC Class 16 bulk water mains with concrete valve chambers and telemetry plinths.',
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
    ];

    for (const item of starterBoq) {
      await ctx.db.insert('boqItems', {
        userId,
        tenderId: 'ET-2026-WC-0842',
        ...item,
      });
    }
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
      companyName: '',
      registrationNumber: '',
      csdMaaaNumber: '',
      taxPinNumber: '',
      taxRefNumber: '',
      sarsTcsPin: '',
      bbbeeLevel: '',
      cidbGrade: '',
      municipalRegions: [],
      preferredRegions: [],
      sectors: [],
      whatsappNumber: '',
      whatsappPhone: '',
      planTier: 'starter',
      directors: [],
      createdAt: now,
      lastSignInAt: now,
    });

    await ctx.db.insert('contractorProfiles', {
      userId,
      companyName: '',
      registrationNumber: '',
      csdNumber: '',
      taxRefNumber: '',
      sarsTcsPin: '',
      cidbGrade: '',
      bbbeeLevel: '',
      preferredRegions: [],
      sectors: [],
      whatsappPhone: '',
      planTier: 'starter',
      directors: [],
      updatedAt: now,
    });

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
    return null;
  },
});

export const ensureDemoSeed = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const username = await ctx.runQuery(
      components.authUsername.public.getUsername,
      { userId }
    );
    if (username?.trim().toLowerCase() !== DEMO_USERNAME) {
      return false;
    }
    await seedDemoWorkspaceForUser(ctx, userId);
    return true;
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const [user, profile, username] = await Promise.all([
      ctx.db.get('users', userId),
      ctx.db
        .query('contractorProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .first(),
      ctx.runQuery(components.authUsername.public.getUsername, { userId }),
    ]);

    if (!user) return null;

    const isDemo = username?.trim().toLowerCase() === DEMO_USERNAME;
    const rawPin = profile?.sarsTcsPin || user.sarsTcsPin || user.taxPinNumber || '';

    return {
      _id: user._id,
      username: username ?? null,
      isDemo,
      companyName: profile?.companyName ?? user.companyName ?? '',
      registrationNumber:
        profile?.registrationNumber ?? user.registrationNumber ?? '',
      csdMaaaNumber: profile?.csdNumber ?? user.csdMaaaNumber ?? '',
      csdNumber: profile?.csdNumber ?? user.csdMaaaNumber ?? '',
      taxRefNumber: profile?.taxRefNumber ?? user.taxRefNumber ?? '',
      taxPinNumber: maskSarsTcsPin(rawPin),
      sarsTcsPin: maskSarsTcsPin(rawPin),
      bbbeeLevel: profile?.bbbeeLevel ?? user.bbbeeLevel ?? '',
      cidbGrade: profile?.cidbGrade ?? user.cidbGrade ?? '',
      municipalRegions:
        user.municipalRegions ?? profile?.preferredRegions ?? [],
      preferredRegions:
        profile?.preferredRegions ?? user.preferredRegions ?? [],
      sectors: profile?.sectors ?? user.sectors ?? [],
      whatsappNumber:
        profile?.whatsappPhone ||
        user.whatsappPhone ||
        user.whatsappNumber ||
        '',
      whatsappPhone:
        profile?.whatsappPhone ||
        user.whatsappPhone ||
        user.whatsappNumber ||
        '',
      planTier: profile?.planTier ?? user.planTier ?? 'starter',
      directors: profile?.directors ?? user.directors ?? [],
    };
  },
});

export const updateProfile = mutation({
  args: {
    companyName: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    csdMaaaNumber: v.optional(v.string()),
    csdNumber: v.optional(v.string()),
    taxRefNumber: v.optional(v.string()),
    taxPinNumber: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    assertNoPortalPasswordField(args as Record<string, unknown>);

    const [user, existingProfile] = await Promise.all([
      ctx.db.get('users', userId),
      ctx.db
        .query('contractorProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .first(),
    ]);

    const csd = args.csdNumber ?? args.csdMaaaNumber;
    const rawPhone = args.whatsappPhone ?? args.whatsappNumber;
    const normalizedPhone =
      rawPhone !== undefined ? normalizeZaPhone(rawPhone) : undefined;
    const rawPin = args.sarsTcsPin ?? args.taxPinNumber;
    const maskedPin = rawPin !== undefined ? maskSarsTcsPin(rawPin) : undefined;

    const cleanPreferredRegions = args.preferredRegions
      ? args.preferredRegions
      : args.municipalRegions
        ? args.municipalRegions.filter((r) => !r.startsWith('__klerk_'))
        : undefined;

    const userPatch: Record<string, unknown> = {};
    if (args.companyName !== undefined) userPatch.companyName = args.companyName.trim();
    if (args.registrationNumber !== undefined) {
      userPatch.registrationNumber = args.registrationNumber.trim();
    }
    if (csd !== undefined) userPatch.csdMaaaNumber = csd.trim().toUpperCase();
    if (args.taxRefNumber !== undefined) {
      userPatch.taxRefNumber = args.taxRefNumber.trim();
    }
    if (maskedPin !== undefined) {
      userPatch.taxPinNumber = maskedPin;
      userPatch.sarsTcsPin = maskedPin;
    }
    if (args.bbbeeLevel !== undefined) userPatch.bbbeeLevel = args.bbbeeLevel.trim();
    if (args.cidbGrade !== undefined) userPatch.cidbGrade = args.cidbGrade.trim();
    if (args.municipalRegions !== undefined) {
      userPatch.municipalRegions = args.municipalRegions;
    }
    if (cleanPreferredRegions !== undefined) {
      userPatch.preferredRegions = cleanPreferredRegions;
    }
    if (args.sectors !== undefined) userPatch.sectors = args.sectors;
    if (normalizedPhone !== undefined) {
      userPatch.whatsappNumber = normalizedPhone;
      userPatch.whatsappPhone = normalizedPhone;
    }
    if (args.planTier !== undefined) userPatch.planTier = args.planTier;
    if (args.directors !== undefined) userPatch.directors = args.directors;

    if (Object.keys(userPatch).length > 0) {
      await ctx.db.patch(userId, userPatch);
    }

    const now = new Date().toISOString();
    const nextProfile = {
      userId,
      companyName:
        (userPatch.companyName as string | undefined) ??
        existingProfile?.companyName ??
        user?.companyName ??
        '',
      registrationNumber:
        (userPatch.registrationNumber as string | undefined) ??
        existingProfile?.registrationNumber ??
        user?.registrationNumber ??
        '',
      csdNumber:
        (userPatch.csdMaaaNumber as string | undefined) ??
        existingProfile?.csdNumber ??
        user?.csdMaaaNumber ??
        '',
      taxRefNumber:
        (userPatch.taxRefNumber as string | undefined) ??
        existingProfile?.taxRefNumber ??
        user?.taxRefNumber ??
        '',
      sarsTcsPin:
        (userPatch.sarsTcsPin as string | undefined) ??
        existingProfile?.sarsTcsPin ??
        user?.sarsTcsPin ??
        '',
      cidbGrade:
        (userPatch.cidbGrade as string | undefined) ??
        existingProfile?.cidbGrade ??
        user?.cidbGrade ??
        '',
      bbbeeLevel:
        (userPatch.bbbeeLevel as string | undefined) ??
        existingProfile?.bbbeeLevel ??
        user?.bbbeeLevel ??
        '',
      preferredRegions:
        (userPatch.preferredRegions as string[] | undefined) ??
        existingProfile?.preferredRegions ??
        user?.preferredRegions ??
        [],
      sectors:
        (userPatch.sectors as string[] | undefined) ??
        existingProfile?.sectors ??
        user?.sectors ??
        [],
      whatsappPhone:
        (userPatch.whatsappPhone as string | undefined) ??
        existingProfile?.whatsappPhone ??
        user?.whatsappPhone ??
        '',
      planTier:
        (userPatch.planTier as 'starter' | 'pro' | 'ops' | undefined) ??
        existingProfile?.planTier ??
        user?.planTier ??
        'starter',
      directors:
        (userPatch.directors as typeof existingProfile extends null | undefined
          ? never
          : NonNullable<typeof existingProfile>['directors']) ??
        existingProfile?.directors ??
        user?.directors ??
        [],
      updatedAt: now,
    };

    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, nextProfile);
    } else {
      await ctx.db.insert('contractorProfiles', nextProfile);
    }

    return await ctx.db.get('users', userId);
  },
});

export const getContractorProfileInternal = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const [user, profile] = await Promise.all([
      ctx.db.get('users', args.userId),
      ctx.db
        .query('contractorProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .first(),
    ]);
    if (!user) return null;
    return {
      userId: args.userId,
      companyName: profile?.companyName ?? user.companyName ?? '',
      registrationNumber:
        profile?.registrationNumber ?? user.registrationNumber ?? '',
      csdNumber: profile?.csdNumber ?? user.csdMaaaNumber ?? '',
      taxRefNumber: profile?.taxRefNumber ?? user.taxRefNumber ?? '',
      sarsTcsPin: profile?.sarsTcsPin ?? user.sarsTcsPin ?? '',
      cidbGrade: profile?.cidbGrade ?? user.cidbGrade ?? '',
      bbbeeLevel: profile?.bbbeeLevel ?? user.bbbeeLevel ?? '',
      preferredRegions:
        profile?.preferredRegions ?? user.preferredRegions ?? [],
      sectors: profile?.sectors ?? user.sectors ?? [],
      whatsappPhone:
        profile?.whatsappPhone ||
        user.whatsappPhone ||
        user.whatsappNumber ||
        '',
      planTier: profile?.planTier ?? user.planTier ?? 'starter',
      directors: profile?.directors ?? user.directors ?? [],
    };
  },
});

export const findUserByWhatsappPhoneInternal = internalQuery({
  args: { whatsappPhone: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeZaPhone(args.whatsappPhone);
    if (!normalized) return null;

    const profileMatch = await ctx.db
      .query('contractorProfiles')
      .withIndex('by_whatsappPhone', (q) => q.eq('whatsappPhone', normalized))
      .first();

    if (profileMatch) {
      return {
        userId: profileMatch.userId,
        companyName: profileMatch.companyName,
        whatsappPhone: profileMatch.whatsappPhone,
        cidbGrade: profileMatch.cidbGrade,
        planTier: profileMatch.planTier,
      };
    }

    const userMatch = await ctx.db
      .query('users')
      .withIndex('by_whatsappPhone', (q) => q.eq('whatsappPhone', normalized))
      .first();

    if (!userMatch) return null;
    return {
      userId: userMatch._id,
      companyName: userMatch.companyName ?? '',
      whatsappPhone: userMatch.whatsappPhone ?? normalized,
      cidbGrade: userMatch.cidbGrade ?? '',
      planTier: userMatch.planTier ?? 'starter',
    };
  },
});

export const listActiveContractorProfilesInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('contractorProfiles').take(200);
  },
});
