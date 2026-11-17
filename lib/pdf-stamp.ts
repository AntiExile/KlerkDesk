import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { extractText } from 'unpdf';
import type { ComplianceDoc, DirectorInfo, SubmissionChannel } from '@/types';

export const MAX_SUBMISSION_PACK_BYTES = 30 * 1024 * 1024;
export const PPR_2022_THRESHOLD_ZAR = 50_000_000;

export interface SbdStampPayload {
  tenderId: string;
  tenderNumber: string;
  municipality: string;
  companyName: string;
  registrationNumber: string;
  csdMaaaNumber: string;
  taxPinNumber: string;
  cidbGrade: string;
  bbbeeLevel: string;
  grandTotalZar: number;
  directors?: DirectorInfo[];
  returnablePdfBuffers?: Uint8Array[];
}

export interface StampedSbdResult {
  fileName: string;
  pageCount: number;
  byteLength: number;
  stampingMethod: 'acroform' | 'coordinate-fallback';
  templatesLoaded: string[];
  extractedSummary: string;
  formsStamped: string[];
  base64Pdf: string;
}

export interface MergedComplianceAttachment {
  title: string;
  shortLabel: string;
  referenceNumber: string;
  status: string;
  fileName: string;
  bytes?: Uint8Array;
  contentType?: string;
}

export interface MergedSubmissionPackInput {
  tenderNumber: string;
  tenderTitle: string;
  municipality: string;
  closingDate: string;
  submissionChannel: SubmissionChannel;
  companyName: string;
  registrationNumber: string;
  csdMaaaNumber: string;
  taxPinNumber: string;
  cidbGrade: string;
  bbbeeLevel: string;
  grandTotalZar: number;
  stampedSbdBytes: Uint8Array;
  complianceAttachments: MergedComplianceAttachment[];
  directors?: DirectorInfo[];
}

export interface MergedSubmissionPackResult {
  fileName: string;
  pdfBytes: Uint8Array;
  byteLength: number;
  pageCount: number;
  attachmentsIncluded: number;
}

interface CoordinateEntry {
  x: number;
  y: number;
  value: string;
}

interface CleanReturnableRow {
  label: string;
  value: string;
}

interface CleanReturnableSpec {
  formTitle: string;
  subtitle: string;
  rows: CleanReturnableRow[];
  declaration: string;
}

interface SbdFormConfig {
  label: string;
  candidatePaths: string[];
  flatCoordinates: CoordinateEntry[];
  cleanSheet: CleanReturnableSpec;
}

