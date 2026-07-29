import JSZip from "jszip";

const MARKER_PROPERTY_NAME = "ChekkamVerificationMarker";
const CUSTOM_PROPS_PATH = "docProps/custom.xml";
const CONTENT_TYPES_PATH = "[Content_Types].xml";
const RELS_PATH = "_rels/.rels";
const CUSTOM_PROPS_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.custom-properties+xml";
const CUSTOM_PROPS_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function propertyXml(pid: number, value: string): string {
  return (
    `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${pid}" ` +
    `name="${MARKER_PROPERTY_NAME}"><vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`
  );
}

function freshCustomPropsXml(marker: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    propertyXml(2, marker) +
    "</Properties>"
  );
}

/** Finds the highest existing pid in a custom.xml so a new property never collides. */
function nextPid(existingXml: string): number {
  const pids = [...existingXml.matchAll(/pid="(\d+)"/g)].map((m) => Number(m[1]));
  return (pids.length ? Math.max(...pids) : 1) + 1;
}

/**
 * Embeds an invisible verification marker as a DOCX custom document
 * property (docProps/custom.xml — the Office Open XML mechanism meant
 * exactly for this: arbitrary named metadata that Word never renders in the
 * document body). Only visible via File > Info > Properties > Advanced
 * Properties > Custom, never on the page — no visible watermark added.
 *
 * A .docx is a zip archive: if docProps/custom.xml doesn't already exist,
 * it's created and registered in [Content_Types].xml and _rels/.rels (the
 * two places OOXML requires a new part to be declared); if it already
 * exists, the marker is appended alongside whatever custom properties the
 * document already had, never replacing them.
 */
export async function embedDocxMarker(buffer: Buffer, marker: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  const existing = zip.file(CUSTOM_PROPS_PATH);
  if (existing) {
    const xml = await existing.async("string");
    const pid = nextPid(xml);
    const updated = xml.replace("</Properties>", `${propertyXml(pid, marker)}</Properties>`);
    zip.file(CUSTOM_PROPS_PATH, updated);
  } else {
    zip.file(CUSTOM_PROPS_PATH, freshCustomPropsXml(marker));

    const contentTypesFile = zip.file(CONTENT_TYPES_PATH);
    if (contentTypesFile) {
      const xml = await contentTypesFile.async("string");
      const override = `<Override PartName="/${CUSTOM_PROPS_PATH}" ContentType="${CUSTOM_PROPS_CONTENT_TYPE}"/>`;
      if (!xml.includes(override)) {
        zip.file(CONTENT_TYPES_PATH, xml.replace("</Types>", `${override}</Types>`));
      }
    }

    const relsFile = zip.file(RELS_PATH);
    if (relsFile) {
      const xml = await relsFile.async("string");
      const existingIds = [...xml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
      const nextId = (existingIds.length ? Math.max(...existingIds) : 0) + 1;
      const relationship =
        `<Relationship Id="rId${nextId}" Type="${CUSTOM_PROPS_REL_TYPE}" Target="${CUSTOM_PROPS_PATH}"/>`;
      zip.file(RELS_PATH, xml.replace("</Relationships>", `${relationship}</Relationships>`));
    }
  }

  const out = await zip.generateAsync({ type: "nodebuffer" });
  return out;
}

/** Reads back the marker embedded by embedDocxMarker, or null if absent/unreadable. */
export async function extractDocxMarker(buffer: Buffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const file = zip.file(CUSTOM_PROPS_PATH);
    if (!file) return null;
    const xml = await file.async("string");
    const match = xml.match(
      new RegExp(`name="${MARKER_PROPERTY_NAME}"[^>]*><vt:lpwstr>([^<]*)</vt:lpwstr>`)
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
