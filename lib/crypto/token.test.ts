import { describe, test, expect } from "vitest";
import { generateSigningKeyPair } from "./sign";
import { buildSignedToken, decodeSignedToken, verifySignedToken, TOKEN_VERSION } from "./token";

const { publicKey, privateKey } = generateSigningKeyPair();
const { publicKey: wrongPublicKey } = generateSigningKeyPair();

const samplePayload = {
  v: TOKEN_VERSION,
  institution_id: "0b8929f6-22e2-400a-8d91-af9e7f70280c",
  document_type: "certificate",
  issued_at: "2026-01-01T00:00:00Z",
  file_sha256: "abc123def456",
  verification_id: "CHK-AAAA-1111",
};

describe("buildSignedToken / decodeSignedToken / verifySignedToken", () => {
  test("round-trips: a freshly built token decodes and verifies", () => {
    const token = buildSignedToken(samplePayload, privateKey);
    const decoded = decodeSignedToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.institution_id).toBe(samplePayload.institution_id);
    expect(decoded?.verification_id).toBe(samplePayload.verification_id);
    expect(verifySignedToken(decoded!, publicKey)).toBe(true);
  });

  test("rejects a token verified against the wrong institution's public key", () => {
    const token = buildSignedToken(samplePayload, privateKey);
    const decoded = decodeSignedToken(token)!;
    expect(verifySignedToken(decoded, wrongPublicKey)).toBe(false);
  });

  test("detects a tampered field (verification_id swapped after signing)", () => {
    const token = buildSignedToken(samplePayload, privateKey);
    const decoded = decodeSignedToken(token)!;
    const tampered = { ...decoded, verification_id: "CHK-ZZZZ-9999" };
    expect(verifySignedToken(tampered, publicKey)).toBe(false);
  });

  test("detects a tampered file hash (the actual tamper-detection case FR-049 cares about)", () => {
    const token = buildSignedToken(samplePayload, privateKey);
    const decoded = decodeSignedToken(token)!;
    const tampered = { ...decoded, file_sha256: "0000000000000000" };
    expect(verifySignedToken(tampered, publicKey)).toBe(false);
  });

  test("decodeSignedToken rejects an unknown version loudly (Coding Standards §5) rather than guessing", () => {
    const token = buildSignedToken(samplePayload, privateKey);
    const raw = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const futureVersionToken = Buffer.from(JSON.stringify({ ...raw, v: 2 }), "utf8").toString("base64url");
    expect(decodeSignedToken(futureVersionToken)).toBeNull();
  });

  test("decodeSignedToken rejects garbage input without throwing", () => {
    expect(decodeSignedToken("not-a-valid-token-at-all")).toBeNull();
    expect(decodeSignedToken("")).toBeNull();
  });

  test("decodeSignedToken rejects a structurally incomplete payload", () => {
    const incomplete = Buffer.from(JSON.stringify({ v: 1, institution_id: "x" }), "utf8").toString(
      "base64url"
    );
    expect(decodeSignedToken(incomplete)).toBeNull();
  });
});
