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

describe("GET /api/security/report/:id", () => {
  beforeEach(() => {
    requireUser.mockReset();
    maybeSingle.mockReset();
  });

  it("returns 404 when not found", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const { GET } = await import("@/app/api/security/report/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/security/report/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when a citizen requests someone else's check", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    maybeSingle.mockResolvedValue({ data: { id: "c1", user_id: "citizen-2" }, error: null });

    const { GET } = await import("@/app/api/security/report/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/security/report/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(403);
  });

  it("allows the owner to see their own check", async () => {
    requireUser.mockResolvedValue({ id: "citizen-1", role: "citizen" });
    maybeSingle.mockResolvedValue({ data: { id: "c1", user_id: "citizen-1" }, error: null });

    const { GET } = await import("@/app/api/security/report/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/security/report/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
  });
});
