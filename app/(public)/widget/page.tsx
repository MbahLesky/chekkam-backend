"use client";

import { useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";
import { getVerifyStatusStyle } from "@/lib/verify-status-style";
import { StatusBadge, Button, type StatusTone } from "@/components/ui";

/**
 * The embeddable website widget (Task B, "Verify everywhere") — an
 * institution pastes a single <iframe src="/widget"> snippet into its own
 * site. Deliberately self-contained: no site header/nav, force-light so it
 * renders consistently regardless of the host page's theme, and a visible
 * "Powered by Chekkam" credit (this is a free, no-signing surface — the
 * document lifecycle's trust still lives entirely at chekkam.example, this
 * widget only reads it).
 *
 * Reuses the exact same engines as every other surface: /api/widget/check
 * (analyzeContent(), same free/IP-rate-limited pipeline as the extension)
 * and the existing public /api/documents/verify* routes (same verifyByUpload/
 * verifyByIdOrPin engine as web/mobile/bots), tagged with channel=widget so
 * institution-embed traffic is distinguishable in reports/analytics.
 */

type CheckResult = {
  risk_level?: "low" | "medium" | "high" | "critical";
  reasons?: string[];
  recommended_action?: string;
  source?: "ai" | "local_model" | "rule_based_fallback";
};

type VerifyResult = {
  status: "genuine" | "tampered" | "revoked" | "expired" | "not_found";
  institution?: string | null;
  document_type?: string;
  reason?: string | null;
};

const RISK_TONE: Record<string, StatusTone> = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

const SOURCE_LABEL_KEY: Record<string, "sourceAi" | "sourceLocalModel" | "sourceRuleBasedFallback"> = {
  ai: "sourceAi",
  local_model: "sourceLocalModel",
  rule_based_fallback: "sourceRuleBasedFallback",
};

export default function WidgetPage() {
  const { lang, t } = useI18n();
  const [tab, setTab] = useState<"check" | "verify">("check");

  // Check tab state
  const [contentType, setContentType] = useState<"text" | "link">("text");
  const [content, setContent] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Verify tab state
  const [verificationId, setVerificationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function handleCheckSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setCheckLoading(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const res = await fetch("/api/widget/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": lang },
        body: JSON.stringify({ content, type: contentType, language: lang }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setCheckResult(body as CheckResult);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setCheckLoading(false);
    }
  }

  async function handleVerifyIdSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = verificationId.trim();
    if (!trimmed) return;
    setVerifyLoading(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const res = await fetch(
        `/api/documents/verify/${encodeURIComponent(trimmed)}?channel=widget&lang=${lang}`,
        { headers: { "Accept-Language": lang } }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedVerifyDocument"));
      setVerifyResult(body as VerifyResult);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleVerifyUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setVerifyError(t("chooseFileToCheck"));
      return;
    }
    setVerifyLoading(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("channel", "widget");
      form.set("language", lang);
      if (verificationId.trim()) form.set("verification_id", verificationId.trim());
      const res = await fetch(`/api/documents/verify-upload?lang=${lang}`, {
        method: "POST",
        headers: { "Accept-Language": lang },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedVerifyDocument"));
      setVerifyResult(body as VerifyResult);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setVerifyLoading(false);
    }
  }

  const verifyStyle = verifyResult ? getVerifyStatusStyle(verifyResult.status, lang) : null;

  return (
    <div className="force-light flex min-h-screen w-full flex-col bg-chekkam-surface p-4 text-chekkam-ink">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-[family-name:var(--font-heading)] text-base font-bold text-chekkam-primary">
            Chekkam
          </span>
          <LanguageToggle />
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("check")}
            className={`flex-1 rounded-[var(--radius-chekkam-sm)] px-3 py-2 text-xs font-semibold transition ${
              tab === "check" ? "bg-chekkam-primary text-white" : "bg-chekkam-tint text-chekkam-muted hover:bg-chekkam-border"
            }`}
          >
            {t("widgetCheckTab")}
          </button>
          <button
            type="button"
            onClick={() => setTab("verify")}
            className={`flex-1 rounded-[var(--radius-chekkam-sm)] px-3 py-2 text-xs font-semibold transition ${
              tab === "verify" ? "bg-chekkam-primary text-white" : "bg-chekkam-tint text-chekkam-muted hover:bg-chekkam-border"
            }`}
          >
            {t("widgetVerifyTab")}
          </button>
        </div>

        {tab === "check" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-chekkam-muted">{t("widgetCheckIntro")}</p>
            <form onSubmit={handleCheckSubmit} className="flex flex-col gap-3">
              <div className="flex gap-2">
                {(["text", "link"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setContentType(type)}
                    className={`rounded-[var(--radius-chekkam-sm)] px-3 py-1 text-xs font-medium transition ${
                      contentType === type
                        ? "bg-chekkam-primary text-white"
                        : "bg-chekkam-tint text-chekkam-muted hover:bg-chekkam-border"
                    }`}
                  >
                    {type === "text" ? t("text") : t("link")}
                  </button>
                ))}
              </div>
              <textarea
                required
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={contentType === "link" ? "https://example.com/suspicious-link" : t("pasteMessageHere")}
                className="w-full rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-tint px-3 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20"
              />
              {checkError && <p className="text-xs text-status-danger">{checkError}</p>}
              <Button type="submit" loading={checkLoading} loadingText={t("analyzing")} className="w-full">
                {t("checkThis")}
              </Button>
            </form>

            {checkResult && (
              <div className="mt-2 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-4 shadow-chekkam-sm">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge
                    tone={(checkResult.risk_level && RISK_TONE[checkResult.risk_level]) || "neutral"}
                    label={
                      checkResult.risk_level
                        ? `${checkResult.risk_level.charAt(0).toUpperCase()}${checkResult.risk_level.slice(1)} risk`
                        : t("somethingWrong")
                    }
                  />
                  {checkResult.source && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-chekkam-faint">
                      {t(SOURCE_LABEL_KEY[checkResult.source])}
                    </span>
                  )}
                </div>
                {checkResult.reasons && checkResult.reasons.length > 0 && (
                  <ul className="mt-3 list-inside list-disc text-xs text-chekkam-muted">
                    {checkResult.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}
                {checkResult.recommended_action && (
                  <p className="mt-3 text-xs font-semibold text-chekkam-ink">{checkResult.recommended_action}</p>
                )}
                <p className="mt-3 rounded-[var(--radius-chekkam-sm)] bg-chekkam-tint p-2.5 text-[11px] text-chekkam-muted">
                  {t("automatedFirstLook")}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "verify" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-chekkam-muted">{t("widgetVerifyIntro")}</p>
            <form onSubmit={handleVerifyIdSubmit} className="flex flex-col gap-2">
              <input
                value={verificationId}
                onChange={(e) => setVerificationId(e.target.value)}
                placeholder="CHK-4F7K-9QRT"
                className="w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3 py-2 font-[family-name:var(--font-data)] text-sm text-chekkam-ink outline-none focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20"
              />
              <Button type="submit" size="sm" className="w-full">
                {t("lookUpById")}
              </Button>
            </form>

            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-chekkam-faint">
              <div className="h-px flex-1 bg-chekkam-border" />
              {t("orUploadFile")}
              <div className="h-px flex-1 bg-chekkam-border" />
            </div>

            <form onSubmit={handleVerifyUploadSubmit} className="flex flex-col gap-2">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-chekkam-muted file:mr-2 file:rounded-[var(--radius-chekkam-sm)] file:border-0 file:bg-chekkam-tint file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-chekkam-ink"
              />
              {verifyError && <p className="text-xs text-status-danger">{verifyError}</p>}
              <Button type="submit" variant="outline" size="sm" loading={verifyLoading} loadingText={t("checking")} className="w-full">
                {t("checkThisFile")}
              </Button>
            </form>

            {verifyResult && verifyStyle && (
              <div className="mt-2 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 text-center shadow-chekkam-sm">
                <div
                  className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${verifyStyle.gradient} text-xl text-white shadow-chekkam-md`}
                >
                  {verifyStyle.icon}
                </div>
                <h2 className="mt-3 font-[family-name:var(--font-heading)] text-lg font-semibold text-chekkam-ink">
                  {verifyStyle.label}
                </h2>
                <p className="mx-auto mt-1.5 max-w-xs text-xs text-chekkam-muted">{verifyStyle.guidance}</p>
                {verifyResult.institution && (
                  <p className="mt-2 text-xs text-chekkam-ink">
                    {t("issuedBy")} <span className="font-semibold">{verifyResult.institution}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <a
          href="https://chekkam-backend-production.up.railway.app"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 text-center text-[11px] font-medium text-chekkam-faint hover:text-chekkam-primary"
        >
          {t("poweredByChekkam")} ↗
        </a>
      </div>
    </div>
  );
}
