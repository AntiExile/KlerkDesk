import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  buildMergedSubmissionPack,
  computePreferencePointsSystem,
  extractPdfPlainText,
  generateStampedSbdPackage,
  MAX_SUBMISSION_PACK_BYTES,
} from './pdf-stamp';

describe('SBD Stamping & Consolidated Submission Pack', () => {
  it('computes PPR 2022 80/20 vs 90/10 at the R50M threshold and maps B-BBEE levels', () => {
    const under50m = computePreferencePointsSystem(14_850_000, 'Level 1 B-BBEE');
    assert.equal(under50m.maxPoints, 20);
    assert.equal(under50m.claimedPoints, 20);
    assert.ok(under50m.systemLabel.startsWith('80/20'));

    const exact50m = computePreferencePointsSystem(50_000_000, 'Level 2 B-BBEE');
    assert.equal(exact50m.maxPoints, 20);
    assert.equal(exact50m.claimedPoints, 18);

    const over50m = computePreferencePointsSystem(55_000_000, 'Level 1 B-BBEE');
    assert.equal(over50m.maxPoints, 10);
    assert.equal(over50m.claimedPoints, 10);
    assert.ok(over50m.systemLabel.startsWith('90/10'));
  });

  it('stamps dynamic SBD 4 director disclosures without demo placeholders', async () => {
    const stamped = await generateStampedSbdPackage({
      tenderId: 'ET-LIVE-9001',
      tenderNumber: 'RFQ/WC/2026/019',
      municipality: 'City of Tshwane Metropolitan Municipality',
      companyName: 'Apex Civil (Pty) Ltd',
      registrationNumber: '2022/123456/07',
      csdMaaaNumber: 'MAAA0777888',
      taxPinNumber: '••••••9901',
      cidbGrade: '6CE PE',
      bbbeeLevel: 'Level 1 B-BBEE',
      grandTotalZar: 18_250_000,
      directors: [
        {
          fullName: 'Thabo Mokoena',
          idNumber: '8503145123082',
          isOrganOfStateEmployee: true,
          organOfStateDetails: 'Part-time Municipal Audit Advisor',
          linkedCsdEnterprises: [
            {
              enterpriseName: 'Mokoena Plant Hire',
              csdNumber: 'MAAA0112233',
              status: 'Active',
            },
          ],
        },
      ],
    });

    assert.equal(stamped.pageCount, 3);
    assert.deepEqual(stamped.formsStamped, ['SBD 1', 'SBD 4', 'SBD 6.1']);

    const bytes = Uint8Array.from(Buffer.from(stamped.base64Pdf, 'base64'));
    const extracted = await extractPdfPlainText(bytes);

    assert.ok(extracted.text.includes('Apex Civil (Pty) Ltd'));
    assert.ok(extracted.text.includes('Thabo Mokoena'));
    assert.ok(extracted.text.includes('Mokoena Plant Hire'));
    assert.ok(extracted.text.includes('20.00 / 20.00'));
    assert.equal(extracted.text.includes('[MOCK]'), false);
  });

  it('merges Cover Sheet, Stamped SBD Pack, and Compliance Vault PDFs under 30MB', async () => {
    const stamped = await generateStampedSbdPackage({
      tenderId: 'ET-LIVE-9002',
      tenderNumber: 'SCM/2026/044',
      municipality: 'eThekwini Municipality',
      companyName: 'Apex Civil (Pty) Ltd',
      registrationNumber: '2022/123456/07',
      csdMaaaNumber: 'MAAA0777888',
      taxPinNumber: '••••••9901',
      cidbGrade: '6CE PE',
      bbbeeLevel: 'Level 1 B-BBEE',
      grandTotalZar: 12_000_000,
    });

    // Create a valid dummy Compliance Vault PDF attachment via pdf-lib
    const vaultDoc = await PDFDocument.create();
    const page = vaultDoc.addPage([595.28, 841.89]);
    const font = await vaultDoc.embedFont(StandardFonts.HelveticaBold);
    page.drawText('CSD SUMMARY REPORT MAAA0777888', { x: 50, y: 760, size: 12, font });
    const vaultPdfBytes = await vaultDoc.save();

    const stampedBytes = Uint8Array.from(Buffer.from(stamped.base64Pdf, 'base64'));
    const pack = await buildMergedSubmissionPack({
      tenderNumber: 'SCM/2026/044',
      tenderTitle: 'Upgrading of Stormwater Culverts',
      municipality: 'eThekwini Municipality',
      closingDate: '2026-08-30',
      submissionChannel: 'etenders_esubmission',
      companyName: 'Apex Civil (Pty) Ltd',
      registrationNumber: '2022/123456/07',
      csdMaaaNumber: 'MAAA0777888',
      taxPinNumber: '••••••9901',
      cidbGrade: '6CE PE',
      bbbeeLevel: 'Level 1 B-BBEE',
      grandTotalZar: 12_000_000,
      stampedSbdBytes: stampedBytes,
      complianceAttachments: [
        {
          title: 'CSD Summary Report',
          shortLabel: 'CSD Report',
          referenceNumber: 'MAAA0777888',
          status: 'valid',
          fileName: 'CSD_MAAA0777888.pdf',
          bytes: vaultPdfBytes,
          contentType: 'application/pdf',
        },
      ],
    });

    assert.equal(pack.attachmentsIncluded, 1);
    assert.equal(pack.pageCount, 1 + stamped.pageCount + 1);
    assert.ok(pack.byteLength < MAX_SUBMISSION_PACK_BYTES);

    const mergedExtracted = await extractPdfPlainText(pack.pdfBytes);
    assert.ok(mergedExtracted.text.includes('KLERKDESK CONSOLIDATED TENDER SUBMISSION PACK'));
    assert.ok(mergedExtracted.text.includes('CSD SUMMARY REPORT MAAA0777888'));
  });
});
