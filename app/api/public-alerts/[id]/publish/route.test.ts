import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/lib/errors";

const requireUser = vi.fn();
const requireAlertPublisher = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser, requireAlertPublisher }));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

function makeRequest() {
  return new NextRequest("http://localhost/api/public-alerts/alert-1/publish", { method: "POST" });
}

describe("POST /api/public-alerts/:id/publish", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireAlertPublisher.mockReset();
    fromMock.mockReset();
  });

  it("returns 403 when requireAlertPublisher rejects the caller", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: "citizen" });
    requireAlertPublisher.mockRejectedValue(new AuthError("Forbidden", 403));

    const { POST } = await import("@/app/api/public-alerts/[id]/publish/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "alert-1" }) });
    expect(res.status).toBe(403);
  });

  it("blocks an institution_officer from publishing a bulletin they didn't create", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    requireAlertPublisher.mockResolvedValue(undefined);
    const alertBuilder: Record<string, unknown> = {
      select: vi.fn(() => alertBuilder),
      eq: vi.fn(() => alertBuilder),
      maybeSingle: vi.fn(async () => ({ data: { created_by: "someone-else" }, error: null })),
    };
    fromMock.mockReturnValue(alertBuilder);

    const { POST } = await import("@/app/api/public-alerts/[id]/publish/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "alert-1" }) });
    expect(res.status).toBe(403);
  });

  it("allows an institution_officer to publish their own bulletin", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    requireAlertPublisher.mockResolvedValue(undefined);
    const auditInsert = vi.fn(async () => ({ data: null, error: null }));
    const alertBuilder: Record<string, unknown> = {
      select: vi.fn(() => alertBuilder),
      eq: vi.fn(() => alertBuilder),
      maybeSingle: vi.fn(async () => ({ data: { created_by: "officer-1" }, error: null })),
      update: vi.fn(() => alertBuilder),
      single: vi.fn(async () => ({ data: { id: "alert-1", published: true }, error: null })),
    };
    fromMock.mockImplementation((table: string) =>
      table === "audit_logs" ? { insert: auditInsert } : alertBuilder
    );

    const { POST } = await import("@/app/api/public-alerts/[id]/publish/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "alert-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.published).toBe(true);
  });

  it("allows an analyst to publish any bulletin without an ownership check", async () => {
    requireUser.mockResolvedValue({ id: "analyst-1", role: "analyst" });
    requireAlertPublisher.mockResolvedValue(undefined);
    const auditInsert = vi.fn(async () => ({ data: null, error: null }));
    const alertBuilder: Record<string, unknown> = {
      update: vi.fn(() => alertBuilder),
      eq: vi.fn(() => alertBuilder),
      select: vi.fn(() => alertBuilder),
      single: vi.fn(async () => ({ data: { id: "alert-1", published: true }, error: null })),
    };
    fromMock.mockImplementation((table: string) =>
      table === "audit_logs" ? { insert: auditInsert } : alertBuilder
    );

    const { POST } = await import("@/app/api/public-alerts/[id]/publish/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "alert-1" }) });
    expect(res.status).toBe(200);
  });
});
