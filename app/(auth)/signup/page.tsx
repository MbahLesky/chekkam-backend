"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { useI18n } from "@/components/i18n-provider";

const INSTITUTION_TYPES = [
  { value: "ministry", en: "Ministry", fr: "Ministère" },
  { value: "exam_board", en: "Exam board", fr: "Office d'examen" },
  { value: "school", en: "School", fr: "École" },
  { value: "university", en: "University", fr: "Université" },
  { value: "company", en: "Company", fr: "Entreprise" },
  { value: "ngo", en: "NGO", fr: "ONG" },
  { value: "media", en: "Media", fr: "Média" },
  { value: "civil_registry", en: "Civil registry", fr: "État civil" },
  { value: "other", en: "Other", fr: "Autre" },
];

const inputClass =
  "w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20";

export default function SignupPage() {
  const { lang, t } = useI18n();
  const [institutionName, setInstitutionName] = useState("");
  const [institutionType, setInstitutionType] = useState("school");
  const [officerName, setOfficerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": lang },
        body: JSON.stringify({
          institution_name: institutionName,
          institution_type: institutionType,
          officer_name: officerName,
          email,
          password,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message ?? t("somethingWrong"));
      }
      setSuccessMessage(body.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  if (successMessage) {
    return (
      <AuthShell eyebrow={t("institutionRegistration")} title={t("registered")}>
        <p className="text-sm text-chekkam-muted">{successMessage}</p>
        <Link href="/login" className="mt-5 inline-block text-sm font-semibold text-chekkam-primary hover:underline">
          {t("backToSignIn")} →
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("institutionRegistration")}
      title={t("registerTitle")}
      subtitle={t("registerSubtitle")}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">{t("institutionName")}</span>
          <input required value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">{t("institutionType")}</span>
          <select required value={institutionType} onChange={(e) => setInstitutionType(e.target.value)} className={inputClass}>
            {INSTITUTION_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type[lang]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">{t("yourName")}</span>
          <input required value={officerName} onChange={(e) => setOfficerName(e.target.value)} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">{t("email")}</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">{t("password")}</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-4 py-2.5 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? t("registering") : t("registerInstitutionAction")}
        </button>

        <Link href="/login" className="text-center text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
          {t("alreadyHaveAccount")}
        </Link>
      </form>
    </AuthShell>
  );
}
