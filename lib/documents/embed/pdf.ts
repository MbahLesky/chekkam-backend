import { PDFDocument, PDFDict, PDFName, PDFString } from "pdf-lib";

const MARKER_KEY = "ChekkamVerificationMarker";

/**
 * Embeds an invisible verification marker into a PDF's Info dictionary — a
 * standard, always-present PDF structure that generic PDF metadata like
 * Title/Author/Subject already lives in, so this never renders on any page
 * and never touches the document's visible content. A custom key name (not
 * a standard field like Keywords) is used deliberately so nothing already
 * meaningful in the uploaded file is overwritten.
 *
 * Only a viewer explicitly inspecting the PDF's raw Info dict (or Chekkam's
 * own extractPdfMarker) would ever see this — there is no visible watermark
 * or stamp, per the "no branding on another institution's document" rule.
 */
export async function embedPdfMarker(buffer: Buffer, marker: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });

  let infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info, PDFDict);
  if (!infoDict) {
    infoDict = pdfDoc.context.obj({});
    pdfDoc.context.trailerInfo.Info = pdfDoc.context.register(infoDict);
  }
  infoDict.set(PDFName.of(MARKER_KEY), PDFString.of(marker));

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

/** Reads back the marker embedded by embedPdfMarker, or null if absent/unreadable. */
export async function extractPdfMarker(buffer: Buffer): Promise<string | null> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    const infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info, PDFDict);
    const value = infoDict?.get(PDFName.of(MARKER_KEY));
    return value instanceof PDFString ? value.decodeText() : null;
  } catch {
    return null;
  }
}
