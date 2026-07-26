import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole, requireInstitutionMember } from "@/lib/auth";
import { toErrorResponse, jsonError } from "@/lib/errors";

/**
 * GET /api/documents/:id — single-document detail for the dashboard, same
 * shape/scoping as GET /api/documents (institution officers see only their
 * own institution's documents; analysts/admins see everything).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const { data: doc, error } = await admin
      .from("documents")
      .select(
        "id, institution_id, document_type, recipient_name, status, file_hash, signature, verification_id, pin_code, qr_payload, issued_at, revoked_at, revocation_reason, expiry_date, institutions(name)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return jsonError("NOT_FOUND", "Document not found.", 404);

    if (profile.role === "institution_officer") {
      await requireInstitutionMember(profile, doc.institution_id);
    }

    const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;
    return NextResponse.json({
      id: doc.id,
      institution_id: doc.institution_id,
      institution_name: institution?.name ?? null,
      document_type: doc.document_type,
      recipient_name: doc.recipient_name,
      status: doc.status,
      file_hash: doc.file_hash,
      signature: doc.signature,
      verification_id: doc.verification_id,
      pin_code: doc.pin_code,
      qr_payload: doc.qr_payload,
      issued_at: doc.issued_at,
      revoked_at: doc.revoked_at,
      revocation_reason: doc.revocation_reason,
      expiry_date: doc.expiry_date,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
