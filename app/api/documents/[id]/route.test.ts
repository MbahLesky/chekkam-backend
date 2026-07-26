import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/lib/errors";

const requireUser = vi.fn();
const requireRole = vi.fn((profile: { role: string }, roles: string[]) => {
  if (!roles.includes(profile.role)) throw new AuthError("Forbidden", 403);
});
const requireInstitutionMember = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
  requireRole: (...args: unknown[]) => requireRole(...args),
  requireInstitutionMember: (...args: unknown[]) => requireInstitutionMember(...args),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

function makeBuilder(doc: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: doc, error: null })),
  };
  return builder;
}

describe("GET /api/documents/:id", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    requireInstitutionMember.mockClear();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/documents/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a citizen role", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: "citizen" });
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/documents/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the document doesn't exist", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: "admin" });
    fromMock.mockReturnValue(makeBuilder(null));
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/documents/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("checks institution membership for an institution_officer", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    fromMock.mockReturnValue(
      makeBuilder({ id: "doc-1", institution_id: "inst-1", institutions: { name: "Test U" } })
    );
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/documents/doc-1"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    expect(res.status).toBe(200);
    expect(requireInstitutionMember).toHaveBeenCalledWith(
      { id: "officer-1", role: "institution_officer" },
      "inst-1"
    );
  });

  it("returns 200 with document detail for staff without a membership check", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    fromMock.mockReturnValue(
      makeBuilder({ id: "doc-1", institution_id: "inst-1", institutions: { name: "Test U" } })
    );
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/documents/doc-1"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.institution_name).toBe("Test U");
    expect(requireInstitutionMember).not.toHaveBeenCalled();
  });
});
