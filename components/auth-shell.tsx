"use client";

import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-full flex-1 bg-chekkam-surface">
      <div className="hidden w-[38%] flex-col justify-between bg-gradient-lagoon p-10 text-white lg:flex">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm">
              ✓
            </span>
            <span className="font-[family-name:var(--font-heading)] text-lg font-semibold">Chekkam</span>
          </div>
          <LanguageToggle dark />
        </div>
        <div>
          <p className="font-[family-name:var(--font-heading)] text-3xl font-medium italic leading-tight text-white/95">
            {t("authSideTagline")}
          </p>
          <p className="mt-4 max-w-xs text-sm text-white/60">{t("authSideBody")}</p>
        </div>
        <p className="text-xs text-white/40">{t("staffDashboard")}</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-5 flex justify-end lg:hidden">
            <LanguageToggle />
          </div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
            {eyebrow}
          </div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-chekkam-muted">{subtitle}</p>}
          <div className="mt-7 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-7 shadow-chekkam-md">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
