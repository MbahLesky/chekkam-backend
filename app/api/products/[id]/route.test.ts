import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/lib/errors";

const requireUser = vi.fn();
const requireRole = vi.fn((profile: { role: string }, roles: string[]) => {
  if (!roles.includes(profile.role)) throw new AuthError("Forbidden", 403);
});
const requireInstitutionMember = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({
  requireUser,
  requireRole,
  requireInstitutionMember,
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

function makeDetailBuilder(product: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: product, error: null })),
  };
  return builder;
}

function makeRequest(id: string, init?: RequestInit) {
  return new NextRequest(`http://localhost/api/products/${id}`, init);
}

describe("GET /api/products/:id", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    requireInstitutionMember.mockClear();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { GET } = await import("@/app/api/products/[id]/route");
    const res = await GET(makeRequest("x"), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the product doesn't exist", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: "admin" });
    fromMock.mockReturnValue(makeDetailBuilder(null));
    const { GET } = await import("@/app/api/products/[id]/route");
    const res = await GET(makeRequest("x"), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(404);
  });

  it("checks institution membership for an institution_officer", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    fromMock.mockReturnValue(
      makeDetailBuilder({ id: "product-1", institution_id: "inst-1", institutions: { name: "Test Manufacturer" } })
    );
    const { GET } = await import("@/app/api/products/[id]/route");
    const res = await GET(makeRequest("product-1"), { params: Promise.resolve({ id: "product-1" }) });
    expect(res.status).toBe(200);
    expect(requireInstitutionMember).toHaveBeenCalledWith(
      { id: "officer-1", role: "institution_officer" },
      "inst-1"
    );
  });

  it("returns 200 with product detail for staff without a membership check", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    fromMock.mockReturnValue(
      makeDetailBuilder({ id: "product-1", institution_id: "inst-1", institutions: { name: "Test Manufacturer" } })
    );
    const { GET } = await import("@/app/api/products/[id]/route");
    const res = await GET(makeRequest("product-1"), { params: Promise.resolve({ id: "product-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.institution_name).toBe("Test Manufacturer");
    expect(requireInstitutionMember).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/products/:id", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    fromMock.mockReset();
  });

  function patchRequest(id: string, body: unknown) {
    return makeRequest(id, { method: "PATCH", body: JSON.stringify(body) });
  }

  it("returns 401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { PATCH } = await import("@/app/api/products/[id]/route");
    const res = await PATCH(patchRequest("product-1", { action: "recall", reason: "x" }), {
      params: Promise.resolve({ id: "product-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when reason is missing for a recall", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    const { PATCH } = await import("@/app/api/products/[id]/route");
    const res = await PATCH(patchRequest("product-1", { action: "recall" }), {
      params: Promise.resolve({ id: "product-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the product doesn't exist", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    fromMock.mockReturnValue(makeDetailBuilder(null));
    const { PATCH } = await import("@/app/api/products/[id]/route");
    const res = await PATCH(patchRequest("product-1", { action: "recall", reason: "Battery defect" }), {
      params: Promise.resolve({ id: "product-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the officer isn't a member of the product's institution", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    const membershipBuilder: Record<string, unknown> = {
      select: vi.fn(() => membershipBuilder),
      eq: vi.fn(() => membershipBuilder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    fromMock.mockImplementation((table: string) =>
      table === "products" ? makeDetailBuilder({ id: "product-1", institution_id: "inst-1", status: "active" }) : membershipBuilder
    );
    const { PATCH } = await import("@/app/api/products/[id]/route");
    const res = await PATCH(patchRequest("product-1", { action: "recall", reason: "Battery defect" }), {
      params: Promise.resolve({ id: "product-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("recalls a product with a reason and logs an audit entry", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    const auditInsert = vi.fn(async () => ({ data: null, error: null }));
    const productBuilder: Record<string, unknown> = {
      select: vi.fn(() => productBuilder),
      eq: vi.fn(() => productBuilder),
      maybeSingle: vi.fn(async () => ({ data: { id: "product-1", institution_id: "inst-1", status: "active" }, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "product-1", status: "recalled", status_reason: "Battery defect", status_changed_at: "2026-01-01T00:00:00Z" },
              error: null,
            })),
          })),
        })),
      })),
    };
    fromMock.mockImplementation((table: string) => (table === "audit_logs" ? { insert: auditInsert } : productBuilder));

    const { PATCH } = await import("@/app/api/products/[id]/route");
    const res = await PATCH(patchRequest("product-1", { action: "recall", reason: "Battery defect" }), {
      params: Promise.resolve({ id: "product-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("recalled");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product.recall", target_id: "product-1" })
    );
  });

  it("reactivates a product without requiring a reason", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    const auditInsert = vi.fn(async () => ({ data: null, error: null }));
    const productBuilder: Record<string, unknown> = {
      select: vi.fn(() => productBuilder),
      eq: vi.fn(() => productBuilder),
      maybeSingle: vi.fn(async () => ({ data: { id: "product-1", institution_id: "inst-1", status: "recalled" }, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "product-1", status: "active", status_reason: null, status_changed_at: "2026-01-01T00:00:00Z" },
              error: null,
            })),
          })),
        })),
      })),
    };
    fromMock.mockImplementation((table: string) => (table === "audit_logs" ? { insert: auditInsert } : productBuilder));

    const { PATCH } = await import("@/app/api/products/[id]/route");
    const res = await PATCH(patchRequest("product-1", { action: "reactivate" }), {
      params: Promise.resolve({ id: "product-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("active");
  });
});
