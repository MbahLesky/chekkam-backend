"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n, type I18nKey } from "@/components/i18n-provider";

type Institution = {
  id: string;
  name: string;
  type: string;
  verified: boolean;
  status: string;
};

type InstitutionDetail = Institution & {
  contact_email?: string | null;
  contact_phone?: string | null;
  verified_domains?: string[];
};

const TYPE_OPTIONS = [
  "ministry",
  "exam_board",
  "school",
  "university",
  "company",
  "ngo",
  "media",
  "civil_registry",
  "manufacturer",
  "hospital",
  "bank",
  "telecom_operator",
  "council",
  "court",
  "police",
  "gendarmerie",
  "other",
] as const;

const TYPE_KEYS: Record<(typeof TYPE_OPTIONS)[number], I18nKey> = {
  ministry: "typeMinistry",
  exam_board: "typeExamBoard",
  school: "typeSchool",
  university: "typeUniversity",
  company: "typeCompany",
  ngo: "typeNgo",
  media: "typeMedia",
  civil_registry: "typeCivilRegistry",
  manufacturer: "typeManufacturer",
  hospital: "typeHospital",
  bank: "typeBank",
  telecom_operator: "typeTelecomOperator",
  council: "typeCouncil",
  court: "typeCourt",
  police: "typePolice",
  gendarmerie: "typeGendarmerie",
  other: "typeOther",
};

export default function InstitutionDirectoryPage() {
  const { lang, t } = useI18n();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ lang });
    if (query.trim()) params.set("q", query.trim());
    if (type) params.set("type", type);
    if (verifiedOnly) params.set("verified", "true");

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-filter-change
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/institutions?${params.toString()}`, {
        headers: { "Accept-Language": lang },
        signal: controller.signal,
      })
        .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
        .then(({ ok, body }) => {
          if (!ok) throw new Error(body?.error?.message ?? t("failedLoadInstitutions"));
          setInstitutions(body.institutions as Institution[]);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : t("somethingWrong"));
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lang, query, type, verifiedOnly, t]);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    try {
      const res = await fetch(`/api/institutions/${id}?lang=${lang}`, {
        headers: { "Accept-Language": lang },
      });
      const body = await res.json();
      if (res.ok) setDetail(body as InstitutionDetail);
    } catch {
      // Best-effort detail expansion — the collapsed row already showed enough.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
          ← {t("backChekkam")}
        </Link>
        <LanguageToggle />
      </div>
      <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
        {t("citizens")}
      </div>
      <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
        {t("institutionDirectory")}
      </h1>
      <p className="mt-2 text-sm text-chekkam-muted">{t("institutionDirectoryIntro")}</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchInstitutions")}
          className="flex-1 rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none focus:border-chekkam-primary focus:bg-chekkam-surface focus:ring-2 focus:ring-chekkam-primary/20"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3 py-2.5 text-sm text-chekkam-ink outline-none focus:border-chekkam-primary"
        >
          <option value="">{t("allTypes")}</option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(TYPE_KEYS[opt])}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-chekkam-muted">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />
          {t("verifiedOnly")}
        </label>
      </div>

      {error && <p className="mt-6 text-sm text-status-danger">{error}</p>}
      {loading && <p className="mt-6 text-sm text-chekkam-muted">{t("loading")}</p>}

      <div className="mt-6 flex flex-col gap-3">
        {institutions.map((inst) => (
          <div
            key={inst.id}
            className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm"
          >
            <button
              type="button"
              onClick={() => toggleExpand(inst.id)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <h2 className="font-[family-name:var(--font-heading)] text-base font-semibold text-chekkam-ink">
                  {inst.name}
                </h2>
                <p className="mt-0.5 text-xs text-chekkam-faint">
                  {t(TYPE_KEYS[inst.type as keyof typeof TYPE_KEYS] ?? "typeOther")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  inst.verified
                    ? "bg-status-success/12 text-status-success"
                    : "bg-status-neutral/12 text-status-neutral"
                }`}
              >
                {inst.verified ? t("verifiedBadge") : t("unverifiedBadge")}
              </span>
            </button>

            {expandedId === inst.id && detail && (
              <div className="mt-4 flex flex-col gap-1.5 border-t border-chekkam-border pt-4 text-sm">
                {detail.contact_email && (
                  <p>
                    <span className="text-chekkam-faint">{t("contactEmail")}: </span>
                    <span className="text-chekkam-ink">{detail.contact_email}</span>
                  </p>
                )}
                {detail.contact_phone && (
                  <p>
                    <span className="text-chekkam-faint">{t("contactPhone")}: </span>
                    <span className="text-chekkam-ink">{detail.contact_phone}</span>
                  </p>
                )}
                {detail.verified_domains && detail.verified_domains.length > 0 && (
                  <p>
                    <span className="text-chekkam-faint">{t("officialDomains")}: </span>
                    <span className="font-[family-name:var(--font-data)] text-chekkam-ink">
                      {detail.verified_domains.join(", ")}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && institutions.length === 0 && (
          <p className="text-sm text-chekkam-muted">{t("noInstitutionsFound")}</p>
        )}
      </div>

      <div className="mt-10 flex gap-4 text-sm">
        <Link href="/check" className="font-medium text-chekkam-primary hover:underline">
          {t("checkMessage")} →
        </Link>
        <Link href="/verify" className="font-medium text-chekkam-primary hover:underline">
          {t("verifyDocument")} →
        </Link>
      </div>
    </div>
  );
}
