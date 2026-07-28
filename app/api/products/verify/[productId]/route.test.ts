import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const checkRateLimit = vi.fn(async () => ({ allowed: true, remaining: 29, limit: 30 }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const verifyProductById = vi.fn(async () => ({ status: "authentic", product_code: "PRD-AAAA-1111" }));
vi.mock("@/lib/products/verify", () => ({
  verifyProductById: (...args: unknown[]) => verifyProductById(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));

function makeRequest(productId: string, query = "") {
  return new NextRequest(`http://localhost/api/products/verify/${productId}${query}`);
}

describe("GET /api/products/verify/:productId", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 29, limit: 30 });
    verifyProductById.mockReset();
    verifyProductById.mockResolvedValue({ status: "authentic", product_code: "PRD-AAAA-1111" });
  });

  it("returns 429 when the caller is rate-limited", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 30 });
    const { GET } = await import("@/app/api/products/verify/[productId]/route");
    const res = await GET(makeRequest("PRD-AAAA-1111"), {
      params: Promise.resolve({ productId: "PRD-AAAA-1111" }),
    });
    expect(res.status).toBe(429);
    expect(verifyProductById).not.toHaveBeenCalled();
  });

  it("defaults channel to web and returns the verify result", async () => {
    const { GET } = await import("@/app/api/products/verify/[productId]/route");
    const res = await GET(makeRequest("PRD-AAAA-1111"), {
      params: Promise.resolve({ productId: "PRD-AAAA-1111" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("authentic");
    expect(verifyProductById).toHaveBeenCalledWith(expect.anything(), "PRD-AAAA-1111", "web");
  });

  it("passes through an explicit ?channel=mobile", async () => {
    const { GET } = await import("@/app/api/products/verify/[productId]/route");
    await GET(makeRequest("PRD-AAAA-1111", "?channel=mobile"), {
      params: Promise.resolve({ productId: "PRD-AAAA-1111" }),
    });
    expect(verifyProductById).toHaveBeenCalledWith(expect.anything(), "PRD-AAAA-1111", "mobile");
  });

  it("surfaces an unknown/counterfeit result unchanged (200, not an error)", async () => {
    verifyProductById.mockResolvedValue({ status: "counterfeit", product_code: "PRD-ZZZZ-9999" });
    const { GET } = await import("@/app/api/products/verify/[productId]/route");
    const res = await GET(makeRequest("PRD-ZZZZ-9999"), {
      params: Promise.resolve({ productId: "PRD-ZZZZ-9999" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("counterfeit");
  });
});
