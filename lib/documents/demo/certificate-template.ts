import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { generateQrDataUrl } from "@/lib/crypto/qrcode";

/**
 * Renders the fictional "Chekkam Demo University" certificate used by the
 * document-verification demo kit (scripts/seed-demo-trust.ts). Deliberately
 * NOT styled with Chekkam's own maroon brand (see lib/documents/certificate.ts
 * for that) — this represents the *issuing institution's own* document
 * template, matching the same "neutral, clearly-not-Chekkam" convention
 * already used for app/partner-demo/page.tsx's fictional university. Chekkam
 * only appears in the small verification footer, exactly as it would on a
 * real institution's Chekkam-enabled certificate.
 *
 * A pure function of its input data — no Supabase/network access — so it is
 * directly unit-testable and, given the same input, byte-for-byte
 * deterministic (see the fixed `issueDateIso`/no-randomness design), which
 * matters for the demo kit's "download twice, get the same file" property.
 */
export type DemoCertificateData = {
  title: string;
  recipientName: string;
  programme: string;
  result: string;
  issueDateIso: string;
  institutionName: string;
  officerName: string;
  officerTitle: string;
  verificationId: string;
  pinCode: string;
  qrPayload: string;
  /** True for the deliberately-altered demo copy — adds a visible "TEST COPY" banner. */
  isTestCopy?: boolean;
};

const COLOR = {
  navy: rgb(0x0f / 255, 0x1f / 255, 0x3d / 255),
  gold: rgb(0xb8 / 255, 0x86 / 255, 0x2f / 255),
  ink: rgb(0x1a / 255, 0x1a / 255, 0x1a / 255),
  muted: rgb(0x45 / 255, 0x45 / 255, 0x45 / 255),
  faint: rgb(0x78 / 255, 0x78 / 255, 0x78 / 255),
  tint: rgb(0xf4 / 255, 0xf5 / 255, 0xf7 / 255),
  border: rgb(0xd8 / 255, 0xda / 255, 0xdf / 255),
  white: rgb(1, 1, 1),
  demoRed: rgb(0.7, 0.1, 0.1),
};

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = COLOR.ink) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font, color });
}

