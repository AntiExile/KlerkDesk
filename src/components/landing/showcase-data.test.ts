import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOWCASE_SCENARIOS,
  buildQuickReplyResponse,
  filterScenarios,
  getNextScenarioIndex,
} from './showcase-data';

test('SHOWCASE_SCENARIOS exposes 4 distinct autopilot workflows', () => {
  assert.equal(SHOWCASE_SCENARIOS.length, 4);
  const words = new Set(SHOWCASE_SCENARIOS.map((s) => s.autopilotWord));
  assert.equal(words.size, 4);
});

test('filterScenarios matches by municipality, tender number, or bot name', () => {
  assert.equal(filterScenarios(SHOWCASE_SCENARIOS, '').length, 4);
  const george = filterScenarios(SHOWCASE_SCENARIOS, 'George');
  assert.equal(george.length, 1);
  assert.equal(george[0].id, 'chief-of-staff');

  const oud = filterScenarios(SHOWCASE_SCENARIOS, 'OUD/INF/019');
  assert.equal(oud.length, 1);
  assert.equal(oud[0].id, 'tender-scout');

  assert.equal(filterScenarios(SHOWCASE_SCENARIOS, 'nonexistent-xyz').length, 0);
});

test('getNextScenarioIndex cycles cleanly across boundaries', () => {
  assert.equal(getNextScenarioIndex(0, 4), 1);
  assert.equal(getNextScenarioIndex(3, 4), 0);
  assert.equal(getNextScenarioIndex(0, 0), 0);
});

test('buildQuickReplyResponse gives domain-specific Compliance and BoQ answers', () => {
  const scenario = SHOWCASE_SCENARIOS[0];
  const csdReply = buildQuickReplyResponse(scenario, 'Check CSD 7-day rule');
  assert.match(csdReply, /7 days/);
  assert.match(csdReply, /pending_approval/);

  const vatReply = buildQuickReplyResponse(scenario, 'Inspect VAT total');
  assert.match(vatReply, /R 17 077 500\.00/);
  assert.match(vatReply, /15% VAT/);
});
