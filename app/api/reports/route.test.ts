import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireUser = vi.fn();
const resolveOptionalUserId = vi.fn(async () => null);
vi.mock("@/lib/auth", () => ({
  requireUser,
  resolveOptionalUserId,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 19, limit: 20 })),
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

describe("POST /api/reports", () => {
  beforeEach(() => {
    fromMock.mockReset();
    resolveOptionalUserId.mockReset();
    resolveOptionalUserId.mockResolvedValue(null);
  });

  it("links a provided evidence_id to the created report (evidence.report_id)", async () => {
    const reportsBuilder: Record<string, unknown> = {
      insert: vi.fn(() => reportsBuilder),
      select: vi.fn(() => reportsBuilder),
      single: vi.fn(async () => ({ data: { id: "report-1" }, error: null })),
      update: vi.fn(() => reportsBuilder),
      eq: vi.fn(async () => ({ data: null, error: null })),
    };
    const evidenceBuilder: Record<string, unknown> = {
      update: vi.fn(() => evidenceBuilder),
      eq: vi.fn(async () => ({ data: null, error: null })),
    };
    fromMock.mockImplementation((table: string) =>
      table === "evidence" ? evidenceBuilder : reportsBuilder
    );

    const { analyzeContent } = await import("@/lib/ai/risk-analysis");
    vi.mocked(analyzeContent).mockResolvedValue({
      risk_level: "low",
      risk_score: 10,
      category: "none",
      language: "en",
      reasons: ["ok"],
      indicators: {
        has_urgency_pressure: false,
        requests_payment: false,
        requests_personal_info: false,
        impersonates_institution: null,
        contains_suspicious_link: false,
      },
      recommended_action: "none",
      confidence: "low",
      suspicious_phrases: [],
      needs_human_review: true,
      source: "rule_based_fallback",
    } as never);

    const { extractFingerprint } = await import("@/lib/campaigns/fingerprint");
    vi.mocked(extractFingerprint).mockReturnValue({} as never);
    const { matchCampaign, findMatchingUnlinkedReport } = await import(
      "@/lib/campaigns/matcher"
    );
    vi.mocked(matchCampaign).mockResolvedValue(null as never);
    vi.mocked(findMatchingUnlinkedReport).mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/reports/route");
    const req = new NextRequest("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify({
        content_type: "text",
        raw_content: "hello",
        evidence_id: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(evidenceBuilder.update).toHaveBeenCalledWith({ report_id: "report-1" });
    expect(evidenceBuilder.eq).toHaveBeenCalledWith(
      "id",
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
