import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PDFCheckBox,
  PDFDocument,
  PDFTextField,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  PPR_2022_THRESHOLD_ZAR,
  buildSbd4Disclosures,
  calculatePpr2022Points,
  type Ppr2022CalculationResult,
  type Sbd4DisclosuresResult,
  type SpecificGoalInput,
} from '@/lib/compliance-forms';
import type { DirectorInfo, SubmissionChannel } from '@/types';

export { PPR_2022_THRESHOLD_ZAR };

export const MAX_SUBMISSION_PACK_BYTES = 30 * 1024 * 1024;

export interface SbdStampPayload {
  tenderId: string;
  tenderNumber: string;
  tenderTitle?: string;
  municipality: string;
  organOfState?: string;
  buyerName?: string;
  submissionChannel?: SubmissionChannel | string;
  closingDate?: string;
  closingTime?: string;
  companyName: string;
  registrationNumber: string;
  csdMaaaNumber: string;
  taxPinNumber: string;
  cidbGrade: string;
  bbbeeLevel: string;
  grandTotalZar: number;
  postalAddress?: string;
  streetAddress?: string;
  telephoneNumber?: string;
  cellphoneNumber?: string;
  emailAddress?: string;
  vatRegistrationNumber?: string;
  municipalAccountNumber?: string;
  signatoryName?: string;
  signatoryIdNumber?: string;
  signatoryCapacity?: string;
  connectedPersonDetails?: string;
  hasConnectedPersons?: boolean;
  accreditedRepresentative?: boolean;
  foreignSupplier?: boolean;
  specificGoals?: SpecificGoalInput[];
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

export interface ReturnableTemplateRoutingInput {
  submissionChannel?: SubmissionChannel | string | null;
  organOfState?: string | null;
  buyerName?: string | null;
  municipality?: string | null;
}

export type ReturnableTemplateName =
  | 'sbd1.pdf'
  | 'sbd4.pdf'
  | 'sbd6_1.pdf'
  | 'mbd1.pdf'
  | 'mbd6_1.pdf';

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

interface FormStampSlot {
  label: string;
  templateFile: ReturnableTemplateName;
  flatCoordinates: CoordinateEntry[];
  cleanSheet: CleanReturnableSpec;
}

interface AcroFieldDataBundle {
  textMap: Record<string, string>;
  checkboxMap: Record<string, boolean>;
}

const MUNICIPAL_INDICATOR_RE =
  /municipality|munisipaliteit|district|metro|mbd/i;

function formatRand(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function extractCsdDigits(csdMaaaNumber: string): string {
  return (csdMaaaNumber || '')
    .trim()
    .replace(/^MAAA/i, '')
    .replace(/\D+/g, '');
}

export function deriveSignatoryInitials(
  signatoryName: string | undefined,
  companyName: string
): string {
  const source = (signatoryName || '').trim() || companyName.trim() || 'KD';
  const words = source
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length >= 2) {
    return `${words[0][0].toUpperCase()}.${words[words.length - 1][0].toUpperCase()}.`;
  }
  if (words.length === 1) {
    return `${words[0].slice(0, 2).toUpperCase()}.`;
  }
  return 'K.D.';
}

/**
 * Automatically selects Municipal (`MBD`) returnable templates when submitting
 * to municipal channels/entities, or National/Provincial (`SBD`) templates
 * for PFMA departments and SOCs.
 */
export function resolveReturnableTemplates(
  tender: ReturnableTemplateRoutingInput
): [ReturnableTemplateName, ReturnableTemplateName, ReturnableTemplateName] {
  const channel = (tender.submissionChannel ?? '').trim().toLowerCase();
  const organText = [
    tender.organOfState,
    tender.buyerName,
    tender.municipality,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' ');

  const isMunicipal =
    channel === 'municipal_email' ||
    channel === 'physical_tender_box' ||
    channel === 'tender_box' ||
    MUNICIPAL_INDICATOR_RE.test(organText);

  return isMunicipal
    ? ['mbd1.pdf', 'sbd4.pdf', 'mbd6_1.pdf']
    : ['sbd1.pdf', 'sbd4.pdf', 'sbd6_1.pdf'];
}

export function computePreferencePointsSystem(
  grandTotalZar: number,
  bbbeeLevel: string
): {
  systemLabel: string;
  maxPoints: number;
  claimedPoints: number;
} {
  const ppr = calculatePpr2022Points(grandTotalZar, bbbeeLevel);
  return {
    systemLabel: ppr.systemLabel,
    maxPoints: ppr.maxPoints,
    claimedPoints: ppr.claimedPoints,
  };
}

function buildSbd4FallbackRows(
  directors: DirectorInfo[] | undefined,
  disclosures: Sbd4DisclosuresResult
): CleanReturnableRow[] {
  if (!directors || directors.length === 0) {
    return [
      {
        label: 'DIRECTORS DISCLOSED (SCM 14/2026):',
        value: 'Pending Director Schedule — update Directors under Contractor Settings',
      },
      {
        label: 'ORGAN OF STATE EMPLOYMENT (2.1):',
        value: disclosures.hasStateEmployment ? 'YES — Disclosed' : 'NO',
      },
      {
        label: 'LINKED CSD ENTERPRISES (2.3/2.4):',
        value: 'None declared outside bidder entity',
      },
    ];
  }

  const stateSummary = disclosures.hasStateEmployment
    ? `YES — ${disclosures.stateEmploymentRows
        .map((r) => `${r.fullName} (${r.organOfState})`)
        .join('; ')}`
    : 'NO — No director employed by Organ of State (SCM Inst. 14/2026)';

  const linkedSummary = disclosures.hasOtherEnterprises
    ? disclosures.linkedEnterpriseRows
        .map((e) => `${e.enterpriseName} [${e.csdNumber} · ${e.status}]`)
        .join('; ')
    : 'None beyond primary CSD registration';

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
      label: 'ORGAN OF STATE EMPLOYMENT (2.1):',
      value: stateSummary.slice(0, 88),
    },
    {
      label: 'LINKED CSD ENTERPRISES (2.3/2.4):',
      value: linkedSummary.slice(0, 88),
    },
  ];
}

