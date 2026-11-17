import type {
  BoQItem,
  ComplianceSummary,
  TenderMatch,
} from '@/types';

export type TenderSectorId =
  | 'civil_roads'
  | 'building_construction'
  | 'electrical_mechanical'
  | 'facilities_security'
  | 'it_telecoms'
  | 'supplies_goods'
  | 'professional_consulting';

export type TenderTypeFilter = 'all' | 'rfb' | 'rfq' | 'rfp';

export type TenderSortOption =
  | 'best_match'
  | 'closing_soon'
  | 'highest_value'
  | 'newest';

export const TENDER_SORT_OPTIONS: Array<{
  id: TenderSortOption;
  label: string;
  ocdsField: string;
}> = [
  {
    id: 'best_match',
    label: 'Best Sector Match',
    ocdsField: 'mainProcurementCategory · additionalProcurementCategories · deliveryAddress',
  },
  {
    id: 'closing_soon',
    label: 'Closing Soonest',
    ocdsField: 'tender.tenderPeriod.endDate',
  },
  {
    id: 'highest_value',
    label: 'Highest Value (ZAR)',
    ocdsField: 'tender.value.amount',
  },
  {
    id: 'newest',
    label: 'Newest Published',
    ocdsField: 'release.date · tender.tenderPeriod.startDate',
  },
];

export interface TenderSectorDefinition {
  id: TenderSectorId;
  label: string;
  shortLabel: string;
  subtitle: string;
  etendersCategories: string[];
  ocdsCategories: Array<'works' | 'goods' | 'services' | 'consultingServices'>;
  keywords: string[];
  usesCidb: boolean;
  defaultCidbClass?: 'CE' | 'GB' | 'EP' | 'EB' | 'ME';
}

export interface TenderScanPreferences {
  sectors: TenderSectorId[];
  provinces: string[];
  tenderType: TenderTypeFilter;
  sortBy?: TenderSortOption;
  cidbGrade: string;
  customKeywords: string;
  configuredAt: string;
}

export interface SectorRecommendationResult {
  recommendedSectorIds: TenderSectorId[];
  suggestedCidbGrade: string;
  rationale: string;
  modelUsed: string;
  disclaimer: string;
}

export const AI_SECTOR_DISCLAIMER =
  'AI can make mistakes — please double-check that the recommended sectors and CIDB grading match your business before scanning.';

export const SA_PROVINCES = [
  'All South Africa',
  'Western Cape',
  'Gauteng',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Mpumalanga',
  'North West',
  'Free State',
  'Limpopo',
  'Northern Cape',
  'National',
] as const;

export const TENDER_SECTORS: TenderSectorDefinition[] = [
  {
    id: 'civil_roads',
    label: 'Civil & Roads Construction',
    shortLabel: 'Civil & Roads',
    subtitle: 'Roads, stormwater, water & sanitation pipelines, bridges, earthworks',
    etendersCategories: [
      'Construction',
      'Services: Civil',
      'Water collection, treatment and supply',
      'Sewerage',
    ],
    ocdsCategories: ['works'],
    keywords: [
      'civil',
      'road',
      'roads',
      'stormwater',
      'asphalt',
      'culvert',
      'pipeline',
      'water',
      'sewer',
      'wastewater',
      'reservoir',
      'earthworks',
      'bridge',
      'paving',
      'sanral',
      'kerb',
      'trench',
      'rehabilitation',
      'borehole',
    ],
    usesCidb: true,
    defaultCidbClass: 'CE',
  },
  {
    id: 'building_construction',
    label: 'Building & General Construction',
    shortLabel: 'Building (GB)',
    subtitle: 'Public buildings, clinics, schools, housing, renovations & roofing',
    etendersCategories: [
      'Construction',
      'Services: Building',
      'Accommodation',
      'Real estate activities',
    ],
    ocdsCategories: ['works'],
    keywords: [
      'building',
      'renovation',
      'renovations',
      'refurbishment',
      'roofing',
      'painting',
      'clinic',
      'hospital',
      'school',
      'classroom',
      'housing',
      'accommodation',
      'plumbing',
      'carpentry',
      'glazing',
      'fencing',
      'boundary wall',
      'brickwork',
      'facilities upgrade',
    ],
    usesCidb: true,
    defaultCidbClass: 'GB',
  },
  {
    id: 'electrical_mechanical',
    label: 'Electrical, Mechanical & Energy',
    shortLabel: 'Electrical & Mech',
    subtitle: 'Substations, solar PV, backup generators, HVAC, pumps, street lighting',
    etendersCategories: [
      'Services: Electrical',
      'Services: Mechanical',
      'Electricity, gas, steam and air conditioning',
      'Supplies: Electrical Equipment',
    ],
    ocdsCategories: ['works', 'services', 'goods'],
    keywords: [
      'electrical',
      'mechanical',
      'solar',
      'photovoltaic',
      'inverter',
      'battery',
      'generator',
      'hvac',
      'air conditioning',
      'substation',
      'transformer',
      'switchgear',
      'cable',
      'streetlight',
      'high mast',
      'lighting',
      'pump station',
      'boiler',
      'elevator',
      'lift',
    ],
    usesCidb: true,
    defaultCidbClass: 'EP',
  },
  {
    id: 'facilities_security',
    label: 'Facilities, Cleaning, Hygiene & Security',
    shortLabel: 'Cleaning & Security',
    subtitle: 'Physical guarding, CCTV, cleaning, hygiene, pest control, landscaping & waste',
    etendersCategories: [
      'Services: Functional (Including Cleaning and Security Services)',
      'Security and investigation activities',
      'Services: General',
      'Waste collection, treatment and disposal activities; materials recovery',
    ],
    ocdsCategories: ['services'],
    keywords: [
      'security',
      'guarding',
      'armed response',
      'cctv',
      'access control',
      'surveillance',
      'cleaning',
      'hygiene',
      'sanitary',
      'pest control',
      'fumigation',
      'horticulture',
      'landscaping',
      'grass cutting',
      'grounds maintenance',
      'waste',
      'refuse',
      'laundry',
      'catering',
    ],
    usesCidb: false,
  },
  {
    id: 'it_telecoms',
    label: 'IT, Software, Cloud & Telecoms',
    shortLabel: 'IT & Cloud',
    subtitle: 'Software licensing, ERP, cloud hosting, cybersecurity, networking & hardware',
    etendersCategories: [
      'Information and communication',
      'Information service activities',
      'Computer programming, consultancy and related activities',
      'Telecommunications',
    ],
    ocdsCategories: ['services', 'goods', 'consultingServices'],
    keywords: [
      'software',
      'cloud',
      'ict',
      'information technology',
      'cyber',
      'cybersecurity',
      'network',
      'networking',
      'wi-fi',
      'server',
      'laptop',
      'computer',
      'licence',
      'license',
      'licensing',
      'microsoft',
      'erp',
      'application',
      'fibre',
      'telecom',
      'voip',
      'hosting',
      'database',
      'digital',
      'portal',
    ],
    usesCidb: false,
  },
  {
    id: 'supplies_goods',
    label: 'General Supplies, Fleet & Medical Goods',
    shortLabel: 'Supplies & Goods',
    subtitle: 'PPE, medical consumables, stationery, furniture, vehicles, plant & equipment',
    etendersCategories: [
      'Supplies: General',
      'Supplies: Medical',
      'Supplies: Clothing/Textiles/Footwear',
      'Supplies: Stationery/Printing',
      'Manufacture of machinery and equipment n.e.c.',
    ],
    ocdsCategories: ['goods'],
    keywords: [
      'supply and delivery',
      'supply & delivery',
      'ppe',
      'protective clothing',
      'uniform',
      'medical',
      'surgical',
      'pharmaceutical',
      'stationery',
      'printing',
      'furniture',
      'vehicle',
      'fleet',
      'truck',
      'tractor',
      'yellow plant',
      'tyre',
      'fuel',
      'diesel',
      'chemical',
      'consumables',
      'equipment',
      'tools',
      'water meters',
    ],
    usesCidb: false,
  },
  {
    id: 'professional_consulting',
    label: 'Professional, Engineering & Financial Consulting',
    shortLabel: 'Consulting & Prof',
    subtitle: 'Engineering design, quantity surveying, audit, accounting, legal & training',
    etendersCategories: [
      'Services: Professional',
      'Architectural and engineering activities; technical testing and analysis',
      'Legal and accounting activities',
      'Other professional, scientific and technical activities',
      'Education',
    ],
    ocdsCategories: ['consultingServices', 'services'],
    keywords: [
      'professional service',
      'professional services',
      'consulting',
      'consultant',
      'engineering',
      'architectural',
      'quantity surveying',
      'project management',
      'audit',
      'internal audit',
      'accounting',
      'financial',
      'legal',
      'panel of attorneys',
      'forensic',
      'training',
      'seta',
      'skills development',
      'environmental',
      'eia',
      'town planning',
      'valuation',
      'advisory',
    ],
    usesCidb: false,
  },
];

