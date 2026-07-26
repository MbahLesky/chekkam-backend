import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole, requireInstitutionMember } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import {
  fetchDocumentForCertificate,
  generateCertificatePdf,
  certificateFilename,
  buildCertificatePdfResponse,
} from "@/lib/documents/certificate";

/**
 * GET /api/documents/:id/certificate — downloadable "Verification Certificate"
 * PDF (SRS FR-048). Institution officers, admins, and super_admins only;
 * officers must belong to the document's institution (same rule as revoke).
 *
 * The `documents` table stores only a hash/signature, never the original
 * file (CLAUDE.md §10.1), so this is a detached attestation of the signed
 * record — not a stamped copy of the original — and says so on the page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const doc = await fetchDocumentForCertificate(admin, id);
    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    await requireInstitutionMember(profile, doc.institution_id);

    const pdfBytes = await generateCertificatePdf(doc);

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "document.certificate.download",
      target_table: "documents",
      target_id: doc.id,
      metadata: { institution_id: doc.institution_id, verification_id: doc.verification_id },
    });

    return buildCertificatePdfResponse(pdfBytes, certificateFilename(doc));
  } catch (err) {
    return toErrorResponse(err);
  }
}