async function loadTemplateOrCreate(
  templateFileName: ReturnableTemplateName,
  returnableBuffer?: Uint8Array
): Promise<{
  doc: PDFDocument;
  loadedFromDisk: boolean;
  fromTenderPack: boolean;
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
        fromTenderPack: true,
        templateName: templateFileName,
        hasAcroFields: fields.length > 0,
      };
    } catch {
      // Fall through to official templates directory
    }
  }

  const safeFileName = path.basename(templateFileName);
  const templatePath = path.join(
    process.cwd(),
    'public',
    'templates',
    safeFileName
  );

  try {
    const fileBytes = await fs.readFile(templatePath);
    const doc = await PDFDocument.load(fileBytes);
    const fields = doc.getForm().getFields();
    return {
      doc,
      loadedFromDisk: true,
      fromTenderPack: false,
      templateName: safeFileName,
      hasAcroFields: fields.length > 0,
    };
  } catch {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    return {
      doc,
      loadedFromDisk: false,
      fromTenderPack: false,
      templateName: null,
      hasAcroFields: false,
    };
  }
}

export function buildAcroFieldMap(
  payload: SbdStampPayload,
  stampDate: string,
  disclosures: Sbd4DisclosuresResult,
  ppr: Ppr2022CalculationResult
): AcroFieldDataBundle {
  const formattedTotal = formatRand(payload.grandTotalZar);
  const invitingEntity =
    payload.organOfState?.trim() ||
    payload.buyerName?.trim() ||
    payload.municipality?.trim() ||
    'Organ of State';
  const csdDigits = extractCsdDigits(payload.csdMaaaNumber);
  const primaryDirector = payload.directors?.[0];
  const signatoryName =
    payload.signatoryName?.trim() ||
    primaryDirector?.fullName?.trim() ||
    payload.companyName;
  const signatoryCapacity =
    payload.signatoryCapacity?.trim() || 'Director / Authorized Signatory';
  const closingDate = (payload.closingDate || stampDate).slice(0, 10);
  const closingTime = payload.closingTime?.trim() || '11:00';
  const bidDescription = (
    payload.tenderTitle?.trim() ||
    `${payload.tenderNumber} — ${invitingEntity}`
  ).slice(0, 90);

  const isSwornAffidavit = /affidavit|eme|qse/i.test(payload.bbbeeLevel || '');
  const hasBbbee = Boolean(payload.bbbeeLevel && payload.bbbeeLevel.trim());
  const isAccreditedRep = Boolean(payload.accreditedRepresentative);
  const isForeign = Boolean(payload.foreignSupplier);

  const directorNames = (payload.directors ?? [])
    .map((d) => d.fullName)
    .join(', ');
  const linkedCsds = disclosures.linkedEnterpriseRows
    .map((e) => `${e.enterpriseName} (${e.csdNumber})`)
    .join('; ');

  const textMap: Record<string, string> = {
    inviting_department: invitingEntity,
    bid_number: payload.tenderNumber,
    closing_date: closingDate,
    closing_time: closingTime,
    bid_description: bidDescription,
    bidder_legal_name: payload.companyName,
    postal_address:
      payload.postalAddress?.trim() ||
      `On File — CSD ${payload.csdMaaaNumber || 'Registered'}`,
    street_address:
      payload.streetAddress?.trim() ||
      `CIPC Reg ${payload.registrationNumber || 'Registered Address'}`,
    telephone_number: payload.telephoneNumber?.trim() || 'On CSD Profile',
    cellphone_number: payload.cellphoneNumber?.trim() || 'On CSD Profile',
    email_address: payload.emailAddress?.trim() || 'Via CSD Supplier Record',
    vat_registration_number:
      payload.vatRegistrationNumber?.trim() ||
      payload.registrationNumber ||
      'On SARS TCS',
    tcs_pin: payload.taxPinNumber,
    csd_number_digits: csdDigits || payload.csdMaaaNumber,
    signatory_name: signatoryName,
    signatory_capacity: signatoryCapacity,
    signature_date: stampDate,
    signature_stamp: signatoryName,
    municipal_account_number:
      payload.municipalAccountNumber?.trim() ||
      `CSD Verified (${payload.csdMaaaNumber})`,

    connected_person_details: disclosures.connectedPersonDetails,
    declarant_full_name: signatoryName,
    declarant_position: signatoryCapacity,
    declarant_signature: signatoryName,
    declaration_date: stampDate,

    preference_system: ppr.preferenceSystem,
    bbbee_status_level: ppr.bbbeeLabel,
    total_preference_points_claimed: `${ppr.claimedPoints.toFixed(2)} / ${ppr.maxPoints.toFixed(2)}`,
    claimant_company_name: payload.companyName,
    claimant_signatory_name: signatoryName,
    claimant_capacity: signatoryCapacity,
    claimant_signature: signatoryName,
    claimant_date: stampDate,

    BID_NUMBER: payload.tenderNumber,
    TENDER_NUMBER: payload.tenderNumber,
    ORGAN_OF_STATE: invitingEntity,
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
    ORGAN_OF_STATE_EMPLOYEE: disclosures.hasStateEmployment ? 'YES' : 'NO',
    LINKED_CSD_ENTERPRISES: linkedCsds,
    TOTAL_BID_PRICE: formattedTotal,
    GRAND_TOTAL_ZAR: formattedTotal,
    DATE: stampDate,
    STAMP_DATE: stampDate,
  };

  for (let i = 0; i < 3; i++) {
    const idx = i + 1;
    const row = disclosures.stateEmploymentRows[i];
    if (row) {
      textMap[`state_person_name_${idx}`] = row.fullName;
      textMap[`state_relationship_${idx}`] = row.relationship;
      textMap[`state_institution_${idx}`] = row.organOfState;
    } else if (i === 0 && !disclosures.hasStateEmployment) {
      textMap.state_person_name_1 = 'N/A';
      textMap.state_relationship_1 = 'No organ of state employment';
      textMap.state_institution_1 = 'None';
    }
  }

  for (let i = 0; i < 4; i++) {
    const idx = i + 1;
    const row = disclosures.linkedEnterpriseRows[i];
    if (row) {
      textMap[`linked_enterprise_name_${idx}`] = row.enterpriseName;
      textMap[`linked_enterprise_csd_${idx}`] = row.csdNumber;
      textMap[`linked_enterprise_status_${idx}`] = row.status;
    } else if (i === 0 && !disclosures.hasOtherEnterprises) {
      textMap.linked_enterprise_name_1 = 'None declared';
      textMap.linked_enterprise_csd_1 = 'N/A';
      textMap.linked_enterprise_status_1 = 'N/A';
    }
  }

  for (let i = 0; i < 3; i++) {
    const idx = i + 1;
    const goal = ppr.goalRows[i];
    if (goal) {
      textMap[`specific_goals_claimed_${idx}`] = goal.goal;
      textMap[`max_points_${idx}`] = goal.maxPoints.toFixed(2);
      textMap[`points_claimed_${idx}`] = goal.claimedPoints.toFixed(2);
    }
  }

  const checkboxMap: Record<string, boolean> = {
    bbbee_certificate_yes: hasBbbee && !isSwornAffidavit,
    bbbee_certificate_no: !hasBbbee || isSwornAffidavit,
    bbbee_affidavit_yes: hasBbbee && isSwornAffidavit,
    bbbee_affidavit_no: !hasBbbee || !isSwornAffidavit,
    accredited_rep_yes: isAccreditedRep,
    accredited_rep_no: !isAccreditedRep,
    foreign_supplier_yes: isForeign,
    foreign_supplier_no: !isForeign,
    municipal_arrears_no: true,
    state_employed_yes: disclosures.hasStateEmployment,
    state_employed_no: !disclosures.hasStateEmployment,
    connected_person_yes: disclosures.hasConnectedPersons,
    connected_person_no: !disclosures.hasConnectedPersons,
    other_enterprises_yes: disclosures.hasOtherEnterprises,
    other_enterprises_no: !disclosures.hasOtherEnterprises,
  };

  return { textMap, checkboxMap };
}

