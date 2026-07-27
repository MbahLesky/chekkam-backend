import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, limit: 10 })),
}));
vi.mock("@/lib/auth", () => ({
  resolveOptionalUserId: vi.fn(async () => null),
}));

const insertBuilder = {
  select: vi.fn(function (this: unknown) {
    return this;
  }),
  single: vi.fn(async () => ({ data: { id: "cac-1" }, error: null })),
};
const fromMock = vi.fn(() => ({ insert: vi.fn(() => insertBuilder) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock("@/lib/ai/content-authenticity", () => ({
  analyzeTextAuthenticity: vi.fn(async () => ({
    status: "done",
    ai_likelihood: "low",
    confidence: "low",
    indicators: {},
    explanation: ["fine"],
  })),
  analyzeImageAuthenticity: vi.fn(),
  analyzeDocumentAuthenticity: vi.fn(),
  videoAuthenticityStatus: vi.fn(() => ({
    status: "not_supported",
    ai_likelihood: "unknown",
    confidence: null,
    indicators: {},
    explanation: [],
  })),
  audioAuthenticityStatus: vi.fn(() => ({
    status: "not_supported",
    ai_likelihood: "unknown",
    confidence: null,
    indicators: {},
    explanation: [],
  })),
}));

describe("POST /api/ai/content-authenticity", () => {
  beforeEach(() => {
    fromMock.mockClear();
  });

  it("rejects an empty text body", async () => {
    const { POST } = await import("@/app/api/ai/content-authenticity/route");
    const req = new NextRequest("http://localhost/api/ai/content-authenticity", {
      method: "POST",
      body: JSON.stringify({ content_type: "text", text: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts valid text and returns the created row", async () => {
    const { POST } = await import("@/app/api/ai/content-authenticity/route");
    const req = new NextRequest("http://localhost/api/ai/content-authenticity", {
      method: "POST",
      body: JSON.stringify({ content_type: "text", text: "Some text to check" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBe("cac-1");
  });
});
