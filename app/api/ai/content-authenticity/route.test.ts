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
  analyzeVideoAuthenticity: vi.fn(() => ({
    status: "unavailable",
    ai_likelihood: "unknown",
    confidence: null,
    indicators: { ai_tool_signature_found: false },
    explanation: [],
  })),
  analyzeAudioAuthenticity: vi.fn(() => ({
    status: "unavailable",
    ai_likelihood: "unknown",
    confidence: null,
    indicators: { ai_tool_signature_found: false },
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

  it("returns 400 (not 500) for a malformed multipart body", async () => {
    const { POST } = await import("@/app/api/ai/content-authenticity/route");
    const req = new NextRequest("http://localhost/api/ai/content-authenticity", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=broken" },
      body: "this is not a valid multipart body",
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

  it("accepts a video file (kind=video) and runs the metadata signature scan", async () => {
    const { POST } = await import("@/app/api/ai/content-authenticity/route");
    const form = new FormData();
    form.set("kind", "video");
    form.set(
      "file",
      new File([new Blob(["not really a video, just test bytes"])], "clip.mp4")
    );
    const req = new NextRequest("http://localhost/api/ai/content-authenticity", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