async function populateAcroForm(
  doc: PDFDocument,
  bundle: AcroFieldDataBundle
): Promise<void> {
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();

  for (const field of form.getFields()) {
    const rawName = field.getName().trim();
    const normalizedName = rawName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');

    if (field instanceof PDFCheckBox) {
      const isChecked =
        bundle.checkboxMap[rawName] ??
        bundle.checkboxMap[normalizedName] ??
        false;
      if (isChecked) {
        field.check();
      } else {
        field.uncheck();
      }
      continue;
    }

    if (field instanceof PDFTextField) {
      const value =
        bundle.textMap[rawName] ?? bundle.textMap[normalizedName] ?? '';
      if (value) {
        field.setText(value);
      }
    }
  }

  form.updateFieldAppearances(fontRegular);
  form.flatten();
}

async function stampTenderPackPageAnchors(
  doc: PDFDocument,
  rawBytes: Uint8Array,
  bundle: AcroFieldDataBundle,
  fallbackEntries: CoordinateEntry[]
): Promise<void> {
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  try {
    const proxy = await getDocumentProxy(new Uint8Array(rawBytes));
    const page1 = await proxy.getPage(1);
    const tc = await page1.getTextContent();
    const tokens = (
      tc.items as Array<{ str?: string; transform?: number[]; width?: number }>
    )
      .filter((it) => it.str?.trim() && it.transform)
      .map((it) => ({
        str: it.str!.trim(),
        x: it.transform![4] ?? 0,
        xEnd: (it.transform![4] ?? 0) + (it.width ?? 0),
        y: it.transform![5] ?? 0,
      }));

    const anchorPairs: Array<{ re: RegExp; field: string; fallbackX: number }> = [
      { re: /BID NUMBER/i, field: 'bid_number', fallbackX: 150 },
      { re: /NAME OF BIDDER/i, field: 'bidder_legal_name', fallbackX: 155 },
      { re: /SYSTEM PIN|TCS PIN/i, field: 'tcs_pin', fallbackX: 350 },
      { re: /MAAA/i, field: 'csd_number_digits', fallbackX: 547 },
      { re: /Name of company/i, field: 'claimant_company_name', fallbackX: 215 },
    ];

    const targetPage = pages[0];
    let matchedCount = 0;
    if (targetPage) {
      for (const pair of anchorPairs) {
        const hit = tokens.find((t) => pair.re.test(t.str));
        const val = bundle.textMap[pair.field];
        if (hit && val) {
          targetPage.drawText(val, {
            x: Math.max(pair.fallbackX, hit.xEnd + 6),
            y: hit.y,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.06, 0.08, 0.12),
          });
          matchedCount += 1;
        }
      }
    }

    if (matchedCount > 0) {
      return;
    }
  } catch {
    // Fall back to direct coordinates below
  }

  const firstPage = pages[0];
  if (firstPage) {
    await stampFlatCoordinates(doc, firstPage, fallbackEntries);
  }
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

