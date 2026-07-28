import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireAlertPublisher } from "@/lib/auth";
import { jsonError, toErrorResponse, AuthError } from "@/lib/errors";

/**
 * POST /api/public-alerts/:id/publish — the human-approval gate before an
 * alert becomes visible to the public (SRS Section 14 "nothing is published
 * ... without human analyst approval"). analyst/admin/super_admin, or an
 * institution_officer of a verified institution publishing their own draft
 * (Phase 11 — Cameroon Emergency Trust Bulletin).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    const admin = getSupabaseAdmin();
    await requireAlertPublisher(profile, admin);

    if (profile.role === "institution_officer") {
      const { data: existing } = await admin
        .from("public_alerts")
        .select("created_by")
        .eq("id", id)
        .maybeSingle();
      if (!existing) return jsonError("NOT_FOUND", "Public alert not found.", 404);
      if (existing.created_by !== profile.id) {
        throw new AuthError("You can only publish bulletins you created.", 403);
      }
    }

    const { data, error } = await admin
      .from("public_alerts")
      .update({ published: true, published_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "public_alert.publish",
      target_table: "public_alerts",
      target_id: id,
    });

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
