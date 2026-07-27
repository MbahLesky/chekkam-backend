import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireApiKey, logApiUsage } from "@/lib/partner-auth";
import { toErrorResponse, ValidationError } from "@/lib/errors";
import { hashDocument } from "@/lib/crypto/sign";

/**
 * POST /api/v1/partner/document-check — server-to-server document verification
 * for API partners (FR-061). multipart/form-data: file (required) or
 * verification_id (form field, either works alongside a file).
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  let apiKeyId: string | undefined;
  try {
    const apiKey = await requireApiKey(req);
    apiKeyId = apiKey.id;

    const form = await req.formData();
    const file = form.get("file");
    const verificationId = form.get("verification_id");
    const admin = getSupabaseAdmin();

    if (!(file instanceof File) && typeof verificationId !== "string") {
      throw new ValidationError("Provide a file and/or verification_id.", "file");
    }

    let result: Record<string, unknown>;
    if (typeof verificationId === "string" && verificationId.length > 0) {
      const { data: doc } = await admin
        .from("documents")
        .select("id, document_type, status, file_hash, revocation_reason, institutions(name)")
        .eq("verification_id", verificationId)
        .maybeSingle();

      if (!doc) {
        result = { status: "not_found", verification_id: verificationId };
      } else if (doc.status === "revoked") {
        result = { status: "revoked", verification_id: verificationId, reason: doc.revocation_reason };
      } else if (file instanceof File) {
        const computedHash = hashDocument(Buffer.from(await file.arrayBuffer()));
        result = { status: computedHash === doc.file_hash ? "genuine" : "tampered", verification_id: verificationId };
      } else {
        result = { status: "genuine", verification_id: verificationId, document_type: doc.document_type };
      }
    } else if (file instanceof File) {
      const computedHash = hashDocument(Buffer.from(await file.arrayBuffer()));
      const { data: doc } = await admin
        .from("documents")
        .select("verification_id, status, document_type")
        .eq("file_hash", computedHash)
        .maybeSingle();
      result = doc
        ? { status: doc.status === "revoked" ? "revoked" : "genuine", verification_id: doc.verification_id }
        : { status: "not_found" };
    } else {
      result = { status: "not_found" };
    }

    const response = NextResponse.json(result);
    await logApiUsage(apiKeyId, "/v1/partner/document-check", 200, Date.now() - start);
    return response;
  } catch (err) {
    const res = toErrorResponse(err);
    if (apiKeyId) {
      await logApiUsage(apiKeyId, "/v1/partner/document-check", res.status, Date.now() - start);
    }
    return res;
  }
}
