"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Report = {
  id: string;
  channel: string;
  content_type: string;
  raw_content: string | null;
  risk_level: string | null;
  risk_score: number | null;
  category: string | null;
  status: string;
  ai_reasons: string[] | null;
  ai_indicators: { source?: string } | null;
  confidence: string | null;
  recommended_action: string | null;
  campaign_id: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["pending", "analyzed", "under_review", "verified_threat", "false_report", "dismissed"];
const CHANNEL_OPTIONS = ["mobile", "web", "whatsapp", "telegram", "api", "extension", "share_intent"];
const RISK_OPTIONS = ["low", "medium", "high", "critical"];

const RISK_COLOR: Record<string, string> = {
  low: "bg-status-success/12 text-status-success",
  medium: "bg-status-warning/12 text-status-warning",
  high: "bg-status-danger/12 text-status-danger",
  critical: "bg-status-danger/12 text-status-danger",
};

const selectClass =
  "rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-2.5 py-1.5 text-xs text-chekkam-ink outline-none focus:border-chekkam-primary";

export default function ReportsDashboardPage() {
  const { lang, t } = useI18n();
  const supabase = getSupabaseBrowser();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: "", channel: "", risk_level: "", category: "" });

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      const params = new URLSearchParams({ lang });
      if (filters.status) params.set("status", filters.status);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.risk_level) params.set("risk_level", filters.risk_level);
      if (filters.category) params.set("category", filters.category);

      const res = await fetch(`/api/reports?${params.toString()}`, {
        headers: { "Accept-Language": lang, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedLoadResult"));
      setReports(body.reports as Report[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }, [supabase, filters, lang, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/filter-change
    loadReports();
  }, [loadReports]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayCount = reports.filter((r) => new Date(r.created_at).toDateString() === today).length;
    const pending = reports.filter((r) => ["pending", "analyzed", "under_review"].includes(r.status));
    const highRisk = pending.filter((r) => r.risk_level === "high" || r.risk_level === "critical").length;
    const campaigns = new Set(reports.map((r) => r.campaign_id).filter(Boolean)).size;
    return { todayCount, pendingCount: pending.length, highRisk, campaigns };
  }, [reports]);

  async function authHeaders() {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      "Accept-Language": lang,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/reports/${id}?lang=${lang}`, {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify({ status }),
    });
    loadReports();
  }

  async function promoteToAlert(report: Report) {
    setPromoting(report.id);
    try {
      const res = await fetch("/api/public-alerts/from-report", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(report.campaign_id ? { campaign_id: report.campaign_id } : { report_id: report.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      window.location.href = `/dashboard/alerts?highlight=${body.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-7">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">{t("overview")}</div>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          {t("reportQueue")}
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">{t("reportQueueIntro")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label={t("reportsLoadedToday")} value={stats.todayCount} />
        <StatTile label={t("pendingReview")} value={stats.pendingCount} accent={stats.pendingCount > 0} />
        <StatTile label={t("highCriticalOpen")} value={stats.highRisk} danger={stats.highRisk > 0} />
        <StatTile label={t("linkedCampaigns")} value={stats.campaigns} />
      </div>

      <div className="flex flex-wrap gap-2 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-3 shadow-chekkam-sm">
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={selectClass}>
          <option value="">{t("allStatuses")}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status, lang)}
            </option>
          ))}
        </select>
        <select value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))} className={selectClass}>
          <option value="">{t("allChannels")}</option>
          {CHANNEL_OPTIONS.map((channel) => (
            <option key={channel} value={channel}>
              {channel}
            </option>
          ))}
        </select>
        <select value={filters.risk_level} onChange={(e) => setFilters((f) => ({ ...f, risk_level: e.target.value }))} className={selectClass}>
          <option value="">{t("allRiskLevels")}</option>
          {RISK_OPTIONS.map((risk) => (
            <option key={risk} value={risk}>
              {riskLabel(risk, lang)}
            </option>
          ))}
        </select>
        <input
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          placeholder={t("categoryPlaceholder")}
          className={selectClass}
        />
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading && <p className="text-sm text-chekkam-muted">{t("loading")}</p>}

      <div className="flex flex-col gap-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-[family-name:var(--font-data)] text-xs text-chekkam-faint">
                    {report.id.slice(0, 8)}
                  </span>
                  {report.risk_level && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK_COLOR[report.risk_level] ?? "bg-status-neutral/12 text-status-neutral"}`}>
                      {riskLabel(report.risk_level, lang)}
                    </span>
                  )}
                  <span className="rounded-full bg-chekkam-tint px-2.5 py-0.5 text-xs font-medium text-chekkam-primary">
                    {report.channel}
                  </span>
                  <span className="text-xs text-chekkam-faint">{report.category ?? t("uncategorized")}</span>
                  <span className="text-xs text-chekkam-faint">· {statusLabel(report.status, lang)}</span>
                  <span className="text-xs text-chekkam-faint">
                    · {new Date(report.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                  </span>
                  {report.confidence && (
                    <span className="text-xs text-chekkam-faint">
                      · {report.confidence} {t("confidence")} ({report.ai_indicators?.source ?? "n/a"})
                    </span>
                  )}
                </div>
                <p className="mt-2 truncate text-sm text-chekkam-ink">{report.raw_content ?? t("noTextContent")}</p>
                {report.recommended_action && (
                  <p className="mt-1 text-xs font-medium text-chekkam-ink">{report.recommended_action}</p>
                )}
                {report.ai_reasons && (
                  <ul className="mt-2 list-inside list-disc text-xs text-chekkam-muted">
                    {report.ai_reasons.slice(0, 3).map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button onClick={() => updateStatus(report.id, "under_review")} className="rounded-[var(--radius-chekkam-sm)] bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-chekkam-sm hover:brightness-110">
                    {t("markUnderReview")}
                  </button>
                  <button onClick={() => updateStatus(report.id, "verified_threat")} className="rounded-[var(--radius-chekkam-sm)] bg-status-danger px-2.5 py-1 text-xs font-semibold text-white shadow-chekkam-sm hover:brightness-110">
                    {t("verifyAsThreat")}
                  </button>
                  <button onClick={() => updateStatus(report.id, "false_report")} className="rounded-[var(--radius-chekkam-sm)] bg-chekkam-tint px-2.5 py-1 text-xs font-semibold text-chekkam-muted hover:bg-chekkam-border">
                    {t("falseReport")}
                  </button>
                  <button onClick={() => updateStatus(report.id, "dismissed")} className="rounded-[var(--radius-chekkam-sm)] bg-chekkam-tint px-2.5 py-1 text-xs font-semibold text-chekkam-muted hover:bg-chekkam-border">
                    {t("dismiss")}
                  </button>
                </div>
                <button onClick={() => promoteToAlert(report)} disabled={promoting === report.id} className="rounded-[var(--radius-chekkam-sm)] bg-gradient-hero px-2.5 py-1 text-xs font-semibold text-white shadow-chekkam-sm disabled:opacity-60">
                  {promoting === report.id ? t("promoting") : t("promoteToAlert")}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && reports.length === 0 && <p className="text-sm text-chekkam-muted">{t("noReportsMatch")}</p>}
      </div>
    </div>
  );
}

function riskLabel(risk: string, lang: "en" | "fr") {
  const labels: Record<string, Record<"en" | "fr", string>> = {
    low: { en: "Low risk", fr: "Risque faible" },
    medium: { en: "Medium risk", fr: "Risque moyen" },
    high: { en: "High risk", fr: "Risque élevé" },
    critical: { en: "Critical risk", fr: "Risque critique" },
  };
  return labels[risk]?.[lang] ?? risk;
}

function statusLabel(status: string, lang: "en" | "fr") {
  const labels: Record<string, Record<"en" | "fr", string>> = {
    pending: { en: "pending", fr: "en attente" },
    analyzed: { en: "analyzed", fr: "analysé" },
    under_review: { en: "under review", fr: "en revue" },
    verified_threat: { en: "verified threat", fr: "menace confirmée" },
    false_report: { en: "false report", fr: "faux signalement" },
    dismissed: { en: "dismissed", fr: "classé" },
  };
  return labels[status]?.[lang] ?? status;
}

function StatTile({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  const valueColor = danger ? "text-status-danger" : accent ? "text-chekkam-primary" : "text-chekkam-ink";
  return (
    <div className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-4 shadow-chekkam-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-chekkam-faint">{label}</div>
      <div className={`mt-1.5 font-[family-name:var(--font-heading)] text-3xl font-semibold ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
