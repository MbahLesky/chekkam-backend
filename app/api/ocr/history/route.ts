import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

const STAFF_ROLES = new Set(["analyst", "admin", "super_admin"]);

/**
 * GET /api/ocr/history — filterable list, same shape as GET /api/reports:
 * staff see every OCR submission, everyone else is scoped to their own.
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    const admin = getSupabaseAdmin();
    const isStaff = STAFF_ROLES.has(profile.role);

    let query = admin
      .from("evidence")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!isStaff) {
      query = query.eq("uploaded_by", profile.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ocr_results: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
