import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { requireApiKey, logApiUsage } from "@/lib/partner-auth";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { verifyByIdOrPin, verifyByUpload } from "@/lib/documents/verify";
import { hashDocument } from "@/lib/crypto/sign";
import { createVerificationReceipt } from "@/lib/documents/receipt";

/**
 * POST /api/verification-receipts (FR-111) — re-runs Registry Verification
 * (the same lib/documents/verify.ts every surface uses) and, whatever the
 * result, issues a Chekkam-signed receipt proving the check happened: what
 * was checked (a hash, never the file), the result, when, and by whom.
 *
 * Body: multipart/form-data. Either `verification_id` (ID or PIN lookup) or
 * `file` (hash-comparison lookup) — same two verification modes the existing
 * routes support. Optional `verified_by_org` free-text label for the receipt.
 * Auth: staff session or X-Api-Key, same dual mode as bulk-verify.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const hasApiKey = !!req.headers.get("x-api-key");
  let apiKeyId: string | null = null;

  try {
    const admin = getSupabaseAdmin();
    let requestedBy: string | null = null;

    if (hasApiKey) {
      const key = await requireApiKey(req);
      apiKeyId = key.id;
    } else {
      const profile = await requireUser(req);
      requireRole(profile, ["institution_officer", "analyst", "admin", "super_admin"]);
      requestedBy = profile.id;
    }

    const form = await req.formData();
    const verificationIdField = form.get("verification_id");
    const verifiedByOrgField = form.get("verified_by_org");
    const file = form.get("file");
    const verifiedByOrg = typeof verifiedByOrgField === "string" && verifiedByOrgField.trim() ? verifiedByOrgField.trim() : null;

    let result;
    let fileHash: string;
    let documentId: string | null = null;

    if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fileHash = hashDocument(buffer);
      result = await verifyByUpload(
        admin,
        buffer,
        typeof verificationIdField === "string" ? verificationIdField : null,
        "api"
      );
    } else if (typeof verificationIdField === "string" && verificationIdField.trim()) {
      result = await verifyByIdOrPin(admin, verificationIdField.trim(), "api");
      // No uploaded file in this mode — the receipt still needs a hash to
      // reference; fall back to hashing the verification id itself so the
      // receipt has a stable, reproducible reference value.
      fileHash = hashDocument(Buffer.from(verificationIdField.trim(), "utf8"));
    } else {
      throw new ValidationError(
        "Provide either verification_id or file (multipart/form-data).",
        "verification_id"
      );
    }

    if (result.status !== "not_found") {
      const { data: doc } = await admin
        .from("documents")
        .select("id")
        .eq("verification_id", result.verification_id ?? "")
        .maybeSingle();
      documentId = doc?.id ?? null;
    }

    const receipt = await createVerificationReceipt(admin, {
      documentId,
      fileHash,
      result: result.status,
      verifiedByOrg,
      apiKeyId,
      requestedBy,
    });

    if (apiKeyId) {
      await logApiUsage(apiKeyId, "/api/verification-receipts", 201, Date.now() - startedAt);
    }

    return NextResponse.json({ ...receipt, verification_result: result }, { status: 201 });
  } catch (err) {
    if (apiKeyId) {
      await logApiUsage(apiKeyId, "/api/verification-receipts", 400, Date.now() - startedAt).catch(
        () => undefined
      );
    }
    return toErrorResponse(err);
  }
}
