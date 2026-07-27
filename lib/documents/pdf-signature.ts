import forge from "node-forge";

/**
 * Standard PDF digital-signature verification (FR-101, Trust Report Layer 1
 * only — see Chekkam_Document_Intelligence_Spec.md §2). This checks the
 * embedded PKCS#7/CMS signature a PDF may already carry from ANY issuer
 * (foreign universities, eIDAS bodies, government agencies) — it does not
 * touch the Chekkam registry (lib/documents/verify.ts) at all, and it is
 * not the full six-layer Trust Report (FR-100/102-107), which is separate,
 * larger, unbuilt scope.
 *
 * What this proves vs. what it doesn't (never blur these — see CLAUDE.md
 * "Proof vs signals"):
 * - `integrityProof: true` means the covered bytes are mathematically
 *   proven unmodified since that signature was applied. That IS proof.
 * - `issuerTrustChecked` is always false: no Adobe AATL/EUTL chain check is
 *   implemented. An unrecognised issuer must be reported as unrecognised,
 *   never as untrusted or fraudulent (spec §2 Layer 1, §5 rule 5).
 */

export type PdfSignatureInfo = {
  signerCommonName: string | null;
  signerOrganization: string | null;
  issuerCommonName: string | null;
  issuerOrganization: string | null;
  selfSigned: boolean;
  validFrom: string;
  validTo: string;
  digestAlgorithm: string;
};

export type PdfSignatureResult =
  | { status: "no_signature_found" }
  | { status: "signature_unparseable"; signatureCount: number; reason: string }
  | {
      status: "signed_valid_unmodified" | "signed_but_modified_after_signing";
      signatureCount: number;
      lastSignature: PdfSignatureInfo;
      integrityProof: boolean;
      issuerTrustChecked: false;
    };

type ByteRange = [number, number, number, number];
type SignatureBlock = { byteRange: ByteRange; signatureHex: string };

const DIGEST_OID_TO_NAME: Record<string, "sha1" | "sha256" | "sha384" | "sha512"> = {
  [forge.pki.oids.sha1]: "sha1",
  [forge.pki.oids.sha256]: "sha256",
  [forge.pki.oids.sha384]: "sha384",
  [forge.pki.oids.sha512]: "sha512",
};

function createMessageDigest(name: "sha1" | "sha256" | "sha384" | "sha512") {
  return forge.md[name].create();
}

// @types/node-forge models asn1.fromDer's 2nd argument as boolean-only, but
// the installed forge runtime (confirmed by direct testing against real
// signed-PDF fixtures) also accepts an options object — parseAllBytes:false
// is required because a PDF's /Contents placeholder is a fixed-size hex
// slot padded with unused trailing bytes, not an exact-length DER blob.
const fromDer = forge.asn1.fromDer as unknown as (
  bytes: string,
  options?: { strict?: boolean; parseAllBytes?: boolean }
) => forge.asn1.Asn1;

function fieldValue(dn: { getField(shortName: string): { value?: unknown } | undefined }, shortName: string): string | null {
  const value = dn.getField(shortName)?.value;
  return typeof value === "string" ? value : null;
}

/**
 * Finds every /ByteRange + /Contents pair in document order. Real signers
 * (including this module's five test fixtures, sourced from node-signpdf)
 * always place a signature's /Contents in the same signature dictionary as
 * its /ByteRange, in matching document order — so pairing by occurrence
 * index is reliable without a full PDF object-graph parser.
 */
