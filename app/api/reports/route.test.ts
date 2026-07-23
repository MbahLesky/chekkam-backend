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

vi.mock("@/lib/ai/risk-analysis", () => ({ analyzeContent: vi.fn() }));
vi.mock("@/lib/campaigns/fingerprint", () => ({ extractFingerprint: vi.fn() }));
vi.mock("@/lib/campaigns/matcher", () => ({
  matchCampaign: vi.fn(),
  findMatchingUnlinkedReport: vi.fn(),
  attachToCampaign: vi.fn(),
  createCampaignFromReports: vi.fn(),
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

describe("GET /api/reports", () => {
  beforeEach(() => {
    requireUser.mockReset();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { AuthError } = await import("@/lib/errors");
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));

    const { GET } = await import("@/app/api/reports/route");
    const res = await GET(new NextRequest("http://localhost/api/reports"));
    expect(res.status).toBe(401);
  });

  it("staff (analyst) sees the full list, not scoped to reporter_id", async () => {
    requireUser.mockResolvedValue({ id: "staff-1", role: "analyst" });
    const rows = [{ id: "r1" }, { id: "r2" }];
    const builder = makeQueryBuilder(rows);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/reports/route");
    const res = await GET(new NextRequest("http://localhost/api/reports"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reports).toEqual(rows);
    expect(builder.eq).not.toHaveBeenCalledWith("reporter_id", expect.anything());
  });

  it("a citizen is scoped to only their own reports", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    const rows = [{ id: "r1", reporter_id: "citizen-1" }];
    const builder = makeQueryBuilder(rows);
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/reports/route");
    const res = await GET(new NextRequest("http://localhost/api/reports"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reports).toEqual(rows);
    expect(builder.eq).toHaveBeenCalledWith("reporter_id", "citizen-1");
  });
});
