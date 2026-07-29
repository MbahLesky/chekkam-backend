import { describe, test, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateDemoCertificatePdf, demoCertificateFilename, type DemoCertificateData } from "./certificate-template";

const BASE_DATA: DemoCertificateData = {
  title: "Certificate of Completion",
  recipientName: "Jane Demo Nfor",
  programme: "Cybersecurity and Digital Trust Fundamentals",
  result: "Successfully Completed",
  issueDateIso: "2026-01-15T00:00:00.000Z",
  institutionName: "Chekkam Demo University",
  officerName: "Dr. Amina Bello",
  officerTitle: "Registrar, Chekkam Demo University",
  verificationId: "CHK-TEST-0001",
  pinCode: "123456",
  qrPayload: "https://chekkam-backend-production.up.railway.app/verify/CHK-TEST-0001",
};

describe("generateDemoCertificatePdf", () => {
  test("produces a single-page, loadable PDF containing the expected title", async () => {
    const bytes = await generateDemoCertificatePdf(BASE_DATA);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getTitle()).toContain("Jane Demo Nfor");
    expect(loaded.getTitle()).toContain("DEMONSTRATION DOCUMENT");
  });

  test("is byte-for-byte deterministic given identical input", async () => {
    const a = await generateDemoCertificatePdf(BASE_DATA);
    const b = await generateDemoCertificatePdf(BASE_DATA);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });

  test("changing the recipient name changes the output bytes", async () => {
    const a = await generateDemoCertificatePdf(BASE_DATA);
    const b = await generateDemoCertificatePdf({ ...BASE_DATA, recipientName: "Janet Demo Nfor" });
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });

  test("the isTestCopy variant still loads as a single valid page", async () => {
    const bytes = await generateDemoCertificatePdf({
      ...BASE_DATA,
      recipientName: "Janet Demo Nfor",
      isTestCopy: true,
    });
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});

describe("demoCertificateFilename", () => {
  test("returns a plain filename for a genuine/revoked document", () => {
    expect(demoCertificateFilename("CHK-TEST-0001")).toBe("CHK-TEST-0001.pdf");
  });

  test("returns a clearly-suffixed filename for the tampered variant", () => {
    expect(demoCertificateFilename("CHK-TEST-0001", "TAMPERED")).toBe("CHK-TEST-0001-TAMPERED.pdf");
  });
});
