import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { buildVerificationUrl } from "@/lib/crypto/qrcode";
import { toErrorResponse } from "@/lib/errors";

const INSTITUTION_ID = "a94910a7-063d-4f8a-9f8c-7a169d71c65c";
const GENUINE_DOCUMENT_TYPE = "demo_trust_genuine";
const REVOKED_DOCUMENT_TYPE = "demo_trust_revoked";

/**
 * GET /api/demo-trust — summary for the protected "Demo Trust Kit" dashboard
 * page (scripts/seed-demo-trust.ts). Admin/analyst only, not public. Never
 * returns private key material — only what the demo_trust_assets/documents
 * rows already hold (hash, status, filenames).
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin", "analyst"]);

    const admin = getSupabaseAdmin();

    const { data: institution } = await admin
      .from("institutions")
      .select("id, name, verified, status, contact_email, verified_domains")
      .eq("id", INSTITUTION_ID)
      .maybeSingle();

    const { data: genuine } = await admin
      .from("documents")
      .select("id, verification_id, status, file_hash, issued_at")
      .eq("institution_id", INSTITUTION_ID)
      .eq("document_type", GENUINE_DOCUMENT_TYPE)
      .maybeSingle();

    const { data: revoked } = await admin
      .from("documents")
      .select("id, verification_id, status, file_hash, issued_at, revoked_at, revocation_reason")
      .eq("institution_id", INSTITUTION_ID)
      .eq("document_type", REVOKED_DOCUMENT_TYPE)
      .maybeSingle();

    const { data: assets } = await admin
      .from("demo_trust_assets")
      .select("key, file_name, mime_type, updated_at");
    const assetByKey = Object.fromEntries((assets ?? []).map((a) => [a.key, a]));

    return NextResponse.json({
      institution: institution
        ? {
            id: institution.id,
            name: institution.name,
            verified: institution.verified,
            status: institution.status,
            contact_email: institution.contact_email,
            domain: institution.verified_domains?.[0] ?? null,
          }
        : null,
      genuine: genuine
        ? {
            verification_id: genuine.verification_id,
            status: genuine.status,
            file_hash: genuine.file_hash,
            issued_at: genuine.issued_at,
            verify_url: buildVerificationUrl(genuine.verification_id),
            download_url: `/api/documents/${genuine.id}/download-original`,
          }
        : null,
      revoked: revoked
        ? {
            verification_id: revoked.verification_id,
            status: revoked.status,
            file_hash: revoked.file_hash,
            issued_at: revoked.issued_at,
            revoked_at: revoked.revoked_at,
            revocation_reason: revoked.revocation_reason,
            verify_url: buildVerificationUrl(revoked.verification_id),
            download_url: `/api/documents/${revoked.id}/download-original`,
          }
        : null,
      tampered: assetByKey.tampered
        ? {
            file_name: assetByKey.tampered.file_name,
            updated_at: assetByKey.tampered.updated_at,
            download_url: "/api/demo-trust/download/tampered",
          }
        : null,
      unregistered: assetByKey.unregistered
        ? {
            file_name: assetByKey.unregistered.file_name,
            updated_at: assetByKey.unregistered.updated_at,
            download_url: "/api/demo-trust/download/unregistered",
          }
        : null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