const VALID_SECTOR_IDS = new Set<TenderSectorId>(
  TENDER_SECTORS.map((s) => s.id)
);

const TAG_PREFIX_SECTOR = '__klerk_sector:';
const TAG_PREFIX_PROVINCE = '__klerk_province:';
const TAG_PREFIX_TYPE = '__klerk_type:';
const TAG_PREFIX_SORT = '__klerk_sort:';
const TAG_PREFIX_KEYWORDS = '__klerk_kw:';
const TAG_PREFIX_CONFIGURED = '__klerk_configured:';

const VALID_SORT_OPTIONS = new Set<TenderSortOption>([
  'best_match',
  'closing_soon',
  'highest_value',
  'newest',
]);

export function isSectorUsingCidb(sectors: TenderSectorId[]): boolean {
  return sectors.some(
    (id) =>
      id === 'civil_roads' ||
      id === 'building_construction' ||
      id === 'electrical_mechanical'
  );
}

/**
 * Encodes `TenderScanPreferences` alongside regular `municipalRegions` so they
 * persist cleanly in the existing `users.municipalRegions` array on Convex
 * without requiring a blocking schema migration.
 */
export function serializeScanPrefsToRegions(
  cleanMunicipalRegions: string[],
  prefs: TenderScanPreferences
): string[] {
  const base = cleanMunicipalRegions.filter(
    (r) => !r.startsWith('__klerk_') && r.trim().length > 0
  );
  const sectorTags = prefs.sectors.map((s) => `${TAG_PREFIX_SECTOR}${s}`);
  const provinceTags = prefs.provinces.map(
    (p) => `${TAG_PREFIX_PROVINCE}${p}`
  );
  const typeTag = `${TAG_PREFIX_TYPE}${prefs.tenderType}`;
  const sortBy: TenderSortOption =
    prefs.sortBy && VALID_SORT_OPTIONS.has(prefs.sortBy)
      ? prefs.sortBy
      : 'best_match';
  const sortTag = `${TAG_PREFIX_SORT}${sortBy}`;
  const kwTag = prefs.customKeywords.trim()
    ? `${TAG_PREFIX_KEYWORDS}${prefs.customKeywords.trim().slice(0, 120)}`
    : null;
  const configuredTag = `${TAG_PREFIX_CONFIGURED}${prefs.configuredAt || new Date().toISOString()}`;

  return [
    ...base,
    ...sectorTags,
    ...provinceTags,
    typeTag,
    sortTag,
    ...(kwTag ? [kwTag] : []),
    configuredTag,
  ];
}

