import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSignupPassword } from './password-validation';

test('evaluateSignupPassword starts in empty state when both fields are blank', () => {
  const result = evaluateSignupPassword('', '');
  assert.equal(result.strength, 'empty');
  assert.equal(result.passedRuleCount, 0);
  assert.equal(result.meetsSecurityStandards, false);
  assert.equal(result.confirmState, 'empty');
  assert.equal(result.passwordsMatch, false);
});

test('evaluateSignupPassword flags short or low-complexity passwords and mismatched confirm password', () => {
  const weak = evaluateSignupPassword('short', 'different');
  assert.equal(weak.meetsSecurityStandards, false);
  assert.equal(weak.confirmState, 'mismatch');
  assert.equal(weak.passwordsMatch, false);
  assert.equal(weak.confirmMessage, 'Passwords do not match');

  const leadingSpace = evaluateSignupPassword(
    ' KlerkDesk2026!',
    ' KlerkDesk2026!'
  );
  assert.equal(leadingSpace.meetsSecurityStandards, false);
  assert.equal(
    leadingSpace.rules.find((r) => r.id === 'noEdgeWhitespace')?.met,
    false
  );
});

test('evaluateSignupPassword approves strong password and matching confirmation', () => {
  const valid = evaluateSignupPassword(
    'KlerkDesk-2026!',
    'KlerkDesk-2026!'
  );
  assert.equal(valid.strength, 'strong');
  assert.equal(valid.passedRuleCount, 4);
  assert.equal(valid.meetsSecurityStandards, true);
  assert.equal(valid.confirmState, 'matching');
  assert.equal(valid.passwordsMatch, true);
  assert.equal(valid.confirmMessage, 'Passwords match');
});
