import { SupabaseClient } from "@supabase/supabase-js";
import { verifyPdfSignature } from "@/lib/documents/pdf-signature";
import { VerifyResult, VerifierChannel, verifyByUpload } from "@/lib/documents/verify";

export type TrustSignal = {
  layer: "chekkam_registry" | "pdf_signature";
  nature: "deterministic" | "heuristic" | "registry";
  result: string;
  detail: string;
};

export type DocumentAssessment =
  | {
      mode: "registry_verification";
      is_proof: true;
      registry: VerifyResult;
      status: VerifyResult["status"];
      signals: TrustSignal[];
      needs_human_review: false;
      recommended_action: string;
    }
  | {
      mode: "trust_report";
      is_proof: false;
      registry: VerifyResult;
      status: "not_in_registry" | "signals_of_concern" | "external_signature_verified";
      signals: TrustSignal[];
      needs_human_review: true;
      recommended_action: string;
    };

const registrySignal = (registry: VerifyResult): TrustSignal => ({
  layer: "chekkam_registry",
  nature: "deterministic",
  result: registry.status,
  detail:
    registry.status === "genuine"
      ? "This exact file matches an active document cryptographically signed in the Chekkam registry."
      : registry.status === "tampered"
        ? "The submitted file does not match the document bytes or signing key recorded in the Chekkam registry."
        : registry.status === "revoked"
          ? "The issuing organisation has revoked this Chekkam registry record."
          : registry.status === "expired"
            ? "The document is in the registry, but its stated validity period has ended."
            : "This file was not found in the Chekkam registry.",
});

/**
 * Composes the two genuinely deterministic checks currently available:
 * Chekkam's own signed registry and a standard PDF's embedded CMS signature.
 * No heuristic is upgraded to a proof in this function.
 */
export async function assessDocument(
  admin: SupabaseClient,
  fileBuffer: Buffer,
  verificationId: string | null | undefined,
  channel: VerifierChannel,
  mimeType: string | undefined
): Promise<DocumentAssessment> {
  const registry = await verifyByUpload(admin, fileBuffer, verificationId, channel);
  if (registry.status !== "not_found") {
    return {
      mode: "registry_verification",
      is_proof: true,
      registry,
      status: registry.status,
      signals: [registrySignal(registry)],
      needs_human_review: false,
      recommended_action:
        registry.status === "genuine"
          ? "You can rely on the document's registry integrity result. Check its stated purpose and expiry before use."
          : "Do not rely on this document until the issuing organisation resolves the registry result.",
    };
  }

  const signals: TrustSignal[] = [registrySignal(registry)];
  if (mimeType === "application/pdf") {
    const pdf = verifyPdfSignature(fileBuffer);
    if (pdf.status === "signed_valid_unmodified") {
      signals.push({
        layer: "pdf_signature",
        nature: "deterministic",
        result: pdf.status,
        detail: `The embedded PDF signature is intact and covers the document. Signer: ${pdf.lastSignature.signerOrganization ?? pdf.lastSignature.signerCommonName ?? "not named"}. Issuer trust was not independently checked.`,
      });
      return {
        mode: "trust_report",
        is_proof: false,
        registry,
        status: "external_signature_verified",
        signals,
        needs_human_review: true,
        recommended_action:
          "The PDF's integrity signature is valid, but its issuer is not yet a Chekkam registry organisation. Confirm the issuer before relying on it.",
      };
    }
    if (pdf.status === "signed_but_modified_after_signing") {
      signals.push({
        layer: "pdf_signature",
        nature: "deterministic",
        result: pdf.status,
        detail: "The PDF contains a digital signature, but its signed bytes no longer match the file you submitted.",
      });
      return {
        mode: "trust_report",
        is_proof: false,
        registry,
        status: "signals_of_concern",
        signals,
        needs_human_review: true,
        recommended_action: "Do not rely on this PDF until you obtain a fresh copy directly from the issuing organisation.",
      };
    }
    signals.push({
      layer: "pdf_signature",
      nature: "deterministic",
      result: pdf.status,
      detail:
        pdf.status === "no_signature_found"
          ? "No standard embedded PDF signature was found. This is neutral; many legitimate PDFs have none."
          : "An embedded PDF signature could not be parsed. Obtain a fresh copy from the issuer before relying on it.",
    });
  }

  return {
    mode: "trust_report",
    is_proof: false,
    registry,
    status: "not_in_registry",
    signals,
    needs_human_review: true,
    recommended_action:
      "Ask the issuing organisation for a Chekkam verification ID, an original digitally signed PDF, or confirmation through an official contact channel.",
  };
}
