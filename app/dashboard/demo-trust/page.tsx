"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button, StatusBadge, LoadingState, ErrorState, Card } from "@/components/ui";

type DemoSummary = {
  institution: {
    id: string;
    name: string;
    verified: boolean;
    status: string;
    contact_email: string | null;
    domain: string | null;
  } | null;
  genuine: {
    verification_id: string;
    status: string;
    file_hash: string;
    issued_at: string;
    verify_url: string;
    download_url: string;
  } | null;
  revoked: {
    verification_id: string;
    status: string;
    file_hash: string;
    issued_at: string;
    revoked_at: string | null;
    revocation_reason: string | null;
    verify_url: string;
    download_url: string;
  } | null;
  tampered: { file_name: string; updated_at: string; download_url: string } | null;
  unregistered: { file_name: string; updated_at: string; download_url: string } | null;
};

/**
 * Protected "Demo Trust Kit" page (admin/analyst only) — download the four
 * fictional documents that prove GENUINE/TAMPERED/REVOKED/NOT_FOUND against
 * the real Chekkam verification engine. Data comes from
 * scripts/seed-demo-trust.ts; run it first if any card below shows "not
 * generated yet."
 */
export default function DemoTrustPage() {
  const supabase = getSupabaseBrowser();
  const [summary, setSummary] = useState<DemoSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/demo-trust", { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Something went wrong.");
      setSummary(body as DemoSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, [load]);

  const download = useCallback(
    async (key: string, url: string, filename: string) => {
      setDownloadingKey(key);
      setDownloadError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? "Download failed.");
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Download failed.");
      } finally {
        setDownloadingKey(null);
      }
    },
    [authHeaders]
  );

  if (loading) return <LoadingState message="Loading demo trust kit..." />;
  if (error) return <ErrorState message={error} />;
  if (!summary) return null;

  const notGeneratedYet = !summary.genuine || !summary.revoked || !summary.tampered || !summary.unregistered;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
          Document verification demo kit
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          Demo Trust Kit
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          Four fictional documents proving Genuine, Tampered, Revoked, and Not Found against the
          real Chekkam verification engine — no real institution, person, or credential involved.
        </p>
      </div>

      {downloadError && <ErrorState message={downloadError} />}

      {notGeneratedYet && (
        <Card className="p-5">
          <p className="text-sm text-chekkam-ink">
            Not all demo files have been generated yet. Run{" "}
            <code className="rounded bg-chekkam-tint px-1.5 py-0.5 font-[family-name:var(--font-data)] text-xs">
              DEMO_SEED_ENABLED=true npm run seed:demo-trust
            </code>{" "}
            from <code className="font-[family-name:var(--font-data)] text-xs">chekkam-backend/</code>, then reload this page.
          </p>
        </Card>
      )}

      {summary.institution && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-chekkam-ink">{summary.institution.name}</div>
              <div className="text-xs text-chekkam-muted">
                {summary.institution.domain} · {summary.institution.contact_email}
              </div>
            </div>
            <StatusBadge
              tone={summary.institution.verified ? "success" : "neutral"}
              label={summary.institution.verified ? "Verified" : "Unverified"}
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {summary.genuine && (
          <DemoCard
            title="1. Genuine"
            tone="success"
            statusLabel="Active"
            fields={[
              ["Verification ID", summary.genuine.verification_id],
              ["SHA-256", summary.genuine.file_hash],
              ["Issued", new Date(summary.genuine.issued_at).toLocaleDateString()],
            ]}
            verifyUrl={summary.genuine.verify_url}
            onDownload={() => download("genuine", summary.genuine!.download_url, `${summary.genuine!.verification_id}.pdf`)}
            downloading={downloadingKey === "genuine"}
          />
        )}
        {summary.revoked && (
          <DemoCard
            title="2. Revoked"
            tone="neutral"
            statusLabel="Revoked"
            fields={[
              ["Verification ID", summary.revoked.verification_id],
              ["Reason", summary.revoked.revocation_reason ?? "—"],
              [
                "Revoked",
                summary.revoked.revoked_at ? new Date(summary.revoked.revoked_at).toLocaleDateString() : "—",
              ],
            ]}
            verifyUrl={summary.revoked.verify_url}
            onDownload={() => download("revoked", summary.revoked!.download_url, `${summary.revoked!.verification_id}.pdf`)}
            downloading={downloadingKey === "revoked"}
          />
        )}
        {summary.tampered && (
          <DemoCard
            title="3. Tampered"
            tone="danger"
            statusLabel="Test copy"
            fields={[
              ["File", summary.tampered.file_name],
              ["Refers to", summary.genuine?.verification_id ?? "the genuine document"],
              ["Note", "Never re-signed or re-registered after the edit"],
            ]}
            onDownload={() => download("tampered", summary.tampered!.download_url, summary.tampered!.file_name)}
            downloading={downloadingKey === "tampered"}
          />
        )}
        {summary.unregistered && (
          <DemoCard
            title="4. Unregistered"
            tone="neutral"
            statusLabel="Never submitted"
            fields={[
              ["File", summary.unregistered.file_name],
              ["Note", "Never hashed, signed, or inserted into the registry"],
            ]}
            onDownload={() =>
              download("unregistered", summary.unregistered!.download_url, summary.unregistered!.file_name)
            }
            downloading={downloadingKey === "unregistered"}
          />
        )}
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-chekkam-ink">Two-minute demonstration</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm text-chekkam-muted">
          <li>Download Genuine, upload it at <Link href="/verify" className="text-chekkam-primary underline">/verify</Link> → Genuine.</li>
          <li>Download Tampered, upload it → Tampered (fingerprint mismatch), same institution/ID shown.</li>
          <li>Download Revoked, upload or look up its ID → Revoked, with the reason.</li>
          <li>Download Unregistered, upload it → Not found (not the same as fake).</li>
        </ol>
      </Card>
    </div>
  );
}

function DemoCard({
  title,
  tone,
  statusLabel,
  fields,
  verifyUrl,
  onDownload,
  downloading,
}: {
  title: string;
  tone: "success" | "danger" | "neutral" | "warning";
  statusLabel: string;
  fields: [string, string][];
  verifyUrl?: string;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-chekkam-ink">{title}</h3>
        <StatusBadge tone={tone} label={statusLabel} />
      </div>
      <dl className="flex flex-col gap-1 text-xs">
        {fields.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="shrink-0 text-chekkam-faint">{label}</dt>
            <dd className="truncate text-right font-[family-name:var(--font-data)] text-chekkam-ink" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-1 flex gap-2">
        <Button size="sm" variant="outline" onClick={onDownload} loading={downloading} loadingText="Downloading..." className="flex-1">
          Download
        </Button>
        {verifyUrl && (
          <a
            href={verifyUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center rounded-[var(--radius-chekkam-sm)] border border-chekkam-border px-3 py-1.5 text-xs font-semibold text-chekkam-muted transition hover:bg-chekkam-tint"
          >
            Public page
          </a>
        )}
      </div>
    </Card>
  );
}
