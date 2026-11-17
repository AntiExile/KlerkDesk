import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICING_TIERS,
  formatSelectedPlanBadge,
  formatTierPrice,
  parsePlanParam,
} from './pricing-data';

test('PRICING_TIERS defines Starter, Pro, and Ops / Teams tiers', () => {
  assert.equal(PRICING_TIERS.length, 3);
  assert.deepEqual(
    PRICING_TIERS.map((t) => t.id),
    ['starter', 'pro', 'ops']
  );
  assert.equal(PRICING_TIERS[1].highlighted, true);
  assert.equal(PRICING_TIERS[1].badgeLabel, 'Most popular');
});

test('formatTierPrice switches cleanly between ZAR and USD', () => {
  const [starter, pro, ops] = PRICING_TIERS;
  assert.deepEqual(formatTierPrice(starter, 'ZAR'), {
    amount: 'R0',
    period: '/ month',
  });
  assert.deepEqual(formatTierPrice(pro, 'ZAR'), {
    amount: 'R1,490',
    period: '/ month',
  });
  assert.deepEqual(formatTierPrice(ops, 'ZAR'), {
    amount: 'R4,950',
    period: '/ month',
  });

  assert.deepEqual(formatTierPrice(starter, 'USD'), {
    amount: '$0',
    period: '/ month',
  });
  assert.deepEqual(formatTierPrice(pro, 'USD'), {
    amount: '$79',
    period: '/ month',
  });
  assert.deepEqual(formatTierPrice(ops, 'USD'), {
    amount: '$275',
    period: '/ month',
  });
});

test('parsePlanParam and formatSelectedPlanBadge handle valid and invalid values', () => {
  assert.equal(parsePlanParam('pro'), 'pro');
  assert.equal(parsePlanParam(' STARTER '), 'starter');
  assert.equal(parsePlanParam('OPS'), 'ops');
  assert.equal(parsePlanParam('enterprise'), null);
  assert.equal(parsePlanParam(undefined), null);

  assert.equal(
    formatSelectedPlanBadge('pro'),
    'Selected: Pro — R1,490/mo (14-day free pilot)'
  );
  assert.equal(
    formatSelectedPlanBadge('starter'),
    'Selected: Starter — R0/mo (Free starter tier)'
  );
  assert.equal(
    formatSelectedPlanBadge('ops'),
    'Selected: Ops / Teams — R4,950/mo (Dedicated cloud desk)'
  );
  assert.equal(formatSelectedPlanBadge(null), null);
});
