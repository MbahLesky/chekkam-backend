import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { AuthError, toErrorResponse } from "@/lib/errors";
import { fetchDocumentForStatusChange, restoreDocumentCore } from "@/lib/documents/revoke";

/**
 * POST /api/documents/:id/restore — institution officer restores a
 * previously revoked document back to active. Mirrors [id]/revoke/route.ts
 * exactly (same auth/scoping), the inverse action.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();

    const doc = await fetchDocumentForStatusChange(admin, id);
    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    if (profile.role === "institution_officer") {
      const { data: membership } = await admin
        .from("institution_members")
        .select("id")
        .eq("institution_id", doc.institution_id)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!membership) {
        throw new AuthError("You are not a member of this document's institution.", 403);
      }
    }

    const updated = await restoreDocumentCore(admin, id, profile.id);
    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
