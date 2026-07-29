import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MARKER_KEYWORD = "ChekkamVerificationMarker";

type PngChunk = { type: string; data: Buffer; start: number; end: number };

/** Walks a PNG's chunk stream (spec: 4-byte length + 4-byte type + data + 4-byte CRC), stopping after IEND. */
function readChunks(buffer: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > buffer.length) break;
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd), start: offset, end: chunkEnd });
    offset = chunkEnd;
    if (type === "IEND") break;
  }
  return chunks;
}

function buildChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * Embeds an invisible verification marker as a standard tEXt chunk — one of
 * PNG's own ancillary chunk types, meant exactly for this (arbitrary
 * keyword/text metadata). Inserted immediately before IEND: never touches
 * IHDR/palette/pixel data, so the decoded image is byte-for-byte identical
 * to before. Not a visible watermark — only visible to a tool that reads
 * PNG text chunks (or Chekkam's own extractPngMarker), never rendered.
 */
export function embedPngMarker(buffer: Buffer, marker: string): Buffer {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a valid PNG file");
  }
  const chunks = readChunks(buffer);
  const iend = chunks.find((c) => c.type === "IEND");
  if (!iend) throw new Error("Malformed PNG: no IEND chunk found");

  const textData = Buffer.concat([
    Buffer.from(MARKER_KEYWORD, "latin1"),
    Buffer.from([0]),
    Buffer.from(marker, "latin1"),
  ]);
  const textChunk = buildChunk("tEXt", textData);

  return Buffer.concat([buffer.subarray(0, iend.start), textChunk, buffer.subarray(iend.start)]);
}

/** Reads back the marker embedded by embedPngMarker, or null if absent/unreadable. */
export function extractPngMarker(buffer: Buffer): string | null {
  try {
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    for (const chunk of readChunks(buffer)) {
      if (chunk.type !== "tEXt") continue;
      const nullIndex = chunk.data.indexOf(0);
      if (nullIndex === -1) continue;
      const keyword = chunk.data.subarray(0, nullIndex).toString("latin1");
      if (keyword === MARKER_KEYWORD) {
        return chunk.data.subarray(nullIndex + 1).toString("latin1");
      }
    }
    return null;
  } catch {
    return null;
  }
}
