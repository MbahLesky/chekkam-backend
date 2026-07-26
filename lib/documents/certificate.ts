import { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { generateQrDataUrl } from "@/lib/crypto/qrcode";

/**
 * Printable verification certificate (SRS FR-048, CLAUDE.md §10.1). The
 * `documents` table stores only a hash/signature, never the original file —
 * so this is a detached attestation of the signed record, not a stamped
 * copy of the original. Extracted like sign-document.ts/verify.ts so the
 * HTTP route stays a thin, testable wrapper.
 */
export type CertificateDocument = {
  id: string;
  institution_id: string;
  institution_name: string | null;
  document_type: string;
  recipient_name: string | null;
  status: "active" | "revoked";
  verification_id: string;
  pin_code: string | null;
  qr_payload: string;
  issued_at: string;
  expiry_date: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
};

/** Fetches the fields needed for a certificate. Returns null if the document doesn't exist. */
export async function fetchDocumentForCertificate(
  admin: SupabaseClient,
  documentId: string
): Promise<CertificateDocument | null> {
  const { data: doc } = await admin
    .from("documents")
    .select(
      "id, institution_id, document_type, recipient_name, status, verification_id, pin_code, qr_payload, issued_at, expiry_date, revoked_at, revocation_reason, institutions(name)"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return null;

  const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;
  return {
    id: doc.id,
    institution_id: doc.institution_id,
    institution_name: institution?.name ?? null,
    document_type: doc.document_type,
    recipient_name: doc.recipient_name,
    status: doc.status,
    verification_id: doc.verification_id,
    pin_code: doc.pin_code,
    qr_payload: doc.qr_payload,
    issued_at: doc.issued_at,
    expiry_date: doc.expiry_date,
    revoked_at: doc.revoked_at,
    revocation_reason: doc.revocation_reason,
  };
}

/** Safe, predictable download filename — verification IDs are already URL/filesystem-safe (CHK-XXXX-XXXX). */
export function certificateFilename(doc: Pick<CertificateDocument, "verification_id">): string {
  return `Chekkam-Certificate-${doc.verification_id}.pdf`;
}

/** Wraps a generated PDF buffer in the HTTP response Next.js/browsers expect for a download. */
export function buildCertificatePdfResponse(pdfBytes: Uint8Array, filename: string): Response {
  const body = new Uint8Array(pdfBytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}

// Brand Guide v3 tokens (chekkam/docs/Chekkam_Brand_Guide.md §3.1-3.2), light theme —
// print output has no dark-mode concept, so the light-theme hex values apply.
const COLOR = {
  maroon: rgb(0x68 / 255, 0x02 / 255, 0x0f / 255),
  primaryRed: rgb(0xf2 / 255, 0x11 / 255, 0x37 / 255),
  ink: rgb(0x03 / 255, 0x03 / 255, 0x03 / 255),
  muted: rgb(0x4a / 255, 0x4a / 255, 0x4a / 255),
  faint: rgb(0x8a / 255, 0x80 / 255, 0x80 / 255),
  tint: rgb(0xf7 / 255, 0xf1 / 255, 0xf1 / 255),
  border: rgb(0xe8 / 255, 0xde / 255, 0xde / 255),
  success: rgb(0x1e / 255, 0x8e / 255, 0x5a / 255),
  white: rgb(1, 1, 1),
};

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

function formatIssuedDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function drawBrandMark(page: PDFPage, x: number, y: number, radius: number) {
  // Checkmark-in-circle homage to the logo mark (Brand Guide §2) — drawn with
  // primitive shapes rather than the licensed vector mark, since this route
  // has no asset pipeline; colors/proportions follow the guide.
  page.drawCircle({ x, y, size: radius, color: COLOR.white });
  page.drawLine({
    start: { x: x - radius * 0.45, y },
    end: { x: x - radius * 0.1, y: y - radius * 0.35 },
    thickness: radius * 0.22,
    color: COLOR.primaryRed,
  });
  page.drawLine({
    start: { x: x - radius * 0.1, y: y - radius * 0.35 },
    end: { x: x + radius * 0.5, y: y + radius * 0.4 },
    thickness: radius * 0.22,
    color: COLOR.primaryRed,
  });
}

/**
 * Draws a small check (active) or cross (revoked) glyph as vector lines,
 * not a text character — pdf-lib's standard-14 fonts use WinAnsiEncoding,
 * which cannot encode ✓/✕ and throws at draw time.
 */
function drawStatusIcon(page: PDFPage, x: number, y: number, radius: number, isActive: boolean) {
  if (isActive) {
    page.drawLine({
      start: { x: x - radius, y },
      end: { x: x - radius * 0.2, y: y - radius * 0.7 },
      thickness: 1.6,
      color: COLOR.white,
    });
    page.drawLine({
      start: { x: x - radius * 0.2, y: y - radius * 0.7 },
      end: { x: x + radius, y: y + radius * 0.8 },
      thickness: 1.6,
      color: COLOR.white,
    });
  } else {
    page.drawLine({
      start: { x: x - radius, y: y - radius },
      end: { x: x + radius, y: y + radius },
      thickness: 1.6,
      color: COLOR.white,
    });
    page.drawLine({
      start: { x: x - radius, y: y + radius },
      end: { x: x + radius, y: y - radius },
      thickness: 1.6,
      color: COLOR.white,
    });
  }
}

function drawLabelValue(
  page: PDFPage,
  opts: {
    x: number;
    y: number;
    label: string;
    value: string;
    labelFont: PDFFont;
    valueFont: PDFFont;
    valueSize?: number;
    valueColor?: ReturnType<typeof rgb>;
  }
): number {
  const { x, y, label, value, labelFont, valueFont } = opts;
  const valueSize = opts.valueSize ?? 12;
  page.drawText(label.toUpperCase(), {
    x,
    y,
    size: 8.5,
    font: labelFont,
    color: COLOR.faint,
  });
  page.drawText(value, {
    x,
    y: y - 15,
    size: valueSize,
    font: valueFont,
    color: opts.valueColor ?? COLOR.ink,
  });
  return y - 15;
}

/**
 * Renders the certificate PDF. Pure function of already-authorized document
 * data — no Supabase/auth access here, so it's directly unit-testable.
 */
export async function generateCertificatePdf(doc: CertificateDocument): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Chekkam Verification Certificate — ${doc.verification_id}`);
  pdfDoc.setSubject("Chekkam document verification certificate");
  pdfDoc.setProducer("Chekkam");

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  // --- Header band ---
  const headerHeight = 110;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - headerHeight,
    width: PAGE_WIDTH,
    height: headerHeight,
    color: COLOR.maroon,
  });
  drawBrandMark(page, MARGIN + 18, PAGE_HEIGHT - headerHeight / 2, 18);
  page.drawText("CHEKKAM", {
    x: MARGIN + 48,
    y: PAGE_HEIGHT - headerHeight / 2 - 2,
    size: 22,
    font: helveticaBold,
    color: COLOR.white,
  });
  page.drawText("One check. Total trust.", {
    x: MARGIN + 48,
    y: PAGE_HEIGHT - headerHeight / 2 - 20,
    size: 10,
    font: helveticaOblique,
    color: COLOR.white,
  });

  let cursorY = PAGE_HEIGHT - headerHeight - 44;

  // --- Title ---
  page.drawText("Verification Certificate", {
    x: MARGIN,
    y: cursorY,
    size: 22,
    font: helveticaBold,
    color: COLOR.ink,
  });
  cursorY -= 30;

  // --- Status badge: icon + label + color, never color alone (Brand Guide §3.2, CLAUDE.md rule 9) ---
  const isExpired =
    doc.status === "active" &&
    !!doc.expiry_date &&
    new Date(doc.expiry_date) < new Date();
  const isActive = doc.status === "active" && !isExpired;
  const statusColor = isActive ? COLOR.success : COLOR.maroon;
  const statusLabel = isActive
    ? "ACTIVE — record in good standing"
    : isExpired
      ? "EXPIRED"
      : "REVOKED";
  const iconSpace = 22;
  const badgeWidth = helveticaBold.widthOfTextAtSize(statusLabel, 11) + iconSpace + 24;
  const badgeY = cursorY - 20;
  page.drawRectangle({
    x: MARGIN,
    y: badgeY,
    width: badgeWidth,
    height: 24,
    color: statusColor,
  });
  drawStatusIcon(page, MARGIN + 16, badgeY + 12, 6, isActive);
  page.drawText(statusLabel, {
    x: MARGIN + iconSpace,
    y: cursorY - 14,
    size: 11,
    font: helveticaBold,
    color: COLOR.white,
  });
  cursorY -= 50;

  // --- Detail grid (two columns) ---
  const col1X = MARGIN;
  const col2X = MARGIN + 260;
  let leftY = cursorY;
  let rightY = cursorY;

  leftY = drawLabelValue(page, {
    x: col1X,
    y: leftY,
    label: "Issuing institution",
    value: doc.institution_name ?? "Unknown institution",
    labelFont: helvetica,
    valueFont: helveticaBold,
  });
  leftY -= 30;
  leftY = drawLabelValue(page, {
    x: col1X,
    y: leftY,
    label: "Document type",
    value: doc.document_type,
    labelFont: helvetica,
    valueFont: helvetica,
  });
  leftY -= 30;
  if (doc.recipient_name) {
    leftY = drawLabelValue(page, {
      x: col1X,
      y: leftY,
      label: "Recipient",
      value: doc.recipient_name,
      labelFont: helvetica,
      valueFont: helvetica,
    });
    leftY -= 30;
  }

  rightY = drawLabelValue(page, {
    x: col2X,
    y: rightY,
    label: "Issue date",
    value: formatIssuedDate(doc.issued_at),
    labelFont: helvetica,
    valueFont: helvetica,
    valueSize: 11,
  });
  rightY -= 30;
  if (doc.expiry_date) {
    rightY = drawLabelValue(page, {
      x: col2X,
      y: rightY,
      label: isExpired ? "Expired" : "Valid until",
      value: formatIssuedDate(doc.expiry_date),
      labelFont: helvetica,
      valueFont: helvetica,
      valueSize: 11,
      valueColor: isExpired ? COLOR.maroon : COLOR.ink,
    });
    rightY -= 30;
  }
  if (!isActive && doc.revoked_at) {
    rightY = drawLabelValue(page, {
      x: col2X,
      y: rightY,
      label: "Revoked",
      value: formatIssuedDate(doc.revoked_at),
      labelFont: helvetica,
      valueFont: helvetica,
      valueSize: 11,
      valueColor: COLOR.maroon,
    });
    rightY -= 30;
    if (doc.revocation_reason) {
      drawLabelValue(page, {
        x: col2X,
        y: rightY,
        label: "Revocation reason",
        value: doc.revocation_reason,
        labelFont: helvetica,
        valueFont: helvetica,
        valueSize: 10.5,
        valueColor: COLOR.maroon,
      });
      rightY -= 30;
    }
  }

  cursorY = Math.min(leftY, rightY) - 10;

  // --- Verification ID / PIN, boxed in monospace (Brand Guide §4.1 data font role) ---
  const idBoxY = cursorY - 70;
  page.drawRectangle({
    x: MARGIN,
    y: idBoxY,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 64,
    color: COLOR.tint,
    borderColor: COLOR.border,
    borderWidth: 1,
  });
  page.drawText("VERIFICATION ID", {
    x: MARGIN + 18,
    y: idBoxY + 42,
    size: 8.5,
    font: helvetica,
    color: COLOR.faint,
  });
  page.drawText(doc.verification_id, {
    x: MARGIN + 18,
    y: idBoxY + 20,
    size: 17,
    font: courierBold,
    color: COLOR.ink,
  });
  if (doc.pin_code) {
    page.drawText("PIN", {
      x: MARGIN + 320,
      y: idBoxY + 42,
      size: 8.5,
      font: helvetica,
      color: COLOR.faint,
    });
    page.drawText(doc.pin_code, {
      x: MARGIN + 320,
      y: idBoxY + 20,
      size: 17,
      font: courier,
      color: COLOR.ink,
    });
  }

  // --- QR code + verify URL ---
  const qrDataUrl = await generateQrDataUrl(doc.qr_payload);
  const qrImage = await pdfDoc.embedPng(qrDataUrl);
  const qrSize = 108;
  const qrY = idBoxY - qrSize - 24;
  page.drawImage(qrImage, {
    x: MARGIN,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });
  page.drawText("Scan to verify this record online", {
    x: MARGIN + qrSize + 20,
    y: qrY + qrSize - 16,
    size: 11,
    font: helveticaBold,
    color: COLOR.ink,
  });
  const urlLines = wrapText(doc.qr_payload, courier, 9, PAGE_WIDTH - MARGIN * 2 - qrSize - 20);
  urlLines.forEach((line, i) => {
    page.drawText(line, {
      x: MARGIN + qrSize + 20,
      y: qrY + qrSize - 34 - i * 12,
      size: 9,
      font: courier,
      color: COLOR.muted,
    });
  });

  // --- Honesty disclaimer (CLAUDE.md §10.1 — must not imply a stamped original) ---
  const disclaimerY = qrY - 34;
  page.drawLine({
    start: { x: MARGIN, y: disclaimerY + 18 },
    end: { x: PAGE_WIDTH - MARGIN, y: disclaimerY + 18 },
    thickness: 1,
    color: COLOR.border,
  });
  const disclaimer =
    "This certificate confirms the cryptographically signed verification record described " +
    "above. Chekkam stores a cryptographic hash and signature of the original file, not the " +
    "file itself — this certificate is a detached attestation, not a scanned or stamped copy " +
    "of the original document. Anyone can independently confirm this record's current status, " +
    "including revocation, by scanning the QR code or visiting the verification URL above.";
  const disclaimerLines = wrapText(disclaimer, helveticaOblique, 9, PAGE_WIDTH - MARGIN * 2);
  disclaimerLines.forEach((line, i) => {
    page.drawText(line, {
      x: MARGIN,
      y: disclaimerY - i * 13,
      size: 9,
      font: helveticaOblique,
      color: COLOR.muted,
    });
  });

  // --- Footer ---
  page.drawText(
    `Generated ${formatIssuedDate(new Date().toISOString())} · chekkam.cm · Not valid if the QR/URL above no longer shows this status`,
    {
      x: MARGIN,
      y: MARGIN - 20,
      size: 8,
      font: helvetica,
      color: COLOR.faint,
    }
  );

  return pdfDoc.save();
}

/** Simple greedy word-wrap for a single PDF font/size against a max width in points. */
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
