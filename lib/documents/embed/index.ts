import { embedPdfMarker, extractPdfMarker } from "./pdf";
import { embedDocxMarker, extractDocxMarker } from "./docx";
import { embedPngMarker, extractPngMarker } from "./png";

export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const SUPPORTED_MIME_TYPES = new Set(["application/pdf", DOCX_MIME_TYPE, "image/png"]);

export type EmbedResult = { buffer: Buffer; mimeType: string };

/**
 * Embeds an invisible verification marker into a file's own bytes, for the
 * formats where a well-understood invisible-metadata location exists (PDF
 * Info dict, DOCX custom document property, PNG tEXt chunk) — see the
 * per-format modules for exactly how. Returns null for anything else
 * (including video/audio, which have no standard equivalent and are
 * intentionally not attempted rather than faked).
 *
 * This runs *before* signing, not after: the caller hashes and signs the
 * returned embedded buffer, not the original upload, so the existing
 * hash-based verifyByUpload() path recognizes this exact embedded version
 * as genuine with zero changes to the verification engine.
 */
export async function embedInvisibleMarker(buffer: Buffer, marker: string): Promise<EmbedResult | null> {
  // Dynamic import deliberately: file-type is ESM-only, and a static
  // top-level import here breaks tsx's CJS-based module resolution the
  // instant this module loads — which crashed `npm run db:seed` (tsx
  // scripts/seed.ts -> sign-document.ts -> here), and with it the whole
  // `db:migrate && db:seed && next start` production boot chain. Next.js's
  // own bundler resolves the static form fine (that's how every other
  // file-type import in this codebase is written) — this file is the one
  // exception because it's reachable from a script tsx executes directly.
  const { fileTypeFromBuffer } = await import("file-type");
  const sniffed = await fileTypeFromBuffer(buffer);
  if (!sniffed || !SUPPORTED_MIME_TYPES.has(sniffed.mime)) return null;

  if (sniffed.mime === "application/pdf") {
    return { buffer: await embedPdfMarker(buffer, marker), mimeType: sniffed.mime };
  }
  if (sniffed.mime === DOCX_MIME_TYPE) {
    return { buffer: await embedDocxMarker(buffer, marker), mimeType: sniffed.mime };
  }
  return { buffer: embedPngMarker(buffer, marker), mimeType: sniffed.mime };
}

/** Reads back a marker embedded by embedInvisibleMarker, given the file's mime type. */
export async function extractInvisibleMarker(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (mimeType === "application/pdf") return extractPdfMarker(buffer);
  if (mimeType === DOCX_MIME_TYPE) return extractDocxMarker(buffer);
  if (mimeType === "image/png") return extractPngMarker(buffer);
  return null;
}
