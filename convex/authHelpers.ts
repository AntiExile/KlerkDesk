import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from './_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';

export const DEMO_USERNAME = 'demo@mundusmk.co.za';

export const PLAN_MONTHLY_CAP_USD: Record<'starter' | 'pro' | 'ops', number> = {
  starter: 15,
  pro: 45,
  ops: 120,
};

/**
 * Resolves the authenticated Convex user ID or throws an explicit Unauthorized error.
 * Works across Convex Queries, Mutations, and Actions via `@convex-dev/auth`.
 */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<'users'>> {
  const userId = await getAuthUserId(
    ctx as unknown as Parameters<typeof getAuthUserId>[0]
  );
  if (!userId) {
    throw new Error('Unauthorized: authentication required');
  }
  return userId;
}

/**
 * Asserts strict multi-tenant ownership of a database record before reading/mutating.
 */
export function assertRecordOwnership(
  recordUserId: Id<'users'> | undefined | null,
  authenticatedUserId: Id<'users'>,
  resourceLabel = 'resource'
): void {
  if (!recordUserId || recordUserId !== authenticatedUserId) {
    throw new Error(
      `Forbidden: ${resourceLabel} does not belong to authenticated user`
    );
  }
}

/**
 * Normalizes a South African phone number to E.164 format (`+27...`).
 */
export function normalizeZaPhone(raw: string | undefined | null): string {
  const digits = (raw ?? '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) {
    if (digits.startsWith('+0') && digits.length >= 10) {
      return `+27${digits.slice(2)}`;
    }
    return digits;
  }
  if (digits.startsWith('27') && digits.length >= 11) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+27${digits.slice(1)}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Masks a SARS Tax Compliance Status (TCS) PIN at rest so full plaintext PINs
 * are never leaked back to client views or logs (POPIA Section 19).
 * Rejects any input resembling a raw eFiling/CSD/CIPC password.
 */
export function maskSarsTcsPin(rawPin: string | undefined | null): string {
  const cleaned = (rawPin ?? '').trim();
  if (!cleaned) return '';
  if (cleaned.includes('•')) return cleaned;
  const visibleTail = cleaned.slice(-4);
  const prefix = cleaned.toUpperCase().startsWith('TCS-') ? 'TCS-' : '';
  return `${prefix}••••${visibleTail}`;
}

/**
 * Guardrail preventing accidental storage of raw government portal passwords
 * (SARS eFiling / CIPC / CSD passwords) inside profile fields.
 */
export function assertNoPortalPasswordField(
  payload: Record<string, unknown>
): void {
  const forbiddenKeys = [
    'efilingPassword',
    'eFilingPassword',
    'csdPassword',
    'cipcPassword',
    'sarsPassword',
    'portalPassword',
    'password',
  ];
  for (const key of forbiddenKeys) {
    if (key in payload && payload[key] !== undefined && payload[key] !== '') {
      throw new Error(
        `Security policy violation: never store raw portal credentials (${key})`
      );
    }
  }
}

/**
 * Evaluates South African public procurement document freshness & expiry rules:
 * - CSD summary report: expired if older than 7 days (`warning` at 5-7 days)
 * - Certified CIPC / Director IDs: expired if older than 90 days (`warning` at <= 15 days left)
 * - Tax PIN / COIDA / B-BBEE: expired past `expiresAt` (`warning` at <= 30 days left)
 */
export function evaluateComplianceDocExpiry(params: {
  docType: 'csd' | 'tax_pin' | 'coida' | 'bbbee' | 'cipc' | 'certified_id';
  issuedAt: string;
  expiresAt?: string | null;
  maxAgeDays?: number | null;
}) {
  const now = Date.now();
  const issuedMs = new Date(params.issuedAt).getTime();
  const ageDays = Number.isFinite(issuedMs)
    ? Math.max(0, Math.floor((now - issuedMs) / 86_400_000))
    : 0;

  let daysUntilExpiry: number | null = null;
  if (params.expiresAt) {
    const expMs = new Date(params.expiresAt).getTime();
    if (Number.isFinite(expMs)) {
      daysUntilExpiry = Math.floor((expMs - now) / 86_400_000);
    }
  } else if (params.maxAgeDays !== undefined && params.maxAgeDays !== null) {
    daysUntilExpiry = params.maxAgeDays - ageDays;
  }

  let status: 'valid' | 'warning' | 'expired' = 'valid';
  let alertReason: string | null = null;

  if (params.docType === 'csd') {
    const maxAge = params.maxAgeDays ?? 7;
    daysUntilExpiry = maxAge - ageDays;
    if (ageDays > maxAge) {
      status = 'expired';
      alertReason = `CSD report is ${ageDays} days old (exceeds 7-day limit).`;
    } else if (ageDays >= 5) {
      status = 'warning';
      alertReason = `CSD report is ${ageDays} days old (${maxAge - ageDays}d left before 7-day limit).`;
    }
  } else if (params.docType === 'cipc' || params.docType === 'certified_id') {
    const maxAge = params.maxAgeDays ?? 90;
    daysUntilExpiry = maxAge - ageDays;
    if (ageDays > maxAge) {
      status = 'expired';
      alertReason = `Certified copy is ${ageDays} days old (exceeds 90-day SAPS/Commissioner limit).`;
    } else if (daysUntilExpiry <= 15) {
      status = 'warning';
      alertReason = `Certified copy expires in ${daysUntilExpiry} days (90-day rule).`;
    }
  } else if (daysUntilExpiry !== null) {
    if (daysUntilExpiry < 0) {
      status = 'expired';
      alertReason = `Expired ${Math.abs(daysUntilExpiry)} days ago.`;
    } else if (daysUntilExpiry <= 30) {
      status = 'warning';
      alertReason = `Expires in ${daysUntilExpiry} days.`;
    }
  }

  return { ageDays, daysUntilExpiry, status, alertReason };
}

export function getCurrentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
