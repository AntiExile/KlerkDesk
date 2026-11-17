import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  action,
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import {
  assertRecordOwnership,
  evaluateComplianceDocExpiry,
  requireUserId,
} from './authHelpers';

const SubmissionChannelValidator = v.union(
  v.literal('etenders_esubmission'),
  v.literal('municipal_email'),
  v.literal('tender_box')
);

const TenderStatusValidator = v.union(
  v.literal('matched'),
  v.literal('staging'),
  v.literal('pending_approval'),
  v.literal('submitted')
);

export const TenderMatchInputValidator = v.object({
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
  status: TenderStatusValidator,
  portalUrl: v.string(),
  submissionChannel: v.optional(SubmissionChannelValidator),
  complianceReady: v.boolean(),
  complianceBlocks: v.array(v.string()),
  summary: v.string(),
  sbdFormsRequired: v.array(v.string()),
});

export const BoqGroupValidator = v.object({
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
});

interface SaveMatchesPayload {
  userId: Id<'users'>;
  tenders: Array<{
    tenderId: string;
    tenderNumber: string;
    ocid?: string;
    publishedDate?: string;
    procurementCategory?: string;
    title: string;
    municipality: string;
    region: string;
    cidbGrade: string;
    closingDate: string;
    briefingDate?: string | null;
    briefingCompulsory: boolean;
    estimatedValueZar: number;
    matchScore: number;
    status: 'matched' | 'staging' | 'pending_approval' | 'submitted';
    portalUrl: string;
    submissionChannel?: 'etenders_esubmission' | 'municipal_email' | 'tender_box';
    complianceReady: boolean;
    complianceBlocks: string[];
    summary: string;
    sbdFormsRequired: string[];
  }>;
  boqGroups?: Array<{
    tenderId: string;
    items: Array<{
      itemId: string;
      itemCode: string;
      section: string;
      description: string;
      unit: string;
      quantity: number;
      rateZar: number;
      amountZar: number;
    }>;
  }>;
  replaceActive?: boolean;
}

async function persistTenderMatchesForUser(
  ctx: MutationCtx,
  args: SaveMatchesPayload
) {
  const existingAll = await ctx.db
    .query('tenderMatches')
    .withIndex('by_userId', (q) => q.eq('userId', args.userId))
    .take(150);

  const incomingIds = new Set(args.tenders.map((t) => t.tenderId));
  const now = new Date().toISOString();

  if (args.replaceActive !== false) {
    for (const row of existingAll) {
      if (
        !incomingIds.has(row.tenderId) &&
        row.status !== 'pending_approval' &&
        row.status !== 'submitted'
      ) {
        await ctx.db.delete(row._id);
      }
    }
  }

  const savedTenders = [];
  for (const t of args.tenders) {
    const existing = existingAll.find((row) => row.tenderId === t.tenderId);
    if (existing) {
      assertRecordOwnership(existing.userId, args.userId, 'tender match');
      const preserveStatus =
        existing.status === 'pending_approval' ||
        existing.status === 'submitted'
          ? existing.status
          : t.status;
      await ctx.db.patch(existing._id, {
        tenderNumber: t.tenderNumber,
        ocid: t.ocid,
        publishedDate: t.publishedDate,
        procurementCategory: t.procurementCategory,
        title: t.title,
        municipality: t.municipality,
        region: t.region,
        cidbGrade: t.cidbGrade,
        closingDate: t.closingDate,
        briefingDate: t.briefingDate ?? null,
        briefingCompulsory: t.briefingCompulsory,
        estimatedValueZar: t.estimatedValueZar,
        matchScore: t.matchScore,
        status: preserveStatus,
        portalUrl: t.portalUrl,
        submissionChannel:
          t.submissionChannel ?? existing.submissionChannel ?? 'etenders_esubmission',
        complianceReady: t.complianceReady,
        complianceBlocks: t.complianceBlocks,
        summary: t.summary,
        sbdFormsRequired: t.sbdFormsRequired,
        updatedAt: now,
      });
      savedTenders.push({
        ...existing,
        ...t,
        status: preserveStatus,
      });
    } else {
      const insertedId = await ctx.db.insert('tenderMatches', {
        userId: args.userId,
        ...t,
        briefingDate: t.briefingDate ?? null,
        submissionChannel: t.submissionChannel ?? 'etenders_esubmission',
        updatedAt: now,
      });
      const inserted = await ctx.db.get('tenderMatches', insertedId);
      if (inserted) savedTenders.push(inserted);
    }
  }

  if (args.boqGroups) {
    for (const group of args.boqGroups) {
      const existingBoq = await ctx.db
        .query('boqItems')
        .withIndex('by_userId_tenderId', (q) =>
          q.eq('userId', args.userId).eq('tenderId', group.tenderId)
        )
        .first();
      if (existingBoq) continue;

      for (const item of group.items) {
        await ctx.db.insert('boqItems', {
          userId: args.userId,
          tenderId: group.tenderId,
          ...item,
          amountZar: Math.round(item.quantity * item.rateZar * 100) / 100,
        });
      }
    }
  }

  return savedTenders;
}

