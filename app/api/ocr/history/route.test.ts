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

describe("GET /api/ocr/history", () => {
  beforeEach(() => {
    requireUser.mockReset();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { AuthError } = await import("@/lib/errors");
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));

    const { GET } = await import("@/app/api/ocr/history/route");
    const res = await GET(new NextRequest("http://localhost/api/ocr/history"));
    expect(res.status).toBe(401);
  });

  it("scopes a citizen to only their own OCR results", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    const builder = makeQueryBuilder([{ id: "e1", uploaded_by: "citizen-1" }]);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/ocr/history/route");
    const res = await GET(new NextRequest("http://localhost/api/ocr/history"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ocr_results).toHaveLength(1);
    expect(builder.eq).toHaveBeenCalledWith("uploaded_by", "citizen-1");
  });

  it("gives staff the full list, not scoped to uploaded_by", async () => {
    requireUser.mockResolvedValue({ id: "staff-1", role: "admin" });
    const builder = makeQueryBuilder([{ id: "e1" }, { id: "e2" }]);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/ocr/history/route");
    const res = await GET(new NextRequest("http://localhost/api/ocr/history"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ocr_results).toHaveLength(2);
    expect(builder.eq).not.toHaveBeenCalled();
  });
});
