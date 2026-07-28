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

const registerProductCore = vi.fn(async () => ({
  id: "product-1",
  product_code: "PRD-AAAA-1111",
  qr_payload: "https://chekkam.cm/verify-product/PRD-AAAA-1111",
  qr_image: "data:image/png;base64,xx",
  status: "active",
}));
vi.mock("@/lib/products/register", () => ({
  registerProductCore: (...args: unknown[]) => registerProductCore(...args),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

function makeInstitutionBuilder(institution: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: institution, error: null })),
  };
  return builder;
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/products", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/products", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    requireInstitutionMember.mockClear();
    fromMock.mockReset();
    registerProductCore.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(postRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a citizen role", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: "citizen" });
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(postRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the manufacturer institution isn't active yet", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    fromMock.mockReturnValue(makeInstitutionBuilder({ status: "pending" }));
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(
      postRequest({
        institution_id: "11111111-1111-4111-8111-111111111111",
        product_name: "Test Widget",
        category: "electronics",
      })
    );
    expect(res.status).toBe(403);
    expect(registerProductCore).not.toHaveBeenCalled();
  });

  it("registers a product and returns 201 when the institution is active", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    fromMock.mockReturnValue(makeInstitutionBuilder({ status: "active" }));
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(
      postRequest({
        institution_id: "11111111-1111-4111-8111-111111111111",
        product_name: "Test Widget",
        category: "electronics",
      })
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.product_code).toBe("PRD-AAAA-1111");
    expect(requireInstitutionMember).toHaveBeenCalledWith(
      { id: "officer-1", role: "institution_officer" },
      "11111111-1111-4111-8111-111111111111"
    );
  });
});

describe("GET /api/products", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { GET } = await import("@/app/api/products/route");
    const res = await GET(new NextRequest("http://localhost/api/products"));
    expect(res.status).toBe(401);
  });

  it("returns an empty list for an institution_officer with no memberships", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    const queryBuilder: Record<string, unknown> = {
      select: vi.fn(() => queryBuilder),
      order: vi.fn(() => queryBuilder),
      limit: vi.fn(async () => ({ data: [], error: null })),
      in: vi.fn(() => queryBuilder),
    };
    const membershipBuilder: Record<string, unknown> = {
      select: vi.fn(() => membershipBuilder),
      eq: vi.fn(async () => ({ data: [], error: null })),
    };
    fromMock.mockImplementation((table: string) =>
      table === "institution_members" ? membershipBuilder : queryBuilder
    );
    const { GET } = await import("@/app/api/products/route");
    const res = await GET(new NextRequest("http://localhost/api/products"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.products).toEqual([]);
  });

  it("returns 200 with the product list for staff", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    const queryBuilder: Record<string, unknown> = {
      select: vi.fn(() => queryBuilder),
      order: vi.fn(() => queryBuilder),
      limit: vi.fn(async () => ({
        data: [
          {
            id: "product-1",
            institution_id: "inst-1",
            product_code: "PRD-AAAA-1111",
            product_name: "Test Widget",
            category: "electronics",
            batch_number: null,
            manufactured_at: null,
            expiry_date: null,
            product_hash: "hash",
            signature: "sig",
            qr_payload: "url",
            status: "active",
            status_reason: null,
            status_changed_at: null,
            created_at: "2026-01-01T00:00:00Z",
            institutions: { name: "Test Manufacturer" },
          },
        ],
        error: null,
      })),
    };
    fromMock.mockReturnValue(queryBuilder);
    const { GET } = await import("@/app/api/products/route");
    const res = await GET(new NextRequest("http://localhost/api/products"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.products).toHaveLength(1);
    expect(body.products[0].institution_name).toBe("Test Manufacturer");
  });
});
