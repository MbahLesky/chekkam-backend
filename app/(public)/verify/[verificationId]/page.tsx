"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";
import { getVerifyStatusStyle } from "@/lib/verify-status-style";

type VerifyResult = {
  status: "genuine" | "tampered" | "revoked" | "expired" | "not_found";
  institution?: string | null;
  institution_verified?: boolean;
  document_type?: string;
  verification_id?: string;
  reason?: string;
};

export default function VerifyPage() {
  const { lang, t } = useI18n();
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
          `/api/documents/verify/${encodeURIComponent(params.verificationId)}?channel=web&lang=${lang}`,
          { headers: { "Accept-Language": lang } }
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? t("verificationFailed"));
        setResult(body as VerifyResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("somethingWrong"));
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [lang, params.verificationId, t]);

  const style = result ? getVerifyStatusStyle(result.status, lang) : null;

  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-surface px-4 py-16">
      <div className="w-full max-w-md rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-9 text-center shadow-chekkam-md">
        <div className="mb-5 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
          {t("documentVerification")}
        </div>
        <p className="mt-2 break-all font-[family-name:var(--font-data)] text-xs text-chekkam-faint">
          {params.verificationId}
        </p>

        {loading && <p className="mt-8 text-sm text-chekkam-muted">{t("checking")}</p>}
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
                <Row label={t("issuedBy")} value={result.institution} />
                <Row
                  label={result.institution_verified ? t("institutionVerified") : t("institutionNotVerified")}
                  value={result.institution_verified ? "✓" : "—"}
                />
                {result.document_type && <Row label={t("documentType")} value={result.document_type} />}
                {result.reason && <Row label={t("reason")} value={result.reason} />}
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
