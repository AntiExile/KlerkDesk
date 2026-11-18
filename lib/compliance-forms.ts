import type { DirectorInfo } from '@/types';

export const PPR_2022_THRESHOLD_ZAR = 50_000_000;

export interface Sbd4StateEmploymentRow {
  fullName: string;
  idNumber: string;
  organOfState: string;
  relationship: string;
}

export interface Sbd4LinkedEnterpriseRow {
  enterpriseName: string;
  csdNumber: string;
  status: string;
}

export interface Sbd4DisclosureProfile {
  directors?: DirectorInfo[];
  connectedPersonDetails?: string | null;
  hasConnectedPersons?: boolean;
}

export interface Sbd4DisclosuresResult {
  hasStateEmployment: boolean;
  stateEmploymentRows: Sbd4StateEmploymentRow[];
  hasConnectedPersons: boolean;
  connectedPersonDetails: string;
  hasOtherEnterprises: boolean;
  linkedEnterpriseRows: Sbd4LinkedEnterpriseRow[];
  requiresOverflowSchedule: boolean;
  overflowDirectors: DirectorInfo[];
  overflowEnterprises: Sbd4LinkedEnterpriseRow[];
  summaryText: string;
}

export interface SpecificGoalInput {
  goal: string;
  maxPoints: number;
  claimedPoints?: number;
}

export interface Ppr2022GoalRow {
  goal: string;
  maxPoints: number;
  claimedPoints: number;
}

export interface Ppr2022CalculationResult {
  preferenceSystem: '80/20' | '90/10';
  systemLabel: string;
  maxPoints: number;
  claimedPoints: number;
  bbbeeLevelNumber: number;
  bbbeeLabel: string;
  goalRows: Ppr2022GoalRow[];
}

/**
 * Parses South African B-BBEE level strings (`Level 1`, `EME`, `QSE`, etc.)
 * into a numeric level from 1 to 8 (0 if unrecognized).
 */
export function parseBbbeeLevelNumber(bbbeeLevel: string): number {
  const lower = (bbbeeLevel || '').toLowerCase();
  const match = lower.match(/level\s*([1-8])/i) ?? lower.match(/\b([1-8])\b/);
  if (match?.[1]) {
    return Number(match[1]);
  }
  if (lower.includes('eme') || lower.includes('exempt')) {
    return 1;
  }
  if (lower.includes('qse')) {
    return 2;
  }
  return 0;
}

/**
 * Maps contractor directors into PFMA SCM Instruction 14 of 2026/27 SBD 4
 * Paragraph 2.1 (state employment), 2.2 (connected persons), and 2.3/2.4
 * (linked CSD enterprises).
 */
export function buildSbd4Disclosures(
  profile: Sbd4DisclosureProfile
): Sbd4DisclosuresResult {
  const directors = profile.directors ?? [];

  const stateEmploymentRows: Sbd4StateEmploymentRow[] = directors
    .filter((d) => d.isOrganOfStateEmployee)
    .map((d) => ({
      fullName: d.fullName.trim(),
      idNumber: d.idNumber.trim(),
      organOfState:
        d.organOfStateDetails?.trim() || 'Organ of State (CSD Verified)',
      relationship: d.idNumber?.trim()
        ? `ID ${d.idNumber.trim()}`
        : 'Director / Shareholder',
    }));

  const hasStateEmployment = stateEmploymentRows.length > 0;

  const trimmedConnected = (profile.connectedPersonDetails ?? '').trim();
  const hasConnectedPersons =
    Boolean(profile.hasConnectedPersons) || trimmedConnected.length > 0;
  const connectedPersonDetails = hasConnectedPersons
    ? trimmedConnected || 'Connected person relationship disclosed'
    : 'N/A — No connected person employed by procuring institution';

  const linkedEnterpriseRows: Sbd4LinkedEnterpriseRow[] = [];
  for (const director of directors) {
    for (const ent of director.linkedCsdEnterprises ?? []) {
      const enterpriseName = ent.enterpriseName.trim();
      const csdNumber = ent.csdNumber.trim();
      if (!enterpriseName && !csdNumber) continue;
      linkedEnterpriseRows.push({
        enterpriseName: enterpriseName || 'Linked Enterprise',
        csdNumber: csdNumber || 'MAAA-PENDING',
        status: ent.status?.trim() || 'Active',
      });
    }
  }

  const hasOtherEnterprises = linkedEnterpriseRows.length > 0;
  const requiresOverflowSchedule =
    directors.length > 4 || linkedEnterpriseRows.length > 4;

  const summaryParts: string[] = [];
  if (hasStateEmployment) {
    summaryParts.push(
      `2.1 YES (${stateEmploymentRows
        .map((r) => `${r.fullName} — ${r.organOfState}`)
        .join('; ')})`
    );
  } else {
    summaryParts.push('2.1 NO');
  }
  summaryParts.push(hasConnectedPersons ? `2.2 YES (${connectedPersonDetails})` : '2.2 NO');
  summaryParts.push(
    hasOtherEnterprises
      ? `2.3/2.4 YES (${linkedEnterpriseRows
          .map((e) => `${e.enterpriseName} [${e.csdNumber}]`)
          .join('; ')})`
      : '2.3/2.4 NO'
  );

  return {
    hasStateEmployment,
    stateEmploymentRows,
    hasConnectedPersons,
    connectedPersonDetails,
    hasOtherEnterprises,
    linkedEnterpriseRows,
    requiresOverflowSchedule,
    overflowDirectors: directors,
    overflowEnterprises: linkedEnterpriseRows,
    summaryText: summaryParts.join(' | '),
  };
}

