import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toErrorResponse } from "@/lib/errors";
import { getInstitutionPrivateKey } from "@/lib/crypto/sign";
import { generateQrDataUrl } from "@/lib/crypto/qrcode";
import { buildSignedToken, TOKEN_VERSION } from "@/lib/crypto/token";

/**
 * GET /api/documents/:id/offline-token (FR-049) — public, anonymous, same
 * access level as GET /api/documents/verify/:id (this exposes nothing more
 * sensitive than that route already does: hash, institution, type, id are
 * all already public knowledge for a signed document). Returns a
 * self-contained signed token a client can cache and verify later without
 * a network call — the actual on-device verification (Flutter +
 * pointycastle) is not built this session; this is the backend primitive
 * that makes it possible without a second signing/verification
 * implementation (lib/crypto/token.ts reuses the exact same ECDSA helpers
 * lib/documents/sign-document.ts does).
 *
 * Deliberately does NOT change documents.qr_payload or the existing
 * /verify/:id flow — this is an additional, opt-in artifact, not a
 * replacement of what's already live and demoed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from("documents")
      .select("id, institution_id, document_type, issued_at, file_hash, verification_id")
      .eq("id", id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    const privateKey = getInstitutionPrivateKey(doc.institution_id);
    const token = buildSignedToken(
      {
        v: TOKEN_VERSION,
        institution_id: doc.institution_id,
        document_type: doc.document_type,
        issued_at: doc.issued_at,
        file_sha256: doc.file_hash,
        verification_id: doc.verification_id,
      },
      privateKey
    );

    const base = (process.env.APP_BASE_URL ?? "https://chekkam.cm").replace(/\/$/, "");
    const verificationUrl = `${base}/v/${token}`;
    const qrImage = await generateQrDataUrl(verificationUrl);

    return NextResponse.json({ token, verification_url: verificationUrl, qr_image: qrImage });
  } catch (err) {
    return toErrorResponse(err);
  }
}
