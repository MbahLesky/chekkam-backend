"use client";

import { useState } from "react";
import Link from "next/link";

type ReportResult = {
  id: string;
  status: string;
  risk_level?: "low" | "medium" | "high" | "critical";
  risk_score?: number;
  category?: string;
  ai_reasons?: string[];
  recommended_action?: string;
  confidence?: string;
};

const RISK_LABEL: Record<string, { label: string; className: string }> = {
  low: { label: "Low risk", className: "bg-status-success/12 text-status-success" },
  medium: { label: "Medium risk", className: "bg-status-warning/12 text-status-warning" },
  high: { label: "High risk", className: "bg-status-danger/12 text-status-danger" },
  critical: { label: "Critical risk", className: "bg-status-danger/12 text-status-danger" },
};

/**
 * Citizen-facing "check a message" page (FR-010-012) — the web equivalent of
 * the Flutter app's report form, so anyone can test the core loop from a
 * browser with no install. Anonymous submission is allowed by design (FR-005).
 */
export default function CheckPage() {
  const [contentType, setContentType] = useState<"text" | "link">("text");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const submitRes = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: contentType, raw_content: content, channel: "web" }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitted?.error?.message ?? "Failed to submit.");

      const detailRes = await fetch(`/api/reports/${submitted.id}`);
      const detail = await detailRes.json();
      if (!detailRes.ok) throw new Error(detail?.error?.message ?? "Failed to load result.");
      setResult(detail as ReportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const risk = result?.risk_level ? RISK_LABEL[result.risk_level] : null;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-6 text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
        ← Chekkam
      </Link>
      <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
        Check a message
      </div>
      <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
        Got something suspicious?
      </h1>
      <p className="mt-2 text-sm text-chekkam-muted">
        Paste a suspicious message or link. This never means you did anything wrong by receiving it.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div className="flex gap-2">
          {(["text", "link"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setContentType(t)}
              className={`rounded-[var(--radius-chekkam-sm)] px-4 py-1.5 text-sm font-medium transition ${
                contentType === t
                  ? "bg-chekkam-primary text-white"
                  : "bg-chekkam-tint text-chekkam-muted hover:bg-chekkam-border"
              }`}
            >
              {t === "text" ? "Text" : "Link"}
            </button>
          ))}
        </div>
        <textarea
          required
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            contentType === "link" ? "https://example.com/suspicious-link" : "Paste the message here…"
          }
          className="w-full rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-tint px-4 py-3 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20"
        />
        {error && <p className="text-sm text-status-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-4 py-2.5 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Analyzing…" : "Check this"}
        </button>
      </form>

      {result && (
        <div className="mt-8 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-md">
          {risk ? (
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${risk.className}`}>
              {risk.label}
            </span>
          ) : (
            <span className="inline-block rounded-full bg-status-neutral/12 px-3 py-1 text-sm font-semibold text-status-neutral">
              Pending review
            </span>
          )}
          <p className="mt-4 font-[family-name:var(--font-heading)] text-xl font-semibold text-chekkam-ink">
            {result.recommended_action ?? "This report is queued for review — check back shortly."}
          </p>
          {result.ai_reasons && result.ai_reasons.length > 0 && (
            <ul className="mt-4 list-inside list-disc text-sm text-chekkam-muted">
              {result.ai_reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-chekkam-sm)] bg-chekkam-tint p-4">
            <span className="text-chekkam-primary">ⓘ</span>
            <p className="text-sm text-chekkam-muted">
              This is an automated first look. A Chekkam analyst reviews every report before any final
              action is taken.
            </p>
          </div>
        </div>
      )}

      <div className="mt-10 flex gap-4 text-sm">
        <Link href="/verify" className="font-medium text-chekkam-primary hover:underline">
          Verify a document →
        </Link>
        <Link href="/alerts" className="font-medium text-chekkam-primary hover:underline">
          See public alerts →
        </Link>
      </div>
    </div>
  );
}
