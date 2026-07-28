import { SupabaseClient } from "@supabase/supabase-js";

/**
 * A source match says only where a shared link was published. It does not
 * establish that every claim made in the video is true. Keeping that boundary
 * explicit is important: a verified BBC/CRTV account can still carry a clip
 * whose context is disputed or outdated.
 */
export type SourceVerification = {
  status: "verified_official_source" | "source_not_verified" | "invalid_url";
  name: string | null;
  source_url: string | null;
  match_kind: "official_domain" | "registered_source" | null;
  detail: string;
};

type SourceRow = {
  name: string | null;
  type: string | null;
  value: string | null;
};

type BuiltInOfficialSource = {
  name: string;
  domains: readonly string[];
};

/**
 * These are publisher domains, not a claim that a copied TikTok/Facebook post
 * is official. Social accounts must be added to `trusted_sources` after an
 * organisation is verified by Chekkam staff.
 */
const BUILT_IN_OFFICIAL_SOURCES: readonly BuiltInOfficialSource[] = [
  { name: "BBC", domains: ["bbc.com", "bbc.co.uk"] },
  { name: "Cameroon Radio Television (CRTV)", domains: ["crtv.cm"] },
];

function normaliseHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

function hostMatches(hostname: string, domain: string): boolean {
  const host = normaliseHost(hostname);
  const expected = normaliseHost(domain);
  return host === expected || host.endsWith(`.${expected}`);
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Matches a public URL to a registered trusted source. A full URL can pin a
 * social-media account path (for example `tiktok.com/@bbcnews`); a bare
 * domain matches that domain and its subdomains.
 */
export function registeredSourceMatches(candidate: URL, value: string): boolean {
  const configured = value.trim();
  if (!configured) return false;

  const configuredUrl = parseHttpUrl(configured);
  if (!configuredUrl) return hostMatches(candidate.hostname, configured.replace(/^@/, ""));
  if (!hostMatches(candidate.hostname, configuredUrl.hostname)) return false;

  const configuredPath = configuredUrl.pathname.replace(/\/+$/, "");
  if (!configuredPath || configuredPath === "/") return true;

  const candidatePath = candidate.pathname.replace(/\/+$/, "");
  return candidatePath === configuredPath || candidatePath.startsWith(`${configuredPath}/`);
}

export async function verifyMediaSource(
  admin: SupabaseClient,
  submittedUrl: string
): Promise<SourceVerification> {
  const url = parseHttpUrl(submittedUrl);
  if (!url) {
    return {
      status: "invalid_url",
      name: null,
      source_url: null,
      match_kind: null,
      detail: "A public http(s) link is needed to check its publishing source.",
    };
  }

  for (const source of BUILT_IN_OFFICIAL_SOURCES) {
    if (source.domains.some((domain) => hostMatches(url.hostname, domain))) {
      return {
        status: "verified_official_source",
        name: source.name,
        source_url: url.toString(),
        match_kind: "official_domain",
        detail: `This link is served from the verified ${source.name} domain.`,
      };
    }
  }

  // A database outage must not turn into a false negative. We retain the
  // honest "not verified" result rather than claiming the source was searched.
  let rows: SourceRow[] = [];
  try {
    const { data, error } = await admin
      .from("trusted_sources")
      .select("name, type, value")
      .eq("verified", true)
      .limit(500);
    if (!error && Array.isArray(data)) rows = data as SourceRow[];
  } catch {
    rows = [];
  }

  const matched = rows.find((source) =>
    typeof source.value === "string" ? registeredSourceMatches(url, source.value) : false
  );
  if (matched) {
    return {
      status: "verified_official_source",
      name: matched.name ?? "Verified Chekkam source",
      source_url: url.toString(),
      match_kind: "registered_source",
      detail: "This link matches a source that Chekkam has registered and verified.",
    };
  }

  return {
    status: "source_not_verified",
    name: null,
    source_url: url.toString(),
    match_kind: null,
    detail:
      "Chekkam could not link this URL to a registered official publisher. This is not proof that the content is false.",
  };
}
