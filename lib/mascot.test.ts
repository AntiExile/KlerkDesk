import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KLERK_MASCOT_VARIANTS,
  THREAD_MASCOT_VARIANTS,
  clampUnit,
  deriveTenderThreadMood,
  deriveWorkspaceMascotMood,
  getTenderMascotVariant,
  normalizeLookTarget,
  resolveTenderMascotVariants,
} from './mascot';
import type { ComplianceDoc } from '@/types';

function makeDoc(status: ComplianceDoc['status']): ComplianceDoc {
  return {
    id: 'doc-csd',
    type: 'csd',
    title: 'CSD Report',
    shortLabel: 'CSD',
    referenceNumber: status === 'missing' ? 'Not uploaded' : 'MAAA0948215',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    ageDays: status === 'expired' ? 12 : 2,
    maxAgeDays: 7,
    daysUntilExpiry: status === 'expired' ? -5 : 5,
    status,
    alertReason: status === 'expired' ? 'CSD report is 12 days old' : null,
    fileName: status === 'missing' ? '' : 'csd.pdf',
    fileSizeBytes: status === 'missing' ? 0 : 1200,
  };
}

test('KLERK_MASCOT_VARIANTS matches specified silhouettes and emerald palette', () => {
  assert.deepEqual(KLERK_MASCOT_VARIANTS.chief, {
    shape: 'drop',
    color: '#34D399',
    eyeColor: '#091510',
    label: 'KlerkDesk Chief of Staff',
  });
  assert.deepEqual(KLERK_MASCOT_VARIANTS.scout, {
    shape: 'soft',
    color: '#10B981',
    eyeColor: '#091510',
    label: 'KlerkDesk Tender Scout',
  });
  assert.deepEqual(KLERK_MASCOT_VARIANTS.shield, {
    shape: 'compact',
    color: '#6EE7B7',
    eyeColor: '#091510',
    label: 'KlerkDesk Approval Shield',
  });
});

test('clampUnit and normalizeLookTarget clamp coordinates cleanly within [-1, 1]', () => {
  assert.equal(clampUnit(5), 1);
  assert.equal(clampUnit(-5), -1);
  assert.equal(clampUnit(Number.NaN), 0);

  const rect = { left: 100, top: 100, width: 88, height: 88 };
  const center = normalizeLookTarget(144, 144, rect);
  assert.equal(center.x, 0);
  assert.equal(center.y, 0);

  const farCorner = normalizeLookTarget(2000, -1000, rect);
  assert.equal(farCorner.x, 1);
  assert.equal(farCorner.y, -1);

  const partial = normalizeLookTarget(254, 144, rect);
  assert.ok(partial.x > 0 && partial.x <= 1);
  assert.equal(partial.y, 0);
});

test('deriveWorkspaceMascotMood enforces strict priority ordering', () => {
  // 1. blocked overrides scanning, waiting_approval, and justApproved
  assert.equal(
    deriveWorkspaceMascotMood({
      compliance: {
        docs: [makeDoc('expired')],
        blockingAlerts: ['CSD: CSD report is 12 days old'],
      },
      isScanning: true,
      approvals: [{ status: 'pending_approval' }],
      justApproved: true,
    }),
    'blocked'
  );

  // Clean 0/6 missing-doc onboarding account should NOT falsely report blocked
  assert.equal(
    deriveWorkspaceMascotMood({
      compliance: {
        docs: [makeDoc('missing')],
        blockingAlerts: ['CSD: Document not uploaded yet'],
      },
      isScanning: false,
      approvals: [],
      justApproved: false,
    }),
    'idle'
  );

  // 2. scanning overrides waiting_approval and justApproved when not blocked
  assert.equal(
    deriveWorkspaceMascotMood({
      compliance: { docs: [makeDoc('valid')], blockingAlerts: [] },
      isScanning: true,
      approvals: [{ status: 'pending_approval' }],
      justApproved: true,
    }),
    'scanning'
  );

  // 3. waiting_approval overrides justApproved when not blocked/scanning
  assert.equal(
    deriveWorkspaceMascotMood({
      compliance: { docs: [makeDoc('valid')], blockingAlerts: [] },
      isScanning: false,
      approvals: [{ status: 'pending_approval' }],
      justApproved: true,
    }),
    'waiting_approval'
  );

  // 4. approved triggers when justApproved is true and no higher priority applies
  assert.equal(
    deriveWorkspaceMascotMood({
      compliance: { docs: [makeDoc('valid')], blockingAlerts: [] },
      isScanning: false,
      approvals: [{ status: 'approved' }],
      justApproved: true,
    }),
    'approved'
  );

  // 5. idle fallback
  assert.equal(
    deriveWorkspaceMascotMood({
      compliance: { docs: [makeDoc('valid')], blockingAlerts: [] },
      isScanning: false,
      approvals: [],
      justApproved: false,
    }),
    'idle'
  );
});

test('resolveTenderMascotVariants assigns unique characters per tender thread deterministically', () => {
  const ids = [
    'ET-2026-WC-0842',
    'ET-2026-WC-0911',
    'ET-2026-WC-1044',
    'ET-2026-CPT-2201',
  ];
  const mapA = resolveTenderMascotVariants(ids);
  const mapB = resolveTenderMascotVariants(ids);
  assert.deepEqual(mapA, mapB);

  const assigned = Object.values(mapA);
  assert.equal(new Set(assigned).size, ids.length);
  for (const variant of assigned) {
    assert.ok(THREAD_MASCOT_VARIANTS.includes(variant));
  }

  assert.equal(getTenderMascotVariant('ET-2026-WC-0911', ids), mapA['ET-2026-WC-0911']);
  assert.ok(THREAD_MASCOT_VARIANTS.includes(getTenderMascotVariant('solo-tender')));
});

test('deriveTenderThreadMood maps tender status to mascot mood', () => {
  assert.equal(deriveTenderThreadMood('submitted'), 'approved');
  assert.equal(deriveTenderThreadMood('pending_approval'), 'waiting_approval');
  assert.equal(deriveTenderThreadMood('staging'), 'scanning');
  assert.equal(deriveTenderThreadMood('matched'), 'idle');
});