export function parseScanPrefsFromRegions(
  rawRegions: string[] | undefined | null,
  cidbGrade = ''
): {
  municipalRegions: string[];
  scanPreferences: TenderScanPreferences | null;
} {
  if (!Array.isArray(rawRegions) || rawRegions.length === 0) {
    return { municipalRegions: [], scanPreferences: null };
  }

  const municipalRegions: string[] = [];
  const sectors: TenderSectorId[] = [];
  const provinces: string[] = [];
  let tenderType: TenderTypeFilter = 'all';
  let sortBy: TenderSortOption = 'best_match';
  let customKeywords = '';
  let configuredAt = '';

  for (const item of rawRegions) {
    if (!item) continue;
    if (item.startsWith(TAG_PREFIX_SECTOR)) {
      const id = item.slice(TAG_PREFIX_SECTOR.length) as TenderSectorId;
      if (VALID_SECTOR_IDS.has(id) && !sectors.includes(id)) {
        sectors.push(id);
      }
    } else if (item.startsWith(TAG_PREFIX_PROVINCE)) {
      const prov = item.slice(TAG_PREFIX_PROVINCE.length);
      if (prov && !provinces.includes(prov)) {
        provinces.push(prov);
      }
    } else if (item.startsWith(TAG_PREFIX_TYPE)) {
      const t = item.slice(TAG_PREFIX_TYPE.length) as TenderTypeFilter;
      if (t === 'all' || t === 'rfb' || t === 'rfq' || t === 'rfp') {
        tenderType = t;
      }
    } else if (item.startsWith(TAG_PREFIX_SORT)) {
      const s = item.slice(TAG_PREFIX_SORT.length) as TenderSortOption;
      if (VALID_SORT_OPTIONS.has(s)) {
        sortBy = s;
      }
    } else if (item.startsWith(TAG_PREFIX_KEYWORDS)) {
      customKeywords = item.slice(TAG_PREFIX_KEYWORDS.length);
    } else if (item.startsWith(TAG_PREFIX_CONFIGURED)) {
      configuredAt = item.slice(TAG_PREFIX_CONFIGURED.length);
    } else if (!item.startsWith('__klerk_')) {
      municipalRegions.push(item);
    }
  }

  if (sectors.length === 0 && !configuredAt) {
    return { municipalRegions, scanPreferences: null };
  }

  return {
    municipalRegions,
    scanPreferences: {
      sectors: sectors.length > 0 ? sectors : ['civil_roads'],
      provinces: provinces.length > 0 ? provinces : ['All South Africa'],
      tenderType,
      sortBy,
      cidbGrade,
      customKeywords,
      configuredAt: configuredAt || new Date().toISOString(),
    },
  };
}

/**
 * Deterministic keyword & phrase classifier used as both a fast local scorer
 * and a reliable fallback when the free-tier LLM returns non-JSON or times out.
 */
export function recommendSectorsHeuristic(
  businessDescription: string
): Omit<SectorRecommendationResult, 'modelUsed'> {
  const normalized = businessDescription.toLowerCase();
  const scores = new Map<TenderSectorId, { score: number; matched: string[] }>();

  for (const sector of TENDER_SECTORS) {
    let score = 0;
    const matched: string[] = [];
    for (const kw of sector.keywords) {
      if (normalized.includes(kw)) {
        score += kw.includes(' ') ? 3 : 2;
        matched.push(kw);
      }
    }
    if (score > 0) {
      scores.set(sector.id, { score, matched });
    }
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(([id]) => id);

  const recommendedSectorIds: TenderSectorId[] =
    ranked.length > 0 ? ranked : ['supplies_goods', 'facilities_security'];

  let suggestedCidbGrade = '';
  const cidbMatch = businessDescription.match(
    /\b([1-9])\s*(CE|GB|EP|EB|ME|SQ|SH|SF)(?:\s*PE)?\b/i
  );
  if (cidbMatch) {
    suggestedCidbGrade = `${cidbMatch[1]}${cidbMatch[2].toUpperCase()}`;
  } else if (recommendedSectorIds.includes('civil_roads')) {
    suggestedCidbGrade = '4CE';
  } else if (recommendedSectorIds.includes('building_construction')) {
    suggestedCidbGrade = '4GB';
  } else if (recommendedSectorIds.includes('electrical_mechanical')) {
    suggestedCidbGrade = '4EP';
  }

  const sectorLabels = recommendedSectorIds
    .map((id) => TENDER_SECTORS.find((s) => s.id === id)?.label ?? id)
    .join(', ');

  const rationale =
    ranked.length > 0
      ? `Based on your description, your work aligns with ${sectorLabels} on National Treasury eTenders.`
      : `Matched general government procurement categories (${sectorLabels}). Select or adjust any additional sectors that apply to your business.`;

  return {
    recommendedSectorIds,
    suggestedCidbGrade,
    rationale,
    disclaimer: AI_SECTOR_DISCLAIMER,
  };
}

/**
 * Parses an LLM response (JSON or free-text) into validated `TenderSectorId[]`
 * and falls back to `recommendSectorsHeuristic` if no valid sector IDs are found.
 */
export function parseAISectorRecommendation(
  rawAiText: string,
  businessDescription: string,
  modelUsed: string
): SectorRecommendationResult {
  const heuristic = recommendSectorsHeuristic(businessDescription);

  if (!rawAiText || !rawAiText.trim()) {
    return { ...heuristic, modelUsed };
  }

  try {
    const cleaned = rawAiText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as {
        sectors?: unknown;
        recommendedSectorIds?: unknown;
        cidbGrade?: unknown;
        suggestedCidbGrade?: unknown;
        rationale?: unknown;
      };

      const rawList = Array.isArray(parsed.recommendedSectorIds)
        ? parsed.recommendedSectorIds
        : Array.isArray(parsed.sectors)
          ? parsed.sectors
          : [];

      const validIds = rawList
        .map((item) => String(item).trim() as TenderSectorId)
        .filter((id) => VALID_SECTOR_IDS.has(id));

      if (validIds.length > 0) {
        const suggestedCidbGrade =
          typeof parsed.suggestedCidbGrade === 'string'
            ? parsed.suggestedCidbGrade.trim()
            : typeof parsed.cidbGrade === 'string'
              ? parsed.cidbGrade.trim()
              : heuristic.suggestedCidbGrade;
        const rationale =
          typeof parsed.rationale === 'string' && parsed.rationale.trim()
            ? parsed.rationale.trim()
            : heuristic.rationale;

        return {
          recommendedSectorIds: [...new Set(validIds)].slice(0, 3),
          suggestedCidbGrade,
          rationale,
          modelUsed,
          disclaimer: AI_SECTOR_DISCLAIMER,
        };
      }
    }
  } catch {
    // Fall through to text extraction
  }

  const mentionedIds: TenderSectorId[] = [];
  const lower = rawAiText.toLowerCase();
  for (const sector of TENDER_SECTORS) {
    if (
      lower.includes(sector.id) ||
      lower.includes(sector.label.toLowerCase()) ||
      lower.includes(sector.shortLabel.toLowerCase())
    ) {
      mentionedIds.push(sector.id);
    }
  }

  if (mentionedIds.length > 0) {
    return {
      recommendedSectorIds: mentionedIds.slice(0, 3),
      suggestedCidbGrade: heuristic.suggestedCidbGrade,
      rationale: heuristic.rationale,
      modelUsed,
      disclaimer: AI_SECTOR_DISCLAIMER,
    };
  }

  return {
    ...heuristic,
    modelUsed,
  };
}

