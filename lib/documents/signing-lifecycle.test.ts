import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySignature } from "@/lib/crypto/verify";
import { generateSigningKeyPair, hashDocument } from "@/lib/crypto/sign";
import { signDocumentCore } from "@/lib/documents/sign-document";
import { verifyByUpload } from "@/lib/documents/verify";

function verifierAdmin(doc: Record<string, unknown>) {
  const documentBuilder: Record<string, unknown> = {
    select: vi.fn(() => documentBuilder),
    or: vi.fn(() => documentBuilder),
    eq: vi.fn(() => documentBuilder),
    maybeSingle: vi.fn(async () => ({ data: doc, error: null })),
  };
  return {
    from: vi.fn((table: string) =>
      table === "document_verification_logs"
        ? { insert: vi.fn(async () => ({ data: null, error: null })) }
        : documentBuilder
    ),
  };
}

describe("signed document verification lifecycle", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("signs an original, detects a changed original, and returns revoked after withdrawal", async () => {
    const institutionId = "c13b37f0-1000-4000-8000-000000000001";
    const envKey = `DOCUMENT_SIGNING_KEY_${institutionId.replace(/-/g, "_").toUpperCase()}`;
    const { privateKey, publicKey } = generateSigningKeyPair();
    vi.stubEnv(envKey, privateKey.replace(/\n/g, "\\n"));

    let inserted: Record<string, unknown> | null = null;
    const documentsBuilder: Record<string, unknown> = {
      insert: vi.fn((payload: Record<string, unknown>) => {
        inserted = payload;
        return documentsBuilder;
      }),
      select: vi.fn(() => documentsBuilder),
      single: vi.fn(async () => ({
        data: {
          id: "doc-1",
          verification_id: inserted?.verification_id,
          pin_code: inserted?.pin_code,
          qr_payload: inserted?.qr_payload,
          status: "active",
        },
        error: null,
      })),
    };
    const signingAdmin = {
      from: vi.fn((table: string) =>
        table === "documents"
          ? documentsBuilder
          : { insert: vi.fn(async () => ({ data: null, error: null })) }
      ),
    };

    const original = Buffer.from("original signed scholarship certificate");
    const signed = await signDocumentCore(signingAdmin as never, {
      institutionId,
      documentType: "scholarship",
      recipientName: "Ada Example",
      fileBuffer: original,
      actorId: "officer-1",
    });

    expect(signed.qr_payload).toContain(`/verify/${signed.verification_id}`);
    expect(signed.qr_image).toMatch(/^data:image\/png/);
    expect(inserted).not.toBeNull();
    expect(
      verifySignature(
        hashDocument(original),
        inserted?.signature as string,
        publicKey
      )
    ).toBe(true);

    const baseDocument = {
      id: "doc-1",
      verification_id: signed.verification_id,
      file_hash: inserted?.file_hash,
      signature: inserted?.signature,
      document_type: "scholarship",
      recipient_name: "Ada Example",
      expiry_date: null,
      institutions: { name: "Example University", verified: true, signing_public_key: publicKey },
    };

    const genuine = await verifyByUpload(
      verifierAdmin({ ...baseDocument, status: "active" }) as never,
      original,
      signed.verification_id,
      "mobile"
    );
    expect(genuine.status).toBe("genuine");
    expect(genuine.institution_verified).toBe(true);

    const tampered = await verifyByUpload(
      verifierAdmin({ ...baseDocument, status: "active" }) as never,
      Buffer.concat([original, Buffer.from(" altered")]),
      signed.verification_id,
      "mobile"
    );
    expect(tampered.status).toBe("tampered");

    const revoked = await verifyByUpload(
      verifierAdmin({
        ...baseDocument,
        status: "revoked",
        revoked_at: "2026-07-28T00:00:00.000Z",
        revocation_reason: "Superseded by a corrected document",
      }) as never,
      original,
      signed.verification_id,
      "mobile"
    );
    expect(revoked.status).toBe("revoked");
    expect(revoked.reason).toBe("Superseded by a corrected document");
  });
});
