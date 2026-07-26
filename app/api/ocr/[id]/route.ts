import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { AuthError, toErrorResponse, jsonError } from "@/lib/errors";

const STAFF_ROLES = new Set(["analyst", "admin", "super_admin"]);

/**
 * GET /api/ocr/:id — full OCR result detail. Unlike GET /api/reports/:id
 * (deliberately unauthenticated — the UUID is a bearer secret for anonymous
 * citizens), this requires auth + ownership: OCR content can carry personal
 * document data (ID numbers, letters), which is more sensitive than a risk
 * label. An anonymous uploader already sees their result inline in the
 * upload response; they just can't re-fetch it later without an account.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.from("evidence").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "OCR result not found.", 404);

    const isStaff = STAFF_ROLES.has(profile.role);
    if (!isStaff && data.uploaded_by !== profile.id) {
      throw new AuthError("You do not have access to this OCR result.", 403);
    }

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