function formatRand(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function computePreferencePointsSystem(
  grandTotalZar: number,
  bbbeeLevel: string
): {
  systemLabel: string;
  maxPoints: number;
  claimedPoints: number;
} {
  const isNinetyTen = grandTotalZar > PPR_2022_THRESHOLD_ZAR;
  const maxPoints = isNinetyTen ? 10 : 20;
  const systemLabel = isNinetyTen
    ? '90/10 (Acquisitions above R 50,000,000.00 — PPR 2022)'
    : '80/20 (Acquisitions up to R 50,000,000.00 — PPR 2022)';

  const lower = bbbeeLevel.toLowerCase();
  const levelMatch = lower.match(/level\s*([1-8])/i);
  const level = levelMatch
    ? Number(levelMatch[1])
    : lower.includes('eme') || lower.includes('exempt')
      ? 1
      : lower.includes('qse')
        ? 2
        : 0;

  const points8020: Record<number, number> = {
    1: 20,
    2: 18,
    3: 14,
    4: 12,
    5: 8,
    6: 6,
    7: 4,
    8: 2,
  };
  const points9010: Record<number, number> = {
    1: 10,
    2: 9,
    3: 6,
    4: 5,
    5: 4,
    6: 3,
    7: 2,
    8: 1,
  };

  const claimedPoints = isNinetyTen
    ? (points9010[level] ?? 0)
    : (points8020[level] ?? 0);

  return { systemLabel, maxPoints, claimedPoints };
}

function buildSbd4DirectorRows(
  directors: DirectorInfo[] | undefined
): CleanReturnableRow[] {
  if (!directors || directors.length === 0) {
    return [
      {
        label: 'DIRECTORS DISCLOSED (SCM 12/2026):',
        value: 'Pending Director Schedule — update Directors under Contractor Settings',
      },
      {
        label: 'ORGAN OF STATE EMPLOYMENT:',
        value: 'NO — None declared by bidder directors',
      },
      {
        label: 'LINKED CSD ENTERPRISES:',
        value: 'None declared outside bidder entity',
      },
    ];
  }

  const hasStateEmployee = directors.some((d) => d.isOrganOfStateEmployee);
  const stateDetails = directors
    .filter((d) => d.isOrganOfStateEmployee)
    .map(
      (d) =>
        `${d.fullName}${d.organOfStateDetails ? ` (${d.organOfStateDetails})` : ''}`
    )
    .join('; ');

  const linkedEnterprises = directors.flatMap((d) =>
    d.linkedCsdEnterprises.map(
      (e) => `${e.enterpriseName} [${e.csdNumber} · ${e.status}]`
    )
  );

  const directorSummary = directors
    .map((d) => {
      const maskedId =
        d.idNumber.length >= 6
          ? `${d.idNumber.slice(0, 6)}••••${d.idNumber.slice(-2)}`
          : d.idNumber;
      return `${d.fullName} (ID: ${maskedId})`;
    })
    .join(' | ');

  return [
    {
      label: `DIRECTORS (${directors.length}) DISCLOSED:`,
      value: directorSummary.slice(0, 88),
    },
    {
      label: 'ORGAN OF STATE EMPLOYEE:',
      value: hasStateEmployee
        ? `YES — ${stateDetails || 'Declared'}`.slice(0, 88)
        : 'NO — No director employed by Organ of State (SCM Inst. 12/2026)',
    },
    {
      label: 'LINKED CSD ENTERPRISES:',
      value:
        linkedEnterprises.length > 0
          ? linkedEnterprises.join('; ').slice(0, 88)
          : 'None beyond primary CSD registration',
    },
  ];
}

async function loadTemplateOrCreate(
  candidatePaths: string[],
  returnableBuffer?: Uint8Array
): Promise<{
  doc: PDFDocument;
  loadedFromDisk: boolean;
  templateName: string | null;
  hasAcroFields: boolean;
}> {
  if (returnableBuffer && returnableBuffer.byteLength > 0) {
    try {
      const doc = await PDFDocument.load(returnableBuffer);
      const fields = doc.getForm().getFields();
      return {
        doc,
        loadedFromDisk: true,
        templateName: 'downloaded-tender-returnable.pdf',
        hasAcroFields: fields.length > 0,
      };
    } catch {
      // Fall through to disk templates
    }
  }

  for (const relPath of candidatePaths) {
    const templatePath = path.join(process.cwd(), relPath);
    try {
      const fileBytes = await fs.readFile(templatePath);
      const doc = await PDFDocument.load(fileBytes);
      const fields = doc.getForm().getFields();
      return {
        doc,
        loadedFromDisk: true,
        templateName: relPath,
        hasAcroFields: fields.length > 0,
      };
    } catch {
      // Try next candidate template path
    }
  }

  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  return {
    doc,
    loadedFromDisk: false,
    templateName: null,
    hasAcroFields: false,
  };
}

function buildAcroFieldMap(
  payload: SbdStampPayload,
  stampDate: string
): Record<string, string> {
  const formattedTotal = formatRand(payload.grandTotalZar);
  const ppr = computePreferencePointsSystem(
    payload.grandTotalZar,
    payload.bbbeeLevel
  );
  const directors = payload.directors ?? [];
  const hasStateEmp = directors.some((d) => d.isOrganOfStateEmployee);
  const directorNames = directors.map((d) => d.fullName).join(', ');
  const linkedCsds = directors
    .flatMap((d) => d.linkedCsdEnterprises.map((e) => `${e.enterpriseName} (${e.csdNumber})`))
    .join('; ');

  return {
    BID_NUMBER: payload.tenderNumber,
    TENDER_NUMBER: payload.tenderNumber,
    ORGAN_OF_STATE: payload.municipality,
    MUNICIPALITY: payload.municipality,
    BIDDER_NAME: payload.companyName,
    NAME_OF_BIDDER: payload.companyName,
    COMPANY_NAME: payload.companyName,
    ENTITY_NAME: payload.companyName,
    REGISTRATION_NUMBER: payload.registrationNumber,
    COMPANY_REG_NO: payload.registrationNumber,
    CSD_NUMBER: payload.csdMaaaNumber,
    CSD_MAAA: payload.csdMaaaNumber,
    MAAA_NUMBER: payload.csdMaaaNumber,
    TAX_PIN: payload.taxPinNumber,
    SARS_TAX_PIN: payload.taxPinNumber,
    CIDB_GRADE: payload.cidbGrade,
    BBBEE_LEVEL: payload.bbbeeLevel,
    PREFERENCE_POINTS_CLAIMED: `${ppr.claimedPoints.toFixed(2)} / ${ppr.maxPoints.toFixed(2)}`,
    PREFERENCE_SYSTEM: ppr.systemLabel,
    DIRECTORS_NAMES: directorNames,
    ORGAN_OF_STATE_EMPLOYEE: hasStateEmp ? 'YES' : 'NO',
    LINKED_CSD_ENTERPRISES: linkedCsds,
    TOTAL_BID_PRICE: formattedTotal,
    GRAND_TOTAL_ZAR: formattedTotal,
    DATE: stampDate,
    STAMP_DATE: stampDate,
  };
}

function populateAcroForm(
  doc: PDFDocument,
  fieldMap: Record<string, string>
): void {
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const normalizedName = field
      .getName()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
    const value = fieldMap[normalizedName];
    if (value && 'setText' in field && typeof field.setText === 'function') {
      field.setText(value);
    }
  }
  form.flatten();
}

