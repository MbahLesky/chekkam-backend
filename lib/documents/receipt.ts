import crypto from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { hashDocument, signHash, getChekkamReceiptSigningKey } from "@/lib/crypto/sign";
import { verifySignature } from "@/lib/crypto/verify";
import { generateVerificationId } from "@/lib/crypto/ids";
import { generateQrDataUrl } from "@/lib/crypto/qrcode";
import { VerifyResult } from "@/lib/documents/verify";

/**
 * Verification Receipt (FR-111, Document Intelligence Spec §7). Proof that a
 * verification happened, not a re-statement of the document itself — the
 * receipt carries only the file hash, never the file. Signed with Chekkam's
 * own platform key (lib/crypto/sign.ts's getChekkamReceiptSigningKey), never
 * an institution's key: a receipt attests "Chekkam checked this," not
 * "institution X issued this." Reuses hashDocument/signHash/verifySignature/
 * generateVerificationId/generateQrDataUrl — no parallel crypto or ID scheme.
 */
export type VerificationReceipt = {
  id: string;
  document_id: string | null;
  file_hash: string;
  result: string;
  verified_by_org: string | null;
  receipt_signature: string;
  receipt_verification_id: string;
  created_at: string;
};

function receiptPayload(receipt: {
  receipt_verification_id: string;
  file_hash: string;
  result: string;
  verified_by_org: string | null;
  created_at: string;
}): string {
  // Fixed field order, pipe-delimited — mirrors the "fixed field order" rule
  // Coding Standards §5 states for the offline QR token, applied here too.
  //
  // created_at is normalized to epoch milliseconds, not signed as the raw
  // string: Postgres returns timestamptz as "...+00:00" while this file
  // originally signs JS's "...Z"-suffixed toISOString() — same instant,
  // different string — so signing the literal string would make every
  // freshly-created receipt fail its own first verification. Date.parse
  // treats both forms identically.
  return [
    receipt.receipt_verification_id,
    receipt.file_hash,
    receipt.result,
    receipt.verified_by_org ?? "",
    String(new Date(receipt.created_at).getTime()),
  ].join("|");
}

function chekkamPublicKeyPem(): string {
  const privateKey = getChekkamReceiptSigningKey();
  const keyObject = crypto.createPrivateKey(privateKey);
  return crypto.createPublicKey(keyObject).export({ type: "spki", format: "pem" }) as string;
}

export function buildReceiptVerificationUrl(receiptVerificationId: string): string {
  const base = (process.env.APP_BASE_URL ?? "https://chekkam.cm").replace(/\/$/, "");
  return `${base}/api/verification-receipts/verify/${receiptVerificationId}`;
}

/** Creates and persists a signed receipt for a verification result that already happened. */
export async function createVerificationReceipt(
  admin: SupabaseClient,
  input: {
    documentId: string | null;
    fileHash: string;
    result: VerifyResult["status"];
    verifiedByOrg: string | null;
    apiKeyId: string | null;
    requestedBy: string | null;
  }
): Promise<VerificationReceipt> {
  const receiptVerificationId = generateVerificationId("RCP");
  const createdAt = new Date().toISOString();

  const payload = receiptPayload({
    receipt_verification_id: receiptVerificationId,
    file_hash: input.fileHash,
    result: input.result,
    verified_by_org: input.verifiedByOrg,
    created_at: createdAt,
  });
  const privateKey = getChekkamReceiptSigningKey();
  const signature = signHash(hashDocument(Buffer.from(payload, "utf8")), privateKey);

  const { data, error } = await admin
    .from("verification_receipts")
    .insert({
      document_id: input.documentId,
      file_hash: input.fileHash,
      result: input.result,
      verified_by_org: input.verifiedByOrg,
      api_key_id: input.apiKeyId,
      requested_by: input.requestedBy,
      receipt_signature: signature,
      receipt_verification_id: receiptVerificationId,
      created_at: createdAt,
    })
    .select("id, document_id, file_hash, result, verified_by_org, receipt_signature, receipt_verification_id, created_at")
    .single();
  if (error) throw error;
  return data;
}

