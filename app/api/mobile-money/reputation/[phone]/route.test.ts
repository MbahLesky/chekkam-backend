import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 29, limit: 30 })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));
vi.mock("@/lib/fraud-intelligence/number-reputation", () => ({
  getNumberReputation: vi.fn(async (_admin: unknown, phone: string) => ({
    normalized_number: phone,
    status: "no_reports",
    report_count: 0,
    categories: [],
    network_providers: [],
    most_recent_report_at: null,
    campaign_ids: [],
  })),
}));

describe("GET /api/mobile-money/reputation/:phone", () => {
  it("is public — no auth required — and returns a reputation result", async () => {
    const { GET } = await import("@/app/api/mobile-money/reputation/[phone]/route");
    const req = new NextRequest("http://localhost/api/mobile-money/reputation/677123456");
    const res = await GET(req, { params: Promise.resolve({ phone: "677123456" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("no_reports");
  });

  it("returns 429 when rate limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 30 });

    const { GET } = await import("@/app/api/mobile-money/reputation/[phone]/route");
    const req = new NextRequest("http://localhost/api/mobile-money/reputation/677123456");
    const res = await GET(req, { params: Promise.resolve({ phone: "677123456" }) });

    expect(res.status).toBe(429);
  });
});
