import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  buildSbd4Disclosures,
  calculatePpr2022Points,
} from './compliance-forms';
import {
  buildMergedSubmissionPack,
  computePreferencePointsSystem,
  extractPdfPagesPlainText,
  extractPdfPlainText,
  generateStampedSbdPackage,
  MAX_SUBMISSION_PACK_BYTES,
  resolveReturnableTemplates,
} from './pdf-stamp';

describe('SBD / MBD In-Place Stamping, Routing & Submission Pack', () => {
  it('computes PPR 2022 80/20 vs 90/10 at R50M and builds dynamic SBD 4 disclosures', () => {
    const under50m = computePreferencePointsSystem(14_850_000, 'Level 1 B-BBEE');
    assert.equal(under50m.maxPoints, 20);
    assert.equal(under50m.claimedPoints, 20);
    assert.ok(under50m.systemLabel.startsWith('80/20'));

    const exact50m = computePreferencePointsSystem(50_000_000, 'Level 2 B-BBEE');
    assert.equal(exact50m.maxPoints, 20);
    assert.equal(exact50m.claimedPoints, 18);

    const over50m = calculatePpr2022Points(55_000_000, 'Level 1 B-BBEE');
    assert.equal(over50m.preferenceSystem, '90/10');
    assert.equal(over50m.maxPoints, 10);
    assert.equal(over50m.claimedPoints, 10);

    const disclosures = buildSbd4Disclosures({
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
    assert.equal(disclosures.hasStateEmployment, true);
    assert.equal(disclosures.hasOtherEnterprises, true);
    assert.equal(disclosures.requiresOverflowSchedule, false);
    assert.equal(disclosures.stateEmploymentRows[0]?.fullName, 'Thabo Mokoena');
    assert.equal(
      disclosures.linkedEnterpriseRows[0]?.csdNumber,
      'MAAA0112233'
    );
  });

  it('routes National/Provincial PFMA tenders to SBD templates, stamps in-place on Page 1, initials every page, and appends Resolution of Directors', async () => {
    assert.deepEqual(
      resolveReturnableTemplates({
        organOfState: 'Department of Public Works and Infrastructure',
        submissionChannel: 'etenders_esubmission',
      }),
      ['sbd1.pdf', 'sbd4.pdf', 'sbd6_1.pdf']
    );

    const stamped = await generateStampedSbdPackage({
      tenderId: 'ET-NAT-9001',
      tenderNumber: 'DPWI/2026/019',
      tenderTitle: 'Rehabilitation of National Route R62 Bridges',
      municipality: 'Department of Public Works and Infrastructure',
      organOfState: 'Department of Public Works and Infrastructure',
      submissionChannel: 'etenders_esubmission',
      closingDate: '2026-09-15',
      companyName: 'Apex Civil (Pty) Ltd',
      registrationNumber: '2022/123456/07',
      csdMaaaNumber: 'MAAA0777888',
      taxPinNumber: '7482910099',
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

    assert.equal(stamped.stampingMethod, 'acroform');
    assert.deepEqual(stamped.templatesLoaded, [
      'sbd1.pdf',
      'sbd4.pdf',
      'sbd6_1.pdf',
    ]);
    assert.deepEqual(stamped.formsStamped, ['SBD 1', 'SBD 4', 'SBD 6.1']);
    // 2 (SBD 1) + 2 (SBD 4) + 4 (SBD 6.1) + 1 (Resolution of Directors) = 9 pages
    assert.equal(stamped.pageCount, 9);

    const bytes = Uint8Array.from(Buffer.from(stamped.base64Pdf, 'base64'));
    const perPage = await extractPdfPagesPlainText(bytes);
    assert.equal(perPage.totalPages, 9);

    // Page 1 of SBD 1 must directly extract legal name, 7 CSD digits, and TCS PIN in-place
    const sbd1Page1 = perPage.pages[0] ?? '';
    assert.ok(sbd1Page1.includes('Apex Civil (Pty) Ltd'));
    assert.ok(sbd1Page1.includes('0777888'));
    assert.ok(sbd1Page1.includes('7482910099'));

    // Every single page must carry the authorized signatory's initials
    for (let i = 0; i < perPage.pages.length; i++) {
      assert.ok(
        perPage.pages[i].includes('Initials: T.M.'),
        `Expected "Initials: T.M." on page ${i + 1}`
      );
    }

    // Dynamic SBD 4 disclosures and PPR 2022 points across official pages
    const fullText = perPage.pages.join('\n');
    assert.ok(fullText.includes('Thabo Mokoena'));
    assert.ok(fullText.includes('Mokoena Plant Hire'));
    assert.ok(fullText.includes('MAAA0112233'));
    assert.ok(fullText.includes('20.00 / 20.00'));
    assert.equal(fullText.includes('[MOCK]'), false);

    // Resolution of Directors appended at the end
    const resolutionPage = perPage.pages[perPage.pages.length - 1] ?? '';
    assert.ok(
      resolutionPage.includes(
        'RESOLUTION OF DIRECTORS / PROOF OF AUTHORITY TO SIGN'
      )
    );
    assert.ok(resolutionPage.includes('8503145123082'));
    assert.ok(resolutionPage.includes('DPWI/2026/019'));
  });

  it('routes Municipal tenders to MBD templates and stamps MBD 1 and MBD 6.1 in-place', async () => {
    assert.deepEqual(
      resolveReturnableTemplates({
        organOfState: 'Oudtshoorn Municipality',
        submissionChannel: 'municipal_email',
      }),
      ['mbd1.pdf', 'sbd4.pdf', 'mbd6_1.pdf']
    );

    const stamped = await generateStampedSbdPackage({
      tenderId: 'ET-MUN-2026',
      tenderNumber: 'T/OUD/014/2026',
      tenderTitle: 'Bulk Water Pipeline Replacement Works',
      municipality: 'Oudtshoorn Municipality',
      organOfState: 'Oudtshoorn Municipality',
      submissionChannel: 'municipal_email',
      closingDate: '2026-10-02',
      companyName: 'Apex Civil (Pty) Ltd',
      registrationNumber: '2022/123456/07',
      csdMaaaNumber: 'MAAA0777888',
      taxPinNumber: '7482910099',
      cidbGrade: '6CE PE',
      bbbeeLevel: 'Level 1 B-BBEE',
      grandTotalZar: 8_420_000,
      signatoryName: 'Wian Marais',
      signatoryIdNumber: '9001015009081',
    });

    assert.equal(stamped.stampingMethod, 'acroform');
    assert.deepEqual(stamped.templatesLoaded, [
      'mbd1.pdf',
      'sbd4.pdf',
      'mbd6_1.pdf',
    ]);
    assert.deepEqual(stamped.formsStamped, ['MBD 1', 'SBD 4', 'MBD 6.1']);
    // 1 (MBD 1) + 2 (SBD 4) + 4 (MBD 6.1) + 1 (Resolution of Directors) = 8 pages
    assert.equal(stamped.pageCount, 8);

    const bytes = Uint8Array.from(Buffer.from(stamped.base64Pdf, 'base64'));
    const perPage = await extractPdfPagesPlainText(bytes);
    assert.equal(perPage.totalPages, 8);

    // MBD 1 Page 1 contains bidder legal name, CSD digits, TCS PIN, and municipality
    const mbd1Page1 = perPage.pages[0] ?? '';
    assert.ok(mbd1Page1.includes('Apex Civil (Pty) Ltd'));
    assert.ok(mbd1Page1.includes('0777888'));
    assert.ok(mbd1Page1.includes('7482910099'));
    assert.ok(mbd1Page1.includes('Oudtshoorn Municipality'));

    // MBD 6.1 pages carry PPR 2022 points and claimant company
    const mbd61Combined = perPage.pages.slice(3, 7).join('\n');
    assert.ok(mbd61Combined.includes('80/20'));
    assert.ok(mbd61Combined.includes('20.00 / 20.00'));
    assert.ok(mbd61Combined.includes('Apex Civil (Pty) Ltd'));

    for (const p of perPage.pages) {
      assert.ok(p.includes('Initials: W.M.'));
    }
  });

  it('merges Cover Sheet, Stamped Returnables Pack, and Compliance Vault PDFs under 30MB', async () => {
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

    const vaultDoc = await PDFDocument.create();
    const page = vaultDoc.addPage([595.28, 841.89]);
    const font = await vaultDoc.embedFont(StandardFonts.HelveticaBold);
    page.drawText('CSD SUMMARY REPORT MAAA0777888', {
      x: 50,
      y: 760,
      size: 12,
      font,
    });
    const vaultPdfBytes = await vaultDoc.save();

    const stampedBytes = Uint8Array.from(
      Buffer.from(stamped.base64Pdf, 'base64')
    );
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
    assert.ok(
      mergedExtracted.text.includes('KLERKDESK CONSOLIDATED TENDER SUBMISSION PACK')
    );
    assert.ok(mergedExtracted.text.includes('CSD SUMMARY REPORT MAAA0777888'));
  });
});