export async function generateDemoCertificatePdf(data: DemoCertificateData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${data.title} — ${data.recipientName} (DEMONSTRATION DOCUMENT)`);
  pdfDoc.setSubject("Chekkam document-verification demo kit — fictional data only");
  pdfDoc.setProducer("Chekkam demo kit");
  // Fixed dates keep repeated regenerations of the same input byte-identical
  // (no wall-clock timestamp drifting into the output).
  const fixedDate = new Date(data.issueDateIso);
  pdfDoc.setCreationDate(fixedDate);
  pdfDoc.setModificationDate(fixedDate);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  // --- Always-on-top demonstration banner — impossible to mistake for a real document. ---
  const bannerHeight = 26;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - bannerHeight,
    width: PAGE_WIDTH,
    height: bannerHeight,
    color: COLOR.demoRed,
  });
  drawCentered(
    page,
    "DEMONSTRATION DOCUMENT — FICTIONAL DATA — NOT A REAL CERTIFICATE",
    PAGE_HEIGHT - bannerHeight + 8,
    helveticaBold,
    11,
    COLOR.white
  );

  let cursorY = PAGE_HEIGHT - bannerHeight - 50;

  // --- Institution header (the fictional university's own letterhead style) ---
  drawCentered(page, data.institutionName.toUpperCase(), cursorY, helveticaBold, 15, COLOR.navy);
  cursorY -= 18;
  drawCentered(page, "Office of the Registrar", cursorY, helveticaOblique, 10, COLOR.muted);
  cursorY -= 6;
  page.drawLine({
    start: { x: MARGIN + 60, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN - 60, y: cursorY },
    thickness: 1.2,
    color: COLOR.gold,
  });
  cursorY -= 44;

  // --- Title ---
  drawCentered(page, data.title, cursorY, timesRomanBold, 26, COLOR.ink);
  cursorY -= 44;

  // --- Body ---
  const bodyLine1 = "This is to certify that";
  drawCentered(page, bodyLine1, cursorY, helvetica, 12, COLOR.muted);
  cursorY -= 28;
  drawCentered(page, data.recipientName, cursorY, timesRomanBold, 20, COLOR.navy);
  cursorY -= 30;
  const bodyLine2 = `has ${data.result.toLowerCase()} the programme`;
  drawCentered(page, bodyLine2, cursorY, helvetica, 12, COLOR.muted);
  cursorY -= 26;
  drawCentered(page, data.programme, cursorY, helveticaBold, 15, COLOR.ink);
  cursorY -= 40;
  drawCentered(page, `Issued ${formatDate(data.issueDateIso)}`, cursorY, helvetica, 11, COLOR.muted);
  cursorY -= 70;

  // --- Officer / signature block ---
  const sigLineWidth = 200;
  const sigX = (PAGE_WIDTH - sigLineWidth) / 2;
  page.drawLine({
    start: { x: sigX, y: cursorY },
    end: { x: sigX + sigLineWidth, y: cursorY },
    thickness: 1,
    color: COLOR.ink,
  });
  cursorY -= 14;
  drawCentered(page, data.officerName, cursorY, helveticaBold, 11, COLOR.ink);
  cursorY -= 14;
  drawCentered(page, data.officerTitle, cursorY, helveticaOblique, 9.5, COLOR.muted);
  cursorY -= 46;

  // --- Verification footer (this is the only place Chekkam appears) ---
  const footerTop = cursorY;
  page.drawLine({
    start: { x: MARGIN, y: footerTop },
    end: { x: PAGE_WIDTH - MARGIN, y: footerTop },
    thickness: 0.75,
    color: COLOR.border,
  });
  const footerY = footerTop - 20;
  const qrSize = 88;
  const qrDataUrl = await generateQrDataUrl(data.qrPayload);
  const qrImage = await pdfDoc.embedPng(qrDataUrl);
  page.drawImage(qrImage, { x: MARGIN, y: footerY - qrSize + 20, width: qrSize, height: qrSize });

  const textX = MARGIN + qrSize + 20;
  page.drawText("VERIFY THIS CERTIFICATE", {
    x: textX,
    y: footerY,
    size: 8.5,
    font: helveticaBold,
    color: COLOR.faint,
  });
  page.drawText("Scan the QR code, or check the ID below at Chekkam:", {
    x: textX,
    y: footerY - 13,
    size: 8.5,
    font: helvetica,
    color: COLOR.muted,
  });
  page.drawText("VERIFICATION ID", {
    x: textX,
    y: footerY - 32,
    size: 7.5,
    font: helvetica,
    color: COLOR.faint,
  });
  page.drawText(data.verificationId, {
    x: textX,
    y: footerY - 47,
    size: 14,
    font: courierBold,
    color: COLOR.ink,
  });
  page.drawText("PIN", {
    x: textX + 190,
    y: footerY - 32,
    size: 7.5,
    font: helvetica,
    color: COLOR.faint,
  });
  page.drawText(data.pinCode, {
    x: textX + 190,
    y: footerY - 47,
    size: 14,
    font: courier,
    color: COLOR.ink,
  });
  const urlLines = wrapText(data.qrPayload, courier, 7.5, PAGE_WIDTH - MARGIN - textX);
  urlLines.slice(0, 2).forEach((line, i) => {
    page.drawText(line, {
      x: textX,
      y: footerY - 62 - i * 10,
      size: 7.5,
      font: courier,
      color: COLOR.faint,
    });
  });

  // --- Fictional-data notice ---
  const noticeY = footerY - qrSize + 4;
  const notice =
    "All names, dates, and identifiers on this document are fictional and created solely to " +
    "demonstrate the Chekkam document-verification workflow for the MINPOSTEL ICT Innovation " +
    "Week competition. This is not a real academic credential.";
  const noticeLines = wrapText(notice, helveticaOblique, 7.5, PAGE_WIDTH - MARGIN * 2);
  noticeLines.forEach((line, i) => {
    page.drawText(line, {
      x: MARGIN,
      y: noticeY - i * 10,
      size: 7.5,
      font: helveticaOblique,
      color: COLOR.faint,
    });
  });

  // --- Test-copy overlay (tampered demo variant only) ---
  if (data.isTestCopy) {
    const bandY = PAGE_HEIGHT / 2 - 14;
    page.drawRectangle({
      x: 0,
      y: bandY,
      width: PAGE_WIDTH,
      height: 28,
      color: COLOR.demoRed,
      opacity: 0.88,
    });
    drawCentered(page, "TEST COPY — ALTERED FOR DEMONSTRATION, DO NOT TREAT AS GENUINE", bandY + 8, helveticaBold, 11, COLOR.white);
  }

  return pdfDoc.save();
}

/** Predictable, clearly-labelled download filename. */
export function demoCertificateFilename(verificationId: string, suffix?: "TAMPERED"): string {
  return suffix ? `${verificationId}-${suffix}.pdf` : `${verificationId}.pdf`;
}
