import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assessDocument } from "@/lib/documents/assess-document";
import { generateSigningKeyPair, hashDocument, signHash } from "@/lib/crypto/sign";

function makeAdmin(doc: Record<string, unknown> | null) {
  const docBuilder: Record<string, unknown> = {
    select: vi.fn(() => docBuilder),
    or: vi.fn(() => docBuilder),
    eq: vi.fn(() => docBuilder),
    maybeSingle: vi.fn(async () => ({ data: doc, error: null })),
  };
  return {
    from: vi.fn((table: string) =>
      table === "document_verification_logs"
        ? { insert: vi.fn(async () => ({ data: null, error: null })) }
        : docBuilder
    ),
  };
}

describe("assessDocument", () => {
  it("keeps a matching Chekkam registry result as cryptographic proof", async () => {
    const file = Buffer.from("registered scholarship certificate");
    const hash = hashDocument(file);
    const { privateKey, publicKey } = generateSigningKeyPair();
    const admin = makeAdmin({
      id: "doc-1",
      verification_id: "CHK-TEST-0001",
      status: "active",
      expiry_date: null,
      file_hash: hash,
      signature: signHash(hash, privateKey),
      document_type: "scholarship",
      institutions: { name: "Example University", verified: true, signing_public_key: publicKey },
    });

    const result = await assessDocument(admin as never, file, "CHK-TEST-0001", "share_intent", "application/pdf");

    expect(result.mode).toBe("registry_verification");
    expect(result.is_proof).toBe(true);
    expect(result.status).toBe("genuine");
    expect(result.registry.institution_verified).toBe(true);
  });

  it("reports a valid external PDF signature without calling the issuer Chekkam-verified", async () => {
    const fixture = fs.readFileSync(path.join(__dirname, "../../test-fixtures/pdf-signatures/signed.pdf"));
    const result = await assessDocument(makeAdmin(null) as never, fixture, null, "web", "application/pdf");

    expect(result.mode).toBe("trust_report");
    expect(result.is_proof).toBe(false);
    expect(result.status).toBe("external_signature_verified");
    expect(result.signals.some((signal) => signal.layer === "pdf_signature")).toBe(true);
  });

  it("does not call an unknown unsigned document fake", async () => {
    const result = await assessDocument(
      makeAdmin(null) as never,
      Buffer.from("an unknown scholarship document"),
      null,
      "web",
      "application/pdf"
    );

    expect(result.mode).toBe("trust_report");
    expect(result.status).toBe("not_in_registry");
    expect(result.recommended_action).toMatch(/organisation|issuer/i);
  });
});
