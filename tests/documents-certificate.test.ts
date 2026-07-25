import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { requireRole, requireInstitutionMember, AuthedProfile } from "@/lib/auth";
import { AuthError } from "@/lib/errors";
import {
  fetchDocumentForCertificate,
  generateCertificatePdf,
  certificateFilename,
  buildCertificatePdfResponse,
  CertificateDocument,
} from "@/lib/documents/certificate";
import { fakeSupabase, unreachableSupabase } from "../test-support/fake-supabase";

const sampleDoc: CertificateDocument = {
  id: "doc-1",
  institution_id: "0b8929f6-22e2-400a-8d91-af9e7f70280c",
  institution_name: "Lycée Bilingue de Yaoundé",
  document_type: "certificate",
  recipient_name: "Jean Dupont",
  status: "active",
  verification_id: "CHK-4F7K-9QRT",
  pin_code: "123456",
  qr_payload: "http://localhost:3000/verify/CHK-4F7K-9QRT",
  issued_at: "2026-01-01T00:00:00Z",
  revoked_at: null,
  revocation_reason: null,
};

describe("GET /api/documents/:id/certificate — authorization", () => {
  test("requireRole rejects a role outside institution_officer/admin/super_admin", () => {
    const analyst: AuthedProfile = { id: "u1", role: "analyst" };
    assert.throws(
      () => requireRole(analyst, ["institution_officer", "admin", "super_admin"]),
      (err: unknown) => err instanceof AuthError && err.status === 403
    );
  });

  test("requireRole allows institution_officer", () => {
    const officer: AuthedProfile = { id: "u1", role: "institution_officer" };
    assert.doesNotThrow(() =>
      requireRole(officer, ["institution_officer", "admin", "super_admin"])
    );
  });

  test("admin bypasses the institution-membership check entirely (no query made)", async () => {
    const admin: AuthedProfile = { id: "u1", role: "admin" };
    // unreachableSupabase() throws if .from() is ever called — proves the bypass.
    await assert.doesNotReject(
      requireInstitutionMember(admin, sampleDoc.institution_id, unreachableSupabase())
    );
  });

  test("institution_officer who belongs to the institution is allowed", async () => {
    const officer: AuthedProfile = { id: "u1", role: "institution_officer" };
    const client = fakeSupabase({
      institution_members: { data: { id: "membership-1" } },
    });
    await assert.doesNotReject(requireInstitutionMember(officer, sampleDoc.institution_id, client));
  });

  test("institution_officer who does NOT belong to the institution is forbidden", async () => {
    const officer: AuthedProfile = { id: "u1", role: "institution_officer" };
    const client = fakeSupabase({
      institution_members: { data: null },
    });
    await assert.rejects(
      requireInstitutionMember(officer, sampleDoc.institution_id, client),
      (err: unknown) => err instanceof AuthError && err.status === 403
    );
  });
});

describe("fetchDocumentForCertificate", () => {
  test("returns null for a document that doesn't exist (unknown ID -> route returns 404)", async () => {
    const admin = fakeSupabase({ documents: { data: null } });
    const doc = await fetchDocumentForCertificate(admin, "00000000-0000-0000-0000-000000000000");
    assert.equal(doc, null);
  });

  test("maps a found row, unwrapping the joined institution name (object shape)", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          institution_id: sampleDoc.institution_id,
          document_type: "certificate",
          recipient_name: "Jean Dupont",
          status: "active",
          verification_id: "CHK-4F7K-9QRT",
          pin_code: "123456",
          qr_payload: sampleDoc.qr_payload,
          issued_at: sampleDoc.issued_at,
          revoked_at: null,
          revocation_reason: null,
          institutions: { name: "Lycée Bilingue de Yaoundé" },
        },
      },
    });
    const doc = await fetchDocumentForCertificate(admin, "doc-1");
    assert.ok(doc);
    assert.equal(doc?.institution_name, "Lycée Bilingue de Yaoundé");
    assert.equal(doc?.verification_id, "CHK-4F7K-9QRT");
  });

  test("unwraps the joined institution name when Supabase returns it as an array", async () => {
    const admin = fakeSupabase({
      documents: {
        data: {
          id: "doc-1",
          institution_id: sampleDoc.institution_id,
          document_type: "certificate",
          recipient_name: null,
          status: "active",
          verification_id: "CHK-4F7K-9QRT",
          pin_code: null,
          qr_payload: sampleDoc.qr_payload,
          issued_at: sampleDoc.issued_at,
          revoked_at: null,
          revocation_reason: null,
          institutions: [{ name: "Array-Shaped Institution" }],
        },
      },
    });
    const doc = await fetchDocumentForCertificate(admin, "doc-1");
    assert.equal(doc?.institution_name, "Array-Shaped Institution");
  });
});

describe("certificateFilename", () => {
  test("produces a safe, predictable download filename from the verification ID", () => {
    assert.equal(
      certificateFilename({ verification_id: "CHK-4F7K-9QRT" }),
      "Chekkam-Certificate-CHK-4F7K-9QRT.pdf"
    );
  });
});

describe("buildCertificatePdfResponse — content type/headers", () => {
  test("sets application/pdf, a matching Content-Disposition, and the byte length", async () => {
    const bytes = new TextEncoder().encode("not a real pdf, just testing headers");
    const res = buildCertificatePdfResponse(bytes, "Chekkam-Certificate-CHK-4F7K-9QRT.pdf");

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.equal(
      res.headers.get("content-disposition"),
      'attachment; filename="Chekkam-Certificate-CHK-4F7K-9QRT.pdf"'
    );
    assert.equal(res.headers.get("content-length"), String(bytes.byteLength));

    const body = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual(body, bytes);
  });
});

describe("generateCertificatePdf", () => {
  test("produces a single-page, loadable PDF for an active document", async () => {
    const bytes = await generateCertificatePdf(sampleDoc);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");

    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
  });

  test("produces a loadable PDF for a revoked document, without throwing on the extra fields", async () => {
    const revoked: CertificateDocument = {
      ...sampleDoc,
      status: "revoked",
      revoked_at: "2026-06-01T00:00:00Z",
      revocation_reason: "Issued in error",
    };
    const bytes = await generateCertificatePdf(revoked);
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
  });

  test("does not throw when recipient_name and pin_code are absent", async () => {
    const minimal: CertificateDocument = {
      ...sampleDoc,
      recipient_name: null,
      pin_code: null,
    };
    const bytes = await generateCertificatePdf(minimal);
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 1);
  });
});
