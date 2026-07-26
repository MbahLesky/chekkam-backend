import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

/**
 * GET /api/documents — list documents for the dashboard (SRS §3.7/§3.8).
 * Institution officers see only their own institution's documents; analysts
 * and admins see everything. Citizens have no reason to hit this route.
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    let query = admin
      .from("documents")
      .select(
        "id, institution_id, document_type, recipient_name, status, file_hash, signature, verification_id, pin_code, qr_payload, issued_at, revoked_at, revocation_reason, expiry_date, institutions(name)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (profile.role === "institution_officer") {
      const { data: memberships } = await admin
        .from("institution_members")
        .select("institution_id")
        .eq("user_id", profile.id);

      const institutionIds = (memberships ?? []).map((m) => m.institution_id);
      if (institutionIds.length === 0) {
        return NextResponse.json({ documents: [] });
      }
      query = query.in("institution_id", institutionIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const documents = (data ?? []).map((doc) => {
      const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;
      return {
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
      };
    });

    return NextResponse.json({ documents });
  } catch (err) {
    return toErrorResponse(err);
  }
}