/** Re-derives Chekkam's public key from the same env-configured private key and checks the signature — never trusts a client-supplied verdict. */
export function isReceiptSignatureValid(receipt: VerificationReceipt): boolean {
  const payload = receiptPayload(receipt);
  const publicKey = chekkamPublicKeyPem();
  return verifySignature(hashDocument(Buffer.from(payload, "utf8")), receipt.receipt_signature, publicKey);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COLOR = {
  maroon: rgb(0x68 / 255, 0x02 / 255, 0x0f / 255),
  ink: rgb(0x03 / 255, 0x03 / 255, 0x03 / 255),
  muted: rgb(0x4a / 255, 0x4a / 255, 0x4a / 255),
  faint: rgb(0x8a / 255, 0x80 / 255, 0x80 / 255),
  tint: rgb(0xf7 / 255, 0xf1 / 255, 0xf1 / 255),
  border: rgb(0xe8 / 255, 0xde / 255, 0xde / 255),
  white: rgb(1, 1, 1),
};

/** Renders the receipt PDF — what was checked (hash only), the result, when, and by whom. Never the document itself. */
export async function generateReceiptPdf(receipt: VerificationReceipt): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Chekkam Verification Receipt — ${receipt.receipt_verification_id}`);
  pdfDoc.setProducer("Chekkam");

  const width = 595.28;
  const height = 841.89;
  const margin = 56;
  const page = pdfDoc.addPage([width, height]);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const headerHeight = 90;
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: COLOR.maroon });
  page.drawText("CHEKKAM", {
    x: margin,
    y: height - headerHeight / 2 - 2,
    size: 20,
    font: helveticaBold,
    color: COLOR.white,
  });
  page.drawText("Verification Receipt", {
    x: margin,
    y: height - headerHeight / 2 - 20,
    size: 11,
    font: helveticaOblique,
    color: COLOR.white,
  });

  let y = height - headerHeight - 50;
  const row = (label: string, value: string, mono = false) => {
    page.drawText(label.toUpperCase(), { x: margin, y, size: 8.5, font: helvetica, color: COLOR.faint });
    page.drawText(value, {
      x: margin,
      y: y - 16,
      size: 12,
      font: mono ? courierBold : helveticaBold,
      color: COLOR.ink,
    });
    y -= 46;
  };

  row("Receipt ID", receipt.receipt_verification_id, true);
  row("Result", receipt.result.toUpperCase());
  row("Verified by", receipt.verified_by_org ?? "Not specified");
  row("Timestamp", formatDate(receipt.created_at));

  page.drawRectangle({
    x: margin,
    y: y - 60,
    width: width - margin * 2,
    height: 56,
    color: COLOR.tint,
    borderColor: COLOR.border,
    borderWidth: 1,
  });
  page.drawText("DOCUMENT HASH (SHA-256) — NOT THE DOCUMENT ITSELF", {
    x: margin + 16,
    y: y - 22,
    size: 8,
    font: helvetica,
    color: COLOR.faint,
  });
  page.drawText(receipt.file_hash, {
    x: margin + 16,
    y: y - 40,
    size: 9,
    font: courier,
    color: COLOR.ink,
  });
  y -= 90;

  const qrUrl = buildReceiptVerificationUrl(receipt.receipt_verification_id);
  const qrDataUrl = await generateQrDataUrl(qrUrl);
  const qrImage = await pdfDoc.embedPng(qrDataUrl);
  const qrSize = 96;
  page.drawImage(qrImage, { x: margin, y: y - qrSize, width: qrSize, height: qrSize });
  page.drawText("Scan to confirm this receipt is genuine", {
    x: margin + qrSize + 18,
    y: y - 14,
    size: 10,
    font: helveticaBold,
    color: COLOR.ink,
  });

  const disclaimer =
    "This receipt confirms that Chekkam performed the verification described above, on the " +
    "document whose hash is shown — it does not certify the document itself; that is the " +
    "role of the document's own verification record. The receipt is signed by Chekkam and " +
    "can be independently re-checked at any time via the QR code above.";
  const words = disclaimer.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (helveticaOblique.widthOfTextAtSize(candidate, 9) > width - margin * 2 && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const disclaimerY = margin + 60;
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: margin,
      y: disclaimerY - i * 13,
      size: 9,
      font: helveticaOblique,
      color: COLOR.muted,
    });
  });

  return pdfDoc.save();
}
