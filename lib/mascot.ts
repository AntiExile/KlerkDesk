import type { BlobShape } from 'open-mascot';
import type { ApprovalShieldState, ComplianceSummary } from '@/types';

export type KlerkMascotMood =
  | 'idle'
  | 'scanning'
  | 'waiting_approval'
  | 'approved'
  | 'blocked';

export type KlerkMascotVariant = 'chief' | 'scout' | 'shield';

export interface KlerkMascotVariantConfig {
  shape: BlobShape;
  color: string;
  eyeColor: string;
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
};

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
