import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyComplianceDocs,
  evaluateComplianceSummary,
  evaluateSingleDoc,
  isLegacySeededComplianceDoc,
  isLegacySeededProfile,
} from './compliance';

describe('Clean Account & Compliance Vault Rules', () => {
  it('starts new user accounts with 6 empty missing compliance document slots', () => {
    const emptyDocs = createEmptyComplianceDocs();
    assert.equal(emptyDocs.length, 6);
    for (const doc of emptyDocs) {
      assert.equal(doc.status, 'missing');
      assert.equal(doc.referenceNumber, 'Not uploaded');
      assert.equal(doc.fileName, '');
      assert.equal(doc.fileSizeBytes, 0);
    }

    const summary = evaluateComplianceSummary(emptyDocs);
    assert.equal(summary.isBidReady, false);
    assert.equal(summary.blockingAlerts.length, 6);
    assert.equal(
      summary.docs.every((d) => d.status === 'missing'),
      true
    );
  });

  it('transitions a missing compliance slot to valid when the user uploads a fresh document', () => {
    const nowIso = new Date().toISOString();
    const uploadedCsd = evaluateSingleDoc({
      id: 'doc-csd',
      type: 'csd',
      title: 'Central Supplier Database (CSD) Summary Report',
      shortLabel: 'CSD Report',
      referenceNumber: 'MAAA0123456',
      issuedAt: nowIso,
      expiresAt: null,
      maxAgeDays: 7,
      fileName: 'CSD_MAAA0123456.pdf',
      fileSizeBytes: 312_000,
    });

    assert.equal(uploadedCsd.status, 'valid');
    assert.equal(uploadedCsd.ageDays, 0);
    assert.equal(uploadedCsd.alertReason, null);
  });

  it('enforces the 7-day CSD and 90-day CIPC expiry rules', () => {
    const nineDaysAgo = new Date(Date.now() - 9 * 86_400_000).toISOString();
    const expiredCsd = evaluateSingleDoc({
      id: 'doc-csd',
      type: 'csd',
      title: 'Central Supplier Database (CSD) Summary Report',
      shortLabel: 'CSD Report',
      referenceNumber: 'MAAA0123456',
      issuedAt: nineDaysAgo,
      expiresAt: null,
      maxAgeDays: 7,
      fileName: 'CSD_Old.pdf',
      fileSizeBytes: 312_000,
    });
    assert.equal(expiredCsd.status, 'expired');

    const hundredDaysAgo = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const expiredCipc = evaluateSingleDoc({
      id: 'doc-cipc',
      type: 'cipc',
      title: 'CIPC CoR 14.3',
      shortLabel: 'CIPC',
      referenceNumber: '2021/458912/07',
      issuedAt: hundredDaysAgo,
      expiresAt: null,
      maxAgeDays: 90,
      fileName: 'CIPC_Old.pdf',
      fileSizeBytes: 410_000,
    });
    assert.equal(expiredCipc.status, 'expired');
  });

  it('filters legacy Karoo Civil starter records for real users while preserving demo sandbox', () => {
    assert.equal(
      isLegacySeededComplianceDoc({
        fileName: 'CSD_Report_MAAA0948215_2026_02.pdf',
        referenceNumber: 'MAAA0948215',
      }),
      true
    );
    assert.equal(
      isLegacySeededComplianceDoc({
        fileName: 'CSD_Report_MAAA0948215.pdf',
        referenceNumber: 'MAAA0948215',
      }),
      true
    );
    assert.equal(
      isLegacySeededComplianceDoc({
        fileName: 'SARS_Tax_PIN_2026.pdf',
        referenceNumber: 'TCS-8841209341',
      }),
      true
    );
    assert.equal(
      isLegacySeededComplianceDoc({
        fileName: 'Apex_CSD_Report.pdf',
        referenceNumber: 'MAAA0999888',
      }),
      false
    );

    assert.equal(
      isLegacySeededProfile({
        username: 'founder@apexcivil.co.za',
        companyName: 'Karoo Civil & Infrastructure (Pty) Ltd',
        csdMaaaNumber: 'MAAA0948215',
      }),
      true
    );
    assert.equal(
      isLegacySeededProfile({
        username: 'demo@mundusmk.co.za',
        companyName: 'Karoo Civil & Infrastructure (Pty) Ltd',
        csdMaaaNumber: 'MAAA0948215',
      }),
      false
    );
  });
});
