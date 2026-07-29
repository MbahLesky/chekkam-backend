import { describe, test, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { Jimp } from "jimp";
import { embedPdfMarker, extractPdfMarker } from "./pdf";
import { embedDocxMarker, extractDocxMarker } from "./docx";
import { embedPngMarker, extractPngMarker } from "./png";
import { embedInvisibleMarker, extractInvisibleMarker, DOCX_MIME_TYPE } from "./index";

async function makeSamplePdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("Original Title — untouched");
  const page = pdfDoc.addPage([300, 200]);
  page.drawText("Hello, this is the original content.");
  return Buffer.from(await pdfDoc.save());
}

/** A minimal but structurally valid .docx — enough for jszip/OOXML parsing, not a real Word render. */
async function makeSampleDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>"
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>"
  );
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:body><w:p><w:r><w:t>Original document body — untouched.</w:t></w:r></w:p></w:body>" +
      "</w:document>"
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function makeSamplePng(): Promise<Buffer> {
  const image = new Jimp({ width: 20, height: 20, color: 0xff0000ff });
  return image.getBuffer("image/png");
}

describe("PDF invisible marker", () => {
  test("embeds and extracts a marker without changing the visible content", async () => {
    const original = await makeSamplePdf();
    const embedded = await embedPdfMarker(original, "Chekkam:CHK-TEST-0001");

    expect(await extractPdfMarker(embedded)).toBe("Chekkam:CHK-TEST-0001");
    expect(await extractPdfMarker(original)).toBeNull();

    const reloaded = await PDFDocument.load(embedded);
    expect(reloaded.getTitle()).toBe("Original Title — untouched");
    expect(reloaded.getPageCount()).toBe(1);
  });

  test("returns null for a PDF with no marker", async () => {
    const original = await makeSamplePdf();
    expect(await extractPdfMarker(original)).toBeNull();
  });
});

describe("DOCX invisible marker", () => {
  test("embeds and extracts a marker without changing document.xml", async () => {
    const original = await makeSampleDocx();
    const embedded = await embedDocxMarker(original, "Chekkam:CHK-TEST-0002");

    expect(await extractDocxMarker(embedded)).toBe("Chekkam:CHK-TEST-0002");
    expect(await extractDocxMarker(original)).toBeNull();

    const originalZip = await JSZip.loadAsync(original);
    const embeddedZip = await JSZip.loadAsync(embedded);
    const originalBody = await originalZip.file("word/document.xml")!.async("string");
    const embeddedBody = await embeddedZip.file("word/document.xml")!.async("string");
    expect(embeddedBody).toBe(originalBody);
    expect(await embeddedZip.file("docProps/custom.xml")!.async("string")).toContain(
      "ChekkamVerificationMarker"
    );
  });

  test("appends alongside an existing custom.xml rather than replacing it", async () => {
    const zip = new JSZip();
    const base = await makeSampleDocx();
    const loaded = await JSZip.loadAsync(base);
    for (const [path, file] of Object.entries(loaded.files)) {
      if (!file.dir) zip.file(path, await file.async("nodebuffer"));
    }
    zip.file(
      "docProps/custom.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Classification">' +
        "<vt:lpwstr>Internal</vt:lpwstr></property>" +
        "</Properties>"
    );
    const withExisting = await zip.generateAsync({ type: "nodebuffer" });

    const embedded = await embedDocxMarker(withExisting, "Chekkam:CHK-TEST-0003");
    const embeddedZip = await JSZip.loadAsync(embedded);
    const customXml = await embeddedZip.file("docProps/custom.xml")!.async("string");

    expect(customXml).toContain("Classification");
    expect(customXml).toContain("Internal");
    expect(customXml).toContain("ChekkamVerificationMarker");
    expect(await extractDocxMarker(embedded)).toBe("Chekkam:CHK-TEST-0003");
  });
});

describe("PNG invisible marker", () => {
  test("embeds and extracts a marker without changing pixel data", async () => {
    const original = await makeSamplePng();
    const embedded = embedPngMarker(original, "Chekkam:CHK-TEST-0004");

    expect(extractPngMarker(embedded)).toBe("Chekkam:CHK-TEST-0004");
    expect(extractPngMarker(original)).toBeNull();

    const originalImage = await Jimp.read(original);
    const embeddedImage = await Jimp.read(embedded);
    expect(embeddedImage.bitmap.width).toBe(originalImage.bitmap.width);
    expect(embeddedImage.bitmap.height).toBe(originalImage.bitmap.height);
    expect(Buffer.compare(embeddedImage.bitmap.data, originalImage.bitmap.data)).toBe(0);
  });

  test("rejects a non-PNG buffer", () => {
    expect(() => embedPngMarker(Buffer.from("not a png"), "x")).toThrow();
  });
});

describe("embedInvisibleMarker dispatcher", () => {
  test("detects and embeds a PDF", async () => {
    const original = await makeSamplePdf();
    const result = await embedInvisibleMarker(original, "Chekkam:CHK-TEST-0005");
    expect(result?.mimeType).toBe("application/pdf");
    expect(await extractInvisibleMarker(result!.buffer, result!.mimeType)).toBe(
      "Chekkam:CHK-TEST-0005"
    );
  });

  test("detects and embeds a DOCX", async () => {
    const original = await makeSampleDocx();
    const result = await embedInvisibleMarker(original, "Chekkam:CHK-TEST-0006");
    expect(result?.mimeType).toBe(DOCX_MIME_TYPE);
    expect(await extractInvisibleMarker(result!.buffer, result!.mimeType)).toBe(
      "Chekkam:CHK-TEST-0006"
    );
  });

  test("detects and embeds a PNG", async () => {
    const original = await makeSamplePng();
    const result = await embedInvisibleMarker(original, "Chekkam:CHK-TEST-0007");
    expect(result?.mimeType).toBe("image/png");
    expect(await extractInvisibleMarker(result!.buffer, result!.mimeType)).toBe(
      "Chekkam:CHK-TEST-0007"
    );
  });

  test("returns null for an unsupported format instead of faking an embed", async () => {
    const plainText = Buffer.from("just some plain text, not a real document");
    expect(await embedInvisibleMarker(plainText, "Chekkam:CHK-TEST-0008")).toBeNull();
  });
});
