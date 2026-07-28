import { describe, expect, it, vi } from "vitest";
import { requireAlertPublisher } from "@/lib/auth";
import { AuthError } from "@/lib/errors";

function makeAdmin(memberships: { institution_id: string }[], verifiedInstitutionIds: string[]) {
  const membersBuilder: Record<string, unknown> = {
    select: vi.fn(() => membersBuilder),
    eq: vi.fn(async () => ({ data: memberships, error: null })),
  };
  const institutionsBuilder: Record<string, unknown> = {
    select: vi.fn(() => institutionsBuilder),
    in: vi.fn(() => institutionsBuilder),
    eq: vi.fn(() => institutionsBuilder),
    limit: vi.fn(async () => ({
      data: verifiedInstitutionIds.map((id) => ({ id })),
      error: null,
    })),
  };
  return {
    from: vi.fn((table: string) =>
      table === "institution_members" ? membersBuilder : institutionsBuilder
    ),
  };
}

describe("requireAlertPublisher", () => {
  it("allows analyst/admin/super_admin without an institution check", async () => {
    const admin = makeAdmin([], []);
    await expect(
      requireAlertPublisher({ id: "u1", role: "analyst" }, admin as never)
    ).resolves.toBeUndefined();
  });

  it("allows an institution_officer of a verified, active institution", async () => {
    const admin = makeAdmin([{ institution_id: "inst-1" }], ["inst-1"]);
    await expect(
      requireAlertPublisher({ id: "u1", role: "institution_officer" }, admin as never)
    ).resolves.toBeUndefined();
  });

  it("rejects an institution_officer whose institution isn't verified/active", async () => {
    const admin = makeAdmin([{ institution_id: "inst-1" }], []);
    await expect(
      requireAlertPublisher({ id: "u1", role: "institution_officer" }, admin as never)
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects an institution_officer with no institution memberships", async () => {
    const admin = makeAdmin([], []);
    await expect(
      requireAlertPublisher({ id: "u1", role: "institution_officer" }, admin as never)
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a plain citizen", async () => {
    const admin = makeAdmin([], []);
    await expect(
      requireAlertPublisher({ id: "u1", role: "citizen" }, admin as never)
    ).rejects.toBeInstanceOf(AuthError);
  });
});
