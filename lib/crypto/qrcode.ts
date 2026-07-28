import QRCode from "qrcode";

/** Builds the public verification URL encoded into a document's (or, with
 * pathSegment="verify-product", a product's — Phase 10) QR code. SRS 10.1 step 5. */
export function buildVerificationUrl(verificationId: string, pathSegment: string = "verify"): string {
  // Railway is the deployed Next.js app used by the mobile app/extension in
  // this workspace. APP_BASE_URL must still be set to the public branded
  // domain in production, but an unset variable must not generate dead QR
  // links to an unrelated placeholder domain.
  const base = process.env.APP_BASE_URL ?? "https://chekkam-backend-production.up.railway.app";
  return `${base.replace(/\/$/, "")}/${pathSegment}/${verificationId}`;
}

/** Renders a QR code as a base64 PNG data URL, generated server-side. SRS 10.1 step 6. */
export async function generateQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}
