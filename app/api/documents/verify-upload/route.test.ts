import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 29, limit: 30 })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));
vi.mock("@/lib/documents/verify", () => ({
  verifyByUpload: vi.fn(async () => ({ status: "authentic" })),
}));

describe("POST /api/documents/verify-upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 (not 500) for a malformed multipart body", async () => {
    const { POST } = await import("@/app/api/documents/verify-upload/route");
    const req = new NextRequest("http://localhost/api/documents/verify-upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=broken" },
      body: "this is not a valid multipart body",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no file is provided", async () => {
    const { POST } = await import("@/app/api/documents/verify-upload/route");
    const form = new FormData();
    form.set("channel", "web");
    const req = new NextRequest("http://localhost/api/documents/verify-upload", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("verifies a valid uploaded file", async () => {
    const { POST } = await import("@/app/api/documents/verify-upload/route");
    const form = new FormData();
    form.set("file", new File(["hello"], "doc.pdf", { type: "application/pdf" }));
    const req = new NextRequest("http://localhost/api/documents/verify-upload", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("authentic");
  });
});
