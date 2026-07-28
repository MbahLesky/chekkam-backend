import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, limit: 10 })),
}));

const createUser = vi.fn();
const upsert = vi.fn(async () => ({ error: null }));
const auditInsert = vi.fn(async () => ({ data: null, error: null }));
const fromMock = vi.fn((table: string) =>
  table === "audit_logs" ? { insert: auditInsert } : { upsert }
);
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { createUser } }, from: fromMock }),
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/citizen-signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/citizen-signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({ error: null });
    createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("rejects a weak password", async () => {
    const { POST } = await import("@/app/api/auth/citizen-signup/route");
    const res = await POST(
      makeRequest({ display_name: "Amina", email: "amina@example.cm", password: "short" })
    );
    expect(res.status).toBe(400);
  });

  it("creates a citizen profile with a hardcoded role, never client-controlled", async () => {
    const { POST } = await import("@/app/api/auth/citizen-signup/route");
    const res = await POST(
      makeRequest({ display_name: "Amina", email: "amina@example.cm", password: "longenough123" })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("user-1");
    expect(upsert).toHaveBeenCalledWith(
      { id: "user-1", role: "citizen", display_name: "Amina" },
      { onConflict: "id" }
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "citizen.signup", target_id: "user-1" })
    );
  });

  it("surfaces a Supabase createUser error as a 400", async () => {
    createUser.mockResolvedValue({ data: null, error: { message: "Email already registered" } });
    const { POST } = await import("@/app/api/auth/citizen-signup/route");
    const res = await POST(
      makeRequest({ display_name: "Amina", email: "amina@example.cm", password: "longenough123" })
    );
    expect(res.status).toBe(400);
  });
});
