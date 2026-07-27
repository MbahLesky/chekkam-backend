import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { requireApiKey, logApiUsage } from "@/lib/partner-auth";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { parseVerificationIdList, runBulkVerification } from "@/lib/documents/bulk-verify";

/**
 * POST /api/enterprise/bulk-verify (FR-110) — verify many documents in one
 * call. Accepts multipart/form-data with a `file` field: a CSV or
 * plain-text file, one verification ID or PIN per line (an optional header
 * row is ignored). Auth: staff session (dashboard) OR X-Api-Key (partners) —
 * exactly one of the two must be presented.
 *
 * Each row runs through verifyByIdOrPin — the same Registry Verification
 * engine every other surface uses (SRS 10.2), never a second implementation.
 * Synchronous for now (capped at MAX_BULK_ROWS); the job row this writes is
 * still a stable, auditable, timestamped snapshot callers can reference.
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
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart/form-data, CSV or plain text).", "file");
    }

    const csvText = await file.text();
    const verificationIds = parseVerificationIdList(csvText);

    const { data: job, error: insertError } = await admin
      .from("bulk_verification_jobs")
      .insert({
        requested_by: requestedBy,
        api_key_id: apiKeyId,
        total_items: verificationIds.length,
        status: "processing",
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const results = await runBulkVerification(admin, verificationIds);

    const { data: completedJob, error: updateError } = await admin
      .from("bulk_verification_jobs")
      .update({
        processed_items: results.length,
        status: "completed",
        results,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("id, total_items, processed_items, status, results, created_at, completed_at")
      .single();
    if (updateError) throw updateError;

    if (apiKeyId) {
      // FR-110/Document Intelligence §6: metered per job call, not per row —
      // the row-level detail already lives in the job's own results array.
      await logApiUsage(apiKeyId, "/api/enterprise/bulk-verify", 200, Date.now() - startedAt);
    }

    return NextResponse.json(completedJob, { status: 201 });
  } catch (err) {
    // Best-effort: only log a failed call if the key was already validated
    // above (an invalid/missing key has no key id to log usage against).
    if (apiKeyId) {
      await logApiUsage(apiKeyId, "/api/enterprise/bulk-verify", 400, Date.now() - startedAt).catch(
        () => undefined
      );
    }
    return toErrorResponse(err);
  }
}
