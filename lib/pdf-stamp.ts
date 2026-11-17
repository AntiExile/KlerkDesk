import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { extractText } from 'unpdf';

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

async function loadTemplateOrCreate(candidatePaths: string[]): Promise<{
  doc: PDFDocument;
  loadedFromDisk: boolean;
  templateName: string | null;
  hasAcroFields: boolean;
}> {
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
      size: 9.5,
      font: fontBold,
      color: rgb(0.2, 0.23, 0.28),
    });

    page.drawText(row.value, {
      x: 235,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.06, 0.08, 0.12),
    });

    page.drawLine({
      start: { x: 50, y: y - 10 },
      end: { x: 545, y: y - 10 },
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
 * Stamps SBD 1, SBD 4, and SBD 6.1 PDFs using pdf-lib.
 * Loads official blank templates from `public/templates/sbd1.pdf`, `sbd4.pdf`,
 * and `sbd6_1.pdf` when present — filling AcroForm fields when available or
 * stamping deterministic `(x, y)` coordinates — and falls back to clean
 * National Treasury returnable sheets when templates are absent.
 */
export async function generateStampedSbdPackage(
  payload: SbdStampPayload
): Promise<StampedSbdResult> {
  const mergedPdf = await PDFDocument.create();
  const stampDate = new Date().toISOString().slice(0, 10);
  const templatesLoaded: string[] = [];
  const fieldMap = buildAcroFieldMap(payload, stampDate);
  const formattedTotal = formatRand(payload.grandTotalZar);
  let usedAcroForm = false;

  const formConfigs: SbdFormConfig[] = [
    {
      label: 'SBD 1',
      candidatePaths: ['public/templates/sbd1.pdf'],
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
      candidatePaths: ['public/templates/sbd4.pdf'],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.companyName },
        { x: 214, y: 686, value: payload.registrationNumber },
        { x: 214, y: 652, value: 'NO — No state employee financial interest declared' },
        { x: 214, y: 618, value: 'NO — No connected persons employed by state (12m)' },
        { x: 214, y: 584, value: 'YES — Independent Bid Determination confirmed' },
        { x: 214, y: 550, value: `${payload.tenderNumber} (${stampDate})` },
      ],
      cleanSheet: {
        formTitle: "SBD 4 — BIDDER'S DISCLOSURE",
        subtitle: 'Declaration of Interest & Independent Bid Determination',
        rows: [
          { label: 'LEGAL ENTITY NAME:', value: payload.companyName },
          { label: 'REGISTRATION NUMBER:', value: payload.registrationNumber },
          { label: 'CSD SUPPLIER NUMBER (MAAA):', value: payload.csdMaaaNumber },
          { label: 'TENDER REFERENCE:', value: payload.tenderNumber },
          { label: 'STATE EMPLOYEE INTEREST:', value: 'NO — None declared' },
          { label: 'CONNECTED PERSONS IN STATE:', value: 'NO — None employed within past 12 months' },
          { label: 'INDEPENDENT BID DETERMINATION:', value: 'YES — Bid prepared independently without collusion' },
        ],
        declaration:
          'I, the undersigned, certify that the information furnished on this disclosure form is true and correct and acknowledge that any misrepresentation may lead to disqualification or restriction.',
      },
    },
    {
      label: 'SBD 6.1',
      candidatePaths: ['public/templates/sbd6_1.pdf'],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.tenderNumber },
        { x: 214, y: 686, value: payload.municipality },
        { x: 214, y: 652, value: payload.companyName },
        { x: 214, y: 618, value: payload.bbbeeLevel },
        { x: 214, y: 584, value: payload.csdMaaaNumber },
        { x: 214, y: 550, value: formattedTotal },
      ],
      cleanSheet: {
        formTitle: 'SBD 6.1 — PREFERENCE POINTS CLAIM FORM (PPR 2022)',
        subtitle: 'Preferential Procurement Regulations, 2022 — Specific Goals & B-BBEE Recognition',
        rows: [
          { label: 'TENDER REFERENCE:', value: payload.tenderNumber },
          { label: 'ORGAN OF STATE / MUNICIPALITY:', value: payload.municipality },
          { label: 'NAME OF BIDDER:', value: payload.companyName },
          { label: 'PREFERENCE POINT SYSTEM:', value: '80/20 (Acquisitions up to R 50,000,000.00)' },
          { label: 'B-BBEE CONTRIBUTOR STATUS:', value: payload.bbbeeLevel },
          { label: 'POINTS CLAIMED:', value: '20.00 / 20.00' },
          { label: 'CSD VERIFICATION NUMBER:', value: payload.csdMaaaNumber },
          { label: 'TOTAL BID OFFER (INCL. 15% VAT):', value: formattedTotal },
        ],
        declaration:
          'The undersigned claims preference points in terms of the Preferential Procurement Policy Framework Act (Act 5 of 2000) and Preferential Procurement Regulations, 2022.',
      },
    },
  ];

  for (const config of formConfigs) {
    const loaded = await loadTemplateOrCreate(config.candidatePaths);
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