async function appendSbd4OverflowSchedulePage(
  mergedPdf: PDFDocument,
  payload: SbdStampPayload,
  disclosures: Sbd4DisclosuresResult,
  stampDate: string
): Promise<void> {
  const page = mergedPdf.addPage([595.28, 841.89]);
  const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await mergedPdf.embedFont(StandardFonts.Helvetica);

  page.drawText('SBD 4 OVERFLOW ANNEXURE — DIRECTORS & LINKED CSD ENTERPRISES', {
    x: 48,
    y: 786,
    size: 12,
    font: fontBold,
    color: rgb(0.06, 0.08, 0.12),
  });
  page.drawText(
    `${payload.companyName} (${payload.registrationNumber}) • CSD ${payload.csdMaaaNumber} • Tender ${payload.tenderNumber}`,
    {
      x: 48,
      y: 768,
      size: 9,
      font: fontRegular,
      color: rgb(0.3, 0.34, 0.4),
    }
  );

  let y = 735;
  page.drawText('DISCLOSED DIRECTORS / SHAREHOLDERS:', {
    x: 48,
    y,
    size: 9.5,
    font: fontBold,
    color: rgb(0.14, 0.18, 0.24),
  });
  y -= 18;

  for (const d of disclosures.overflowDirectors) {
    if (y < 140) break;
    page.drawText(
      `• ${d.fullName} (ID: ${d.idNumber}) — Organ of State: ${
        d.isOrganOfStateEmployee
          ? `YES (${d.organOfStateDetails || 'Declared'})`
          : 'NO'
      }`,
      {
        x: 54,
        y,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.08, 0.1, 0.14),
        maxWidth: 492,
      }
    );
    y -= 16;
  }

  y -= 12;
  page.drawText('LINKED CSD-REGISTERED ENTERPRISES:', {
    x: 48,
    y,
    size: 9.5,
    font: fontBold,
    color: rgb(0.14, 0.18, 0.24),
  });
  y -= 18;

  for (const ent of disclosures.overflowEnterprises) {
    if (y < 90) break;
    page.drawText(
      `• ${ent.enterpriseName} — ${ent.csdNumber} (${ent.status})`,
      {
        x: 54,
        y,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.08, 0.1, 0.14),
        maxWidth: 492,
      }
    );
    y -= 15;
  }

  page.drawText(`Certified Date: ${stampDate}`, {
    x: 48,
    y: 64,
    size: 8.5,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });
}

