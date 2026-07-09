"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PublicAlert = {
  id: string;
  title: string;
  body: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  published_at: string | null;
};

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-blue-500/12 text-blue-700",
  warning: "bg-status-warning/12 text-status-warning",
  critical: "bg-status-danger/12 text-status-danger",
};

/** Citizen-facing public alerts (FR-090) — human-approved warnings, visible without an account. */
export default function PublicAlertsPage() {
  const [alerts, setAlerts] = useState<PublicAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public-alerts")
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body?.error?.message ?? "Failed to load alerts.");
        setAlerts(body.alerts as PublicAlert[]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <Link href="/" className="mb-6 text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
        ← Chekkam
      </Link>
      <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
        Reviewed by a human
      </div>
      <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
        Public alerts
      </h1>
      <p className="mt-2 text-sm text-chekkam-muted">
        Warnings about active scams and campaigns, published only after analyst review.
      </p>

      {error && <p className="mt-6 text-sm text-status-danger">{error}</p>}
      {loading && <p className="mt-6 text-sm text-chekkam-muted">Loading…</p>}

      <div className="mt-6 flex flex-col gap-4">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[alert.severity] ?? "bg-status-neutral/12 text-status-neutral"}`}
              >
                {alert.severity}
              </span>
              <span className="text-xs text-chekkam-faint">{alert.alert_type}</span>
              {alert.published_at && (
                <span className="text-xs text-chekkam-faint">
                  · {new Date(alert.published_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-chekkam-ink">
              {alert.title}
            </h2>
            <p className="mt-1.5 text-sm text-chekkam-muted">{alert.body}</p>
          </div>
        ))}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-chekkam-muted">No active alerts right now.</p>
        )}
      </div>

      <div className="mt-10 flex gap-4 text-sm">
        <Link href="/check" className="font-medium text-chekkam-primary hover:underline">
          Check a message →
        </Link>
        <Link href="/verify" className="font-medium text-chekkam-primary hover:underline">
          Verify a document →
        </Link>
      </div>
    </div>
  );
}
