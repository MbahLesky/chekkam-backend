import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { AuthError, toErrorResponse, jsonError } from "@/lib/errors";

const STAFF_ROLES = new Set(["analyst", "admin", "super_admin"]);

/**
 * GET /api/security/report/:id — full detail for one safety check. Requires
 * auth + ownership (staff or the submitter) — same posture as
 * GET /api/ocr/:id, since findings can reference sensitive submitted content.
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
      .from("security_checks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "Safety check not found.", 404);

    const isStaff = STAFF_ROLES.has(profile.role);
    if (!isStaff && data.user_id !== profile.id) {
      throw new AuthError("You do not have access to this safety check.", 403);
    }

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
