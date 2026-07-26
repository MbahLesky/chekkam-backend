import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

describe("GET /api/reports/:id", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns 404 when not found", async () => {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    fromMock.mockReturnValue(builder);

    const { GET } = await import("@/app/api/reports/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/reports/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("includes related_reports (safe fields only) when the report has a campaign_id", async () => {
    const mainBuilder: Record<string, unknown> = {
      select: vi.fn(() => mainBuilder),
      eq: vi.fn(() => mainBuilder),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "r1",
          campaign_id: "camp-1",
          raw_content: "secret text",
          reporter_id: "u1",
        },
        error: null,
      })),
    };
    const relatedBuilder: Record<string, unknown> = {
      select: vi.fn(() => relatedBuilder),
      eq: vi.fn(() => relatedBuilder),
      neq: vi.fn(async () => ({
        data: [{ id: "r2", risk_level: "high", category: "phishing", created_at: "2026-01-01" }],
        error: null,
      })),
    };
    fromMock.mockReturnValueOnce(mainBuilder).mockReturnValueOnce(relatedBuilder);

    const { GET } = await import("@/app/api/reports/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/reports/r1"), {
      params: Promise.resolve({ id: "r1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.related_reports).toEqual([
      { id: "r2", risk_level: "high", category: "phishing", created_at: "2026-01-01" },
    ]);
    expect(relatedBuilder.select).toHaveBeenCalledWith("id, risk_level, category, created_at");
  });

  it("returns an empty related_reports array when there is no campaign_id", async () => {
    const mainBuilder: Record<string, unknown> = {
      select: vi.fn(() => mainBuilder),
      eq: vi.fn(() => mainBuilder),
      maybeSingle: vi.fn(async () => ({
        data: { id: "r1", campaign_id: null },
        error: null,
      })),
    };
    fromMock.mockReturnValue(mainBuilder);

    const { GET } = await import("@/app/api/reports/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/reports/r1"), {
      params: Promise.resolve({ id: "r1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.related_reports).toEqual([]);
  });
});
