import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/lib/errors";

const requireUser = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser, requireRole }));

function makeQueryBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return builder;
}

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));
vi.mock("@/lib/crypto/sign", () => ({
  generateSigningKeyPair: vi.fn(() => ({ publicKey: "pub", privateKey: "priv" })),
}));

describe("GET /api/institutions", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("lists active institutions with no filters, anonymously", async () => {
    const rows = [{ id: "i1", name: "Ministry of Health", type: "ministry" }];
    const builder = makeQueryBuilder(rows);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/institutions/route");
    const res = await GET(new NextRequest("http://localhost/api/institutions"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.institutions).toEqual(rows);
    expect(builder.eq).toHaveBeenCalledWith("status", "active");
  });

  it("applies a name search filter (?q=)", async () => {
    const builder = makeQueryBuilder([]);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/institutions/route");
    await GET(new NextRequest("http://localhost/api/institutions?q=Douala"));

    expect(builder.ilike).toHaveBeenCalledWith("name", "%Douala%");
  });

  it("applies a type filter (?type=)", async () => {
    const builder = makeQueryBuilder([]);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/institutions/route");
    await GET(new NextRequest("http://localhost/api/institutions?type=hospital"));

    expect(builder.eq).toHaveBeenCalledWith("type", "hospital");
  });
});

describe("POST /api/institutions (unaffected by the search-param changes)", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockReset();
    fromMock.mockReset();
  });

  it("still requires admin", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: "citizen" });
    requireRole.mockImplementation(() => {
      throw new AuthError("Forbidden", 403);
    });

    const { POST } = await import("@/app/api/institutions/route");
    const req = new NextRequest("http://localhost/api/institutions", {
      method: "POST",
      body: JSON.stringify({ name: "Test", type: "hospital" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
