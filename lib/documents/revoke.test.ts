import { describe, test, expect, vi } from "vitest";
import {
  fetchDocumentForStatusChange,
  revokeDocumentCore,
  restoreDocumentCore,
} from "./revoke";

function makeAdmin(doc: Record<string, unknown> | null, updatedRow: Record<string, unknown>) {
  const docBuilder: Record<string, unknown> = {
    select: vi.fn(() => docBuilder),
    eq: vi.fn(() => docBuilder),
    maybeSingle: vi.fn(async () => ({ data: doc, error: null })),
  };
  const updateBuilder: Record<string, unknown> = {
    eq: vi.fn(() => updateBuilder),
    select: vi.fn(() => updateBuilder),
    single: vi.fn(async () => ({ data: updatedRow, error: null })),
  };
  const logInsert = vi.fn(async () => ({ data: null, error: null }));
  return {
    from: vi.fn((table: string) => {
      if (table === "audit_logs") return { insert: logInsert };
      return { ...docBuilder, update: vi.fn(() => updateBuilder) };
    }),
    _logInsert: logInsert,
  };
}

describe("fetchDocumentForStatusChange", () => {
  test("returns null when the document doesn't exist", async () => {
    const admin = makeAdmin(null, {});
    const result = await fetchDocumentForStatusChange(admin as never, "doc-1");
    expect(result).toBeNull();
  });

  test("returns the document's id/institution_id/status when found", async () => {
    const admin = makeAdmin({ id: "doc-1", institution_id: "inst-1", status: "active" }, {});
    const result = await fetchDocumentForStatusChange(admin as never, "doc-1");
    expect(result).toEqual({ id: "doc-1", institution_id: "inst-1", status: "active" });
  });
});

describe("revokeDocumentCore", () => {
  test("updates status/revoked_at/revocation_reason and logs an audit entry", async () => {
    const updatedRow = {
      id: "doc-1",
      status: "revoked",
      revoked_at: "2026-01-01T00:00:00Z",
      revocation_reason: "Reissued",
    };
    const admin = makeAdmin(null, updatedRow);
    const result = await revokeDocumentCore(admin as never, "doc-1", "Reissued", "actor-1");
    expect(result).toEqual(updatedRow);
    expect(admin._logInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "actor-1",
        action: "document.revoke",
        target_table: "documents",
        target_id: "doc-1",
        metadata: { reason: "Reissued" },
      })
    );
  });
});

describe("restoreDocumentCore", () => {
  test("clears status/revoked_at/revocation_reason and logs an audit entry", async () => {
    const updatedRow = { id: "doc-1", status: "active", revoked_at: null, revocation_reason: null };
    const admin = makeAdmin(null, updatedRow);
    const result = await restoreDocumentCore(admin as never, "doc-1", "actor-1");
    expect(result).toEqual(updatedRow);
    expect(admin._logInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "actor-1",
        action: "document.restore",
        target_table: "documents",
        target_id: "doc-1",
      })
    );
  });
});
