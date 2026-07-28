"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type DocumentAssessment = {
  mode: "registry_verification" | "trust_report";
  is_proof: boolean;
  registry: VerifyResult;
  status: "genuine" | "tampered" | "revoked" | "expired" | "not_found" | "not_in_registry" | "external_signature_verified" | "signals_of_concern";
  signals: Array<{ layer: string; nature: string; result: string; detail: string }>;
  recommended_action: string;
};

export default function VerifyHubPage() {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [verificationId, setVerificationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<DocumentAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = verificationId.trim();
    if (!trimmed) return;
    router.push(`/verify/${encodeURIComponent(trimmed)}`);
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(t("chooseFileToCheck"));
      return;
    }
    setLoading(true);
    setError(null);
    setUploadResult(null);

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("channel", "web");
      form.set("language", lang);
      if (verificationId.trim()) form.set("verification_id", verificationId.trim());

      const res = await fetch(`/api/documents/assess?lang=${lang}`, {
        method: "POST",
        headers: { "Accept-Language": lang },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedVerifyDocument"));
      setUploadResult(body as DocumentAssessment);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  const registryResult = uploadResult?.mode === "registry_verification" ? uploadResult.registry : null;
  const style = registryResult ? getVerifyStatusStyle(registryResult.status, lang) : null;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
          ← {t("backChekkam")}
        </Link>
        <LanguageToggle />
      </div>
      <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
        {t("verifyDocument")}
      </div>
      <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
        {t("checkGenuine")}
      </h1>
      <p className="mt-2 text-sm text-chekkam-muted">{t("verifyIntro")}</p>

      <form
        onSubmit={handleManualSubmit}
        className="mt-6 flex flex-col gap-3 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm"
      >
        <label className="block">
          <span className="text-sm font-medium text-chekkam-ink">{t("verificationIdOrPin")}</span>
          <input
            value={verificationId}
            onChange={(e) => setVerificationId(e.target.value)}
            placeholder="CHK-4F7K-9QRT or 482915"
            className="mt-1.5 w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 font-[family-name:var(--font-data)] text-sm text-chekkam-ink outline-none focus:border-chekkam-primary focus:bg-chekkam-surface focus:ring-2 focus:ring-chekkam-primary/20"
          />
        </label>
        <button
          type="submit"
          className="rounded-[var(--radius-chekkam-sm)] bg-gradient-hero px-4 py-2.5 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110"
        >
          {t("lookUpById")}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
        <div className="h-px flex-1 bg-chekkam-border" />
        {t("orUploadFile")}
        <div className="h-px flex-1 bg-chekkam-border" />
      </div>

      <form
        onSubmit={handleUploadSubmit}
        className="flex flex-col gap-3 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm"
      >
        <label className="block">
          <span className="text-sm font-medium text-chekkam-ink">{t("documentFile")}</span>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1.5 w-full text-sm text-chekkam-muted file:mr-3 file:rounded-[var(--radius-chekkam-sm)] file:border-0 file:bg-chekkam-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-chekkam-ink"
          />
        </label>
        <p className="text-xs text-chekkam-faint">
          For an exact Genuine/Tampered result, upload the original digital file. A photo, screenshot, or re-scan has different bytes; use its QR or verification ID to check the issuer.
        </p>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-[var(--radius-chekkam-sm)] border border-chekkam-primary px-4 py-2.5 text-sm font-semibold text-chekkam-primary transition hover:bg-chekkam-tint disabled:opacity-60"
        >
          {loading ? t("checking") : t("checkThisFile")}
        </button>
      </form>

      {registryResult && style && (
        <div className="mt-8 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-8 text-center shadow-chekkam-md">
          <div
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${style.gradient} text-3xl text-white shadow-chekkam-lg`}
          >
            {style.icon}
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
            {style.label}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-chekkam-muted">{style.guidance}</p>
          {registryResult.institution && (
            <p className="mt-3 text-sm text-chekkam-ink">
              {t("issuedBy")} <span className="font-semibold">{registryResult.institution}</span>
            </p>
          )}
          {registryResult.institution && (
            <p className="mt-1 text-xs text-chekkam-muted">
              {registryResult.institution_verified ? "Issuing organisation verified by Chekkam" : "Issuing organisation is not independently verified by Chekkam"}
            </p>
          )}
        </div>
      )}

      {uploadResult?.mode === "trust_report" && (
        <div className="mt-8 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-8 shadow-chekkam-md">
          <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">Document trust report</div>
          <h2 className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
            {uploadResult.status === "external_signature_verified"
              ? "External PDF signature is intact"
              : uploadResult.status === "signals_of_concern"
                ? "Signals of concern"
                : "Not in the Chekkam registry"}
          </h2>
          <p className="mt-2 text-sm text-chekkam-muted">
            {uploadResult.status === "external_signature_verified"
              ? "The PDF’s embedded signature is intact, but its issuer is not yet verified in Chekkam’s registry."
              : uploadResult.status === "signals_of_concern"
                ? "A deterministic signature issue was found. Do not rely on this document until the issuer provides a fresh copy."
                : "This is not proof that the document is false. Chekkam cannot cryptographically prove it from our registry."}
          </p>
          <div className="mt-5 space-y-3">
            {uploadResult.signals.map((signal) => (
              <div key={`${signal.layer}-${signal.result}`} className="rounded-[var(--radius-chekkam-sm)] bg-chekkam-tint p-3 text-sm">
                <p className="font-semibold text-chekkam-ink">{signal.layer.replaceAll("_", " ")} · {signal.nature} check</p>
                <p className="mt-1 text-chekkam-muted">{signal.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm font-semibold text-chekkam-ink">{uploadResult.recommended_action}</p>
        </div>
      )}

      <div className="mt-10 flex gap-4 text-sm">
        <Link href="/check" className="font-medium text-chekkam-primary hover:underline">
          {t("checkMessage")} →
        </Link>
        <Link href="/alerts" className="font-medium text-chekkam-primary hover:underline">
          {t("seePublicAlerts")} →
        </Link>
      </div>
    </div>
  );
}
