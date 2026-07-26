import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/lib/errors";

const requireUser = vi.fn();
const requireRole = vi.fn((profile: { role: string }, roles: string[]) => {
  if (!roles.includes(profile.role)) throw new AuthError("Forbidden", 403);
});
vi.mock("@/lib/auth", () => ({
  requireUser,
  requireRole,
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/institutions/inst-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/institutions/:id", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { PATCH } = await import("@/app/api/institutions/[id]/route");
    const res = await PATCH(makeRequest({ status: "active" }), {
      params: Promise.resolve({ id: "inst-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: "institution_officer" });
    const { PATCH } = await import("@/app/api/institutions/[id]/route");
    const res = await PATCH(makeRequest({ status: "active" }), {
      params: Promise.resolve({ id: "inst-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("activates a pending institution and writes an audit log", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    const auditInsert = vi.fn(async () => ({ data: null, error: null }));
    const instBuilder: Record<string, unknown> = {
      update: vi.fn(() => instBuilder),
      eq: vi.fn(() => instBuilder),
      select: vi.fn(() => instBuilder),
      maybeSingle: vi.fn(async () => ({
        data: { id: "inst-1", name: "Test U", status: "active" },
        error: null,
      })),
    };
    fromMock.mockImplementation((table: string) =>
      table === "audit_logs" ? { insert: auditInsert } : instBuilder
    );

    const { PATCH } = await import("@/app/api/institutions/[id]/route");
    const res = await PATCH(makeRequest({ status: "active" }), {
      params: Promise.resolve({ id: "inst-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("active");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "institution.status_update", target_id: "inst-1" })
    );
  });

  it("returns 400 for an invalid status value", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    const { PATCH } = await import("@/app/api/institutions/[id]/route");
    const res = await PATCH(makeRequest({ status: "not-a-real-status" }), {
      params: Promise.resolve({ id: "inst-1" }),
    });
    expect(res.status).toBe(400);
  });
});
