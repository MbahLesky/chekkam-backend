import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { AuthError, toErrorResponse } from "@/lib/errors";
import { byteaToBuffer } from "@/lib/documents/bytea";

/**
 * GET /api/documents/:id/download-original — re-downloads the exact file an
 * institution officer signed, invisibly marked (PDF/DOCX/PNG only — see
 * lib/documents/embed/), not the detached certificate/label. Authenticated
 * and scoped to the signing institution's own members (plus staff), same
 * posture as revoke — this is not a public/anonymous endpoint, unlike
 * verification itself.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin", "analyst"]);

    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from("documents")
      .select("id, institution_id, original_file_data, original_file_mime_type, original_file_name")
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

    const bytes = byteaToBuffer(doc.original_file_data as string | null);
    if (!bytes) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message:
              "No re-downloadable original is available for this document (only PDF, DOCX, and PNG uploads retain one).",
          },
        },
        { status: 404 }
      );
    }

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "document.download_original",
      target_table: "documents",
      target_id: id,
    });

    const filename = doc.original_file_name || "document";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": doc.original_file_mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
