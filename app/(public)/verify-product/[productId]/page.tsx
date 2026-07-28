"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";
import { getProductVerifyStatusStyle } from "@/lib/verify-product-status-style";

type ProductVerifyResult = {
  status: "authentic" | "counterfeit" | "expired" | "recalled" | "stolen" | "unknown";
  institution?: string | null;
  product_name?: string;
  category?: string;
  product_code?: string;
  batch_number?: string | null;
  manufactured_at?: string | null;
  expiry_date?: string | null;
  reason?: string | null;
};

export default function VerifyProductPage() {
  const { lang, t } = useI18n();
  const params = useParams<{ productId: string }>();
  const [result, setResult] = useState<ProductVerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/products/verify/${encodeURIComponent(params.productId)}?channel=web&lang=${lang}`,
          { headers: { "Accept-Language": lang } }
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? t("verificationFailed"));
        setResult(body as ProductVerifyResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("somethingWrong"));
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [lang, params.productId, t]);

  const style = result ? getProductVerifyStatusStyle(result.status, lang) : null;

  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-surface px-4 py-16">
      <div className="w-full max-w-md rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-9 text-center shadow-chekkam-md">
        <div className="mb-5 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
          {t("productVerification")}
        </div>
        <p className="mt-2 break-all font-[family-name:var(--font-data)] text-xs text-chekkam-faint">
          {params.productId}
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

            {(result.institution || result.product_name) && (
              <div className="mt-6 rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint p-4 text-left text-sm">
                {result.institution && <Row label={t("issuedBy")} value={result.institution} />}
                {result.product_name && <Row label={t("productName")} value={result.product_name} />}
                {result.category && <Row label={t("category")} value={result.category} />}
                {result.batch_number && <Row label={t("batchNumber")} value={result.batch_number} />}
                {result.expiry_date && <Row label={t("expiresOn")} value={result.expiry_date} />}
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