async function stampFlatCoordinates(
  doc: PDFDocument,
  page: PDFPage,
  entries: CoordinateEntry[]
): Promise<void> {
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  for (const entry of entries) {
    page.drawText(entry.value, {
      x: entry.x,
      y: entry.y,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.08, 0.1, 0.14),
    });
  }
}

async function renderCleanReturnableSheet(
  doc: PDFDocument,
  page: PDFPage,
  spec: CleanReturnableSpec,
  stampDate: string
): Promise<void> {
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText('REPUBLIC OF SOUTH AFRICA — NATIONAL TREASURY', {
    x: 50,
    y: 785,
    size: 9,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });

  page.drawText(spec.formTitle, {
    x: 50,
    y: 762,
    size: 13,
    font: fontBold,
    color: rgb(0.06, 0.08, 0.12),
  });

  page.drawText(spec.subtitle, {
    x: 50,
    y: 744,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.32, 0.36, 0.42),
  });

  page.drawLine({
    start: { x: 50, y: 732 },
    end: { x: 545, y: 732 },
    thickness: 0.75,
    color: rgb(0.75, 0.78, 0.82),
  });

  let y = 706;
  for (const row of spec.rows) {
    page.drawText(row.label, {
      x: 50,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.2, 0.23, 0.28),
    });

    page.drawText(row.value || '—', {
      x: 235,
      y,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.06, 0.08, 0.12),
      maxWidth: 310,
      lineHeight: 12,
    });

    page.drawLine({
      start: { x: 50, y: y - 12 },
      end: { x: 545, y: y - 12 },
      thickness: 0.4,
      color: rgb(0.88, 0.9, 0.92),
    });

    y -= 32;
  }

  page.drawText(spec.declaration, {
    x: 50,
    y: Math.min(y - 14, 210),
    size: 9,
    font: fontRegular,
    color: rgb(0.22, 0.25, 0.3),
    maxWidth: 495,
    lineHeight: 13,
  });

  page.drawText('AUTHORIZED BIDDER SIGNATURE:', {
    x: 50,
    y: 112,
    size: 8.5,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });
  page.drawLine({
    start: { x: 215, y: 110 },
    end: { x: 405, y: 110 },
    thickness: 0.6,
    color: rgb(0.35, 0.38, 0.44),
  });

  page.drawText(`DATE: ${stampDate}`, {
    x: 430,
    y: 112,
    size: 8.5,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });

  page.drawText('CAPACITY / DESIGNATION:', {
    x: 50,
    y: 84,
    size: 8.5,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });
  page.drawLine({
    start: { x: 215, y: 82 },
    end: { x: 405, y: 82 },
    thickness: 0.6,
    color: rgb(0.35, 0.38, 0.44),
  });
}

