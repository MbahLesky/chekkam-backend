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

describe("GET /api/ai/content-authenticity/:id", () => {
  beforeEach(() => {
    requireUser.mockReset();
    maybeSingle.mockReset();
  });

  it("returns 404 when not found", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const { GET } = await import("@/app/api/ai/content-authenticity/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/ai/content-authenticity/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-owner citizen", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    maybeSingle.mockResolvedValue({ data: { id: "cac1", user_id: "citizen-2" }, error: null });

    const { GET } = await import("@/app/api/ai/content-authenticity/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/ai/content-authenticity/cac1"), {
      params: Promise.resolve({ id: "cac1" }),
    });
    expect(res.status).toBe(403);
  });

  it("allows staff to see any check", async () => {
    requireUser.mockResolvedValue({ id: "staff-1", role: "analyst" });
    maybeSingle.mockResolvedValue({ data: { id: "cac1", user_id: "citizen-2" }, error: null });

    const { GET } = await import("@/app/api/ai/content-authenticity/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/ai/content-authenticity/cac1"), {
      params: Promise.resolve({ id: "cac1" }),
    });
    expect(res.status).toBe(200);
  });
});
