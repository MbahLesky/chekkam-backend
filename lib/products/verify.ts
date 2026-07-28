import { SupabaseClient } from "@supabase/supabase-js";
import { verifySignature } from "@/lib/crypto/verify";

/**
 * The one and only product verification path (Phase 10). Mirrors
 * lib/documents/verify.ts. Six outcomes per the spec: authentic,
 * counterfeit, expired, recalled, stolen, unknown.
 */
export type ProductVerifierChannel = "mobile" | "web" | "api";

export type ProductVerifyResult = {
  status: "authentic" | "counterfeit" | "expired" | "recalled" | "stolen" | "unknown";
  institution?: string | null;
  product_name?: string;
  category?: string;
  product_code?: string;
  batch_number?: string | null;
  manufactured_at?: string | null;
  expiry_date?: string | null;
  reason?: string | null;
};

const PRODUCT_CODE_PATTERN = /^PRD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

const COUNTERFEIT_REASON =
  "This product ID does not match any product record we can verify. It may be counterfeit.";

function isValidProductCodeFormat(id: string): boolean {
  return PRODUCT_CODE_PATTERN.test(id);
}

function isExpired(expiryDate: string | null | undefined): boolean {
  return !!expiryDate && new Date(expiryDate) < new Date();
}

/**
 * Re-validates the stored ECDSA signature against the manufacturer's public
 * key. Unlike documents' equivalent, a missing hash/signature/public key is
 * treated as INVALID here, not gracefully skipped — products has no legacy
 * pre-signature-check rows (greenfield table), so a missing value can only
 * mean corrupted data, never a legitimate old record.
 */
function hasValidStoredSignature(
  productHash: string | null | undefined,
  signature: string | null | undefined,
  publicKey: string | null | undefined
): boolean {
  if (!productHash || !signature || !publicKey) return false;
  return verifySignature(productHash, signature, publicKey);
}

async function logAttempt(
  admin: SupabaseClient,
  productRowId: string | null,
  attempted: string,
  result: ProductVerifyResult["status"],
  channel: ProductVerifierChannel
) {
  await admin.from("product_verification_logs").insert({
    product_id: productRowId,
    product_code_attempted: attempted,
    result,
    verifier_channel: channel,
  });
}

export async function verifyProductById(
  admin: SupabaseClient,
  rawInput: string,
  channel: ProductVerifierChannel
): Promise<ProductVerifyResult> {
  const normalized = rawInput.trim().toUpperCase();

  if (!isValidProductCodeFormat(normalized)) {
    await logAttempt(admin, null, rawInput, "unknown", channel);
    return { status: "unknown", product_code: rawInput };
  }

  const { data: product } = await admin
    .from("products")
    .select(
      "id, product_code, product_name, category, batch_number, manufactured_at, expiry_date, status, status_reason, product_hash, signature, institutions(name, signing_public_key)"
    )
    .eq("product_code", normalized)
    .maybeSingle();

  if (!product) {
    await logAttempt(admin, null, normalized, "counterfeit", channel);
    return { status: "counterfeit", product_code: normalized, reason: COUNTERFEIT_REASON };
  }

  const institution = Array.isArray(product.institutions) ? product.institutions[0] : product.institutions;

  const base = {
    institution: institution?.name ?? null,
    product_name: product.product_name,
    category: product.category,
    product_code: normalized,
    batch_number: product.batch_number,
    manufactured_at: product.manufactured_at,
  };

  if (!hasValidStoredSignature(product.product_hash, product.signature, institution?.signing_public_key)) {
    await logAttempt(admin, product.id, normalized, "counterfeit", channel);
    return { ...base, status: "counterfeit", reason: COUNTERFEIT_REASON };
  }

  // An explicit institution action (recall/stolen) always outranks a
  // passively-computed expiry date — same precedence documents use for
  // revoked-before-expired (see migration 0006's comment).
  if (product.status === "recalled") {
    await logAttempt(admin, product.id, normalized, "recalled", channel);
    return { ...base, status: "recalled", reason: product.status_reason };
  }

  if (product.status === "stolen") {
    await logAttempt(admin, product.id, normalized, "stolen", channel);
    return { ...base, status: "stolen", reason: product.status_reason };
  }

  if (isExpired(product.expiry_date)) {
    await logAttempt(admin, product.id, normalized, "expired", channel);
    return {
      ...base,
      status: "expired",
      expiry_date: product.expiry_date,
      reason: `This product's shelf life ended on ${product.expiry_date}.`,
    };
  }

  await logAttempt(admin, product.id, normalized, "authentic", channel);
  return { ...base, status: "authentic", expiry_date: product.expiry_date };
}