export const listTenderMatches = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query('tenderMatches')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(100);
  },
});

export const getTenderMatch = query({
  args: { tenderId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const match = await ctx.db
      .query('tenderMatches')
      .withIndex('by_userId_tenderId', (q) =>
        q.eq('userId', userId).eq('tenderId', args.tenderId)
      )
      .first();
    if (!match) return null;
    assertRecordOwnership(match.userId, userId, 'tender match');
    return match;
  },
});

export const saveTenderMatches = mutation({
  args: {
    tenders: v.array(TenderMatchInputValidator),
    boqGroups: v.optional(v.array(BoqGroupValidator)),
    replaceActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await persistTenderMatchesForUser(ctx, {
      userId,
      tenders: args.tenders,
      boqGroups: args.boqGroups,
      replaceActive: args.replaceActive,
    });
  },
});

export const saveTenderMatchesInternal = internalMutation({
  args: {
    userId: v.id('users'),
    tenders: v.array(TenderMatchInputValidator),
    boqGroups: v.optional(v.array(BoqGroupValidator)),
    replaceActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await persistTenderMatchesForUser(ctx, args);
  },
});

export const listRegulatoryRules = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db
      .query('regulatoryRules')
      .withIndex('by_effectiveDate')
      .order('desc')
      .take(20);
  },
});

export const upsertRegulatoryRulesInternal = internalMutation({
  args: {
    rules: v.array(
      v.object({
        ruleKey: v.string(),
        title: v.string(),
        sourceUrl: v.string(),
        effectiveDate: v.string(),
        summary: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const fetchedAt = new Date().toISOString();
    let count = 0;
    for (const rule of args.rules) {
      const existing = await ctx.db
        .query('regulatoryRules')
        .withIndex('by_ruleKey', (q) => q.eq('ruleKey', rule.ruleKey))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { ...rule, fetchedAt });
      } else {
        await ctx.db.insert('regulatoryRules', { ...rule, fetchedAt });
      }
      count += 1;
    }
    return count;
  },
});

interface RawOcdsReleaseLite {
  ocid?: string;
  id?: string;
  date?: string;
  buyer?: { name?: string };
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    mainProcurementCategory?: string;
    additionalProcurementCategories?: string[];
    procurementMethodDetails?: string;
    submissionMethod?: string[];
    eligibilityCriteria?: string;
    value?: { amount?: number };
    procuringEntity?: { name?: string };
    tenderPeriod?: { startDate?: string; endDate?: string };
    documents?: Array<{ title?: string; url?: string }>;
  };
}

const SECTOR_KEYWORDS: Record<string, string[]> = {
  civil_roads: ['road', 'civil', 'stormwater', 'water', 'sewer', 'asphalt', 'bridge', 'culvert', 'pipeline'],
  building_construction: ['building', 'renovation', 'school', 'clinic', 'roofing', 'fencing', 'construction'],
  electrical_mechanical: ['electrical', 'mechanical', 'solar', 'generator', 'hvac', 'pump', 'substation', 'cable'],
  facilities_security: ['security', 'cleaning', 'hygiene', 'landscaping', 'waste', 'guarding', 'cctv'],
  it_telecoms: ['software', 'cloud', 'ict', 'network', 'cyber', 'server', 'laptop', 'erp', 'fibre'],
  supplies_goods: ['supply', 'ppe', 'medical', 'stationery', 'furniture', 'vehicle', 'fleet', 'diesel'],
  professional_consulting: ['consulting', 'audit', 'engineering', 'legal', 'training', 'advisory', 'environmental'],
};

