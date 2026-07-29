import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCameroonNumber } from "@/lib/campaigns/fingerprint";

/**
 * Phase 12 — Cameroon Mobile Money Scam Intelligence: "check this number
 * before you pay it." Deliberately NOT a "Verified Safe" claim when nothing
 * is found — absence of a report is not proof of safety, and claiming
 * otherwise would repeat the exact fabrication-under-thin-evidence mistake
 * already fixed once this phase in lib/ai/content-authenticity.ts. The
 * status vocabulary here reflects only what the data actually shows.
 */
export type NumberReputationStatus =
  | "no_reports"
  | "reported"
  | "under_review"
  | "confirmed_scam"
  | "cleared";

export type NumberReputationResult = {
  normalized_number: string;
  status: NumberReputationStatus;
  report_count: number;
  categories: string[];
  network_providers: string[];
  most_recent_report_at: string | null;
  campaign_ids: string[];
};

type ReportRow = {
  id: string;
  status: string;
  category: string | null;
  network_provider: string | null;
  created_at: string;
  campaign_id: string | null;
};

function statusFrom(reports: ReportRow[]): NumberReputationStatus {
  if (reports.length === 0) return "no_reports";
  if (reports.some((r) => r.status === "verified_threat")) return "confirmed_scam";
  if (reports.some((r) => r.status === "under_review")) return "under_review";
  const allClosed = reports.every((r) => r.status === "false_report" || r.status === "dismissed");
  if (allClosed) return "cleared";
  return "reported";
}

/**
 * Looks up every report that names this phone/wallet number, either via the
 * structured phone_number/wallet_number columns (Phase 12 onward) or the
 * fingerprint extracted from free-text raw_content (pre-Phase-12 reports —
 * lib/campaigns/fingerprint.ts already ran phone extraction on every text/
 * link report before this feature existed).
 */
export async function getNumberReputation(
  admin: SupabaseClient,
  rawNumber: string
): Promise<NumberReputationResult> {
  const normalized = normalizeCameroonNumber(rawNumber);
  if (!normalized) {
    return {
      normalized_number: normalized,
      status: "no_reports",
      report_count: 0,
      categories: [],
      network_providers: [],
      most_recent_report_at: null,
      campaign_ids: [],
    };
  }

  const [structured, fromFingerprint] = await Promise.all([
    admin
      .from("reports")
      .select("id, status, category, network_provider, created_at, campaign_id")
      .or(`phone_number.eq.${normalized},wallet_number.eq.${normalized}`)
      .limit(500),
    admin
      .from("reports")
      .select("id, status, category, network_provider, created_at, campaign_id")
      .filter("ai_indicators->fingerprint->phoneNumbers", "cs", JSON.stringify([normalized]))
      .limit(500),
  ]);

  const byId = new Map<string, ReportRow>();
  for (const row of [...(structured.data ?? []), ...(fromFingerprint.data ?? [])] as ReportRow[]) {
    byId.set(row.id, row);
  }
  const reports = Array.from(byId.values());
  reports.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    normalized_number: normalized,
    status: statusFrom(reports),
    report_count: reports.length,
    categories: Array.from(new Set(reports.map((r) => r.category).filter((c): c is string => !!c))),
    network_providers: Array.from(
      new Set(reports.map((r) => r.network_provider).filter((n): n is string => !!n))
    ),
    most_recent_report_at: reports[0]?.created_at ?? null,
    campaign_ids: Array.from(
      new Set(reports.map((r) => r.campaign_id).filter((c): c is string => !!c))
    ),
  };
}