export interface RawETendersOpportunity {
  id?: number | string;
  ocid?: string;
  tender_No?: string;
  description?: string;
  category?: string;
  type?: string;
  organ_of_State?: string;
  department?: string;
  status?: string;
  closing_Date?: string;
  date_Published?: string;
  compulsory_briefing_session?: string | null;
  briefingSession?: boolean;
  briefingCompulsory?: boolean;
  briefingVenue?: string | null;
  town?: string | null;
  surburb?: string | null;
  province?: string | null;
  conditions?: string | null;
  estimatedValueZarOverride?: number | null;
  additionalProcurementCategories?: string[] | null;
  classificationDescription?: string | null;
  supportDocument?: Array<{
    supportDocumentID?: string;
    fileName?: string;
    extension?: string;
  }> | null;
}

export interface RawOcdsRelease {
  ocid?: string;
  id?: string;
  date?: string;
  buyer?: {
    id?: string;
    name?: string;
  };
  parties?: Array<{
    id?: string;
    name?: string;
    roles?: string[];
    address?: {
      region?: string;
      locality?: string;
      streetAddress?: string;
    };
  }>;
  awards?: Array<{
    value?: {
      amount?: number;
      currency?: string;
    };
  }>;
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    mainProcurementCategory?: string;
    additionalProcurementCategories?: string[];
    procurementMethod?: string;
    procurementMethodDetails?: string;
    eligibilityCriteria?: string;
    classification?: {
      scheme?: string;
      id?: string;
      description?: string;
    };
    value?: {
      amount?: number;
      currency?: string;
    };
    procuringEntity?: {
      id?: string;
      name?: string;
    };
    tenderPeriod?: {
      startDate?: string;
      endDate?: string;
    };
    items?: Array<{
      id?: string;
      description?: string;
      classification?: {
        description?: string;
      };
      deliveryAddress?: {
        region?: string;
        locality?: string;
        streetAddress?: string;
      };
    }>;
    documents?: Array<{
      id?: string;
      title?: string;
      url?: string;
    }>;
  };
}

const CIDB_UPPER_LIMIT_ZAR: Record<number, number> = {
  1: 500_000,
  2: 1_000_000,
  3: 3_000_000,
  4: 6_000_000,
  5: 10_000_000,
  6: 20_000_000,
  7: 60_000_000,
  8: 200_000_000,
  9: 280_000_000,
};

export function extractCidbGradeFromText(
  text: string,
  sectorIds: TenderSectorId[]
): string {
  const match = text.match(
    /\b([1-9])\s*(CE|GB|ME|EP|EB|SQ|SH|SF)(?:\s*(PE))?\b/i
  );
  if (match) {
    const level = match[1];
    const cls = match[2].toUpperCase();
    return `${level}${cls}`;
  }

  const reverseMatch = text.match(
    /\bCIDB\s+(?:grade|grading|designation)?\s*(?:of\s+)?([1-9])\s*(CE|GB|ME|EP|EB|SQ|SH|SF)\b/i
  );
  if (reverseMatch) {
    return `${reverseMatch[1]}${reverseMatch[2].toUpperCase()}`;
  }

  if (sectorIds.includes('civil_roads')) return 'CIDB CE';
  if (sectorIds.includes('building_construction')) return 'CIDB GB';
  if (sectorIds.includes('electrical_mechanical')) return 'CIDB EP/EB';
  return 'Open / Non-CIDB';
}

function estimateTenderValueZar(
  cidbGrade: string,
  tenderType: string,
  seedString: string
): number {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash * 31 + seedString.charCodeAt(i)) >>> 0;
  }
  const factor = 0.62 + (hash % 33) / 100; // 0.62 .. 0.94

  const levelMatch = cidbGrade.match(/^([1-9])/);
  if (levelMatch) {
    const lvl = Number(levelMatch[1]);
    const cap = CIDB_UPPER_LIMIT_ZAR[lvl] ?? 6_000_000;
    return Math.round((cap * factor) / 10_000) * 10_000;
  }

  const lowerType = tenderType.toLowerCase();
  if (lowerType.includes('quotation') || lowerType.includes('rfq')) {
    return Math.round((450_000 + (hash % 1_200_000)) / 5_000) * 5_000;
  }

  return Math.round((2_400_000 + (hash % 14_500_000)) / 25_000) * 25_000;
}

function cleanTenderTitle(rawDescription: string, tenderNo: string): string {
  const cleaned = rawDescription
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return `Tender ${tenderNo}`;
  if (cleaned.length <= 130) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return `${cleaned.slice(0, 127).trim()}...`;
}

export function generateBoqForTender(
  tenderId: string,
  sectorId: TenderSectorId,
  estimatedValueZar: number,
  title: string
): BoQItem[] {
  const net = Math.max(250_000, estimatedValueZar);
  const pg = Math.round(net * 0.1);
  const core1 = Math.round(net * 0.45);
  const core2 = Math.round(net * 0.3);
  const closeout = Math.max(50_000, net - pg - core1 - core2);

  switch (sectorId) {
    case 'civil_roads':
    case 'building_construction':
      return [
        {
          id: `${tenderId}-boq-1`,
          itemCode: '1200',
          section: 'Section 1: Preliminary & General',
          description: 'Site establishment, OHS compliance file & insurance',
          unit: 'Sum',
          quantity: 1,
          rateZar: pg,
          amountZar: pg,
        },
        {
          id: `${tenderId}-boq-2`,
          itemCode: '3100',
          section: 'Section 2: Primary Works Execution',
          description: title.slice(0, 88),
          unit: 'Sum',
          quantity: 1,
          rateZar: core1,
          amountZar: core1,
        },
        {
          id: `${tenderId}-boq-3`,
          itemCode: '4200',
          section: 'Section 3: Materials, Plant & Specialist Sub-Works',
          description: 'SABS-compliant materials supply, delivery & installation',
          unit: 'Sum',
          quantity: 1,
          rateZar: core2,
          amountZar: core2,
        },
        {
          id: `${tenderId}-boq-4`,
          itemCode: '8100',
          section: 'Section 4: Testing, Commissioning & Close-Out',
          description: 'Quality assurance testing, as-built documentation & handover',
          unit: 'Sum',
          quantity: 1,
          rateZar: closeout,
          amountZar: closeout,
        },
      ];
    default:
      return [
        {
          id: `${tenderId}-boq-1`,
          itemCode: '0100',
          section: 'Section 1: Mobilisation & Project Onboarding',
          description: 'Contract SLA setup, compliance verification & project inception',
          unit: 'Sum',
          quantity: 1,
          rateZar: pg,
          amountZar: pg,
        },
        {
          id: `${tenderId}-boq-2`,
          itemCode: '0200',
          section: 'Section 2: Core Scope & Deliverables',
          description: title.slice(0, 88),
          unit: 'Sum',
          quantity: 1,
          rateZar: core1 + core2,
          amountZar: core1 + core2,
        },
        {
          id: `${tenderId}-boq-3`,
          itemCode: '0300',
          section: 'Section 3: Support, Reporting & SLA Close-Out',
          description: 'Ongoing SLA support, statutory reporting & quality sign-off',
          unit: 'Sum',
          quantity: 1,
          rateZar: closeout,
          amountZar: closeout,
        },
      ];
  }
}