/**
 * Stamps SBD 1, SBD 4 (PFMA SCM Instruction 12 & 14 of 2026/27), and SBD 6.1
 * (PPR 2022 80/20 vs 90/10 at R50M) using `pdf-lib`.
 */
export async function generateStampedSbdPackage(
  payload: SbdStampPayload
): Promise<StampedSbdResult> {
  const mergedPdf = await PDFDocument.create();
  const stampDate = new Date().toISOString().slice(0, 10);
  const templatesLoaded: string[] = [];
  const fieldMap = buildAcroFieldMap(payload, stampDate);
  const formattedTotal = formatRand(payload.grandTotalZar);
  const ppr = computePreferencePointsSystem(
    payload.grandTotalZar,
    payload.bbbeeLevel
  );
  const sbd4DirectorRows = buildSbd4DirectorRows(payload.directors);
  let usedAcroForm = false;

  const formConfigs: SbdFormConfig[] = [
    {
      label: 'SBD 1',
      candidatePaths: [
        'public/templates/sbd1.pdf',
        'templates/sbd1.pdf',
      ],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.tenderNumber },
        { x: 214, y: 686, value: payload.municipality },
        { x: 214, y: 652, value: payload.companyName },
        { x: 214, y: 618, value: payload.registrationNumber },
        { x: 214, y: 584, value: payload.csdMaaaNumber },
        { x: 214, y: 550, value: payload.taxPinNumber },
        { x: 214, y: 516, value: payload.cidbGrade },
        { x: 214, y: 482, value: formattedTotal },
      ],
      cleanSheet: {
        formTitle: 'SBD 1 — PART A: INVITATION TO BID',
        subtitle: 'Standard Bidding Document — Returnable Bid Identification & Offer Summary',
        rows: [
          { label: 'BID NUMBER:', value: payload.tenderNumber },
          { label: 'ORGAN OF STATE / MUNICIPALITY:', value: payload.municipality },
          { label: 'NAME OF BIDDER:', value: payload.companyName },
          { label: 'COMPANY REGISTRATION NO.:', value: payload.registrationNumber },
          { label: 'CSD SUPPLIER NUMBER (MAAA):', value: payload.csdMaaaNumber },
          { label: 'SARS TAX COMPLIANCE PIN:', value: payload.taxPinNumber },
          { label: 'CIDB CONTRACTOR GRADING:', value: payload.cidbGrade },
          { label: 'B-BBEE STATUS LEVEL:', value: payload.bbbeeLevel },
          { label: 'TOTAL BID PRICE (INCL. VAT):', value: formattedTotal },
        ],
        declaration:
          'I/We hereby bid to supply the goods/works/services described in the attached Bill of Quantities and specification documents subject to the General Conditions of Contract and Supply Chain Management Policy.',
      },
    },
    {
      label: 'SBD 4',
      candidatePaths: [
        'public/templates/sbd4.pdf',
        'templates/sbd4.pdf',
      ],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.companyName },
        { x: 214, y: 686, value: payload.registrationNumber },
        { x: 214, y: 652, value: sbd4DirectorRows[0]?.value ?? '' },
        { x: 214, y: 618, value: sbd4DirectorRows[1]?.value ?? '' },
        { x: 214, y: 584, value: sbd4DirectorRows[2]?.value ?? '' },
        { x: 214, y: 550, value: `${payload.tenderNumber} (${stampDate})` },
      ],
      cleanSheet: {
        formTitle: "SBD 4 — BIDDER'S DISCLOSURE (SCM INST. 12 & 14 OF 2026/27)",
        subtitle: 'Declaration of Directors, State Employment & Linked CSD Enterprises',
        rows: [
          { label: 'LEGAL ENTITY NAME:', value: payload.companyName },
          { label: 'REGISTRATION NUMBER:', value: payload.registrationNumber },
          { label: 'CSD SUPPLIER NUMBER (MAAA):', value: payload.csdMaaaNumber },
          { label: 'TENDER REFERENCE:', value: payload.tenderNumber },
          ...sbd4DirectorRows,
          {
            label: 'INDEPENDENT BID DETERMINATION:',
            value: 'YES — Bid prepared independently without collusion (PFMA SCM Inst. 12)',
          },
        ],
        declaration:
          'I, the undersigned, certify that all directors, Organ of State connections, and linked CSD enterprises disclosed above are complete and accurate in terms of PFMA SCM Instructions 12 & 14 of 2026/27.',
      },
    },
    {
      label: 'SBD 6.1',
      candidatePaths: [
        'public/templates/sbd6_1.pdf',
        'templates/sbd6_1.pdf',
      ],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.tenderNumber },
        { x: 214, y: 686, value: payload.municipality },
        { x: 214, y: 652, value: payload.companyName },
        { x: 214, y: 618, value: ppr.systemLabel },
        { x: 214, y: 584, value: `${ppr.claimedPoints.toFixed(2)} / ${ppr.maxPoints.toFixed(2)}` },
        { x: 214, y: 550, value: formattedTotal },
      ],
      cleanSheet: {
        formTitle: 'SBD 6.1 — PREFERENCE POINTS CLAIM FORM (PPR 2022)',
        subtitle: 'Preferential Procurement Regulations, 2022 — Specific Goals & B-BBEE Recognition',
        rows: [
          { label: 'TENDER REFERENCE:', value: payload.tenderNumber },
          { label: 'ORGAN OF STATE / MUNICIPALITY:', value: payload.municipality },
          { label: 'NAME OF BIDDER:', value: payload.companyName },
          { label: 'PREFERENCE POINT SYSTEM:', value: ppr.systemLabel },
          { label: 'B-BBEE CONTRIBUTOR STATUS:', value: payload.bbbeeLevel },
          {
            label: 'SPECIFIC GOALS POINTS CLAIMED:',
            value: `${ppr.claimedPoints.toFixed(2)} / ${ppr.maxPoints.toFixed(2)}`,
          },
          { label: 'CSD VERIFICATION NUMBER:', value: payload.csdMaaaNumber },
          { label: 'TOTAL BID OFFER (INCL. 15% VAT):', value: formattedTotal },
        ],
        declaration:
          'The undersigned claims preference points in terms of the Preferential Procurement Policy Framework Act (Act 5 of 2000) and Preferential Procurement Regulations, 2022.',
      },
    },
  ];

  for (let i = 0; i < formConfigs.length; i++) {
    const config = formConfigs[i];
    const downloadedBuf = payload.returnablePdfBuffers?.[i];
    const loaded = await loadTemplateOrCreate(
      config.candidatePaths,
      downloadedBuf
    );
    if (loaded.loadedFromDisk && loaded.templateName) {
      templatesLoaded.push(loaded.templateName);
    }

    if (loaded.hasAcroFields) {
      usedAcroForm = true;
      populateAcroForm(loaded.doc, fieldMap);
    } else if (loaded.loadedFromDisk) {
      const page = loaded.doc.getPages()[0];
      if (page) {
        await stampFlatCoordinates(loaded.doc, page, config.flatCoordinates);
      }
    } else {
      const page = loaded.doc.getPages()[0];
      if (page) {
        await renderCleanReturnableSheet(
          loaded.doc,
          page,
          config.cleanSheet,
          stampDate
        );
      }
    }

    const copiedPages = await mergedPdf.copyPages(
      loaded.doc,
      loaded.doc.getPageIndices()
    );
    for (const p of copiedPages) {
      mergedPdf.addPage(p);
    }
  }

  const pdfBytes = await mergedPdf.save();
  let extractedSummary = '';

  try {
    const extracted = await extractText(new Uint8Array(pdfBytes), {
      mergePages: true,
    });
    extractedSummary = extracted.text.slice(0, 320);
  } catch {
    extractedSummary = `Stamped SBD 1, SBD 4, and SBD 6.1 returnables (${payload.tenderNumber}) for ${payload.companyName}.`;
  }

  const base64Pdf = Buffer.from(pdfBytes).toString('base64');

  return {
    fileName: `${payload.tenderId}_SBD_1_4_6_1_Stamped.pdf`,
    pageCount: mergedPdf.getPageCount(),
    byteLength: pdfBytes.byteLength,
    stampingMethod: usedAcroForm ? 'acroform' : 'coordinate-fallback',
    templatesLoaded,
    extractedSummary,
    formsStamped: formConfigs.map((c) => c.label),
    base64Pdf,
  };
}

