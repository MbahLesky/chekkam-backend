"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VERIFY_STATUS_STYLE } from "@/lib/verify-status-style";

type VerifyResult = {
  status: "genuine" | "tampered" | "revoked" | "not_found";
  institution?: string | null;
  document_type?: string;
  verification_id?: string;
  reason?: string;
};

/**
 * Public web verification fallback for people without the Flutter app
 * (FR-044, SRS 3.2). Mirrors the mobile app's "seal moment" verify result —
 * one focal badge, one verdict word, nothing else competing for attention.
 */
export default function VerifyPage() {
  const params = useParams<{ verificationId: string }>();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/documents/verify/${encodeURIComponent(params.verificationId)}?channel=web`
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? "Verification failed.");
        setResult(body as VerifyResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [params.verificationId]);

  const style = result ? VERIFY_STATUS_STYLE[result.status] : null;

  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-surface px-4 py-16">
      <div className="w-full max-w-md rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-9 text-center shadow-chekkam-md">
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
          Document verification
        </div>
        <p className="mt-2 break-all font-[family-name:var(--font-data)] text-xs text-chekkam-faint">
          {params.verificationId}
        </p>

        {loading && <p className="mt-8 text-sm text-chekkam-muted">Checking…</p>}
        {error && <p className="mt-8 text-sm text-status-danger">{error}</p>}

        {result && style && (
          <div className="mt-7">
            <div
              className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${style.gradient} text-4xl text-white shadow-chekkam-lg`}
            >
              {style.icon}
            </div>
            <h1 className="mt-5 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
              {style.label}
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-chekkam-muted">{style.guidance}</p>

            {result.institution && (
              <div className="mt-6 rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint p-4 text-left text-sm">
                <Row label="Issued by" value={result.institution} />
                {result.document_type && <Row label="Document type" value={result.document_type} />}
                {result.reason && <Row label="Reason" value={result.reason} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-chekkam-faint">{label}</span>
      <span className="font-medium text-chekkam-ink">{value}</span>
    </div>
  );
}
