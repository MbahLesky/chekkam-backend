import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hashDocument } from "@/lib/crypto/sign";
import { verifyByIdOrPin, verifyByUpload } from "@/lib/documents/verify";
import { fakeSupabase } from "../test-support/fake-supabase";

/**
 * Gate 1 exit criterion (CLAUDE.md §8): "a jury can see genuine, tampered,
 * revoked, and not_found with no improvised setup." These tests pin the
 * decision-order/precedence rules in lib/documents/verify.ts directly,
 * without a live database.
 */

describe("verifyByIdOrPin", () => {
  test("unknown verification ID returns not_found", async () => {
    const admin = fakeSupabase({ documents: { data: null } });
    const result = await verifyByIdOrPin(admin, "CHK-0000-0000", "web");
    assert.equal(result.status, "not_found");
  });

  test("revoked document returns revoked (with reason), even though it would otherwise be genuine", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          document_type: "certificate",
          recipient_name: "Jane Doe",
          status: "revoked",
          issued_at: "2026-01-01T00:00:00Z",
          revoked_at: "2026-02-01T00:00:00Z",
          revocation_reason: "Issued in error",
          institutions: { name: "Test Institution" },
        },
      },
    });
    const result = await verifyByIdOrPin(admin, "CHK-4F7K-9QRT", "web");
    assert.equal(result.status, "revoked");
    assert.equal(result.reason, "Issued in error");
  });

  test("active document returns genuine", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          document_type: "certificate",
          recipient_name: "Jane Doe",
          status: "active",
          issued_at: "2026-01-01T00:00:00Z",
          revoked_at: null,
          revocation_reason: null,
          institutions: { name: "Test Institution" },
        },
      },
    });
    const result = await verifyByIdOrPin(admin, "CHK-4F7K-9QRT", "web");
    assert.equal(result.status, "genuine");
  });
});

describe("verifyByUpload", () => {
  const originalBytes = Buffer.from("the original signed file bytes");
  const originalHash = hashDocument(originalBytes);

  test("matching file hash returns genuine", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          file_hash: originalHash,
          document_type: "certificate",
          recipient_name: null,
          status: "active",
          revoked_at: null,
          revocation_reason: null,
          institutions: { name: "Test Institution" },
        },
      },
    });
    const result = await verifyByUpload(admin, originalBytes, "CHK-4F7K-9QRT", "web");
    assert.equal(result.status, "genuine");
  });

  test("altered file bytes return tampered, not genuine or an error", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          file_hash: originalHash,
          document_type: "certificate",
          recipient_name: null,
          status: "active",
          revoked_at: null,
          revocation_reason: null,
          institutions: { name: "Test Institution" },
        },
      },
    });
    const alteredBytes = Buffer.from("the original signed file bytes, but altered");
    const result = await verifyByUpload(admin, alteredBytes, "CHK-4F7K-9QRT", "web");
    assert.equal(result.status, "tampered");
  });

  test("revoked precedence: a revoked document reports revoked even if the uploaded bytes still match exactly", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          file_hash: originalHash,
          document_type: "certificate",
          recipient_name: null,
          status: "revoked",
          revoked_at: "2026-02-01T00:00:00Z",
          revocation_reason: "Superseded",
          institutions: { name: "Test Institution" },
        },
      },
    });
    const result = await verifyByUpload(admin, originalBytes, "CHK-4F7K-9QRT", "web");
    assert.equal(result.status, "revoked");
    assert.equal(result.reason, "Superseded");
  });

  test("unknown verification ID with an uploaded file returns not_found", async () => {
    const admin = fakeSupabase({ documents: { data: null } });
    const result = await verifyByUpload(admin, originalBytes, "CHK-0000-0000", "web");
    assert.equal(result.status, "not_found");
  });

  test("hash-only lookup (no verification ID given) still finds the document by content", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          verification_id: "CHK-4F7K-9QRT",
          document_type: "certificate",
          status: "active",
          revocation_reason: null,
          institutions: { name: "Test Institution" },
        },
      },
    });
    const result = await verifyByUpload(admin, originalBytes, null, "web");
    assert.equal(result.status, "genuine");
    assert.equal(result.verification_id, "CHK-4F7K-9QRT");
  });

  test("hash-only lookup with no match returns not_found", async () => {
    const admin = fakeSupabase({ documents: { data: null } });
    const result = await verifyByUpload(admin, originalBytes, undefined, "web");
    assert.equal(result.status, "not_found");
  });
});