const PROVINCE_MATCH_PATTERNS: Array<{
  province: string;
  patterns: RegExp[];
}> = [
  {
    province: 'Western Cape',
    patterns: [
      /\bwestern cape\b/i,
      /\bcape town\b/i,
      /\bgeorge\b/i,
      /\bstellenbosch\b/i,
      /\bpaarl\b/i,
      /\boverstrand\b/i,
      /\bdrakenstein\b/i,
      /\bmossel bay\b/i,
      /\bsaldanha\b/i,
      /\bbreede valley\b/i,
    ],
  },
  {
    province: 'Gauteng',
    patterns: [
      /\bgauteng\b/i,
      /\bjohannesburg\b/i,
      /\btshwane\b/i,
      /\bpretoria\b/i,
      /\bekurhuleni\b/i,
      /\bmogale city\b/i,
      /\bmidrand\b/i,
      /\bsandton\b/i,
      /\bsoweto\b/i,
      /\bemfuleni\b/i,
    ],
  },
  {
    province: 'KwaZulu-Natal',
    patterns: [
      /\bkwazulu[\s-]*natal\b/i,
      /\bkwa[\s-]*zulu[\s-]*natal\b/i,
      /\bkzn\b/i,
      /\bethekwini\b/i,
      /\bdurban\b/i,
      /\bpietermaritzburg\b/i,
      /\bmsunduzi\b/i,
      /\bnewcastle\b/i,
      /\brichards bay\b/i,
      /\bumhlathuze\b/i,
    ],
  },
  {
    province: 'Eastern Cape',
    patterns: [
      /\beastern cape\b/i,
      /\bnelson mandela bay\b/i,
      /\bgqeberha\b/i,
      /\bport elizabeth\b/i,
      /\bbuffalo city\b/i,
      /\beast london\b/i,
      /\bmthatha\b/i,
      /\bmakana\b/i,
      /\bkouga\b/i,
    ],
  },
  {
    province: 'Mpumalanga',
    patterns: [
      /\bmpumalanga\b/i,
      /\bmbombela\b/i,
      /\bnelspruit\b/i,
      /\bemalahleni\b/i,
      /\bsteve tshwete\b/i,
      /\bgovan mbeki\b/i,
    ],
  },
  {
    province: 'North West',
    patterns: [
      /\bnorth west\b/i,
      /\brustenburg\b/i,
      /\bmahikeng\b/i,
      /\bjb marks\b/i,
      /\bpotchefstroom\b/i,
      /\bmatlosana\b/i,
      /\bklerksdorp\b/i,
    ],
  },
  {
    province: 'Free State',
    patterns: [
      /\bfree state\b/i,
      /\bmangaung\b/i,
      /\bbloemfontein\b/i,
      /\bmatjhabeng\b/i,
      /\bwelkom\b/i,
    ],
  },
  {
    province: 'Limpopo',
    patterns: [
      /\blimpopo\b/i,
      /\bpolokwane\b/i,
      /\bthulamela\b/i,
      /\bmopani\b/i,
      /\bvhembe\b/i,
      /\bsekhukhune\b/i,
    ],
  },
  {
    province: 'Northern Cape',
    patterns: [
      /\bnorthern cape\b/i,
      /\bsol plaatje\b/i,
      /\bkimberley\b/i,
      /\bupington\b/i,
      /\bnamakwa\b/i,
    ],
  },
];

export function inferSaProvince(
  candidates: Array<string | null | undefined>
): string {
  const combined = candidates
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' ');
  if (!combined) return 'National';

  for (const entry of PROVINCE_MATCH_PATTERNS) {
    if (entry.patterns.some((re) => re.test(combined))) {
      return entry.province;
    }
  }
  return 'National';
}

function normalizeOcdsCategoryTokens(
  mainCat?: string | null,
  additionalCats?: string[] | null
): Array<'works' | 'goods' | 'services' | 'consultingServices'> {
  const tokens = new Set<'works' | 'goods' | 'services' | 'consultingServices'>();
  const rawList = [
    ...(mainCat ? [mainCat] : []),
    ...(Array.isArray(additionalCats) ? additionalCats : []),
  ];

  for (const raw of rawList) {
    const c = raw.toLowerCase().trim();
    if (!c) continue;
    if (c === 'works' || c.includes('construction') || c.includes('civil')) {
      tokens.add('works');
    } else if (c === 'goods' || c.includes('suppl')) {
      tokens.add('goods');
    } else if (c === 'consultingservices' || c.includes('consulting') || c.includes('professional')) {
      tokens.add('consultingServices');
    } else if (c === 'services' || c.includes('service')) {
      tokens.add('services');
    }
  }

  return [...tokens];
}

function mapOcdsCategoryToLabel(
  ocdsTokens: Array<'works' | 'goods' | 'services' | 'consultingServices'>
): string {
  if (ocdsTokens.includes('works')) return 'Construction';
  if (ocdsTokens.includes('goods')) return 'Supplies: General';
  if (ocdsTokens.includes('consultingServices')) return 'Services: Professional';
  if (ocdsTokens.includes('services')) return 'Services: General';
  return 'Services: General';
}

