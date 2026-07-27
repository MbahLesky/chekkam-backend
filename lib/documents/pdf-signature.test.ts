import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { verifyPdfSignature } from "./pdf-signature";

/**
 * Fixtures in test-fixtures/pdf-signatures/ are REAL signed PDFs sourced
 * from github.com/vbuch/node-signpdf (MIT), not self-authored test data —
 * this module's core job is parsing third-party PKCS#7 structures we did
 * not create, so validating against something we didn't build ourselves is
 * the only meaningful proof it works (see CLAUDE.md: don't mark a feature
 * working merely because source code exists).
 */
const fixtureDir = path.join(__dirname, "../../test-fixtures/pdf-signatures");
const load = (name: string) => fs.readFileSync(path.join(fixtureDir, name));

describe("verifyPdfSignature — real signed PDF fixtures", () => {
  test("signed.pdf: single signature, covers to EOF -> signed_valid_unmodified", () => {
    const result = verifyPdfSignature(load("signed.pdf"));
    expect(result.status).toBe("signed_valid_unmodified");
    if (result.status === "signed_valid_unmodified") {
      expect(result.integrityProof).toBe(true);
      expect(result.issuerTrustChecked).toBe(false);
      expect(result.signatureCount).toBe(1);
      expect(result.lastSignature.signerCommonName).toBe("signpdf");
      expect(result.lastSignature.selfSigned).toBe(true);
      expect(result.lastSignature.digestAlgorithm).toBe("sha256");
    }
  });

  test("signed-once.pdf: exercises the parseAllBytes:false DER path (placeholder longer than actual DER content)", () => {
    const result = verifyPdfSignature(load("signed-once.pdf"));
    expect(result.status).toBe("signed_valid_unmodified");
  });

  test("signed-twice.pdf: two signatures -> verifies the LAST one, which covers to EOF", () => {
    const result = verifyPdfSignature(load("signed-twice.pdf"));
    expect(result.status).toBe("signed_valid_unmodified");
    if (result.status === "signed_valid_unmodified") {
      expect(result.signatureCount).toBe(2);
    }
  });

  test("incrementally-signed.pdf: signed_valid_unmodified", () => {
    const result = verifyPdfSignature(load("incrementally-signed.pdf"));
    expect(result.status).toBe("signed_valid_unmodified");
  });

  test("unsigned.pdf: no /ByteRange at all -> no_signature_found", () => {
    const result = verifyPdfSignature(load("unsigned.pdf"));
    expect(result.status).toBe("no_signature_found");
  });

  test("non-PDF garbage bytes never throw -> no_signature_found", () => {
    const result = verifyPdfSignature(Buffer.from("this is not a pdf at all"));
    expect(result.status).toBe("no_signature_found");
  });

  test("empty buffer never throws -> no_signature_found", () => {
    const result = verifyPdfSignature(Buffer.alloc(0));
    expect(result.status).toBe("no_signature_found");
  });

  test("a byte flipped INSIDE the signed range (before the signature placeholder) is detected as modified after signing", () => {
    const original = load("signed.pdf");
    const tampered = Buffer.from(original);
    // Flip one content byte well before the /ByteRange gap (offset 0..153
    // per the fixture's own ByteRange[0,153,...]) so it's covered by the
    // signature but not inside the /Contents hex placeholder itself.
    tampered[50] = tampered[50] ^ 0xff;
    const result = verifyPdfSignature(tampered);
    expect(result.status).toBe("signed_but_modified_after_signing");
    if (result.status === "signed_but_modified_after_signing") {
      expect(result.integrityProof).toBe(false);
    }
  });

  test("bytes appended after a valid signature's coverage are detected as modified after signing", () => {
    const original = load("signed.pdf");
    const appended = Buffer.concat([original, Buffer.from("\n%extra-injected-content\n")]);
    const result = verifyPdfSignature(appended);
    expect(result.status).toBe("signed_but_modified_after_signing");
  });
});
