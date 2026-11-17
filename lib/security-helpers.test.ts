import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoPortalPasswordField,
  evaluateComplianceDocExpiry,
  maskSarsTcsPin,
  normalizeZaPhone,
} from '../convex/authHelpers';

describe('POPIA Section 19 & South African Security Helpers', () => {
  it('normalizes South African mobile numbers to E.164 +27 format', () => {
    assert.equal(normalizeZaPhone('082 555 1234'), '+27825551234');
    assert.equal(normalizeZaPhone('27825551234'), '+27825551234');
    assert.equal(normalizeZaPhone('+27825551234'), '+27825551234');
    assert.equal(normalizeZaPhone('+0825551234'), '+27825551234');
    assert.equal(normalizeZaPhone(''), '');
  });

  it('masks SARS TCS PINs at rest while preserving the last 4 digits', () => {
    assert.equal(maskSarsTcsPin('TCS-8841209341'), 'TCS-••••9341');
    assert.equal(maskSarsTcsPin('99410234'), '••••0234');
    assert.equal(maskSarsTcsPin('TCS-••••9341'), 'TCS-••••9341');
    assert.equal(maskSarsTcsPin(''), '');
  });

  it('rejects payloads attempting to store raw government portal passwords', () => {
    assert.doesNotThrow(() =>
      assertNoPortalPasswordField({
        companyName: 'Apex Civil (Pty) Ltd',
        sarsTcsPin: '99410234',
      })
    );

    assert.throws(
      () =>
        assertNoPortalPasswordField({
          efilingPassword: 'secret-password',
        }),
      /never store raw portal credentials/
    );
    assert.throws(
      () =>
        assertNoPortalPasswordField({
          csdPassword: 'secret-password',
        }),
      /never store raw portal credentials/
    );
  });

  it('evaluates CSD 7-day and CIPC/ID 90-day rules in Convex compliance gate', () => {
    const nineDaysAgo = new Date(Date.now() - 9 * 86_400_000).toISOString();
    const csdResult = evaluateComplianceDocExpiry({
      docType: 'csd',
      issuedAt: nineDaysAgo,
      maxAgeDays: 7,
    });
    assert.equal(csdResult.status, 'expired');

    const hundredDaysAgo = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const idResult = evaluateComplianceDocExpiry({
      docType: 'certified_id',
      issuedAt: hundredDaysAgo,
      maxAgeDays: 90,
    });
    assert.equal(idResult.status, 'expired');
  });
});
