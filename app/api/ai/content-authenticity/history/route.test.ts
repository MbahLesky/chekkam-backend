import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

function makeQueryBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return builder;
}

describe("GET /api/ai/content-authenticity/history", () => {
  beforeEach(() => {
    requireUser.mockReset();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { AuthError } = await import("@/lib/errors");
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));

    const { GET } = await import("@/app/api/ai/content-authenticity/history/route");
    const res = await GET(new NextRequest("http://localhost/api/ai/content-authenticity/history"));
    expect(res.status).toBe(401);
  });

  it("scopes a citizen to only their own checks", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    const builder = makeQueryBuilder([{ id: "cac1", user_id: "citizen-1" }]);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/ai/content-authenticity/history/route");
    const res = await GET(new NextRequest("http://localhost/api/ai/content-authenticity/history"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.content_authenticity_checks).toHaveLength(1);
    expect(builder.eq).toHaveBeenCalledWith("user_id", "citizen-1");
  });
});
