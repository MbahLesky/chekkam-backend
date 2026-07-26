import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { reportUpdateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse, jsonError } from "@/lib/errors";
import { sendPushToTokens } from "@/lib/push/fcm";

const FINAL_STATUSES = new Set(["verified_threat", "false_report", "dismissed"]);

/**
 * GET /api/reports/:id — full analysis detail (SRS 6.1). When the report is
 * part of a scam campaign (lib/campaigns/matcher.ts), includes a
 * `related_reports` summary of other reports in that campaign — count and
 * risk fields only, never another citizen's raw_content or reporter_id
 * (same redaction posture as lib/privacy/redact.ts).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("reports").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "Report not found.", 404);

    let relatedReports: Array<Record<string, unknown>> = [];
    if (data.campaign_id) {
      const { data: related } = await admin
        .from("reports")
        .select("id, risk_level, category, created_at")
        .eq("campaign_id", data.campaign_id)
        .neq("id", id);
      relatedReports = related ?? [];
    }

    return NextResponse.json({ ...data, related_reports: relatedReports });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** PATCH /api/reports/:id — analyst status update (FR-083). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const body = parseBody(reportUpdateSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("reports")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "report.status_update",
      target_table: "reports",
      target_id: id,
      metadata: { new_status: body.status },
    });

    // FR-051: notify the submitter once their report reaches a final state, if opted in.
    if (FINAL_STATUSES.has(body.status) && data.reporter_id) {
      const { data: tokens } = await admin
        .from("device_tokens")
        .select("fcm_token")
        .eq("user_id", data.reporter_id)
        .eq("consent_given", true);

      if (tokens?.length) {
        await sendPushToTokens(
          tokens.map((t) => t.fcm_token),
          "Update on your Chekkam report",
          statusMessage(body.status)
        );
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}

function statusMessage(status: string): string {
  switch (status) {
    case "verified_threat":
      return "A report you submitted was confirmed as a genuine threat. Thank you for helping keep others safe.";
    case "false_report":
      return "A report you submitted was reviewed and found not to be a threat.";
    case "dismissed":
      return "A report you submitted has been reviewed and closed.";
    default:
      return "There is an update on a report you submitted.";
  }
}
