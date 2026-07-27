import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

const STAFF_ROLES = new Set(["analyst", "admin", "super_admin"]);

/** GET /api/ai/content-authenticity/history — same shape as GET /api/ocr/history. */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    const admin = getSupabaseAdmin();
    const isStaff = STAFF_ROLES.has(profile.role);

    let query = admin
      .from("content_authenticity_checks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!isStaff) {
      query = query.eq("user_id", profile.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ content_authenticity_checks: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
