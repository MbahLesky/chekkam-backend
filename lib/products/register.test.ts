import { describe, test, expect, vi, beforeAll } from "vitest";
import { generateSigningKeyPair, hashDocument } from "@/lib/crypto/sign";
import { verifySignature } from "@/lib/crypto/verify";
import { registerProductCore } from "@/lib/products/register";

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111";

function makeAdmin() {
  const auditInsert = vi.fn(async () => ({ data: null, error: null }));
  let capturedRow: Record<string, unknown> = {};
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "audit_logs") return { insert: auditInsert };
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          capturedRow = row;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "product-1", product_code: row.product_code, status: "active" },
                error: null,
              })),
            })),
          };
        }),
      };
    }),
    auditInsert,
    getCapturedRow: () => capturedRow,
  };
  return admin;
}

let publicKey: string;

beforeAll(() => {
  // Tests never touch a real Railway/production key — a throwaway key pair
  // generated in-process, same convention used by lib/documents/receipt.test.ts.
  const pair = generateSigningKeyPair();
  publicKey = pair.publicKey;
  const envVar = `DOCUMENT_SIGNING_KEY_${INSTITUTION_ID.replace(/-/g, "_").toUpperCase()}`;
  process.env[envVar] = pair.privateKey.replace(/\n/g, "\\n");
});

describe("registerProductCore", () => {
  test("round-trips: a freshly registered product's stored signature verifies against the manufacturer's public key", async () => {
    const admin = makeAdmin();
    const result = await registerProductCore(admin as never, {
      institutionId: INSTITUTION_ID,
      productName: "Test Widget",
      category: "electronics",
      actorId: "user-1",
    });

    expect(result.product_code).toMatch(/^PRD-/);
    expect(result.qr_payload).toContain("/verify-product/");
    expect(result.qr_payload).toContain(result.product_code);
    expect(result.qr_image).toMatch(/^data:image\/png;base64,/);

    const row = admin.getCapturedRow();
    expect(verifySignature(row.product_hash as string, row.signature as string, publicKey)).toBe(true);

    // Re-derive the same canonical payload+hash an independent verifier
    // would, and confirm it matches what was actually stored/signed.
    const canonical = Buffer.from(
      JSON.stringify([result.product_code, INSTITUTION_ID, "Test Widget", "electronics", "", "", ""]),
      "utf8"
    );
    expect(row.product_hash).toBe(hashDocument(canonical));
  });

  test("logs a product.register audit entry", async () => {
    const admin = makeAdmin();
    await registerProductCore(admin as never, {
      institutionId: INSTITUTION_ID,
      productName: "Test Widget",
      category: "electronics",
      actorId: "user-1",
    });
    expect(admin.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product.register", target_table: "products" })
    );
  });

  test("two different manufactured_at values produce different signatures (canonicalization doesn't silently drop the field)", async () => {
    const adminA = makeAdmin();
    const adminB = makeAdmin();

    await registerProductCore(adminA as never, {
      institutionId: INSTITUTION_ID,
      productName: "Test Widget",
      category: "electronics",
      manufacturedAt: "2026-01-01",
      actorId: "user-1",
    });
    await registerProductCore(adminB as never, {
      institutionId: INSTITUTION_ID,
      productName: "Test Widget",
      category: "electronics",
      manufacturedAt: "2026-06-01",
      actorId: "user-1",
    });

    expect(adminA.getCapturedRow().signature).not.toBe(adminB.getCapturedRow().signature);
  });
});
