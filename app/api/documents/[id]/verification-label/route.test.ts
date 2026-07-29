import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/lib/errors";

const requireUser = vi.fn();
const requireRole = vi.fn((profile: { role: string }, roles: string[]) => {
  if (!roles.includes(profile.role)) throw new AuthError("Forbidden", 403);
});
const requireInstitutionMember = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({
  requireUser,
  requireRole,
  requireInstitutionMember,
}));

const auditInsert = vi.fn(async () => ({ data: null, error: null }));
const fromMock = vi.fn((table: string) => (table === "audit_logs" ? { insert: auditInsert } : {}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

const fetchDocumentForVerificationLabel = vi.fn();
const hasValidRegistrySignature = vi.fn(() => true);
const generateVerificationLabelPdf = vi.fn(async () => new Uint8Array([1, 2, 3]));
const verificationLabelFilename = vi.fn(() => "Verification-Label-CHK-4F7K-9QRT.pdf");
const buildVerificationLabelPdfResponse = vi.fn(
  (_bytes: Uint8Array, filename: string) =>
    new Response("verification label", {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
);
vi.mock("@/lib/documents/verification-label", () => ({
  fetchDocumentForVerificationLabel,
  hasValidRegistrySignature,
  generateVerificationLabelPdf,
  verificationLabelFilename,
  buildVerificationLabelPdfResponse,
}));

const documentRecord = {
  id: "doc-1",
  institution_id: "inst-1",
  verification_id: "CHK-4F7K-9QRT",
};

function request(id = "doc-1") {
  return new NextRequest(`http://localhost/api/documents/${id}/verification-label`);
}

describe("GET /api/documents/:id/verification-label", () => {
  beforeEach(() => {
    requireUser.mockReset();
    requireRole.mockClear();
    requireInstitutionMember.mockClear();
    fetchDocumentForVerificationLabel.mockReset();
    hasValidRegistrySignature.mockReset();
    hasValidRegistrySignature.mockReturnValue(true);
    generateVerificationLabelPdf.mockClear();
    verificationLabelFilename.mockClear();
    buildVerificationLabelPdfResponse.mockClear();
    auditInsert.mockClear();
    fromMock.mockClear();
  });

  it("returns 401 without a session", async () => {
    requireUser.mockRejectedValue(new AuthError("Missing Authorization bearer token.", 401));
    const { GET } = await import("./route");
    const response = await GET(request(), { params: Promise.resolve({ id: "doc-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown registry record", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    fetchDocumentForVerificationLabel.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(request("unknown"), { params: Promise.resolve({ id: "unknown" }) });
    expect(response.status).toBe(404);
    expect(generateVerificationLabelPdf).not.toHaveBeenCalled();
  });

  it("refuses a label when the stored registry signature cannot be validated", async () => {
    requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    fetchDocumentForVerificationLabel.mockResolvedValue(documentRecord);
    hasValidRegistrySignature.mockReturnValue(false);
    const { GET } = await import("./route");
    const response = await GET(request(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(409);
    expect(generateVerificationLabelPdf).not.toHaveBeenCalled();
  });

  it("requires institution membership and generates only a separate label", async () => {
    requireUser.mockResolvedValue({ id: "officer-1", role: "institution_officer" });
    fetchDocumentForVerificationLabel.mockResolvedValue(documentRecord);
    const { GET } = await import("./route");
    const response = await GET(request(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(200);
    expect(requireInstitutionMember).toHaveBeenCalledWith(
      { id: "officer-1", role: "institution_officer" },
      "inst-1"
    );
    expect(generateVerificationLabelPdf).toHaveBeenCalledWith(documentRecord);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.verification_label.download", target_id: "doc-1" })
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Verification-Label-CHK-4F7K-9QRT.pdf"'
    );
  });
});
