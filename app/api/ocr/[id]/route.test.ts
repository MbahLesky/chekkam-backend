import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

const maybeSingle = vi.fn();
const fromMock = vi.fn(() => ({
  select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

describe("GET /api/ocr/:id", () => {
  beforeEach(() => {
    requireUser.mockReset();
    maybeSingle.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { AuthError } = await import("@/lib/errors");
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));

    const { GET } = await import("@/app/api/ocr/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/ocr/evidence-1"), {
      params: Promise.resolve({ id: "evidence-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when a citizen requests someone else's result", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    maybeSingle.mockResolvedValue({ data: { id: "evidence-1", uploaded_by: "citizen-2" }, error: null });

    const { GET } = await import("@/app/api/ocr/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/ocr/evidence-1"), {
      params: Promise.resolve({ id: "evidence-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("allows the owner to see their own result", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    maybeSingle.mockResolvedValue({ data: { id: "evidence-1", uploaded_by: "citizen-1" }, error: null });

    const { GET } = await import("@/app/api/ocr/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/ocr/evidence-1"), {
      params: Promise.resolve({ id: "evidence-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("allows staff to see anyone's result", async () => {
    requireUser.mockResolvedValue({ id: "staff-1", role: "analyst" });
    maybeSingle.mockResolvedValue({ data: { id: "evidence-1", uploaded_by: "citizen-2" }, error: null });

    const { GET } = await import("@/app/api/ocr/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/ocr/evidence-1"), {
      params: Promise.resolve({ id: "evidence-1" }),
    });
    expect(res.status).toBe(200);
  });
});
