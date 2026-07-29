import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole, requireInstitutionMember } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import {
  buildVerificationLabelPdfResponse,
  fetchDocumentForVerificationLabel,
  generateVerificationLabelPdf,
  hasValidRegistrySignature,
  verificationLabelFilename,
} from "@/lib/documents/verification-label";

/**
 * GET /api/documents/:id/verification-label
 *
 * Delivers a generic, separate QR label for an existing signed registry
 * record. It never reads, uploads, stores, or modifies the original file.
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
    const doc = await fetchDocumentForVerificationLabel(admin, id);
    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    await requireInstitutionMember(profile, doc.institution_id);
    if (!hasValidRegistrySignature(doc)) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNATURE_INVALID",
            message:
              "A verification label cannot be issued because this record's cryptographic signature could not be validated.",
          },
        },
        { status: 409 }
      );
    }
    const pdfBytes = await generateVerificationLabelPdf(doc);

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "document.verification_label.download",
      target_table: "documents",
      target_id: doc.id,
      metadata: { institution_id: doc.institution_id, verification_id: doc.verification_id },
    });

    return buildVerificationLabelPdfResponse(pdfBytes, verificationLabelFilename(doc));
  } catch (err) {
    return toErrorResponse(err);
  }
}
