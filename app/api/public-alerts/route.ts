import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireAlertPublisher } from "@/lib/auth";
import { publicAlertCreateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";

/**
 * GET /api/public-alerts — public, human-approved alerts only (SRS FR-090, 6.7).
 * ?scope=drafts lists unpublished drafts for the dashboard's promote/edit/publish
 * workflow (Phase 2 §7.3): analyst/admin/super_admin see every draft; an
 * institution_officer of a verified institution (Phase 11) sees only their own.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();

    if (req.nextUrl.searchParams.get("scope") === "drafts") {
      const profile = await requireUser(req);
      await requireAlertPublisher(profile, admin);

      let query = admin
        .from("public_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (profile.role === "institution_officer") {
        query = query.eq("created_by", profile.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ alerts: data });
    }

    try {
      const { data, error } = await admin
        .from("public_alerts")
        .select("id, title, body, alert_type, severity, published_at")
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return NextResponse.json({ alerts: data });
    } catch (err) {
      // Citizen-facing: never 500 here — an unexpected DB hiccup should
      // degrade to an empty list rather than break the app's alerts screen.
      console.error("[public-alerts] falling back to an empty list:", err);
      return NextResponse.json({ alerts: [] });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/public-alerts — drafts an alert, unpublished until reviewed
 * (SRS 6.7). analyst/admin/super_admin, or an institution_officer of a
 * verified institution (Phase 11 — Cameroon Emergency Trust Bulletin).
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    const admin = getSupabaseAdmin();
    await requireAlertPublisher(profile, admin);

    const body = parseBody(publicAlertCreateSchema, await req.json());

    const { data, error } = await admin
      .from("public_alerts")
      .insert({ ...body, created_by: profile.id, published: false })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