async function appendResolutionOfDirectorsPage(
  mergedPdf: PDFDocument,
  payload: SbdStampPayload,
  stampDate: string
): Promise<void> {
  const page = mergedPdf.addPage([595.28, 841.89]);
  const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await mergedPdf.embedFont(StandardFonts.Helvetica);

  const primaryDirector = payload.directors?.[0];
  const signatoryName =
    payload.signatoryName?.trim() ||
    primaryDirector?.fullName?.trim() ||
    'Authorized Representative';
  const signatoryId =
    payload.signatoryIdNumber?.trim() ||
    primaryDirector?.idNumber?.trim() ||
    'On File (Certified ID in Compliance Vault)';
  const capacity =
    payload.signatoryCapacity?.trim() || 'Director / Authorized Signatory';
  const organ =
    payload.organOfState?.trim() ||
    payload.buyerName?.trim() ||
    payload.municipality?.trim() ||
    'Organ of State';
  const tenderTitle =
    payload.tenderTitle?.trim() || `Procurement Bid ${payload.tenderNumber}`;

  page.drawText('COMPANIES ACT (ACT 71 OF 2008) — PROOF OF AUTHORITY', {
    x: 50,
    y: 785,
    size: 9,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });

  page.drawText('RESOLUTION OF DIRECTORS / PROOF OF AUTHORITY TO SIGN', {
    x: 50,
    y: 762,
    size: 13.5,
    font: fontBold,
    color: rgb(0.06, 0.08, 0.12),
  });

  page.drawLine({
    start: { x: 50, y: 748 },
    end: { x: 545, y: 748 },
    thickness: 0.75,
    color: rgb(0.75, 0.78, 0.82),
  });

  const rows: Array<[string, string]> = [
    ['REGISTERED LEGAL ENTITY:', payload.companyName],
    ['CIPC REGISTRATION NUMBER:', payload.registrationNumber || '—'],
    ['CSD SUPPLIER NUMBER:', payload.csdMaaaNumber || '—'],
    ['SARS TAX COMPLIANCE PIN:', payload.taxPinNumber || '—'],
    ['INVITING INSTITUTION:', organ],
    ['TENDER REFERENCE NUMBER:', payload.tenderNumber],
    ['TENDER DESCRIPTION:', tenderTitle],
    ['AUTHORIZED SIGNATORY:', signatoryName],
    ['SIGNATORY IDENTITY NUMBER:', signatoryId],
    ['DESIGNATION / CAPACITY:', capacity],
    ['DATE OF RESOLUTION:', stampDate],
  ];

  let y = 716;
  for (const [label, value] of rows) {
    page.drawText(label, {
      x: 50,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.2, 0.23, 0.28),
    });
    page.drawText(value, {
      x: 235,
      y,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.06, 0.08, 0.12),
      maxWidth: 310,
      lineHeight: 12,
    });
    page.drawLine({
      start: { x: 50, y: y - 10 },
      end: { x: 545, y: y - 10 },
      thickness: 0.4,
      color: rgb(0.88, 0.9, 0.92),
    });
    y -= 28;
  }

  const resolutionBody = `RESOLVED THAT ${signatoryName} (Identity No.: ${signatoryId}), in their capacity as ${capacity} of ${payload.companyName} (Registration No.: ${payload.registrationNumber || 'Registered'}, CSD No.: ${payload.csdMaaaNumber || 'Registered'}), be and is hereby authorized to sign and submit Tender Reference ${payload.tenderNumber} ("${tenderTitle}") and all accompanying returnable schedules (SBD/MBD 1, 4, 6.1 and Bill of Quantities) to ${organ}.`;

  page.drawText('EXTRACT FROM MINUTES OF BOARD RESOLUTION:', {
    x: 50,
    y: y - 14,
    size: 9.5,
    font: fontBold,
    color: rgb(0.14, 0.18, 0.24),
  });

  page.drawText(resolutionBody, {
    x: 50,
    y: y - 34,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.1, 0.12, 0.16),
    maxWidth: 495,
    lineHeight: 14,
  });

  page.drawText('SIGNED ON BEHALF OF THE BOARD:', {
    x: 50,
    y: 132,
    size: 8.5,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });
  page.drawText(signatoryName, {
    x: 235,
    y: 134,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.06, 0.08, 0.12),
  });
  page.drawLine({
    start: { x: 235, y: 128 },
    end: { x: 430, y: 128 },
    thickness: 0.6,
    color: rgb(0.35, 0.38, 0.44),
  });

  page.drawText(`DATE: ${stampDate}`, {
    x: 448,
    y: 132,
    size: 8.5,
    font: fontBold,
    color: rgb(0.22, 0.25, 0.3),
  });
}

