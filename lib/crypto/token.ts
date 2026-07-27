import { hashDocument, signHash } from "@/lib/crypto/sign";
import { verifySignature } from "@/lib/crypto/verify";

/**
 * Signed offline-verification token (FR-049, Coding Standards §5: "base64url,
 * fixed field order, versioned (v:1) so future formats stay backward
 * compatible; verify must reject unknown versions loudly"). This is purely
 * additive — it does NOT change documents.qr_payload or the existing
 * /verify/:id flow, both already live and demoed. A document's existing QR
 * still points at /verify/<id> exactly as before; this token is a separate,
 * opt-in artifact for whatever surface wants offline capability (a future
 * Flutter on-device verifier, or the /v/:token web fallback), fetched via
 * GET /api/documents/:id/offline-token, never baked into the stored QR.
 *
 * Deliberately backend-only this session: the actual "verify fully offline"
 * experience needs a Flutter-side port (key caching + on-device pointycastle
 * ECDSA + the "revocation not checked" caveat UI) that isn't built here —
 * see STATUS_REPORT.md. What's here is the shared primitive both the web
 * fallback and a future Dart port would call, so there's still only one
 * implementation of "what a valid token looks like," never two.
 */
export const TOKEN_VERSION = 1 as const;

export type SignedTokenPayload = {
  v: typeof TOKEN_VERSION;
  institution_id: string;
  document_type: string;
  issued_at: string;
  file_sha256: string;
  verification_id: string;
};

export type SignedToken = SignedTokenPayload & { signature: string };

function canonicalPayload(p: SignedTokenPayload): string {
  // Fixed field order — verification reconstructs this from decoded field
  // values (never by re-stringifying the whole object), so it can never
  // drift from what was actually signed regardless of JSON key ordering.
  return [String(p.v), p.institution_id, p.document_type, p.issued_at, p.file_sha256, p.verification_id].join(
    "|"
  );
}

/** Builds a versioned, base64url-encoded signed token. */
export function buildSignedToken(payload: SignedTokenPayload, privateKeyPem: string): string {
  const signature = signHash(hashDocument(Buffer.from(canonicalPayload(payload), "utf8")), privateKeyPem);
  const full: SignedToken = { ...payload, signature };
  return Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
}

/** Decodes a token's structure only — never trust the contents until verifySignedToken passes. Rejects unknown versions loudly rather than guessing a format. */
export function decodeSignedToken(token: string): SignedToken | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (
      parsed?.v !== TOKEN_VERSION ||
      typeof parsed.institution_id !== "string" ||
      typeof parsed.document_type !== "string" ||
      typeof parsed.issued_at !== "string" ||
      typeof parsed.file_sha256 !== "string" ||
      typeof parsed.verification_id !== "string" ||
      typeof parsed.signature !== "string"
    ) {
      return null;
    }
    return parsed as SignedToken;
  } catch {
    return null;
  }
}

/** Verifies a decoded token's signature against the institution's public key. Never throws. */
export function verifySignedToken(token: SignedToken, publicKeyPem: string): boolean {
  const { signature, ...payload } = token;
  return verifySignature(hashDocument(Buffer.from(canonicalPayload(payload), "utf8")), signature, publicKeyPem);
}
