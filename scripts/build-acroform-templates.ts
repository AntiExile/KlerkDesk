import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PDFCheckBox,
  PDFDocument,
  PDFPage,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFForm,
} from 'pdf-lib';
import { getDocumentProxy } from 'unpdf';

interface PdfTextToken {
  str: string;
  x: number;
  xEnd: number;
  y: number;
}

interface TextFieldPlacement {
  kind: 'text';
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  multiline?: boolean;
}

interface CheckBoxPlacement {
  kind: 'checkbox';
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  size?: number;
}

type FieldPlacement = TextFieldPlacement | CheckBoxPlacement;

const TEMPLATES_DIR = path.join(process.cwd(), 'public', 'templates');

const APPENDED_SCHEDULE_MARKERS = [
  'ELECTRONIC BIDDER COMPLETION SCHEDULE',
  'OFFICIAL RETURNABLE SCHEDULE',
];

async function extractPageTokens(
  pdfBytes: Uint8Array
): Promise<PdfTextToken[][]> {
  const proxy = await getDocumentProxy(new Uint8Array(pdfBytes));
  const pages: PdfTextToken[][] = [];

  for (let p = 1; p <= proxy.numPages; p++) {
    const page = await proxy.getPage(p);
    const tc = await page.getTextContent();
    const tokens: PdfTextToken[] = [];
    for (const raw of tc.items as Array<{
      str?: string;
      transform?: number[];
      width?: number;
    }>) {
      const text = raw.str?.trim();
      if (!text || !raw.transform) continue;
      const x = raw.transform[4] ?? 0;
      const y = raw.transform[5] ?? 0;
      const width = raw.width ?? 0;
      tokens.push({ str: text, x, xEnd: x + width, y });
    }
    pages.push(tokens);
  }

  return pages;
}

function isPreviouslyAppendedSchedulePage(tokens: PdfTextToken[]): boolean {
  const joined = tokens.map((t) => t.str).join(' ').toUpperCase();
  return APPENDED_SCHEDULE_MARKERS.some((marker) => joined.includes(marker));
}

