import { describe, test, expect, vi, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateSigningKeyPair } from "@/lib/crypto/sign";
import {
  createVerificationReceipt,
  isReceiptSignatureValid,
  generateReceiptPdf,
  buildReceiptVerificationUrl,
  VerificationReceipt,
} from "./receipt";

function makeAdminForInsert(insertedRow: Record<string, unknown>) {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: insertedRow, error: null })),
        })),
      })),
    })),
  };
}

beforeAll(() => {
  // Tests never touch a real Railway/production key — a throwaway key pair
  // generated in-process, same as the demo-institution provisioning flow.
  const { privateKey } = generateSigningKeyPair();
  process.env.CHEKKAM_RECEIPT_SIGNING_KEY = privateKey.replace(/\n/g, "\\n");
});

describe("createVerificationReceipt + isReceiptSignatureValid", () => {
  test("round-trips: a freshly created receipt verifies as genuine", async () => {
    let capturedInsert: Record<string, unknown> = {};
    const admin = {
      from: vi.fn(() => ({
        insert: vi.fn((row: Record<string, unknown>) => {
          capturedInsert = row;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: capturedInsert, error: null })),
            })),
          };
        }),
      })),
    };

    const receipt = (await createVerificationReceipt(admin as never, {
      documentId: "doc-1",
      fileHash: "abc123",
      result: "genuine",
      verifiedByOrg: "ABC Bank HR",
      apiKeyId: null,
      requestedBy: "user-1",
    })) as VerificationReceipt;

    expect(receipt.receipt_verification_id).toMatch(/^RCP-/);
    expect(isReceiptSignatureValid(receipt)).toBe(true);
  });

  test("survives a Postgres-style timestamp round-trip (+00:00 vs Z suffix, same instant)", async () => {
    let capturedInsert: Record<string, unknown> = {};
    const admin = {
      from: vi.fn(() => ({
        insert: vi.fn((row: Record<string, unknown>) => {
          capturedInsert = row;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: capturedInsert, error: null })),
            })),
          };
        }),
      })),
    };
    const receipt = (await createVerificationReceipt(admin as never, {
      documentId: null,
      fileHash: "hash-1",
      result: "genuine",
      verifiedByOrg: null,
      apiKeyId: null,
      requestedBy: null,
    })) as VerificationReceipt;

    // Simulate what Postgres actually returns for a timestamptz: the same
    // instant, "+00:00" instead of JS's "Z" suffix. This exact mismatch
    // caused every freshly-created receipt to fail its own verification
    // (caught live against the real database, not by a mocked round-trip).
    const postgresStyle: VerificationReceipt = {
      ...receipt,
      created_at: receipt.created_at.replace("Z", "+00:00"),
    };
    expect(isReceiptSignatureValid(postgresStyle)).toBe(true);
  });

  test("detects a tampered receipt (any field altered after signing)", async () => {
    const admin = makeAdminForInsert({});
    const receipt = (await createVerificationReceipt(admin as never, {
      documentId: null,
      fileHash: "original-hash",
      result: "genuine",
      verifiedByOrg: null,
      apiKeyId: null,
      requestedBy: null,
    })) as VerificationReceipt;

    const tampered: VerificationReceipt = { ...receipt, result: "tampered" };
    expect(isReceiptSignatureValid(tampered)).toBe(false);
  });
});

describe("buildReceiptVerificationUrl", () => {
  test("builds a URL under /api/verification-receipts/verify/", () => {
    const url = buildReceiptVerificationUrl("RCP-AAAA-1111");
    expect(url).toContain("/api/verification-receipts/verify/RCP-AAAA-1111");
  });
});

describe("generateReceiptPdf", () => {
  test("produces a single-page, loadable PDF that never embeds the original file", async () => {
    const receipt: VerificationReceipt = {
      id: "r1",
      document_id: "doc-1",
      file_hash: "abcdef0123456789",
      result: "genuine",
      verified_by_org: "ABC Bank HR",
      receipt_signature: "sig",
      receipt_verification_id: "RCP-AAAA-1111",
      created_at: new Date().toISOString(),
    };
    const bytes = await generateReceiptPdf(receipt);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});