function sortScoredTenders(
  scored: Array<{
    tender: TenderMatch;
    primarySectorId: TenderSectorId;
    rawScore: number;
    closingMs: number;
    publishedMs: number;
  }>,
  sortBy: TenderSortOption
) {
  scored.sort((a, b) => {
    switch (sortBy) {
      case 'closing_soon': {
        const diff = a.closingMs - b.closingMs;
        if (diff !== 0) return diff;
        return b.rawScore - a.rawScore;
      }
      case 'highest_value': {
        const diff = b.tender.estimatedValueZar - a.tender.estimatedValueZar;
        if (diff !== 0) return diff;
        return b.rawScore - a.rawScore;
      }
      case 'newest': {
        const diff = b.publishedMs - a.publishedMs;
        if (diff !== 0) return diff;
        return b.rawScore - a.rawScore;
      }
      case 'best_match':
      default: {
        const diff = b.rawScore - a.rawScore;
        if (diff !== 0) return diff;
        return a.closingMs - b.closingMs;
      }
    }
  });
}

/**
 * Matches, scores, and sorts National Treasury tender opportunities (enriched with
 * OCDS release fields) against the user's selected `TenderScanPreferences` and
 * `ComplianceSummary`.
 */
export function matchAndScoreETendersOpportunities(
  rows: RawETendersOpportunity[],
  prefs: TenderScanPreferences,
  compliance: ComplianceSummary,
  municipalRegions: string[] = []
): {
  tenders: TenderMatch[];
  boqsByTender: Record<string, BoQItem[]>;
} {
  const selectedSectors = TENDER_SECTORS.filter((s) =>
    prefs.sectors.includes(s.id)
  );
  const activeSectors =
    selectedSectors.length > 0 ? selectedSectors : [TENDER_SECTORS[0]];

  const wantsAllProvinces =
    prefs.provinces.length === 0 ||
    prefs.provinces.includes('All South Africa');
  const provinceSet = new Set(
    prefs.provinces.map((p) => p.toLowerCase().trim())
  );
  const customKwList = prefs.customKeywords
    .toLowerCase()
    .split(/[,;\s]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 3);
  const userRegionTokens = municipalRegions
    .filter((r) => !r.startsWith('__klerk_'))
    .map((r) => r.toLowerCase().trim())
    .filter(Boolean);

  const nowMs = Date.now();
  const hasFutureClosingTenders = rows.some((r) => {
    if (!r.closing_Date) return false;
    const ms = new Date(r.closing_Date).getTime();
    return Number.isFinite(ms) && ms > nowMs - 86_400_000;
  });

  const scored: Array<{
    tender: TenderMatch;
    primarySectorId: TenderSectorId;
    rawScore: number;
    closingMs: number;
    publishedMs: number;
  }> = [];

  for (const row of rows) {
    const tenderNo = (row.tender_No ?? '').trim();
    const rawDesc = (row.description ?? '').trim();
    if (!tenderNo || !rawDesc) continue;

    // Exclude already-closed/cancelled tenders when live open tenders exist
    const parsedClosingMs = row.closing_Date
      ? new Date(row.closing_Date).getTime()
      : NaN;
    if (
      hasFutureClosingTenders &&
      Number.isFinite(parsedClosingMs) &&
      parsedClosingMs < nowMs - 86_400_000
    ) {
      continue;
    }

    const category = (row.category ?? '').trim();
    const categoryLower = category.toLowerCase();
    const ocdsTokens = normalizeOcdsCategoryTokens(
      category,
      row.additionalProcurementCategories
    );
    const organ = (
      row.organ_of_State ??
      row.department ??
      'Organ of State'
    ).trim();
    const inferredProvince =
      row.province && row.province !== 'National'
        ? row.province.trim()
        : inferSaProvince([row.province, organ, row.town, rawDesc]);
    const town = (row.town ?? row.surburb ?? inferredProvince).trim();
    const tenderType = (row.type ?? 'Request for Bid(Open-Tender)').trim();
    const conditions = (row.conditions ?? '').trim();
    const classificationDesc = (row.classificationDescription ?? '').trim();
    const combinedText = `${rawDesc} ${category} ${classificationDesc} ${organ} ${conditions} ${town}`.toLowerCase();

    // Filter by tenderType if specified
    if (prefs.tenderType !== 'all') {
      const lowerType = tenderType.toLowerCase();
      if (prefs.tenderType === 'rfq' && !lowerType.includes('quotation') && !lowerType.includes('rfq')) {
        continue;
      }
      if (prefs.tenderType === 'rfb' && !lowerType.includes('bid') && !lowerType.includes('open tender')) {
        continue;
      }
      if (prefs.tenderType === 'rfp' && !lowerType.includes('proposal') && !lowerType.includes('rfp')) {
        continue;
      }
    }

    // Score sector match using both eTenders category labels & OCDS procurement categories
    let bestSectorScore = 0;
    let bestSector: TenderSectorDefinition = activeSectors[0];

    for (const sector of activeSectors) {
      let sScore = 0;
      if (
        sector.etendersCategories.some(
          (cat) => cat.toLowerCase() === categoryLower
        )
      ) {
        sScore += 45;
      } else if (
        categoryLower &&
        sector.etendersCategories.some((cat) =>
          categoryLower.includes(cat.toLowerCase().split(':')[0])
        )
      ) {
        sScore += 22;
      }

      if (ocdsTokens.some((tok) => sector.ocdsCategories.includes(tok))) {
        sScore += 20;
      }

      for (const kw of sector.keywords) {
        if (combinedText.includes(kw)) {
          sScore += kw.includes(' ') ? 14 : 9;
        }
      }

      if (sScore > bestSectorScore) {
        bestSectorScore = sScore;
        bestSector = sector;
      }
    }

    for (const kw of customKwList) {
      if (combinedText.includes(kw)) {
        bestSectorScore += 15;
      }
    }

    if (bestSectorScore === 0) {
      continue;
    }

    // Check province preference
    const provinceLower = inferredProvince.toLowerCase();
    if (!wantsAllProvinces) {
      const matchesProvince =
        provinceSet.has(provinceLower) || provinceLower === 'national';
      const matchesTown = userRegionTokens.some((tok) =>
        combinedText.includes(tok)
      );
      if (!matchesProvince && !matchesTown) {
        continue;
      }
      if (provinceSet.has(provinceLower)) {
        bestSectorScore += 18;
      }
    }

    if (userRegionTokens.some((tok) => combinedText.includes(tok))) {
      bestSectorScore += 12;
    }

    const extractedCidb = extractCidbGradeFromText(
      `${conditions} ${rawDesc}`,
      [bestSector.id]
    );
    if (
      prefs.cidbGrade &&
      extractedCidb.toLowerCase().includes(prefs.cidbGrade.slice(0, 2).toLowerCase())
    ) {
      bestSectorScore += 12;
    }

    const matchScore = Math.min(
      99,
      Math.max(68, 62 + Math.round(bestSectorScore / 2.2))
    );
    const id = `ET-LIVE-${row.id ?? tenderNo.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    const doc = row.supportDocument?.[0];
    const portalUrl =
      doc?.supportDocumentID && doc?.fileName
        ? `https://www.etenders.gov.za/home/Download?blobName=${encodeURIComponent(
            doc.supportDocumentID
          )}${doc.extension ?? '.pdf'}&downloadedFileName=${encodeURIComponent(
            doc.fileName
          )}`
        : row.ocid
          ? `https://ocds-api.etenders.gov.za/api/OCDSReleases/release/${encodeURIComponent(row.ocid)}`
          : 'https://www.etenders.gov.za/Home/opportunities?id=1';

    const closingMs = Number.isFinite(parsedClosingMs)
      ? parsedClosingMs
      : nowMs + 14 * 86_400_000;
    const closingDate = new Date(closingMs).toISOString();

    const parsedPublishedMs = row.date_Published
      ? new Date(row.date_Published).getTime()
      : NaN;
    const publishedMs = Number.isFinite(parsedPublishedMs)
      ? parsedPublishedMs
      : nowMs - 2 * 86_400_000;
    const publishedDate = new Date(publishedMs).toISOString();

    const briefingDate = row.compulsory_briefing_session
      ? new Date(row.compulsory_briefing_session).toISOString()
      : null;

    const explicitOcdsValue =
      typeof row.estimatedValueZarOverride === 'number' &&
      row.estimatedValueZarOverride > 0
        ? Math.round(row.estimatedValueZarOverride)
        : null;

    const estimatedValueZar =
      explicitOcdsValue ??
      estimateTenderValueZar(
        extractedCidb,
        tenderType,
        `${tenderNo}-${rawDesc}`
      );

    const summaryParts = [
      `${category || bestSector.label} (${tenderType}) issued by ${organ} (${inferredProvince}${
        town && town !== inferredProvince ? ` · ${town}` : ''
      }).`,
    ];
    if (conditions) {
      summaryParts.push(
        conditions.replace(/\s+/g, ' ').trim().slice(0, 220)
      );
    }
    if (doc?.fileName) {
      summaryParts.push(`Official bid pack: ${doc.fileName}.`);
    }

    scored.push({
      rawScore: bestSectorScore,
      primarySectorId: bestSector.id,
      closingMs,
      publishedMs,
      tender: {
        id,
        tenderNumber: tenderNo,
        title: cleanTenderTitle(rawDesc, tenderNo),
        municipality: organ,
        region: town || inferredProvince,
        cidbGrade: extractedCidb,
        closingDate,
        publishedDate,
        ocid: row.ocid,
        procurementCategory: category || mapOcdsCategoryToLabel(ocdsTokens),
        briefingDate,
        briefingCompulsory: Boolean(row.briefingCompulsory),
        estimatedValueZar,
        matchScore,
        status: 'matched',
        portalUrl,
        complianceReady: compliance.isBidReady,
        complianceBlocks: compliance.blockingAlerts,
        summary: summaryParts.join(' '),
        sbdFormsRequired: ['SBD 1', 'SBD 4', 'SBD 6.1'],
      },
    });
  }

  const sortBy: TenderSortOption =
    prefs.sortBy && VALID_SORT_OPTIONS.has(prefs.sortBy)
      ? prefs.sortBy
      : 'best_match';
  sortScoredTenders(scored, sortBy);

  const top = scored.slice(0, 8);

  const tenders: TenderMatch[] = top.map((entry, idx) => ({
    ...entry.tender,
    status: idx === 0 ? 'staging' : 'matched',
  }));

  const boqsByTender: Record<string, BoQItem[]> = {};
  for (const entry of top) {
    boqsByTender[entry.tender.id] = generateBoqForTender(
      entry.tender.id,
      entry.primarySectorId,
      entry.tender.estimatedValueZar,
      entry.tender.title
    );
  }

  return { tenders, boqsByTender };
}

