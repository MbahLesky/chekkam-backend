import { Reader } from "@contentauth/c2pa-node";

/**
 * C2PA / Content Credentials are signed provenance records embedded in some
 * images, video, and audio. They can establish what a signed manifest says
 * about an asset's origin/edit history; they do not establish that every
 * claim made in that asset is true.
 *
 * This module deliberately has no fallback heuristic. If credentials are not
 * present, we say so. If the native verifier cannot run, we surface that
 * separately instead of treating the file as unverified or AI-generated.
 */
export type ContentCredentialsStatus =
  | "verified"
  | "present_with_warnings"
  | "not_present"
  | "unavailable";

export type ContentCredentialsResult = {
  status: ContentCredentialsStatus;
  detail: string;
  has_embedded_manifest: boolean;
  claim_generator: string | null;
  title: string | null;
  validation_codes: string[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * C2PA manifests expose validation entries as an array. A signature failure
 * can arrive in slightly different shapes across SDK releases, so we retain
 * only safe machine-readable codes for the report and never expose a raw
 * verifier exception to the citizen UI.
 */
function validationCodes(manifest: unknown): string[] {
  const source = record(manifest);
  const statuses = source?.validation_status;
  if (!Array.isArray(statuses)) return [];

  return statuses
    .map((entry) => {
      const item = record(entry);
      return stringValue(item?.code) ?? stringValue(item?.explanation);
    })
    .filter((code): code is string => Boolean(code))
    .slice(0, 6);
}

function warningLike(code: string): boolean {
  const normalised = code.toLowerCase();
  return /fail|error|invalid|mismatch|untrusted|warning/.test(normalised);
}

const NOT_PRESENT: Omit<ContentCredentialsResult, "status"> = {
  detail:
    "No signed Content Credentials were found in this submitted file. This does not mean the file is false or AI-generated.",
  has_embedded_manifest: false,
  claim_generator: null,
  title: null,
  validation_codes: [],
};

/**
 * Reads and validates an embedded C2PA manifest without fetching remote
 * manifests or OCSP records. Keeping verification local prevents a shared
 * file from causing arbitrary server-side network requests.
 */
export async function inspectContentCredentials(
  buffer: Buffer,
  mimeType: string
): Promise<ContentCredentialsResult> {
  try {
    const reader = await Reader.fromAsset(
      { buffer, mimeType },
      {
        verify: {
          verify_after_reading: true,
          verify_trust: true,
          verify_timestamp_trust: true,
          remote_manifest_fetch: false,
          ocsp_fetch: false,
        },
      }
    );

    if (!reader) return { status: "not_present", ...NOT_PRESENT };

    const manifest = record(reader.getActive());
    const codes = validationCodes(manifest);
    const hasWarnings = codes.some(warningLike);
    const claimGenerator = stringValue(manifest?.claim_generator);
    const title = stringValue(manifest?.title);

    return {
      status: hasWarnings ? "present_with_warnings" : "verified",
      detail: hasWarnings
        ? "Content Credentials were found, but the verifier reported validation warnings. Treat the provenance as incomplete."
        : "Signed Content Credentials were found and validated locally. They describe provenance, not whether every claim in the media is true.",
      has_embedded_manifest: reader.isEmbedded(),
      claim_generator: claimGenerator,
      title,
      validation_codes: codes,
    };
  } catch {
    return {
      status: "unavailable",
      detail:
        "Content Credentials could not be read for this file. No provenance conclusion has been made.",
      has_embedded_manifest: false,
      claim_generator: null,
      title: null,
      validation_codes: [],
    };
  }
}
