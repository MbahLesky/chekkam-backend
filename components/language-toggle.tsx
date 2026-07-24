"use client";

import { useI18n } from "@/components/i18n-provider";
import type { Lang } from "@/lib/i18n";

export function LanguageToggle({
  className = "",
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  const { lang, setLang, t } = useI18n();
  const options: Array<{ value: Lang; label: string }> = [
    { value: "en", label: "EN" },
    { value: "fr", label: "FR" },
  ];

  return (
    <div
      aria-label={t("switchLabel")}
      className={`inline-flex rounded-[var(--radius-chekkam-sm)] border p-0.5 text-xs font-semibold ${
        dark ? "border-white/20 bg-white/10 text-white" : "border-chekkam-border bg-chekkam-tint text-chekkam-muted"
      } ${className}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLang(option.value)}
          className={`rounded-[calc(var(--radius-chekkam-sm)-2px)] px-2.5 py-1 transition ${
            lang === option.value
              ? dark
                ? "bg-white text-chekkam-lagoon"
                : "bg-chekkam-primary text-white"
              : dark
                ? "text-white/70 hover:text-white"
                : "hover:text-chekkam-primary"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
