/**
 * PostgREST (and therefore supabase-js) has no native binary JSON type, so a
 * `bytea` column is read/written as Postgres's hex text representation
 * ("\x" followed by hex digits) — never a raw Buffer/Uint8Array. Every read
 * or write of documents.original_file_data must go through these, or the
 * column ends up storing/parsing garbage.
 */
export function bufferToBytea(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

export function byteaToBuffer(value: string | null | undefined): Buffer | null {
  if (!value) return null;
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  return Buffer.from(hex, "hex");
}
