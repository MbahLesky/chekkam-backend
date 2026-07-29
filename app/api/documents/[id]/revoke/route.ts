import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { documentRevokeSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { AuthError, toErrorResponse } from "@/lib/errors";
import { fetchDocumentForStatusChange, revokeDocumentCore } from "@/lib/documents/revoke";

/**
 * POST /api/documents/:id/revoke — institution officer revokes a signed document.
 * SRS FR-046, 6.4. After this, verification returns "revoked" with the stated reason.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const body = parseBody(documentRevokeSchema, await req.json());
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

    const updated = await revokeDocumentCore(admin, id, body.reason, profile.id);
    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