/**
 * Builds the single consolidated submission pack PDF under 30MB when a contractor
 * approves a tender on `/bid/[id]`:
 *   1) Cover Sheet & Compliance Matrix
 *   2) Stamped SBD 1, 4, 6.1 / MBD returnables
 *   3) Active Compliance Vault PDFs / certified ID images from Convex `_storage`
 */
export async function buildMergedSubmissionPack(
  input: MergedSubmissionPackInput
): Promise<MergedSubmissionPackResult> {
  const pack = await PDFDocument.create();
  const fontBold = await pack.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pack.embedFont(StandardFonts.Helvetica);

  // 1. Cover & Compliance Matrix Page
  const cover = pack.addPage([595.28, 841.89]);
  cover.drawText('KLERKDESK CONSOLIDATED TENDER SUBMISSION PACK', {
    x: 48,
    y: 790,
    size: 13,
    font: fontBold,
    color: rgb(0.06, 0.08, 0.12),
  });
  cover.drawText(`${input.tenderNumber} — ${input.municipality}`, {
    x: 48,
    y: 770,
    size: 10.5,
    font: fontBold,
    color: rgb(0.18, 0.22, 0.28),
  });
  cover.drawText(input.tenderTitle.slice(0, 96), {
    x: 48,
    y: 752,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.28, 0.32, 0.38),
    maxWidth: 500,
  });

  const channelLabel =
    input.submissionChannel === 'etenders_esubmission'
      ? 'National Treasury eTenders Portal (Manual Contractor eSubmission)'
      : input.submissionChannel === 'municipal_email'
        ? 'Official Municipal SCM Email Submission'
        : 'Physical Municipal Tender Box Drop-Off';

  const summaryRows: Array<[string, string]> = [
    ['Bidder Legal Entity', input.companyName],
    ['CIPC Registration No.', input.registrationNumber || '—'],
    ['CSD Supplier Number', input.csdMaaaNumber || '—'],
    ['SARS TCS PIN (Masked)', input.taxPinNumber || '—'],
    ['CIDB Grade', input.cidbGrade || '—'],
    ['B-BBEE Status', input.bbbeeLevel || '—'],
    ['Total Offer (Incl. 15% VAT)', formatRand(input.grandTotalZar)],
    ['Closing Date', input.closingDate.slice(0, 10)],
    ['Submission Channel', channelLabel],
  ];

  let y = 718;
  for (const [label, value] of summaryRows) {
    cover.drawText(label, {
      x: 48,
      y,
      size: 8.5,
      font: fontBold,
      color: rgb(0.25, 0.28, 0.34),
    });
    cover.drawText(value, {
      x: 215,
      y,
      size: 9,
      font: fontRegular,
      color: rgb(0.08, 0.1, 0.14),
      maxWidth: 330,
    });
    y -= 20;
  }

  y -= 10;
  cover.drawText('COMPLIANCE VAULT & RETURNABLE MATRIX', {
    x: 48,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.14),
  });
  y -= 18;

  for (const doc of input.complianceAttachments) {
    const statusText = `${doc.shortLabel}: ${doc.status.toUpperCase()} (${doc.referenceNumber || 'N/A'}) — ${doc.fileName || 'No file'}`;
    cover.drawText(statusText.slice(0, 96), {
      x: 48,
      y,
      size: 8.5,
      font: fontRegular,
      color:
        doc.status === 'valid' || doc.status === 'warning'
          ? rgb(0.07, 0.32, 0.18)
          : rgb(0.55, 0.12, 0.12),
    });
    y -= 16;
  }

  // 2. Append Stamped SBD 1 / 4 / 6.1 Returnables
  const sbdDoc = await PDFDocument.load(input.stampedSbdBytes);
  const sbdPages = await pack.copyPages(sbdDoc, sbdDoc.getPageIndices());
  for (const page of sbdPages) {
    pack.addPage(page);
  }

  // 3. Append Compliance Vault PDFs & Certified Images
  let attachmentsIncluded = 0;
  for (const attachment of input.complianceAttachments) {
    if (!attachment.bytes || attachment.bytes.byteLength === 0) continue;

    const lowerName = attachment.fileName.toLowerCase();
    const isPdf =
      attachment.contentType?.includes('pdf') || lowerName.endsWith('.pdf');
    const isPng =
      attachment.contentType?.includes('png') || lowerName.endsWith('.png');
    const isJpg =
      attachment.contentType?.includes('jpeg') ||
      attachment.contentType?.includes('jpg') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg');

    try {
      if (isPdf) {
        const subPdf = await PDFDocument.load(attachment.bytes);
        const copied = await pack.copyPages(subPdf, subPdf.getPageIndices());
        for (const p of copied) {
          pack.addPage(p);
        }
        attachmentsIncluded += 1;
      } else if (isPng || isJpg) {
        const img = isPng
          ? await pack.embedPng(attachment.bytes)
          : await pack.embedJpg(attachment.bytes);
        const page = pack.addPage([595.28, 841.89]);
        const dims = img.scaleToFit(500, 740);
        page.drawText(`${attachment.title} (${attachment.referenceNumber})`, {
          x: 48,
          y: 805,
          size: 9.5,
          font: fontBold,
          color: rgb(0.1, 0.12, 0.16),
        });
        page.drawImage(img, {
          x: 48,
          y: 785 - dims.height,
          width: dims.width,
          height: dims.height,
        });
        attachmentsIncluded += 1;
      }
    } catch {
      // Skip malformed binary file without aborting the submission pack
    }
  }

  const pdfBytes = await pack.save({ useObjectStreams: true });
  if (pdfBytes.byteLength > MAX_SUBMISSION_PACK_BYTES) {
    throw new Error(
      `Consolidated submission pack (${(pdfBytes.byteLength / (1024 * 1024)).toFixed(1)} MB) exceeds the 30MB limit. Compress large attachments and retry.`
    );
  }

  const safeNumber = input.tenderNumber.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return {
    fileName: `${safeNumber}_Consolidated_Submission_Pack.pdf`,
    pdfBytes,
    byteLength: pdfBytes.byteLength,
    pageCount: pack.getPageCount(),
    attachmentsIncluded,
  };
}

export async function extractPdfPlainText(bytes: Uint8Array): Promise<{
  totalPages: number;
  text: string;
}> {
  const result = await extractText(bytes, { mergePages: true });
  return {
    totalPages: result.totalPages,
    text: result.text,
  };
}