/**
 * Maps National Treasury OCDS API releases into `RawETendersOpportunity` rows
 * preserving `ocid`, `tender.value.amount`, `additionalProcurementCategories`,
 * `release.date`, `classification`, and inferred South African province/locality.
 */
export function mapOcdsReleasesToOpportunities(
  releases: RawOcdsRelease[]
): RawETendersOpportunity[] {
  return releases
    .filter((rel) => {
      const st = (rel.tender?.status ?? '').toLowerCase();
      return st !== 'cancelled' && st !== 'complete' && st !== 'unsuccessful';
    })
    .map((rel) => {
      const t = rel.tender ?? {};
      const ocdsTokens = normalizeOcdsCategoryTokens(
        t.mainProcurementCategory,
        t.additionalProcurementCategories
      );
      const mappedCategory = mapOcdsCategoryToLabel(ocdsTokens);

      const organ = (
        t.procuringEntity?.name ??
        rel.buyer?.name ??
        'Organ of State'
      ).trim();
      const partyAddr = rel.parties?.find(
        (p) => p.address?.region || p.address?.locality
      )?.address;
      const itemAddr = t.items?.find(
        (i) => i.deliveryAddress?.region || i.deliveryAddress?.locality
      )?.deliveryAddress;

      const province = inferSaProvince([
        itemAddr?.region,
        partyAddr?.region,
        organ,
        t.description,
      ]);
      const town = (
        itemAddr?.locality ??
        partyAddr?.locality ??
        province
      ).trim();

      const rawValueAmount =
        typeof t.value?.amount === 'number' && t.value.amount > 0
          ? t.value.amount
          : typeof rel.awards?.[0]?.value?.amount === 'number' &&
              rel.awards[0].value.amount > 0
            ? rel.awards[0].value.amount
            : null;

      const firstDoc = t.documents?.[0];
      const blobMatch = firstDoc?.url?.match(/blobName=([^.&]+)(\.[a-zA-Z0-9]+)?/);
      const classificationDescription =
        t.classification?.description ??
        t.items?.[0]?.classification?.description ??
        null;

      return {
        id: t.id ?? rel.ocid ?? rel.id,
        ocid: rel.ocid,
        tender_No: t.title ?? t.id ?? rel.ocid ?? 'OCDS-TENDER',
        description: t.description ?? t.title ?? '',
        category: mappedCategory,
        additionalProcurementCategories: t.additionalProcurementCategories ?? null,
        classificationDescription,
        type: t.procurementMethodDetails ?? t.procurementMethod ?? 'Open Tender',
        organ_of_State: organ,
        status: t.status ?? 'Published',
        closing_Date: t.tenderPeriod?.endDate,
        date_Published: rel.date ?? t.tenderPeriod?.startDate,
        province,
        town,
        conditions: t.eligibilityCriteria ?? '',
        estimatedValueZarOverride: rawValueAmount,
        supportDocument:
          blobMatch && firstDoc?.title
            ? [
                {
                  supportDocumentID: blobMatch[1],
                  extension: blobMatch[2] ?? '.pdf',
                  fileName: firstDoc.title,
                },
              ]
            : null,
      };
    });
}