function inferSubmissionChannel(
  submissionMethods: string[] | undefined,
  portalUrl: string,
  description: string
): 'etenders_esubmission' | 'municipal_email' | 'tender_box' {
  const joined = `${(submissionMethods ?? []).join(' ')} ${portalUrl} ${description}`.toLowerCase();
  if (joined.includes('electroniconly') || joined.includes('etenders') || joined.includes('esubmission')) {
    return 'etenders_esubmission';
  }
  if (joined.includes('email')) {
    return 'municipal_email';
  }
  if (joined.includes('inperson') || joined.includes('tender box') || joined.includes('physical')) {
    return 'tender_box';
  }
  return 'etenders_esubmission';
}

async function fetchOcdsReleasesFeed(): Promise<RawOcdsReleaseLite[]> {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const dateFrom = new Date(now.getTime() - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const url = `https://ocds-api.etenders.gov.za/api/OCDSReleases?PageNumber=1&PageSize=80&dateFrom=${dateFrom}&dateTo=${dateTo}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { releases?: RawOcdsReleaseLite[] };
    return Array.isArray(data.releases) ? data.releases : [];
  } catch {
    return [];
  }
}

function buildScoredMatchesFromReleases(params: {
  releases: RawOcdsReleaseLite[];
  sectors: string[];
  regions: string[];
  cidbGrade: string;
  isBidReady: boolean;
  blockingAlerts: string[];
}) {
  const activeSectors =
    params.sectors.length > 0 ? params.sectors : ['civil_roads', 'building_construction'];
  const regionTokens = params.regions.map((r) => r.toLowerCase().trim()).filter(Boolean);
  const nowMs = Date.now();
  const scored: Array<{
    rawScore: number;
    tender: SaveMatchesPayload['tenders'][number];
    boq: SaveMatchesPayload['boqGroups'] extends Array<infer T> | undefined ? T : never;
  }> = [];

  for (const rel of params.releases) {
    const t = rel.tender;
    if (!t) continue;
    const status = (t.status ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'complete' || status === 'unsuccessful') {
      continue;
    }

    const endMs = t.tenderPeriod?.endDate ? new Date(t.tenderPeriod.endDate).getTime() : NaN;
    if (Number.isFinite(endMs) && endMs < nowMs - 86_400_000) continue;

    const tenderNumber = (t.title ?? t.id ?? rel.ocid ?? '').trim();
    const desc = (t.description ?? t.title ?? '').trim();
    if (!tenderNumber || !desc) continue;

    const organ = (t.procuringEntity?.name ?? rel.buyer?.name ?? 'Organ of State').trim();
    const text = `${desc} ${organ} ${t.eligibilityCriteria ?? ''}`.toLowerCase();

    let score = 0;
    for (const sector of activeSectors) {
      for (const kw of SECTOR_KEYWORDS[sector] ?? []) {
        if (text.includes(kw)) score += 10;
      }
    }
    if (score === 0) continue;

    for (const reg of regionTokens) {
      if (text.includes(reg)) score += 16;
    }

    const cidbMatch = `${t.eligibilityCriteria ?? ''} ${desc}`.match(
      /\b([1-9])\s*(CE|GB|ME|EP|EB)(?:\s*PE)?\b/i
    );
    const extractedCidb = cidbMatch
      ? `${cidbMatch[1]}${cidbMatch[2].toUpperCase()}`
      : 'Open';
    if (
      params.cidbGrade &&
      extractedCidb.toLowerCase().includes(params.cidbGrade.slice(0, 2).toLowerCase())
    ) {
      score += 12;
    }

    const tenderId = `ET-LIVE-${t.id ?? tenderNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const portalUrl =
      t.documents?.[0]?.url ||
      (rel.ocid
        ? `https://ocds-api.etenders.gov.za/api/OCDSReleases/release/${encodeURIComponent(rel.ocid)}`
        : 'https://www.etenders.gov.za/Home/opportunities?id=1');

    const estimatedValueZar =
      typeof t.value?.amount === 'number' && t.value.amount > 0
        ? Math.round(t.value.amount)
        : 3_500_000;

    const pg = Math.round(estimatedValueZar * 0.12);
    const core = Math.round(estimatedValueZar * 0.76);
    const closeout = Math.max(25_000, estimatedValueZar - pg - core);

    scored.push({
      rawScore: score,
      tender: {
        tenderId,
        tenderNumber,
        ocid: rel.ocid,
        publishedDate: rel.date ?? t.tenderPeriod?.startDate,
        procurementCategory: t.mainProcurementCategory || 'Services',
        title: desc.length > 130 ? `${desc.slice(0, 127).trim()}...` : desc,
        municipality: organ,
        region: regionTokens[0] ? params.regions[0] : 'South Africa',
        cidbGrade: extractedCidb,
        closingDate: Number.isFinite(endMs)
          ? new Date(endMs).toISOString()
          : new Date(nowMs + 14 * 86_400_000).toISOString(),
        briefingDate: null,
        briefingCompulsory: text.includes('compulsory'),
        estimatedValueZar,
        matchScore: Math.min(99, Math.max(68, 65 + Math.round(score / 2))),
        status: 'matched',
        portalUrl,
        submissionChannel: inferSubmissionChannel(
          t.submissionMethod,
          portalUrl,
          desc
        ),
        complianceReady: params.isBidReady,
        complianceBlocks: params.blockingAlerts,
        summary: `${organ} — ${desc.slice(0, 220)}`,
        sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
      },
      boq: {
        tenderId,
        items: [
          {
            itemId: `${tenderId}-boq-1`,
            itemCode: '1200',
            section: 'Section 1: Preliminary & General',
            description: 'Mobilisation, OHS compliance & statutory site establishment',
            unit: 'Sum',
            quantity: 1,
            rateZar: pg,
            amountZar: pg,
          },
          {
            itemId: `${tenderId}-boq-2`,
            itemCode: '2100',
            section: 'Section 2: Core Scope Execution',
            description: desc.slice(0, 88),
            unit: 'Sum',
            quantity: 1,
            rateZar: core,
            amountZar: core,
          },
          {
            itemId: `${tenderId}-boq-3`,
            itemCode: '8100',
            section: 'Section 3: Testing, Reporting & Handover',
            description: 'Close-out verification & statutory sign-off',
            unit: 'Sum',
            quantity: 1,
            rateZar: closeout,
            amountZar: closeout,
          },
        ],
      },
    });
  }

  scored.sort((a, b) => b.rawScore - a.rawScore);
  const top = scored.slice(0, 8);
  return {
    tenders: top.map((s, idx) => ({
      ...s.tender,
      status: idx === 0 ? ('staging' as const) : ('matched' as const),
    })),
    boqGroups: top.map((s) => s.boq),
  };
}

export const triggerPortalTenderScan = action({
  args: {
    sectors: v.optional(v.array(v.string())),
    provinces: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<unknown[]> => {
    const userId = await requireUserId(ctx);
    const [profile, docs] = await Promise.all([
      ctx.runQuery(internal.users.getContractorProfileInternal, { userId }),
      ctx.runQuery(internal.compliance.listComplianceDocsForUserInternal, {
        userId,
      }),
    ]);

    const blockingAlerts: string[] = [];
    if (docs.length < 6) {
      blockingAlerts.push(
        `${6 - docs.length} required compliance documents missing from Compliance Vault.`
      );
    }
    for (const doc of docs) {
      const evaluated = evaluateComplianceDocExpiry({
        docType: doc.docType,
        issuedAt: doc.issuedAt,
        expiresAt: doc.expiresAt ?? null,
        maxAgeDays: doc.maxAgeDays ?? null,
      });
      if (evaluated.status === 'expired' && evaluated.alertReason) {
        blockingAlerts.push(`${doc.shortLabel}: ${evaluated.alertReason}`);
      }
    }

    const releases = await fetchOcdsReleasesFeed();
    const { tenders, boqGroups } = buildScoredMatchesFromReleases({
      releases,
      sectors: args.sectors ?? profile?.sectors ?? [],
      regions: args.provinces ?? profile?.preferredRegions ?? [],
      cidbGrade: profile?.cidbGrade ?? '',
      isBidReady: docs.length >= 6 && blockingAlerts.length === 0,
      blockingAlerts,
    });

    if (tenders.length === 0) {
      return [];
    }

    const saved: unknown[] = await ctx.runMutation(
      internal.tenders.saveTenderMatchesInternal,
      {
        userId,
        tenders,
        boqGroups,
        replaceActive: true,
      }
    );

    return saved;
  },
});

export const runDailyUserPortalScans = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{ scannedProfiles: number; matchesSaved: number }> => {
    const profiles: Array<{
      userId: Id<'users'>;
      companyName: string;
      sectors: string[];
      preferredRegions: string[];
      cidbGrade: string;
    }> = await ctx.runQuery(
      internal.users.listActiveContractorProfilesInternal,
      {}
    );
    const releases = await fetchOcdsReleasesFeed();

    if (profiles.length === 0 || releases.length === 0) {
      return { scannedProfiles: profiles.length, matchesSaved: 0 };
    }

    let totalMatches = 0;
    for (const profile of profiles) {
      const docs = await ctx.runQuery(
        internal.compliance.listComplianceDocsForUserInternal,
        { userId: profile.userId }
      );
      const blockingAlerts: string[] = [];
      for (const doc of docs) {
        const evaluated = evaluateComplianceDocExpiry({
          docType: doc.docType,
          issuedAt: doc.issuedAt,
          expiresAt: doc.expiresAt ?? null,
          maxAgeDays: doc.maxAgeDays ?? null,
        });
        if (evaluated.status === 'expired' && evaluated.alertReason) {
          blockingAlerts.push(`${doc.shortLabel}: ${evaluated.alertReason}`);
        }
      }

      const { tenders, boqGroups } = buildScoredMatchesFromReleases({
        releases,
        sectors: profile.sectors,
        regions: profile.preferredRegions,
        cidbGrade: profile.cidbGrade,
        isBidReady: docs.length >= 6 && blockingAlerts.length === 0,
        blockingAlerts,
      });

      if (tenders.length > 0) {
        await ctx.runMutation(internal.tenders.saveTenderMatchesInternal, {
          userId: profile.userId,
          tenders,
          boqGroups,
          replaceActive: true,
        });
        totalMatches += tenders.length;

        const top = tenders[0];
        await ctx.runMutation(internal.chat.appendMessageInternal, {
          userId: profile.userId,
          bidId: top.tenderId,
          role: 'assistant',
          content: `Morning OCDS scan (06:30 SAST): Found ${tenders.length} live tenders matching ${profile.companyName || 'your profile'}. Top match: ${top.tenderNumber} (${top.municipality}, closes ${top.closingDate.slice(0, 10)}).`,
          contentType: 'markdown',
          modelUsed: 'ocds-cron-scanner',
        });
      }
    }

    return { scannedProfiles: profiles.length, matchesSaved: totalMatches };
  },
});