/**
 * Calculates PPR 2022 preference point system (`80/20` up to R50M incl. VAT;
 * `90/10` above R50M incl. VAT) and Specific Goals points claimed.
 */
export function calculatePpr2022Points(
  bidTotalInclVat: number,
  bbbeeLevel: string,
  specificGoals?: SpecificGoalInput[]
): Ppr2022CalculationResult {
  const isNinetyTen = bidTotalInclVat > PPR_2022_THRESHOLD_ZAR;
  const preferenceSystem: '80/20' | '90/10' = isNinetyTen ? '90/10' : '80/20';
  const maxPoints = isNinetyTen ? 10 : 20;
  const systemLabel = isNinetyTen
    ? '90/10 (Acquisitions above R 50,000,000.00 — PPR 2022)'
    : '80/20 (Acquisitions up to R 50,000,000.00 — PPR 2022)';

  const level = parseBbbeeLevelNumber(bbbeeLevel);
  const points8020: Record<number, number> = {
    1: 20,
    2: 18,
    3: 14,
    4: 12,
    5: 8,
    6: 6,
    7: 4,
    8: 2,
  };
  const points9010: Record<number, number> = {
    1: 10,
    2: 9,
    3: 6,
    4: 5,
    5: 4,
    6: 3,
    7: 2,
    8: 1,
  };

  const baseBbbeePoints = isNinetyTen
    ? (points9010[level] ?? 0)
    : (points8020[level] ?? 0);

  const bbbeeLabel =
    bbbeeLevel?.trim() || (level > 0 ? `Level ${level} B-BBEE` : 'Non-Compliant');

  let goalRows: Ppr2022GoalRow[];
  if (specificGoals && specificGoals.length > 0) {
    const ratio = maxPoints > 0 ? baseBbbeePoints / maxPoints : 0;
    goalRows = specificGoals.slice(0, 3).map((g) => {
      const gMax = Math.max(0, Number(g.maxPoints) || 0);
      const rawClaim =
        g.claimedPoints !== undefined
          ? Number(g.claimedPoints)
          : Math.round(gMax * ratio * 100) / 100;
      const gClaim = Math.min(gMax, Math.max(0, rawClaim));
      return {
        goal: g.goal.trim(),
        maxPoints: gMax,
        claimedPoints: Math.round(gClaim * 100) / 100,
      };
    });
  } else {
    goalRows = [
      {
        goal: `B-BBEE Contributor (${bbbeeLabel})`,
        maxPoints,
        claimedPoints: baseBbbeePoints,
      },
    ];
  }

  const summedClaimed = goalRows.reduce((sum, r) => sum + r.claimedPoints, 0);
  const claimedPoints =
    Math.round(Math.min(maxPoints, summedClaimed) * 100) / 100;

  return {
    preferenceSystem,
    systemLabel,
    maxPoints,
    claimedPoints,
    bbbeeLevelNumber: level,
    bbbeeLabel,
    goalRows,
  };
}