function findAnchor(
  tokens: PdfTextToken[],
  pattern: RegExp,
  expectedY?: number,
  maxDeltaY = 40
): PdfTextToken | null {
  const candidates = tokens.filter((t) => pattern.test(t.str));
  if (candidates.length === 0) return null;
  if (expectedY === undefined) return candidates[0];

  let best: PdfTextToken | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(c.y - expectedY);
    if (dist <= maxDeltaY && dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

function anchorRightX(
  tokens: PdfTextToken[],
  pattern: RegExp,
  fallbackX: number,
  expectedY?: number,
  padding = 6
): { x: number; y: number } {
  const match = findAnchor(tokens, pattern, expectedY);
  if (!match) {
    return { x: fallbackX, y: expectedY ?? 700 };
  }
  return {
    x: Math.max(fallbackX, match.xEnd + padding),
    y: match.y,
  };
}

function anchorY(
  tokens: PdfTextToken[],
  pattern: RegExp,
  fallbackY: number,
  maxDeltaY = 40
): number {
  const match = findAnchor(tokens, pattern, fallbackY, maxDeltaY);
  return match ? match.y : fallbackY;
}

function addTextWidget(
  form: PDFForm,
  page: PDFPage,
  spec: TextFieldPlacement
): void {
  const tf = form.createTextField(spec.name);
  if (spec.multiline) {
    tf.enableMultiline();
  }
  tf.addToPage(page, {
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    borderWidth: 0,
    textColor: rgb(0.05, 0.07, 0.12),
  });
  tf.setFontSize(spec.fontSize ?? 8);
}

function addCheckBoxWidget(
  form: PDFForm,
  page: PDFPage,
  spec: CheckBoxPlacement
): PDFCheckBox {
  const size = spec.size ?? 9;
  const cb = form.createCheckBox(spec.name);
  cb.addToPage(page, {
    x: spec.x,
    y: spec.y,
    width: size,
    height: size,
    borderWidth: 0.75,
    borderColor: rgb(0.28, 0.32, 0.38),
    backgroundColor: rgb(1, 1, 1),
    textColor: rgb(0.05, 0.07, 0.12),
  });
  return cb;
}

function drawTinyLabel(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number
): void {
  page.drawText(text, {
    x,
    y,
    size: 6.5,
    font,
    color: rgb(0.28, 0.32, 0.38),
  });
}

function buildSbd1Placements(tokensByPage: PdfTextToken[][]): FieldPlacement[] {
  const p0 = tokensByPage[0] ?? [];
  const p1 = tokensByPage[1] ?? p0;
  const partBPageIdx = tokensByPage.length > 1 ? 1 : 0;

  const deptY = anchorY(p0, /DEPARTMENT\/\s*PUBLIC ENTITY/i, 755);
  const bidPos = anchorRightX(p0, /^BID NUMBER:/i, 96, 742);
  const closeDatePos = anchorRightX(p0, /^CLOSING DATE:/i, 408, 742);
  const closeTimeY = anchorY(p0, /^TIME:/i, 738);
  const descPos = anchorRightX(p0, /^DESCRIPTION/i, 98, 729);
  const bidderY = anchorY(p0, /^NAME OF BIDDER/i, 580);
  const postalY = anchorY(p0, /^POSTAL ADDRESS/i, 571);
  const streetY = anchorY(p0, /^STREET ADDRESS/i, 562);
  const telY = anchorY(p0, /^TELEPHONE NUMBER/i, 553);
  const cellY = anchorY(p0, /^CELLPHONE NUMBER/i, 544);
  const emailY = anchorY(p0, /^E-MAIL ADDRESS/i, 526);
  const vatY = anchorY(p0, /^VAT REGISTRATION NUMBER/i, 517);
  const pinPos = anchorRightX(p0, /^SYSTEM PIN:/i, 352, 487);
  const csdY = anchorY(p0, /^No:/i, 483);
  const accYesAnchor = findAnchor(p0, /^Yes$/, 474, 25);
  const accNoAnchor = findAnchor(p0, /^No$/, 466, 25);
  const foreignAnchor = findAnchor(p0, /Yes No/i, 469, 25);

  const sigPos = anchorRightX(p1, /SIGNATURE OF BIDDER:/i, 237, 634);
  const capPos = anchorRightX(
    p1,
    /CAPACITY UNDER WHICH THIS BID IS SIGNED:/i,
    270,
    613
  );
  const datePos = anchorRightX(p1, /^DATE:/i, 194, 582);

  return [
    {
      kind: 'text',
      name: 'inviting_department',
      pageIndex: 0,
      x: 150,
      y: deptY - 2,
      width: 395,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'bid_number',
      pageIndex: 0,
      x: bidPos.x,
      y: bidPos.y - 2,
      width: 245,
      height: 10,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'closing_date',
      pageIndex: 0,
      x: closeDatePos.x,
      y: closeDatePos.y - 2,
      width: 82,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'closing_time',
      pageIndex: 0,
      x: 520,
      y: closeTimeY - 2,
      width: 48,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'bid_description',
      pageIndex: 0,
      x: descPos.x,
      y: descPos.y - 2,
      width: 450,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'bidder_legal_name',
      pageIndex: 0,
      x: 150,
      y: bidderY - 2,
      width: 395,
      height: 10,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'postal_address',
      pageIndex: 0,
      x: 150,
      y: postalY - 2,
      width: 395,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'street_address',
      pageIndex: 0,
      x: 150,
      y: streetY - 2,
      width: 395,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'telephone_number',
      pageIndex: 0,
      x: 476,
      y: telY - 2,
      width: 80,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'cellphone_number',
      pageIndex: 0,
      x: 150,
      y: cellY - 2,
      width: 240,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'email_address',
      pageIndex: 0,
      x: 150,
      y: emailY - 2,
      width: 395,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'vat_registration_number',
      pageIndex: 0,
      x: 150,
      y: vatY - 2,
      width: 240,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'tcs_pin',
      pageIndex: 0,
      x: pinPos.x,
      y: pinPos.y - 1,
      width: 102,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'csd_number_digits',
      pageIndex: 0,
      x: 547,
      y: csdY + 2,
      width: 44,
      height: 11,
      fontSize: 7.5,
    },
    {
      kind: 'checkbox',
      name: 'accredited_rep_yes',
      pageIndex: 0,
      x: (accYesAnchor?.xEnd ?? 315) + 3,
      y: (accYesAnchor?.y ?? 474) - 1,
      size: 8,
    },
    {
      kind: 'checkbox',
      name: 'accredited_rep_no',
      pageIndex: 0,
      x: (accNoAnchor?.xEnd ?? 324) + 3,
      y: (accNoAnchor?.y ?? 466) - 1,
      size: 8,
    },
    {
      kind: 'checkbox',
      name: 'foreign_supplier_yes',
      pageIndex: 0,
      x: (foreignAnchor?.xEnd ?? 465) + 3,
      y: (foreignAnchor?.y ?? 469) - 1,
      size: 8,
    },
    {
      kind: 'checkbox',
      name: 'foreign_supplier_no',
      pageIndex: 0,
      x: (foreignAnchor?.xEnd ?? 465) + 15,
      y: (foreignAnchor?.y ?? 469) - 1,
      size: 8,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_certificate_yes',
      pageIndex: partBPageIdx,
      x: 145,
      y: 536,
      size: 8,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_certificate_no',
      pageIndex: partBPageIdx,
      x: 185,
      y: 536,
      size: 8,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_affidavit_yes',
      pageIndex: partBPageIdx,
      x: 345,
      y: 536,
      size: 8,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_affidavit_no',
      pageIndex: partBPageIdx,
      x: 385,
      y: 536,
      size: 8,
    },
    {
      kind: 'text',
      name: 'signature_stamp',
      pageIndex: partBPageIdx,
      x: sigPos.x,
      y: sigPos.y - 2,
      width: 170,
      height: 12,
      fontSize: 8.5,
    },
    {
      kind: 'text',
      name: 'signatory_name',
      pageIndex: partBPageIdx,
      x: 416,
      y: sigPos.y - 2,
      width: 140,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'signatory_capacity',
      pageIndex: partBPageIdx,
      x: capPos.x,
      y: capPos.y - 2,
      width: 220,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'signature_date',
      pageIndex: partBPageIdx,
      x: datePos.x,
      y: datePos.y - 2,
      width: 120,
      height: 12,
      fontSize: 8,
    },
  ];
}

function buildMbd1Placements(tokensByPage: PdfTextToken[][]): FieldPlacement[] {
  const p0 = tokensByPage[0] ?? [];
  const deptPos = anchorRightX(p0, /MUNICIPAL ENTITY\)/i, 272, 777);
  const bidPos = anchorRightX(p0, /^BID NUMBER:/i, 80, 771);
  const descPos = anchorRightX(p0, /^DESCRIPTION/i, 80, 765);
  const bidderY = anchorY(p0, /^NAME OF BIDDER/i, 711);
  const postalY = anchorY(p0, /^POSTAL ADDRESS/i, 705);
  const streetY = anchorY(p0, /^STREET ADDRESS/i, 699);
  const telY = anchorY(p0, /^TELEPHONE NUMBER/i, 693);
  const cellY = anchorY(p0, /^CELLPHONE NUMBER/i, 687);
  const emailY = anchorY(p0, /^E-MAIL ADDRESS/i, 675);
  const vatY = anchorY(p0, /^VAT REGISTRATION NUMBER/i, 669);
  const pinPos = anchorRightX(p0, /^TCS PIN:/i, 342, 663);
  const sigY = anchorY(p0, /^SIGNATURE OF BIDDER:/i, 352);
  const capY = anchorY(p0, /^CAPACITY UNDER WHICH THIS BID IS SIGNED:/i, 338);
  const dateY = anchorY(p0, /^DATE:/i, 324);

  return [
    {
      kind: 'text',
      name: 'inviting_department',
      pageIndex: 0,
      x: deptPos.x,
      y: deptPos.y - 2,
      width: 280,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'bid_number',
      pageIndex: 0,
      x: bidPos.x,
      y: bidPos.y - 1,
      width: 170,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'closing_date',
      pageIndex: 0,
      x: 340,
      y: bidPos.y - 1,
      width: 90,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'closing_time',
      pageIndex: 0,
      x: 470,
      y: bidPos.y - 1,
      width: 75,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'bid_description',
      pageIndex: 0,
      x: descPos.x,
      y: descPos.y - 1,
      width: 465,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'bidder_legal_name',
      pageIndex: 0,
      x: 150,
      y: bidderY - 1,
      width: 395,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'postal_address',
      pageIndex: 0,
      x: 150,
      y: postalY - 1,
      width: 395,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'street_address',
      pageIndex: 0,
      x: 150,
      y: streetY - 1,
      width: 395,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'telephone_number',
      pageIndex: 0,
      x: 440,
      y: telY - 1,
      width: 105,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'cellphone_number',
      pageIndex: 0,
      x: 150,
      y: cellY - 1,
      width: 240,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'email_address',
      pageIndex: 0,
      x: 150,
      y: emailY - 1,
      width: 395,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'vat_registration_number',
      pageIndex: 0,
      x: 150,
      y: vatY - 1,
      width: 240,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'tcs_pin',
      pageIndex: 0,
      x: pinPos.x,
      y: pinPos.y - 1,
      width: 95,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'text',
      name: 'csd_number_digits',
      pageIndex: 0,
      x: 455,
      y: pinPos.y - 1,
      width: 90,
      height: 8,
      fontSize: 6.5,
    },
    {
      kind: 'checkbox',
      name: 'accredited_rep_yes',
      pageIndex: 0,
      x: 322,
      y: 656,
      size: 7.5,
    },
    {
      kind: 'checkbox',
      name: 'accredited_rep_no',
      pageIndex: 0,
      x: 395,
      y: 656,
      size: 7.5,
    },
    {
      kind: 'checkbox',
      name: 'foreign_supplier_yes',
      pageIndex: 0,
      x: 220,
      y: 434,
      size: 7.5,
    },
    {
      kind: 'checkbox',
      name: 'foreign_supplier_no',
      pageIndex: 0,
      x: 271,
      y: 434,
      size: 7.5,
    },
    {
      kind: 'text',
      name: 'signature_stamp',
      pageIndex: 0,
      x: 149,
      y: sigY - 2,
      width: 150,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'signatory_name',
      pageIndex: 0,
      x: 315,
      y: sigY - 2,
      width: 190,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'signatory_capacity',
      pageIndex: 0,
      x: 171,
      y: capY - 2,
      width: 210,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'signature_date',
      pageIndex: 0,
      x: 138,
      y: dateY - 2,
      width: 120,
      height: 10,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'municipal_account_number',
      pageIndex: 0,
      x: 180,
      y: 294,
      width: 190,
      height: 11,
      fontSize: 7.5,
    },
    {
      kind: 'checkbox',
      name: 'municipal_arrears_no',
      pageIndex: 0,
      x: 415,
      y: 295,
      size: 9,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_certificate_yes',
      pageIndex: 0,
      x: 145,
      y: 276,
      size: 8.5,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_certificate_no',
      pageIndex: 0,
      x: 185,
      y: 276,
      size: 8.5,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_affidavit_yes',
      pageIndex: 0,
      x: 345,
      y: 276,
      size: 8.5,
    },
    {
      kind: 'checkbox',
      name: 'bbbee_affidavit_no',
      pageIndex: 0,
      x: 385,
      y: 276,
      size: 8.5,
    },
  ];
}

function buildSbd4Placements(tokensByPage: PdfTextToken[][]): FieldPlacement[] {
  const p0 = tokensByPage[0] ?? [];
  const p1 = tokensByPage[1] ?? p0;
  const page2Idx = tokensByPage.length > 1 ? 1 : 0;

  const stateYesNo = findAnchor(p0, /^YES\/NO$/i, 651, 30);
  const stateTableHeaderY = anchorY(p0, /^Full Name$/i, 598);
  const connYesNo = findAnchor(p0, /^YES\/NO$/i, 360, 30);
  const connDetailY = anchorY(p0, /…{5,}/, 324);
  const entYesNo = findAnchor(p0, /^YES\/NO$/i, 295, 30);
  const csdHeaderY = anchorY(p0, /Supplier registration number/i, 259);

  const sigLineY = anchorY(p1, /^Signature$/i, 601);
  const nameLineY = anchorY(p1, /^Designation$/i, 573);

  const stateRowYs = [1, 2, 3].map(
    (idx) => stateTableHeaderY - 22 - (idx - 1) * 24
  );
  const entRowYs = [1, 2, 3, 4].map(
    (idx) => csdHeaderY - 12 - (idx - 1) * 9.5
  );

  const placements: FieldPlacement[] = [
    {
      kind: 'checkbox',
      name: 'state_employed_yes',
      pageIndex: 0,
      x: (stateYesNo?.xEnd ?? 120) + 6,
      y: (stateYesNo?.y ?? 651) - 1,
      size: 8.5,
    },
    {
      kind: 'checkbox',
      name: 'state_employed_no',
      pageIndex: 0,
      x: (stateYesNo?.xEnd ?? 120) + 28,
      y: (stateYesNo?.y ?? 651) - 1,
      size: 8.5,
    },
    ...stateRowYs.flatMap((rowY, i): FieldPlacement[] => {
      const idx = i + 1;
      return [
        {
          kind: 'text',
          name: `state_person_name_${idx}`,
          pageIndex: 0,
          x: 47,
          y: rowY,
          width: 106,
          height: 16,
          fontSize: 7.5,
        },
        {
          kind: 'text',
          name: `state_relationship_${idx}`,
          pageIndex: 0,
          x: 157,
          y: rowY,
          width: 160,
          height: 16,
          fontSize: 7.5,
        },
        {
          kind: 'text',
          name: `state_institution_${idx}`,
          pageIndex: 0,
          x: 322,
          y: rowY,
          width: 226,
          height: 16,
          fontSize: 7.5,
        },
      ];
    }),
    {
      kind: 'checkbox',
      name: 'connected_person_yes',
      pageIndex: 0,
      x: (connYesNo?.xEnd ?? 456) + 6,
      y: (connYesNo?.y ?? 360) - 1,
      size: 8.5,
    },
    {
      kind: 'checkbox',
      name: 'connected_person_no',
      pageIndex: 0,
      x: (connYesNo?.xEnd ?? 456) + 28,
      y: (connYesNo?.y ?? 360) - 1,
      size: 8.5,
    },
    {
      kind: 'text',
      name: 'connected_person_details',
      pageIndex: 0,
      x: 61,
      y: connDetailY - 1,
      width: 492,
      height: 12,
      fontSize: 7.5,
    },
    {
      kind: 'checkbox',
      name: 'other_enterprises_yes',
      pageIndex: 0,
      x: (entYesNo?.xEnd ?? 306) + 6,
      y: (entYesNo?.y ?? 295) - 1,
      size: 8.5,
    },
    {
      kind: 'checkbox',
      name: 'other_enterprises_no',
      pageIndex: 0,
      x: (entYesNo?.xEnd ?? 306) + 28,
      y: (entYesNo?.y ?? 295) - 1,
      size: 8.5,
    },
    ...entRowYs.flatMap((rowY, i): FieldPlacement[] => {
      const idx = i + 1;
      return [
        {
          kind: 'text',
          name: `linked_enterprise_csd_${idx}`,
          pageIndex: 0,
          x: 47,
          y: rowY,
          width: 105,
          height: 9,
          fontSize: 6.8,
        },
        {
          kind: 'text',
          name: `linked_enterprise_name_${idx}`,
          pageIndex: 0,
          x: 158,
          y: rowY,
          width: 160,
          height: 9,
          fontSize: 6.8,
        },
        {
          kind: 'text',
          name: `linked_enterprise_status_${idx}`,
          pageIndex: 0,
          x: 323,
          y: rowY,
          width: 220,
          height: 9,
          fontSize: 6.8,
        },
      ];
    }),
    {
      kind: 'text',
      name: 'declarant_signature',
      pageIndex: page2Idx,
      x: 58,
      y: sigLineY + 7,
      width: 85,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'declaration_date',
      pageIndex: page2Idx,
      x: 151,
      y: sigLineY + 7,
      width: 105,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'declarant_position',
      pageIndex: page2Idx,
      x: 58,
      y: nameLineY + 7,
      width: 85,
      height: 12,
      fontSize: 7.5,
    },
    {
      kind: 'text',
      name: 'declarant_full_name',
      pageIndex: page2Idx,
      x: 148,
      y: nameLineY + 7,
      width: 220,
      height: 12,
      fontSize: 8,
    },
  ];

  return placements;
}

function buildPpr61Placements(tokensByPage: PdfTextToken[][]): FieldPlacement[] {
  const p0 = tokensByPage[0] ?? [];
  const p2 = tokensByPage[2] ?? p0;
  const p3 = tokensByPage[3] ?? p0;
  const page3Idx = tokensByPage.length > 2 ? 2 : 0;
  const page4Idx = tokensByPage.length > 3 ? 3 : 0;

  const sysY = anchorY(p0, /80\/20 preference point system/i, 457);
  const specGoalsSummaryY = anchorY(p0, /^SPECIFIC GOALS$/i, 204);
  const tableHeaderBottomY = anchorY(p2, /^\(To be completed/i, 295);
  const companyNameY = anchorY(p2, /Name of company\/firm/i, 107);
  const firmTypeY = anchorY(p2, /TYPE OF COMPANY\/ FIRM/i, 77);
  const sigY = anchorY(p3, /SIGNATURE\(S\) OF TENDERER\(S\)/i, 336);
  const surnameY = anchorY(p3, /^SURNAME AND NAME$/i, 321);
  const dateY = anchorY(p3, /^DATE:$/i, 313);

  const rowYs = [1, 2, 3].map(
    (idx) => tableHeaderBottomY - 26 - (idx - 1) * 28
  );

  return [
    {
      kind: 'text',
      name: 'preference_system',
      pageIndex: 0,
      x: 452,
      y: sysY - 2,
      width: 95,
      height: 14,
      fontSize: 8.5,
    },
    {
      kind: 'text',
      name: 'total_preference_points_claimed',
      pageIndex: 0,
      x: 486,
      y: specGoalsSummaryY - 2,
      width: 58,
      height: 14,
      fontSize: 8.5,
    },
    ...rowYs.flatMap((rowY, i): FieldPlacement[] => {
      const idx = i + 1;
      return [
        {
          kind: 'text',
          name: `specific_goals_claimed_${idx}`,
          pageIndex: page3Idx,
          x: 48,
          y: rowY,
          width: 132,
          height: 22,
          fontSize: 7.5,
          multiline: true,
        },
        {
          kind: 'text',
          name: `max_points_${idx}`,
          pageIndex: page3Idx,
          x: 294,
          y: rowY + 4,
          width: 68,
          height: 14,
          fontSize: 8,
        },
        {
          kind: 'text',
          name: `points_claimed_${idx}`,
          pageIndex: page3Idx,
          x: 468,
          y: rowY + 4,
          width: 68,
          height: 14,
          fontSize: 8,
        },
      ];
    }),
    {
      kind: 'text',
      name: 'claimant_company_name',
      pageIndex: page3Idx,
      x: 215,
      y: companyNameY - 2,
      width: 325,
      height: 13,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'bbbee_status_level',
      pageIndex: page3Idx,
      x: 340,
      y: firmTypeY - 2,
      width: 200,
      height: 13,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'claimant_signature',
      pageIndex: page4Idx,
      x: 46,
      y: sigY + 7,
      width: 185,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'claimant_signatory_name',
      pageIndex: page4Idx,
      x: 126,
      y: surnameY - 1,
      width: 210,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'claimant_capacity',
      pageIndex: page4Idx,
      x: 345,
      y: surnameY - 1,
      width: 195,
      height: 12,
      fontSize: 8,
    },
    {
      kind: 'text',
      name: 'claimant_date',
      pageIndex: page4Idx,
      x: 106,
      y: dateY - 1,
      width: 150,
      height: 12,
      fontSize: 8,
    },
  ];
}

function drawTemplateFieldMicroLabels(
  fileName: string,
  pages: PDFPage[],
  fontBold: PDFFont
): void {
  if (fileName === 'sbd1.pdf' && pages[1]) {
    drawTinyLabel(pages[1], fontBold, 'B-BBEE CERT (Y/N):', 68, 538);
    drawTinyLabel(pages[1], fontBold, 'SWORN AFFIDAVIT (Y/N):', 250, 538);
  }
  if (fileName === 'mbd1.pdf' && pages[0]) {
    drawTinyLabel(pages[0], fontBold, 'MUNICIPAL ACCOUNT NO.:', 44, 296);
    drawTinyLabel(pages[0], fontBold, 'NO ARREARS >90D:', 345, 296);
    drawTinyLabel(pages[0], fontBold, 'B-BBEE CERT (Y/N):', 68, 278);
    drawTinyLabel(pages[0], fontBold, 'SWORN AFFIDAVIT (Y/N):', 250, 278);
  }
  if (fileName === 'sbd4.pdf' && pages[0]) {
    drawTinyLabel(pages[0], fontBold, 'YES', 127, 661);
    drawTinyLabel(pages[0], fontBold, 'NO', 149, 661);
    drawTinyLabel(pages[0], fontBold, 'YES', 463, 370);
    drawTinyLabel(pages[0], fontBold, 'NO', 485, 370);
    drawTinyLabel(pages[0], fontBold, 'YES', 313, 305);
    drawTinyLabel(pages[0], fontBold, 'NO', 335, 305);
  }
}

async function rebuildTemplate(
  fileName: 'sbd1.pdf' | 'mbd1.pdf' | 'sbd4.pdf' | 'sbd6_1.pdf' | 'mbd6_1.pdf'
): Promise<void> {
  const fullPath = path.join(TEMPLATES_DIR, fileName);
  const existingBytes = new Uint8Array(await fs.readFile(fullPath));
  const rawTokensByPage = await extractPageTokens(existingBytes);

  const sourceDoc = await PDFDocument.load(existingBytes);
  const keptIndices: number[] = [];
  const keptTokens: PdfTextToken[][] = [];

  for (let i = 0; i < sourceDoc.getPageCount(); i++) {
    const tokens = rawTokensByPage[i] ?? [];
    if (isPreviouslyAppendedSchedulePage(tokens)) {
      continue;
    }
    keptIndices.push(i);
    keptTokens.push(tokens);
  }

  if (keptIndices.length === 0) {
    throw new Error(
      `${fileName}: 0 official returnable pages remained after stripping schedule pages.`
    );
  }

  const outDoc = await PDFDocument.create();
  const copiedPages = await outDoc.copyPages(sourceDoc, keptIndices);
  for (const page of copiedPages) {
    outDoc.addPage(page);
  }

  const fontRegular = await outDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
  const outPages = outDoc.getPages();
  const form = outDoc.getForm();

  drawTemplateFieldMicroLabels(fileName, outPages, fontBold);

  let placements: FieldPlacement[];
  switch (fileName) {
    case 'sbd1.pdf':
      placements = buildSbd1Placements(keptTokens);
      break;
    case 'mbd1.pdf':
      placements = buildMbd1Placements(keptTokens);
      break;
    case 'sbd4.pdf':
      placements = buildSbd4Placements(keptTokens);
      break;
    case 'sbd6_1.pdf':
    case 'mbd6_1.pdf':
      placements = buildPpr61Placements(keptTokens);
      break;
  }

  for (const spec of placements) {
    const page = outPages[spec.pageIndex] ?? outPages[0];
    if (!page) continue;
    if (spec.kind === 'checkbox') {
      addCheckBoxWidget(form, page, spec);
    } else {
      addTextWidget(form, page, spec);
    }
  }

  form.updateFieldAppearances(fontRegular);
  const savedBytes = await outDoc.save();
  await fs.writeFile(fullPath, savedBytes);

  console.log(
    `Built ${fileName}: ${outDoc.getPageCount()} official pages, ${form.getFields().length} in-place AcroForm fields`
  );
}

async function main(): Promise<void> {
  const targets = [
    'sbd1.pdf',
    'mbd1.pdf',
    'sbd4.pdf',
    'sbd6_1.pdf',
    'mbd6_1.pdf',
  ] as const;

  for (const fileName of targets) {
    await rebuildTemplate(fileName);
  }
}

void main().catch((err) => {
  console.error('Failed to build in-place AcroForm templates:', err);
  process.exitCode = 1;
});