function extractSignatureBlocks(pdfBytes: Buffer): SignatureBlock[] {
  const latin1 = pdfBytes.toString("latin1"); // byte-accurate: 1 char per byte, required for exact offsets
  const byteRanges = [...latin1.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map(
    (m) => m.slice(1, 5).map(Number) as ByteRange
  );
  const contentsList = [...latin1.matchAll(/\/Contents\s*<([0-9a-fA-F]+)>/g)].map((m) => m[1]);
  const count = Math.min(byteRanges.length, contentsList.length);
  const blocks: SignatureBlock[] = [];
  for (let i = 0; i < count; i++) {
    blocks.push({ byteRange: byteRanges[i], signatureHex: contentsList[i] });
  }
  return blocks;
}

/**
 * Verifies one signature block's cryptographic integrity against the
 * actual PDF bytes it claims to cover, and extracts signer certificate
 * metadata. Throws on any malformed/unparseable structure — callers must
 * catch and report `signature_unparseable` rather than crashing.
 */
function verifySignatureBlock(pdfBytes: Buffer, block: SignatureBlock): { valid: boolean; info: PdfSignatureInfo } {
  const [a, b, c, d] = block.byteRange;
  const signedBytes = Buffer.concat([pdfBytes.subarray(a, a + b), pdfBytes.subarray(c, c + d)]);

  // Decode the full /Contents hex placeholder as-is. Do NOT strip trailing
  // zero hex characters with a regex — that is a character-level operation
  // that can desynchronize byte boundaries when the real DER content
  // legitimately ends near a run of zero nibbles, corrupting the parse.
  // `parseAllBytes: false` lets forge stop at the DER structure's own
  // self-declared length and ignore the placeholder's unused padding.
  const der = forge.util.hexToBytes(block.signatureHex);
  const asn1 = fromDer(der, { parseAllBytes: false });
  const message = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.Captured<forge.pkcs7.PkcsSignedData>;

  const cert = message.certificates?.[0];
  if (!cert) throw new Error("PKCS#7 structure contains no signer certificate");
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;

  const digestAlgOid = forge.asn1.derToOid(message.rawCapture.digestAlgorithm);
  const digestName = DIGEST_OID_TO_NAME[digestAlgOid];
  if (!digestName) throw new Error(`Unsupported digest algorithm OID: ${digestAlgOid}`);

  const contentMd = createMessageDigest(digestName);
  contentMd.update(signedBytes.toString("binary"));

  // rawCapture is untyped (`any`) in @types/node-forge — it exposes the raw
  // parsed ASN.1 fields forge's own high-level API does not surface.
  const attrs: Array<{ value: Array<{ value: unknown }> }> | undefined = message.rawCapture.authenticatedAttributes;
  let valid: boolean;
  if (attrs && attrs.length > 0) {
    // PKCS#7 with authenticated attributes: the actual signature covers the
    // DER-encoded attribute SET, not the content directly. One attribute
    // (messageDigest) must independently match the content's own digest.
    let messageDigestHex: string | null = null;
    for (const attr of attrs) {
      const oid = forge.asn1.derToOid(attr.value[0].value as string);
      if (oid === forge.pki.oids.messageDigest) {
        const octetString = (attr.value[1].value as Array<{ value: string }>)[0];
        messageDigestHex = forge.util.bytesToHex(octetString.value);
      }
    }
    const digestMatches = messageDigestHex === contentMd.digest().toHex();

    const attrSet = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs as forge.asn1.Asn1[]);
    const attrsDer = forge.asn1.toDer(attrSet).getBytes();
    const attrsMd = createMessageDigest(digestName);
    attrsMd.update(attrsDer);
    const signatureMatches = publicKey.verify(attrsMd.digest().bytes(), message.rawCapture.signature);

    valid = digestMatches && signatureMatches;
  } else {
    // No authenticated attributes: the signature covers the content digest directly.
    valid = publicKey.verify(contentMd.digest().bytes(), message.rawCapture.signature);
  }

  const selfSigned =
    cert.issuer.attributes.length === cert.subject.attributes.length &&
    cert.issuer.attributes.every(
      (attr, i) => attr.shortName === cert.subject.attributes[i]?.shortName && attr.value === cert.subject.attributes[i]?.value
    );

  return {
    valid,
    info: {
      signerCommonName: fieldValue(cert.subject, "CN"),
      signerOrganization: fieldValue(cert.subject, "O"),
      issuerCommonName: fieldValue(cert.issuer, "CN"),
      issuerOrganization: fieldValue(cert.issuer, "O"),
      selfSigned,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      digestAlgorithm: digestName,
    },
  };
}

/** Never throws. Callers (API routes, future Trust Report aggregation) can call this directly on untrusted uploaded bytes. */
export function verifyPdfSignature(pdfBytes: Buffer): PdfSignatureResult {
  let blocks: SignatureBlock[];
  try {
    blocks = extractSignatureBlocks(pdfBytes);
  } catch {
    return { status: "no_signature_found" };
  }
  if (blocks.length === 0) return { status: "no_signature_found" };

  const lastBlock = blocks[blocks.length - 1];
  let outcome: { valid: boolean; info: PdfSignatureInfo };
  try {
    outcome = verifySignatureBlock(pdfBytes, lastBlock);
  } catch (err) {
    return {
      status: "signature_unparseable",
      signatureCount: blocks.length,
      reason: err instanceof Error ? err.message : "Unknown PDF signature parsing error",
    };
  }

  const [, , c, d] = lastBlock.byteRange;
  // A signature whose ByteRange no longer reaches the true end of the file
  // means bytes were appended after it was applied — modified after
  // signing, exactly as with an in-place edit that breaks the digest.
  const coversToEof = c + d === pdfBytes.length;
  const unmodified = outcome.valid && coversToEof;

  return {
    status: unmodified ? "signed_valid_unmodified" : "signed_but_modified_after_signing",
    signatureCount: blocks.length,
    lastSignature: outcome.info,
    integrityProof: unmodified,
    issuerTrustChecked: false,
  };
}