function mergeOpportunitySources(
  paginatedRows: RawETendersOpportunity[],
  ocdsRows: RawETendersOpportunity[]
): RawETendersOpportunity[] {
  const ocdsByTenderNo = new Map<string, RawETendersOpportunity>();
  const ocdsById = new Map<string, RawETendersOpportunity>();

  for (const row of ocdsRows) {
    const noKey = (row.tender_No ?? '').trim().toLowerCase();
    const idKey = row.id !== undefined ? String(row.id) : '';
    if (noKey) ocdsByTenderNo.set(noKey, row);
    if (idKey) ocdsById.set(idKey, row);
  }

  const seenKeys = new Set<string>();
  const merged: RawETendersOpportunity[] = [];

  for (const row of paginatedRows) {
    const noKey = (row.tender_No ?? '').trim().toLowerCase();
    const idKey = row.id !== undefined ? String(row.id) : '';
    const match =
      (noKey ? ocdsByTenderNo.get(noKey) : undefined) ??
      (idKey ? ocdsById.get(idKey) : undefined);

    if (noKey) seenKeys.add(noKey);
    if (idKey) seenKeys.add(idKey);

    merged.push(
      match
        ? {
            ...row,
            ocid: match.ocid ?? row.ocid,
            date_Published: row.date_Published ?? match.date_Published,
            additionalProcurementCategories:
              match.additionalProcurementCategories ??
              row.additionalProcurementCategories,
            classificationDescription:
              match.classificationDescription ?? row.classificationDescription,
            estimatedValueZarOverride:
              row.estimatedValueZarOverride ?? match.estimatedValueZarOverride,
            conditions: row.conditions || match.conditions,
          }
        : row
    );
  }

  for (const row of ocdsRows) {
    const noKey = (row.tender_No ?? '').trim().toLowerCase();
    const idKey = row.id !== undefined ? String(row.id) : '';
    if ((noKey && seenKeys.has(noKey)) || (idKey && seenKeys.has(idKey))) {
      continue;
    }
    if (noKey) seenKeys.add(noKey);
    if (idKey) seenKeys.add(idKey);
    merged.push(row);
  }

  return merged;
}

/**
 * Fetches live active South African government tenders from BOTH National Treasury's
 * `PaginatedTenderOpportunities` feed and `OCDSReleases` API in parallel, enriches
 * each opportunity with OCDS fields (value, categories, release date, region),
 * then matches and sorts them against the user's `TenderScanPreferences`.
 */
export async function fetchLiveETendersForPreferences(
  prefs: TenderScanPreferences,
  compliance: ComplianceSummary,
  municipalRegions: string[] = []
): Promise<{
  tenders: TenderMatch[];
  boqsByTender: Record<string, BoQItem[]>;
  source: 'etenders-live' | 'ocds-live';
}> {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  // Keep OCDS query window compact (6 days) to avoid NT OCDS API 500 timeouts
  const dateFrom = new Date(now.getTime() - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const ocdsUrl = `https://ocds-api.etenders.gov.za/api/OCDSReleases?PageNumber=1&PageSize=100&dateFrom=${dateFrom}&dateTo=${dateTo}`;

  const [paginatedRes, ocdsRes] = await Promise.allSettled([
    fetch(
      'https://www.etenders.gov.za/Home/PaginatedTenderOpportunities?draw=1&start=0&length=150&status=1',
      {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(9_000),
        cache: 'no-store',
      }
    ),
    fetch(ocdsUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9_000),
      cache: 'no-store',
    }),
  ]);

  let paginatedRows: RawETendersOpportunity[] = [];
  if (paginatedRes.status === 'fulfilled' && paginatedRes.value.ok) {
    try {
      const payload = (await paginatedRes.value.json()) as {
        data?: RawETendersOpportunity[];
      };
      if (Array.isArray(payload.data)) {
        paginatedRows = payload.data;
      }
    } catch (err) {
      console.warn('[eTenders Live] PaginatedTenderOpportunities parse error:', err);
    }
  }

  let ocdsRows: RawETendersOpportunity[] = [];
  if (ocdsRes.status === 'fulfilled' && ocdsRes.value.ok) {
    try {
      const ocdsPayload = (await ocdsRes.value.json()) as {
        releases?: RawOcdsRelease[];
      };
      if (Array.isArray(ocdsPayload.releases)) {
        ocdsRows = mapOcdsReleasesToOpportunities(ocdsPayload.releases);
      }
    } catch (err) {
      console.warn('[eTenders Live] OCDSReleases parse error:', err);
    }
  }

  const opportunities = mergeOpportunitySources(paginatedRows, ocdsRows);
  const source: 'etenders-live' | 'ocds-live' =
    paginatedRows.length > 0 ? 'etenders-live' : 'ocds-live';

  let matched = matchAndScoreETendersOpportunities(
    opportunities,
    prefs,
    compliance,
    municipalRegions
  );

  // If user selected a narrow province filter that returned 0 results,
  // relax province filter to 'All South Africa' so they still receive real live sector matches.
  if (
    matched.tenders.length === 0 &&
    opportunities.length > 0 &&
    !prefs.provinces.includes('All South Africa')
  ) {
    matched = matchAndScoreETendersOpportunities(
      opportunities,
      { ...prefs, provinces: ['All South Africa'] },
      compliance,
      municipalRegions
    );
  }

  return {
    ...matched,
    source,
  };
}
