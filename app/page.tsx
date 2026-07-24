"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden bg-gradient-lagoon px-6 py-24 text-center text-white">
        <LanguageToggle dark className="absolute right-5 top-5" />
        <div className="relative mx-auto max-w-2xl">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/12 text-3xl shadow-chekkam-lg">
            ✓
          </span>
          <h1 className="mt-7 font-[family-name:var(--font-heading)] text-5xl font-semibold tracking-tight">
            Chekkam
          </h1>
          <p className="mt-3 font-[family-name:var(--font-heading)] text-xl italic text-chekkam-bright">
            {t("homeTagline")}
          </p>
          <p className="mx-auto mt-6 max-w-md text-white/70">{t("homeSummary")}</p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-6 py-14 sm:grid-cols-3">
        <ActionCard
          href="/check"
          eyebrow={t("citizens")}
          title={t("checkMessage")}
          detail={t("checkMessageDetail")}
          action={t("tryIt")}
        />
        <ActionCard
          href="/verify"
          eyebrow={t("citizens")}
          title={t("verifyDocument")}
          detail={t("verifyDocumentDetail")}
          action={t("tryIt")}
        />
        <ActionCard
          href="/alerts"
          eyebrow={t("citizens")}
          title={t("publicAlerts")}
          detail={t("publicAlertsDetail")}
          action={t("tryIt")}
        />
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16">
        <div className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm sm:flex sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
              {t("institutionsAnalysts")}
            </div>
            <p className="mt-1 text-sm text-chekkam-muted">{t("staffSummary")}</p>
          </div>
          <div className="mt-4 flex shrink-0 gap-3 sm:mt-0">
            <Link
              href="/login"
              className="rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-5 py-2 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110"
            >
              {t("staffSignIn")}
            </Link>
            <Link
              href="/signup"
              className="rounded-[var(--radius-chekkam-sm)] border border-chekkam-primary px-5 py-2 text-sm font-semibold text-chekkam-primary transition hover:bg-chekkam-tint"
            >
              {t("registerInstitution")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ActionCard({
  href,
  eyebrow,
  title,
  detail,
  action,
}: {
  href: string;
  eyebrow: string;
  title: string;
  detail: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm transition hover:shadow-chekkam-md"
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">{eyebrow}</div>
      <h2 className="mt-2 font-[family-name:var(--font-heading)] text-lg font-semibold text-chekkam-ink">
        {title}
      </h2>
      <p className="mt-2 text-sm text-chekkam-muted">{detail}</p>
      <span className="mt-4 inline-block text-sm font-semibold text-chekkam-primary transition group-hover:translate-x-0.5">
        {action} →
      </span>
    </Link>
  );
}
