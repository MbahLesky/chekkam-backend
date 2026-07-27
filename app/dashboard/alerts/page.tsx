"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button, StatusBadge, LoadingState, ErrorState } from "@/components/ui";

type PublicAlert = {
  id: string;
  title: string;
  body: string;
  alert_type: string;
  severity: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
};

const ALERT_TYPES = ["scam_campaign", "document_fraud", "safety_incident", "general_advisory"];
const SEVERITIES = ["info", "warning", "critical"];

const inputClass =
  "mt-1 w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3 py-2 text-sm text-chekkam-ink outline-none focus:border-chekkam-primary disabled:bg-chekkam-surface disabled:text-chekkam-muted";

const SEVERITY_COLOR: Record<string, string> = {
  info: "bg-blue-500/12 text-blue-700",
  warning: "bg-status-warning/12 text-status-warning",
  critical: "bg-status-danger/12 text-status-danger",
};

export default function PublicAlertsAdminPage() {
  const { lang, t } = useI18n();
  const supabase = getSupabaseBrowser();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [alerts, setAlerts] = useState<PublicAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<PublicAlert>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAlert, setNewAlert] = useState({
    title: "",
    body: "",
    alert_type: "scam_campaign",
    severity: "warning",
    related_campaign_id: "",
  });

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      "Accept-Language": lang,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, [supabase, lang]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/public-alerts?scope=drafts&lang=${lang}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedLoadAlerts"));
      setAlerts(body.alerts as PublicAlert[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, lang, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/language-change
    load();
  }, [load]);

  function field(alert: PublicAlert, key: keyof PublicAlert): string {
    return (editing[alert.id]?.[key] as string) ?? (alert[key] as string);
  }

  function setField(alertId: string, key: keyof PublicAlert, value: string) {
    setEditing((prev) => ({ ...prev, [alertId]: { ...prev[alertId], [key]: value } }));
  }

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/public-alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: newAlert.title,
          body: newAlert.body,
          alert_type: newAlert.alert_type,
          severity: newAlert.severity,
          ...(newAlert.related_campaign_id ? { related_campaign_id: newAlert.related_campaign_id } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setNewAlert({ title: "", body: "", alert_type: "scam_campaign", severity: "warning", related_campaign_id: "" });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setCreating(false);
    }
  }

  async function saveEdits(alert: PublicAlert) {
    const changes = editing[alert.id];
    if (!changes) return;
    setBusyId(alert.id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/public-alerts/${alert.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(changes),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setEditing((prev) => {
        const next = { ...prev };
        delete next[alert.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setBusyId(null);
    }
  }

  async function publish(alertId: string) {
    setBusyId(alertId);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/public-alerts/${alertId}/publish`, { method: "POST", headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setBusyId(null);
    }
  }

  const drafts = alerts.filter((a) => !a.published);
  const published = alerts.filter((a) => a.published);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
            {t("humanApprovalGate")}
          </div>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
            {t("publicAlerts")}
          </h1>
          <p className="mt-1 text-sm text-chekkam-muted">{t("publicAlertsAdminIntro")}</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} className="shrink-0">
          {showCreate ? t("cancel") : t("createNewAlert")}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={createAlert}
          className="flex flex-col gap-3 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm"
        >
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("title")}</span>
            <input required value={newAlert.title} onChange={(e) => setNewAlert((a) => ({ ...a, title: e.target.value }))} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("body")}</span>
            <textarea required rows={3} value={newAlert.body} onChange={(e) => setNewAlert((a) => ({ ...a, body: e.target.value }))} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-chekkam-muted">{t("alertType")}</span>
              <select value={newAlert.alert_type} onChange={(e) => setNewAlert((a) => ({ ...a, alert_type: e.target.value }))} className={inputClass}>
                {ALERT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-chekkam-muted">{t("severity")}</span>
              <select value={newAlert.severity} onChange={(e) => setNewAlert((a) => ({ ...a, severity: e.target.value }))} className={inputClass}>
                {SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("relatedCampaignOptional")}</span>
            <input value={newAlert.related_campaign_id} onChange={(e) => setNewAlert((a) => ({ ...a, related_campaign_id: e.target.value }))} placeholder="uuid" className={`${inputClass} font-[family-name:var(--font-data)]`} />
          </label>
          <Button type="submit" variant="solid" loading={creating} loadingText={t("creating")} className="mt-1 self-start">
            {t("createDraft")}
          </Button>
        </form>
      )}

      {error && <ErrorState message={error} />}
      {loading && <LoadingState message={t("loading")} />}

      <Section title={t("drafts")} count={drafts.length}>
        {drafts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            highlighted={alert.id === highlightId}
            field={field}
            setField={setField}
            onSave={saveEdits}
            onPublish={publish}
            busy={busyId === alert.id}
            hasEdits={!!editing[alert.id]}
          />
        ))}
        {!loading && drafts.length === 0 && <p className="text-sm text-chekkam-muted">{t("noDrafts")}</p>}
      </Section>

      <Section title={t("published")} count={published.length}>
        {published.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            highlighted={alert.id === highlightId}
            field={field}
            setField={setField}
            onSave={saveEdits}
            onPublish={publish}
            busy={busyId === alert.id}
            hasEdits={false}
          />
        ))}
        {!loading && published.length === 0 && <p className="text-sm text-chekkam-muted">{t("nothingPublished")}</p>}
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-chekkam-ink">{title}</h2>
        <span className="rounded-full bg-chekkam-tint px-2 py-0.5 text-xs font-semibold text-chekkam-muted">{count}</span>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function AlertCard({
  alert,
  highlighted,
  field,
  setField,
  onSave,
  onPublish,
  busy,
  hasEdits,
}: {
  alert: PublicAlert;
  highlighted: boolean;
  field: (alert: PublicAlert, key: keyof PublicAlert) => string;
  setField: (id: string, key: keyof PublicAlert, value: string) => void;
  onSave: (alert: PublicAlert) => void;
  onPublish: (id: string) => void;
  busy: boolean;
  hasEdits: boolean;
}) {
  const { lang, t } = useI18n();

  return (
    <div className={`rounded-[var(--radius-chekkam)] border bg-chekkam-surface-raised p-5 shadow-chekkam-sm ${highlighted ? "border-chekkam-primary ring-2 ring-chekkam-primary/15" : "border-chekkam-border"}`}>
      <div className="mb-3 flex items-center gap-2">
        <StatusBadge
          tone={alert.published ? "success" : "neutral"}
          label={
            alert.published
              ? `${t("published")} ${alert.published_at ? new Date(alert.published_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : ""}`
              : t("draft")
          }
        />
        <span className="text-xs text-chekkam-faint">{alert.alert_type}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLOR[alert.severity] ?? "bg-status-neutral/12 text-status-neutral"}`}>
          {alert.severity}
        </span>
      </div>

      <label className="mb-3 block">
        <span className="text-xs font-medium text-chekkam-muted">{t("title")}</span>
        <input value={field(alert, "title")} onChange={(e) => setField(alert.id, "title", e.target.value)} disabled={alert.published} className={inputClass} />
      </label>

      <label className="mb-4 block">
        <span className="text-xs font-medium text-chekkam-muted">{t("body")}</span>
        <textarea value={field(alert, "body")} onChange={(e) => setField(alert.id, "body", e.target.value)} disabled={alert.published} rows={3} className={inputClass} />
      </label>

      {!alert.published && (
        <div className="flex gap-2">
          <Button onClick={() => onSave(alert)} disabled={busy || !hasEdits} variant="outline" size="sm">
            {t("saveChanges")}
          </Button>
          <Button onClick={() => onPublish(alert.id)} loading={busy} loadingText={t("publishing")} size="sm">
            {t("publish")}
          </Button>
        </div>
      )}
    </div>
  );
}
