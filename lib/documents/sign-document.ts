import { SupabaseClient } from "@supabase/supabase-js";
import { hashDocument, getInstitutionPrivateKey, signHash } from "@/lib/crypto/sign";
import { generateVerificationId, generatePinCode } from "@/lib/crypto/ids";
import { buildVerificationUrl, generateQrDataUrl } from "@/lib/crypto/qrcode";

/**
 * The one and only document signing path (SRS 10.1). Extracted from
 * app/api/documents/sign/route.ts so WhatsApp/Telegram officer-signing calls
 * the exact same logic instead of a re-implementation. The HTTP route is now
 * a thin wrapper around this function — behavior is unchanged.
 *
 * Callers are responsible for their own authorization check before calling
 * this (web route: requireRole + requireInstitutionMember; bots: a verified
 * channel_identities row with a non-null institution_id).
 */
export type SignDocumentInput = {
  institutionId: string;
  documentType: string;
  recipientName?: string | null;
  fileBuffer: Buffer;
  actorId: string | null;
  actorType?: "user" | "system" | "api_partner";
  auditAction?: string;
  /** ISO date string. Most document types have no expiry (e.g. certificates); optional. */
  expiryDate?: string | null;
};

export type SignDocumentResult = {
  id: string;
  verification_id: string;
  pin_code: string;
  qr_payload: string;
  qr_image: string;
  status: string;
};

export async function signDocumentCore(
  admin: SupabaseClient,
  input: SignDocumentInput
): Promise<SignDocumentResult> {
  const fileHash = hashDocument(input.fileBuffer);
  const privateKey = getInstitutionPrivateKey(input.institutionId);
  const signature = signHash(fileHash, privateKey);

  const verificationId = generateVerificationId();
  const pinCode = generatePinCode();
  const qrPayload = buildVerificationUrl(verificationId);
  const qrImage = await generateQrDataUrl(qrPayload);

  const { data, error } = await admin
    .from("documents")
    .insert({
      institution_id: input.institutionId,
      document_type: input.documentType,
      recipient_name: input.recipientName,
      file_hash: fileHash,
      signature,
      verification_id: verificationId,
      qr_payload: qrPayload,
      pin_code: pinCode,
      expiry_date: input.expiryDate ?? null,
    })
    .select("id, verification_id, pin_code, qr_payload, status")
    .single();

  if (error) throw error;

  await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_type: input.actorType ?? "user",
    action: input.auditAction ?? "document.sign",
    target_table: "documents",
    target_id: data.id,
    metadata: { institution_id: input.institutionId, document_type: input.documentType },
  });

  return {
    id: data.id,
    verification_id: data.verification_id,
    pin_code: data.pin_code,
    qr_payload: data.qr_payload,
    qr_image: qrImage,
    status: data.status,
  };
}
