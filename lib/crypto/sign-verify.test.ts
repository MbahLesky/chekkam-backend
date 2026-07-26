import { describe, expect, it } from "vitest";
import { hashDocument, generateSigningKeyPair, signHash } from "@/lib/crypto/sign";
import { verifySignature } from "@/lib/crypto/verify";

describe("crypto sign/verify round trip", () => {
  it("verifies a signature made with the matching private key", () => {
    const { publicKey, privateKey } = generateSigningKeyPair();
    const hash = hashDocument(Buffer.from("hello world"));
    const signature = signHash(hash, privateKey);
    expect(verifySignature(hash, signature, publicKey)).toBe(true);
  });

  it("rejects a signature checked against a different institution's public key", () => {
    const { privateKey } = generateSigningKeyPair();
    const { publicKey: otherPublicKey } = generateSigningKeyPair();
    const hash = hashDocument(Buffer.from("hello world"));
    const signature = signHash(hash, privateKey);
    expect(verifySignature(hash, signature, otherPublicKey)).toBe(false);
  });

  it("rejects a signature when the hash has changed (tamper detection)", () => {
    const { publicKey, privateKey } = generateSigningKeyPair();
    const originalHash = hashDocument(Buffer.from("original content"));
    const signature = signHash(originalHash, privateKey);
    const tamperedHash = hashDocument(Buffer.from("tampered content"));
    expect(verifySignature(tamperedHash, signature, publicKey)).toBe(false);
  });

  it("never throws on garbage input", () => {
    expect(verifySignature("not-a-hash", "not-a-signature", "not-a-key")).toBe(false);
  });

  it("hashDocument is deterministic SHA-256 (64 hex chars)", () => {
    const a = hashDocument(Buffer.from("same content"));
    const b = hashDocument(Buffer.from("same content"));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(hashDocument(Buffer.from("different content"))).not.toBe(a);
  });
});
