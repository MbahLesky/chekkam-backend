import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { AuthError, toErrorResponse } from "@/lib/errors";

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

    const { data: doc } = await admin
      .from("documents")
      .select("id, institution_id, status")
      .eq("id", id)
      .maybeSingle();

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

    const { data: updated, error } = await admin
      .from("documents")
      .update({
        status: "active",
        revoked_at: null,
        revocation_reason: null,
      })
      .eq("id", id)
      .select("id, status, revoked_at, revocation_reason")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "document.restore",
      target_table: "documents",
      target_id: id,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
