import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, limit: 15 })),
}));
vi.mock("@/lib/auth", () => ({
  resolveOptionalUserId: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: vi.fn() }),
}));
vi.mock("@/lib/security/safety-check", () => ({
  runSafetyCheck: vi.fn(async () => ({
    id: "check-1",
    input_type: "text",
    risk_level: "low",
    risk_score: 10,
    findings: [],
    recommended_action: "ok",
  })),
}));

describe("POST /api/security/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a JSON body missing text for input_type=text", async () => {
    const { POST } = await import("@/app/api/security/check/route");
    const req = new NextRequest("http://localhost/api/security/check", {
      method: "POST",
      body: JSON.stringify({ input_type: "text" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.field).toBe("text");
  });

  it("rejects a JSON body missing url for input_type=link", async () => {
    const { POST } = await import("@/app/api/security/check/route");
    const req = new NextRequest("http://localhost/api/security/check", {
      method: "POST",
      body: JSON.stringify({ input_type: "link" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.field).toBe("url");
  });

  it("returns 400 (not 500) for a malformed multipart body", async () => {
    const { POST } = await import("@/app/api/security/check/route");
    const req = new NextRequest("http://localhost/api/security/check", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=broken" },
      body: "this is not a valid multipart body",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts a valid text check and returns the result", async () => {
    const { POST } = await import("@/app/api/security/check/route");
    const req = new NextRequest("http://localhost/api/security/check", {
      method: "POST",
      body: JSON.stringify({ input_type: "text", text: "Check this message" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBe("check-1");
  });
});
