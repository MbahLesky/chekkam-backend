"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button, StatusBadge, LoadingState, ErrorState, EmptyState, Card } from "@/components/ui";
import type { StatusTone } from "@/components/ui";

type BulkVerifyRow = {
  row: number;
  verification_id_attempted: string;
  status: "genuine" | "tampered" | "revoked" | "expired" | "not_found";
  institution?: string | null;
  document_type?: string;
  recipient_name?: string | null;
};

type BulkJob = {
  id: string;
  total_items: number;
  processed_items: number;
  status: string;
  results: BulkVerifyRow[];
  created_at: string;
  completed_at: string | null;
};

const STATUS_TONE: Record<BulkVerifyRow["status"], StatusTone> = {
  genuine: "success",
  tampered: "danger",
  revoked: "neutral",
  expired: "warning",
  not_found: "neutral",
};

/**
 * Dashboard UI for POST /api/enterprise/bulk-verify (FR-110). The endpoint
 * has existed since this session's Task 6 with no UI reachable without
 * curl — this closes that gap. Reuses the exact same API the partner-facing
 * X-Api-Key path calls; this page just authenticates with the staff session
 * instead, per the route's dual-auth design.
 */
export default function BulkVerifyPage() {
  const { t } = useI18n();
  const supabase = getSupabaseBrowser();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<BulkJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function statusLabel(status: BulkVerifyRow["status"]): string {
    switch (status) {
      case "genuine":
        return t("genuine");
      case "tampered":
        return t("tampered");
      case "revoked":
        return t("revoked");
      case "expired":
        return t("expired");
      case "not_found":
        return t("notFound");
    }
  }

  async function runVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(t("chooseFileToVerify"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const form = new FormData();
      form.set("file", file);

      const res = await fetch("/api/enterprise/bulk-verify", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedBulkVerify"));
      setJob(body as BulkJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!job) return;
    const header = ["row", "verification_id_attempted", "status", "institution", "document_type", "recipient_name"];
    const lines = [
      header.join(","),
      ...job.results.map((r) =>
        [r.row, r.verification_id_attempted, r.status, r.institution ?? "", r.document_type ?? "", r.recipient_name ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chekkam-bulk-verify-${job.id}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
          {t("overview")}
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          {t("bulkVerification")}
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">{t("bulkVerificationIntro")}</p>
      </div>

      <Card className="p-5">
        <form onSubmit={runVerification} className="flex flex-col gap-3">
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("uploadCsvOrText")}</span>
            <input
              required
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-chekkam-muted file:mr-3 file:rounded-[var(--radius-chekkam-sm)] file:border-0 file:bg-chekkam-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-chekkam-ink"
            />
          </label>
          {error && <ErrorState message={error} />}
          <Button type="submit" variant="solid" loading={loading} loadingText={t("runningVerification")} className="self-start">
            {t("runVerification")}
          </Button>
        </form>
      </Card>

      {loading && <LoadingState message={t("runningVerification")} />}

      {job && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-chekkam-border p-4">
            <p className="text-sm text-chekkam-muted">
              <span className="font-semibold text-chekkam-ink">{job.processed_items}</span> / {job.total_items}{" "}
              {t("jobSummary")}
            </p>
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              {t("downloadResultsCsv")}
            </Button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-chekkam-tint text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
              <tr>
                <th className="px-4 py-3">{t("row")}</th>
                <th className="px-4 py-3">{t("idOrPinAttempted")}</th>
                <th className="px-4 py-3">{t("result")}</th>
                <th className="px-4 py-3">{t("institution")}</th>
                <th className="px-4 py-3">{t("documentType")}</th>
              </tr>
            </thead>
            <tbody>
              {job.results.map((r) => (
                <tr key={r.row} className="border-t border-chekkam-border">
                  <td className="px-4 py-3 text-chekkam-faint">{r.row}</td>
                  <td className="px-4 py-3 font-[family-name:var(--font-data)] text-xs text-chekkam-ink">
                    {r.verification_id_attempted}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={STATUS_TONE[r.status]} label={statusLabel(r.status)} />
                  </td>
                  <td className="px-4 py-3 text-chekkam-ink">{r.institution ?? "-"}</td>
                  <td className="px-4 py-3 text-chekkam-muted">{r.document_type ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!job && !loading && <EmptyState message={t("noBulkJobsYet")} />}
    </div>
  );
}