function stampInitialsOnAllPages(
  doc: PDFDocument,
  fontBold: PDFFont,
  initials: string
): void {
  const label = `Initials: ${initials}`;
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    page.drawText(label, {
      x: width - 68,
      y: 22,
      size: 8,
      font: fontBold,
      color: rgb(0.18, 0.22, 0.28),
    });
  }
}

/**
 * Stamps SBD/MBD 1, SBD 4 (PFMA SCM Instruction 14 of 2026/27), and SBD/MBD 6.1
 * (PPR 2022 80/20 vs 90/10 at R50M) in-place using AcroForm widgets, initials
 * every page, and appends the Resolution of Directors page.
 */
export async function generateStampedSbdPackage(
  payload: SbdStampPayload
): Promise<StampedSbdResult> {
  const mergedPdf = await PDFDocument.create();
  const stampDate = new Date().toISOString().slice(0, 10);
  const templatesLoaded: string[] = [];
  const formattedTotal = formatRand(payload.grandTotalZar);

  const disclosures = buildSbd4Disclosures({
    directors: payload.directors,
    connectedPersonDetails: payload.connectedPersonDetails,
    hasConnectedPersons: payload.hasConnectedPersons,
  });
  const ppr = calculatePpr2022Points(
    payload.grandTotalZar,
    payload.bbbeeLevel,
    payload.specificGoals
  );
  const fieldBundle = buildAcroFieldMap(payload, stampDate, disclosures, ppr);
  const fallbackRows = buildSbd4FallbackRows(payload.directors, disclosures);
  const selectedFiles = resolveReturnableTemplates({
    submissionChannel: payload.submissionChannel,
    organOfState: payload.organOfState,
    buyerName: payload.buyerName,
    municipality: payload.municipality,
  });
  const isMunicipal = selectedFiles[0] === 'mbd1.pdf';
  const invitingEntity =
    payload.organOfState?.trim() ||
    payload.buyerName?.trim() ||
    payload.municipality;

  let usedAcroForm = false;

  const formSlots: FormStampSlot[] = [
    {
      label: isMunicipal ? 'MBD 1' : 'SBD 1',
      templateFile: selectedFiles[0],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.tenderNumber },
        { x: 214, y: 686, value: invitingEntity },
        { x: 214, y: 652, value: payload.companyName },
        { x: 214, y: 618, value: payload.registrationNumber },
        { x: 214, y: 584, value: payload.csdMaaaNumber },
        { x: 214, y: 550, value: payload.taxPinNumber },
        { x: 214, y: 516, value: payload.cidbGrade },
        { x: 214, y: 482, value: formattedTotal },
      ],
      cleanSheet: {
        formTitle: isMunicipal
          ? 'MBD 1 — PART A: INVITATION TO BID'
          : 'SBD 1 — PART A: INVITATION TO BID',
        subtitle:
          'Standard Bidding Document — Returnable Bid Identification & Offer Summary',
        rows: [
          { label: 'BID NUMBER:', value: payload.tenderNumber },
          { label: 'ORGAN OF STATE / MUNICIPALITY:', value: invitingEntity },
          { label: 'NAME OF BIDDER:', value: payload.companyName },
          {
            label: 'COMPANY REGISTRATION NO.:',
            value: payload.registrationNumber,
          },
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
      templateFile: selectedFiles[1],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.companyName },
        { x: 214, y: 686, value: payload.registrationNumber },
        { x: 214, y: 652, value: fallbackRows[0]?.value ?? '' },
        { x: 214, y: 618, value: fallbackRows[1]?.value ?? '' },
        { x: 214, y: 584, value: fallbackRows[2]?.value ?? '' },
        { x: 214, y: 550, value: `${payload.tenderNumber} (${stampDate})` },
      ],
      cleanSheet: {
        formTitle: "SBD 4 — BIDDER'S DISCLOSURE (SCM INST. 14 OF 2026/27)",
        subtitle:
          'Declaration of Directors, State Employment & Linked CSD Enterprises',
        rows: [
          { label: 'LEGAL ENTITY NAME:', value: payload.companyName },
          { label: 'REGISTRATION NUMBER:', value: payload.registrationNumber },
          { label: 'CSD SUPPLIER NUMBER (MAAA):', value: payload.csdMaaaNumber },
          { label: 'TENDER REFERENCE:', value: payload.tenderNumber },
          ...fallbackRows,
          {
            label: 'INDEPENDENT BID DETERMINATION:',
            value:
              'YES — Bid prepared independently without collusion (PFMA SCM Inst. 14)',
          },
        ],
        declaration:
          'I, the undersigned, certify that all directors, Organ of State connections, and linked CSD enterprises disclosed above are complete and accurate in terms of PFMA SCM Instructions 12 & 14 of 2026/27.',
      },
    },
    {
      label: isMunicipal ? 'MBD 6.1' : 'SBD 6.1',
      templateFile: selectedFiles[2],
      flatCoordinates: [
        { x: 214, y: 720, value: payload.tenderNumber },
        { x: 214, y: 686, value: invitingEntity },
        { x: 214, y: 652, value: payload.companyName },
        { x: 214, y: 618, value: ppr.systemLabel },
        {
          x: 214,
          y: 584,
          value: `${ppr.claimedPoints.toFixed(2)} / ${ppr.maxPoints.toFixed(2)}`,
        },
        { x: 214, y: 550, value: formattedTotal },
      ],
      cleanSheet: {
        formTitle: isMunicipal
          ? 'MBD 6.1 — PREFERENCE POINTS CLAIM FORM (PPR 2022)'
          : 'SBD 6.1 — PREFERENCE POINTS CLAIM FORM (PPR 2022)',
        subtitle:
          'Preferential Procurement Regulations, 2022 — Specific Goals & B-BBEE Recognition',
        rows: [
          { label: 'TENDER REFERENCE:', value: payload.tenderNumber },
          { label: 'ORGAN OF STATE / MUNICIPALITY:', value: invitingEntity },
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

  for (let i = 0; i < formSlots.length; i++) {
    const slot = formSlots[i];
    const downloadedBuf = payload.returnablePdfBuffers?.[i];
    const loaded = await loadTemplateOrCreate(
      slot.templateFile,
      downloadedBuf
    );
    if (loaded.templateName) {
      templatesLoaded.push(loaded.templateName);
    }

    if (loaded.hasAcroFields) {
      usedAcroForm = true;
      await populateAcroForm(loaded.doc, fieldBundle);
    } else if (loaded.fromTenderPack && downloadedBuf) {
      await stampTenderPackPageAnchors(
        loaded.doc,
        downloadedBuf,
        fieldBundle,
        slot.flatCoordinates
      );
    } else if (loaded.loadedFromDisk) {
      const page = loaded.doc.getPages()[0];
      if (page) {
        await stampFlatCoordinates(loaded.doc, page, slot.flatCoordinates);
      }
    } else {
      const page = loaded.doc.getPages()[0];
      if (page) {
        await renderCleanReturnableSheet(
          loaded.doc,
          page,
          slot.cleanSheet,
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

    if (slot.label === 'SBD 4' && disclosures.requiresOverflowSchedule) {
      await appendSbd4OverflowSchedulePage(
        mergedPdf,
        payload,
        disclosures,
        stampDate
      );
    }
  }

  await appendResolutionOfDirectorsPage(mergedPdf, payload, stampDate);

  const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
  const initials = deriveSignatoryInitials(
    payload.signatoryName ?? payload.directors?.[0]?.fullName,
    payload.companyName
  );
  stampInitialsOnAllPages(mergedPdf, fontBold, initials);

  const pdfBytes = await mergedPdf.save();
  let extractedSummary = '';

  try {
    const extracted = await extractText(new Uint8Array(pdfBytes), {
      mergePages: true,
    });
    extractedSummary = extracted.text.slice(0, 320);
  } catch {
    extractedSummary = `Stamped ${formSlots.map((c) => c.label).join(', ')} returnables (${payload.tenderNumber}) for ${payload.companyName}.`;
  }

  const base64Pdf = Buffer.from(pdfBytes).toString('base64');
  const filePrefix = isMunicipal ? 'MBD_1_SBD4_MBD6_1' : 'SBD_1_4_6_1';

  return {
    fileName: `${payload.tenderId}_${filePrefix}_Stamped.pdf`,
    pageCount: mergedPdf.getPageCount(),
    byteLength: pdfBytes.byteLength,
    stampingMethod: usedAcroForm ? 'acroform' : 'coordinate-fallback',
    templatesLoaded,
    extractedSummary,
    formsStamped: formSlots.map((c) => c.label),
    base64Pdf,
  };
}

/**
 * Builds the single consolidated submission pack PDF under 30MB when a contractor
 * approves a tender on `/bid/[id]`:
 *   1) Cover Sheet & Compliance Matrix
 *   2) Stamped SBD/MBD 1, 4, 6.1 returnables + Resolution of Directors
 *   3) Active Compliance Vault PDFs / certified ID images from Convex `_storage`
 */
export async function buildMergedSubmissionPack(
  input: MergedSubmissionPackInput
): Promise<MergedSubmissionPackResult> {
  const pack = await PDFDocument.create();
  const fontBold = await pack.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pack.embedFont(StandardFonts.Helvetica);

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

  const sbdDoc = await PDFDocument.load(input.stampedSbdBytes);
  const sbdPages = await pack.copyPages(sbdDoc, sbdDoc.getPageIndices());
  for (const page of sbdPages) {
    pack.addPage(page);
  }

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

export async function extractPdfPagesPlainText(bytes: Uint8Array): Promise<{
  totalPages: number;
  pages: string[];
}> {
  const result = await extractText(bytes, { mergePages: false });
  return {
    totalPages: result.totalPages,
    pages: Array.isArray(result.text) ? result.text : [String(result.text)],
  };
}
