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

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/documents/${id}/restore`, { method: "POST" });
}

describe("POST /api/documents/:id/restore", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { POST } = await import("@/app/api/documents/[id]/restore/route");
    const res = await POST(makeRequest("doc-1"), { params: Promise.resolve({ id: "doc-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the document doesn't exist", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    fromMock.mockReturnValue({
      select: vi.fn(function (this: unknown) {
        return this;
      }),
      eq: vi.fn(function (this: unknown) {
        return this;
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    });
    const { POST } = await import("@/app/api/documents/[id]/restore/route");
    const res = await POST(makeRequest("doc-1"), { params: Promise.resolve({ id: "doc-1" }) });
    expect(res.status).toBe(404);
  });

  it("sets status back to active and clears revocation fields", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    const auditInsert = vi.fn(async () => ({ data: null, error: null }));
    const docBuilder: Record<string, unknown> = {
      select: vi.fn(() => docBuilder),
      eq: vi.fn(() => docBuilder),
      maybeSingle: vi.fn(async () => ({
        data: { id: "doc-1", institution_id: "inst-1", status: "revoked" },
        error: null,
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "doc-1", status: "active", revoked_at: null, revocation_reason: null },
              error: null,
            })),
          })),
        })),
      })),
    };
    fromMock.mockImplementation((table: string) =>
      table === "audit_logs" ? { insert: auditInsert } : docBuilder
    );

    const { POST } = await import("@/app/api/documents/[id]/restore/route");
    const res = await POST(makeRequest("doc-1"), { params: Promise.resolve({ id: "doc-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("active");
    expect(body.revoked_at).toBeNull();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.restore", target_id: "doc-1" })
    );
  });
});
