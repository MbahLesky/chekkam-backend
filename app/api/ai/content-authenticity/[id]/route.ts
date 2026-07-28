import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { AuthError, toErrorResponse, jsonError } from "@/lib/errors";

const STAFF_ROLES = new Set(["analyst", "admin", "super_admin"]);

/**
 * GET /api/ai/content-authenticity/:id — requires auth + ownership, same
 * posture as GET /api/ocr/:id.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("content_authenticity_checks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "Content authenticity check not found.", 404);

    const isStaff = STAFF_ROLES.has(profile.role);
    if (!isStaff && data.user_id !== profile.id) {
      throw new AuthError("You do not have access to this check.", 403);
    }

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
