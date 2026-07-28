import { SupabaseClient } from "@supabase/supabase-js";
import { hashDocument, getInstitutionPrivateKey, signHash } from "@/lib/crypto/sign";
import { generateVerificationId } from "@/lib/crypto/ids";
import { buildVerificationUrl, generateQrDataUrl } from "@/lib/crypto/qrcode";

/**
 * The one and only product registration path (Phase 10). Mirrors
 * lib/documents/sign-document.ts's structure, adapted for a hashed *record*
 * instead of hashed *file bytes* — products have no uploaded file, so
 * hashDocument (which hashes any Buffer, not just file bytes) is fed a
 * canonical JSON buffer built from a fixed, explicit key order. This must
 * never be derived from an object spread — a fixed order keeps the hash
 * (and therefore the signature) reproducible and stable if fields are added
 * later.
 */
export type RegisterProductInput = {
  institutionId: string;
  productName: string;
  category: string;
  batchNumber?: string | null;
  manufacturedAt?: string | null;
  expiryDate?: string | null;
  actorId: string | null;
  actorType?: "user" | "system" | "api_partner";
};

export type RegisterProductResult = {
  id: string;
  product_code: string;
  qr_payload: string;
  qr_image: string;
  status: string;
};

function canonicalProductPayload(fields: {
  product_code: string;
  institution_id: string;
  product_name: string;
  category: string;
  batch_number: string | null;
  manufactured_at: string | null;
  expiry_date: string | null;
}): Buffer {
  const ordered = [
    fields.product_code,
    fields.institution_id,
    fields.product_name,
    fields.category,
    fields.batch_number ?? "",
    fields.manufactured_at ?? "",
    fields.expiry_date ?? "",
  ];
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

export async function registerProductCore(
  admin: SupabaseClient,
  input: RegisterProductInput
): Promise<RegisterProductResult> {
  const productCode = generateVerificationId("PRD");
  const canonical = canonicalProductPayload({
    product_code: productCode,
    institution_id: input.institutionId,
    product_name: input.productName,
    category: input.category,
    batch_number: input.batchNumber ?? null,
    manufactured_at: input.manufacturedAt ?? null,
    expiry_date: input.expiryDate ?? null,
  });
  const productHash = hashDocument(canonical);
  const privateKey = getInstitutionPrivateKey(input.institutionId);
  const signature = signHash(productHash, privateKey);
  const qrPayload = buildVerificationUrl(productCode, "verify-product");
  const qrImage = await generateQrDataUrl(qrPayload);

  const { data, error } = await admin
    .from("products")
    .insert({
      institution_id: input.institutionId,
      product_code: productCode,
      product_name: input.productName,
      category: input.category,
      batch_number: input.batchNumber ?? null,
      manufactured_at: input.manufacturedAt ?? null,
      expiry_date: input.expiryDate ?? null,
      product_hash: productHash,
      signature,
      qr_payload: qrPayload,
    })
    .select("id, product_code, status")
    .single();
  if (error) throw error;

  await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_type: input.actorType ?? "user",
    action: "product.register",
    target_table: "products",
    target_id: data.id,
    metadata: { institution_id: input.institutionId, category: input.category },
  });

  return {
    id: data.id,
    product_code: data.product_code,
    qr_payload: qrPayload,
    qr_image: qrImage,
    status: data.status,
  };
}