export const runWeeklyRegulatoryWatcher = internalAction({
  args: {},
  handler: async (ctx) => {
    const baselineRules = [
      {
        ruleKey: 'pfma-scm-inst-12-2026-27',
        title: 'PFMA SCM Instruction 12 of 2026/27 — Revised SBD 4 Director & Connected Person Disclosures',
        sourceUrl: 'https://ocpo.treasury.gov.za',
        effectiveDate: '2026-04-01',
        summary:
          'Mandatory disclosure of all directors, Organ of State employees, and CSD-linked enterprises (MAAA) on SBD 4 prior to award adjudication.',
      },
      {
        ruleKey: 'pfma-scm-inst-14-2026-27',
        title: 'PFMA SCM Instruction 14 of 2026/27 — CSD 7-Day Freshness & SBD 6.1 Specific Goals Verification',
        sourceUrl: 'https://ocpo.treasury.gov.za',
        effectiveDate: '2026-05-01',
        summary:
          'Enforces 80/20 vs 90/10 PPR 2022 threshold at R50,000,000.00 and requires verified CSD supplier status within 7 days of bid closing.',
      },
    ];

    const parsedRules = [...baselineRules];
    try {
      const res = await fetch('https://ocpo.treasury.gov.za', {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const html = await res.text();
        const headingMatches = html.matchAll(
          /(?:SCM\s+Instruction|Practice\s+Note|Circular)\s+(?:No\.?\s*)?\d+\s+(?:of\s+)?\d{4}(?:\/\d{2,4})?[^<]{0,120}/gi
        );
        const seen = new Set(parsedRules.map((r) => r.ruleKey));
        for (const m of headingMatches) {
          const cleanTitle = m[0].replace(/\s+/g, ' ').trim();
          const slug = cleanTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 60);
          if (slug && !seen.has(slug)) {
            seen.add(slug);
            parsedRules.push({
              ruleKey: slug,
              title: cleanTitle,
              sourceUrl: 'https://ocpo.treasury.gov.za',
              effectiveDate: new Date().toISOString().slice(0, 10),
              summary: `Detected on National Treasury OCPO bulletin: ${cleanTitle}`,
            });
          }
          if (parsedRules.length >= 10) break;
        }
      }
    } catch {
      // Retain baseline regulatory rules when ocpo.treasury.gov.za is unreachable
    }

    const updated: number = await ctx.runMutation(
      internal.tenders.upsertRegulatoryRulesInternal,
      { rules: parsedRules }
    );
    return { updated };
  },
});
