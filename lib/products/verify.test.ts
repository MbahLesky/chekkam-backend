import { describe, expect, it, vi } from "vitest";
import { verifyProductById } from "@/lib/products/verify";
import { hashDocument, generateSigningKeyPair, signHash } from "@/lib/crypto/sign";

function makeAdmin(product: Record<string, unknown> | null) {
  const productBuilder: Record<string, unknown> = {
    select: vi.fn(() => productBuilder),
    eq: vi.fn(() => productBuilder),
    maybeSingle: vi.fn(async () => ({ data: product, error: null })),
  };
  const logInsert = vi.fn(async () => ({ data: null, error: null }));
  return {
    from: vi.fn((table: string) =>
      table === "product_verification_logs" ? { insert: logInsert } : productBuilder
    ),
  };
}

const { publicKey, privateKey } = generateSigningKeyPair();
const { publicKey: wrongPublicKey } = generateSigningKeyPair();
const productHash = hashDocument(Buffer.from("product payload"));
const validSignature = signHash(productHash, privateKey);

const VALID_CODE = "PRD-4F7K-9QRT";

describe("verifyProductById", () => {
  it("returns unknown for a malformed code (doesn't even look like a Chekkam product code)", async () => {
    const admin = makeAdmin(null);
    const result = await verifyProductById(admin as never, "garbage-not-a-code", "web");
    expect(result.status).toBe("unknown");
  });

  it("returns counterfeit when a well-formed code matches no row", async () => {
    const admin = makeAdmin(null);
    const result = await verifyProductById(admin as never, VALID_CODE, "web");
    expect(result.status).toBe("counterfeit");
  });

  it("returns counterfeit when the row's stored signature doesn't verify against the manufacturer's public key", async () => {
    const admin = makeAdmin({
      id: "product-1",
      product_name: "Test Widget",
      category: "electronics",
      status: "active",
      expiry_date: null,
      product_hash: productHash,
      signature: validSignature,
      institutions: { name: "Test Manufacturer", signing_public_key: wrongPublicKey },
    });
    const result = await verifyProductById(admin as never, VALID_CODE, "web");
    expect(result.status).toBe("counterfeit");
  });

  it("returns recalled when active-signature-valid but status is recalled", async () => {
    const admin = makeAdmin({
      id: "product-1",
      product_name: "Test Widget",
      category: "electronics",
      status: "recalled",
      status_reason: "Battery defect",
      expiry_date: null,
      product_hash: productHash,
      signature: validSignature,
      institutions: { name: "Test Manufacturer", signing_public_key: publicKey },
    });
    const result = await verifyProductById(admin as never, VALID_CODE, "web");
    expect(result.status).toBe("recalled");
    expect(result.reason).toBe("Battery defect");
  });

  it("returns stolen when status is stolen", async () => {
    const admin = makeAdmin({
      id: "product-1",
      product_name: "Test Widget",
      category: "electronics",
      status: "stolen",
      status_reason: "Reported by manufacturer",
      expiry_date: null,
      product_hash: productHash,
      signature: validSignature,
      institutions: { name: "Test Manufacturer", signing_public_key: publicKey },
    });
    const result = await verifyProductById(admin as never, VALID_CODE, "web");
    expect(result.status).toBe("stolen");
  });

  it("returns expired when active and past its expiry date", async () => {
    const admin = makeAdmin({
      id: "product-1",
      product_name: "Test Widget",
      category: "food",
      status: "active",
      expiry_date: "2020-01-01",
      product_hash: productHash,
      signature: validSignature,
      institutions: { name: "Test Manufacturer", signing_public_key: publicKey },
    });
    const result = await verifyProductById(admin as never, VALID_CODE, "web");
    expect(result.status).toBe("expired");
  });

  it("returns authentic when active, not expired, and the signature is valid", async () => {
    const admin = makeAdmin({
      id: "product-1",
      product_name: "Test Widget",
      category: "electronics",
      status: "active",
      expiry_date: null,
      product_hash: productHash,
      signature: validSignature,
      institutions: { name: "Test Manufacturer", signing_public_key: publicKey },
    });
    const result = await verifyProductById(admin as never, VALID_CODE, "web");
    expect(result.status).toBe("authentic");
  });

  it("prioritizes recalled over expired (an explicit action outranks a computed date)", async () => {
    const admin = makeAdmin({
      id: "product-1",
      product_name: "Test Widget",
      category: "food",
      status: "recalled",
      status_reason: "Contamination risk",
      expiry_date: "2020-01-01",
      product_hash: productHash,
      signature: validSignature,
      institutions: { name: "Test Manufacturer", signing_public_key: publicKey },
    });
    const result = await verifyProductById(admin as never, VALID_CODE, "web");
    expect(result.status).toBe("recalled");
  });

  it("normalizes lowercase input to the stored uppercase code format", async () => {
    const admin = makeAdmin({
      id: "product-1",
      product_name: "Test Widget",
      category: "electronics",
      status: "active",
      expiry_date: null,
      product_hash: productHash,
      signature: validSignature,
      institutions: { name: "Test Manufacturer", signing_public_key: publicKey },
    });
    const result = await verifyProductById(admin as never, "prd-4f7k-9qrt", "web");
    expect(result.status).toBe("authentic");
  });
});
