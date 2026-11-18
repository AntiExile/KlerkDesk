import type { BlobShape, EyeShape } from 'open-mascot';
import type { ApprovalShieldState, ComplianceSummary, TenderMatch } from '@/types';

export type KlerkMascotMood =
  | 'idle'
  | 'scanning'
  | 'waiting_approval'
  | 'approved'
  | 'blocked';

export type ThreadMascotVariant =
  | 'thread_amber'
  | 'thread_sky'
  | 'thread_violet'
  | 'thread_emerald'
  | 'thread_rose'
  | 'thread_teal';

export type KlerkMascotVariant =
  | 'chief'
  | 'scout'
  | 'shield'
  | ThreadMascotVariant;

export interface KlerkMascotVariantConfig {
  shape: BlobShape;
  color: string;
  eyeColor: string;
  eyeShape?: EyeShape;
  label: string;
}

export const KLERK_MASCOT_VARIANTS: Record<
  KlerkMascotVariant,
  KlerkMascotVariantConfig
> = {
  chief: {
    shape: 'drop',
    color: '#34D399',
    eyeColor: '#091510',
    label: 'KlerkDesk Chief of Staff',
  },
  scout: {
    shape: 'soft',
    color: '#10B981',
    eyeColor: '#091510',
    label: 'KlerkDesk Tender Scout',
  },
  shield: {
    shape: 'compact',
    color: '#6EE7B7',
    eyeColor: '#091510',
    label: 'KlerkDesk Approval Shield',
  },
  thread_amber: {
    shape: 'compact',
    color: '#FBBF24',
    eyeColor: '#1A1104',
    eyeShape: 'oval',
    label: 'Amber Tender Mascot',
  },
  thread_sky: {
    shape: 'tall',
    color: '#38BDF8',
    eyeColor: '#061523',
    eyeShape: 'capsule',
    label: 'Sky Tender Mascot',
  },
  thread_violet: {
    shape: 'round',
    color: '#A78BFA',
    eyeColor: '#130D24',
    eyeShape: 'oval',
    label: 'Violet Tender Mascot',
  },
  thread_emerald: {
    shape: 'soft',
    color: '#10B981',
    eyeColor: '#091510',
    eyeShape: 'capsule',
    label: 'Emerald Tender Mascot',
  },
  thread_rose: {
    shape: 'wide',
    color: '#FB7185',
    eyeColor: '#23070D',
    eyeShape: 'oval',
    label: 'Rose Tender Mascot',
  },
  thread_teal: {
    shape: 'large',
    color: '#2DD4BF',
    eyeColor: '#041C19',
    eyeShape: 'capsule',
    label: 'Teal Tender Mascot',
  },
};

export const THREAD_MASCOT_VARIANTS: readonly ThreadMascotVariant[] = [
  'thread_amber',
  'thread_sky',
  'thread_violet',
  'thread_emerald',
  'thread_rose',
  'thread_teal',
];

function hashStringFnv1a(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Assigns each tender thread a distinct mascot character deterministically,
 * avoiding visual collisions among visible threads whenever the thread count
 * is within the preset roster size.
 */
export function resolveTenderMascotVariants(
  tenderIds: string[]
): Record<string, ThreadMascotVariant> {
  const result: Record<string, ThreadMascotVariant> = {};
  const used = new Set<ThreadMascotVariant>();
  const pool = THREAD_MASCOT_VARIANTS;

  for (const tenderId of tenderIds) {
    if (result[tenderId]) continue;
    const preferredIdx = hashStringFnv1a(tenderId) % pool.length;
    let chosen = pool[preferredIdx];

    if (used.size < pool.length && used.has(chosen)) {
      for (let offset = 1; offset < pool.length; offset += 1) {
        const candidate = pool[(preferredIdx + offset) % pool.length];
        if (!used.has(candidate)) {
          chosen = candidate;
          break;
        }
      }
    }

    used.add(chosen);
    result[tenderId] = chosen;
  }

  return result;
}

export function getTenderMascotVariant(
  tenderId: string,
  allTenderIds?: string[]
): ThreadMascotVariant {
  if (allTenderIds && allTenderIds.length > 0) {
    const map = resolveTenderMascotVariants(allTenderIds);
    if (map[tenderId]) return map[tenderId];
  }
  const idx = hashStringFnv1a(tenderId) % THREAD_MASCOT_VARIANTS.length;
  return THREAD_MASCOT_VARIANTS[idx];
}

export function deriveTenderThreadMood(
  status: TenderMatch['status']
): KlerkMascotMood {
  switch (status) {
    case 'submitted':
      return 'approved';
    case 'pending_approval':
      return 'waiting_approval';
    case 'staging':
      return 'scanning';
    case 'matched':
    default:
      return 'idle';
  }
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export interface BoundingBoxLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Normalizes a window pointer position relative to the mascot's bounding box
 * into open-mascot's [-1, 1] look-target coordinate space.
 */
export function normalizeLookTarget(
  clientX: number,
  clientY: number,
  rect: BoundingBoxLike
): { x: number; y: number } {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return { x: 0, y: 0 };
  }
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radiusX = Math.max(rect.width * 2.2, 220);
  const radiusY = Math.max(rect.height * 2.2, 220);

  return {
    x: clampUnit((clientX - centerX) / radiusX),
    y: clampUnit((clientY - centerY) / radiusY),
  };
}

export interface WorkspaceMoodInput {
  compliance: Pick<ComplianceSummary, 'docs' | 'blockingAlerts'>;
  isScanning: boolean;
  approvals: Pick<ApprovalShieldState, 'status'>[];
  justApproved: boolean;
}

/**
 * Derives the workspace mascot mood in strict priority order:
 * 1. blocked — expired compliance document or active blocking alert
 * 2. scanning — live AI audit, OCDS portal scan, or chat response streaming
 * 3. waiting_approval — ≥1 Approval Shield record awaiting user sign-off
 * 4. approved — 3-second celebratory state immediately after Approval Shield sign-off
 * 5. idle — calm default
 */
export function deriveWorkspaceMascotMood({
  compliance,
  isScanning,
  approvals,
  justApproved,
}: WorkspaceMoodInput): KlerkMascotMood {
  const hasExpiredDoc = compliance.docs.some((doc) => doc.status === 'expired');
  const hasActiveBlockingAlert = compliance.blockingAlerts.some(
    (alert) => !alert.toLowerCase().includes('document not uploaded yet')
  );

  if (hasExpiredDoc || hasActiveBlockingAlert) {
    return 'blocked';
  }

  if (isScanning) {
    return 'scanning';
  }

  const hasPendingApproval = approvals.some(
    (approval) => approval.status === 'pending_approval'
  );
  if (hasPendingApproval) {
    return 'waiting_approval';
  }

  if (justApproved) {
    return 'approved';
  }

  return 'idle';
}
