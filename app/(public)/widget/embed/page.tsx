"use client";

import { useState } from "react";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui";

/**
 * "Get the embed code" — the copy-paste snippet page for Task B. One global
 * widget serves every institution identically (no per-institution key or
 * config needed, since the widget only ever calls the same free/anonymous
 * engine every citizen surface already uses), so this is a public docs-style
 * page rather than something gated behind institution login.
 */
const ORIGIN = "https://chekkam-backend-production.up.railway.app";

export default function WidgetEmbedPage() {
  const { t } = useI18n();
  const [width, setWidth] = useState(380);
  const [height, setHeight] = useState(560);
  const [copied, setCopied] = useState(false);

  const snippet = `<iframe
  src="${ORIGIN}/widget"
  width="${width}"
  height="${height}"
  style="border:0;border-radius:16px;max-width:100%;"
  title="Chekkam verification widget"
></iframe>`;

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="force-light flex min-h-full flex-1 flex-col bg-chekkam-surface px-6 py-16 text-chekkam-ink">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/pricing" className="text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
            ← {t("backChekkam")}
          </Link>
          <LanguageToggle />
        </div>

        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">Verify everywhere</div>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
          Embed Chekkam on your institution&apos;s website
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-chekkam-muted">
          One snippet gives your visitors the same free message check and document verification
          citizens already get on chekkam&apos;s own site — no account, no API key, no per-institution
          setup. Paste it anywhere on your page.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
          <div>
            <div className="flex flex-wrap gap-4">
              <label className="text-sm">
                <span className="block font-medium text-chekkam-ink">Width (px)</span>
                <input
                  type="number"
                  min={280}
                  max={800}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value) || 380)}
                  className="mt-1 w-28 rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3 py-1.5 text-sm outline-none focus:border-chekkam-primary"
                />
              </label>
              <label className="text-sm">
                <span className="block font-medium text-chekkam-ink">Height (px)</span>
                <input
                  type="number"
                  min={400}
                  max={900}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value) || 560)}
                  className="mt-1 w-28 rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3 py-1.5 text-sm outline-none focus:border-chekkam-primary"
                />
              </label>
            </div>

            <div className="mt-4 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-ink p-4">
              <pre className="overflow-x-auto text-xs text-white">
                <code>{snippet}</code>
              </pre>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopy} className="mt-3">
              {copied ? "Copied!" : "Copy snippet"}
            </Button>

            <div className="mt-8 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm">
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-chekkam-ink">
                What it does and doesn&apos;t do
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-chekkam-muted">
                <li>Reuses the exact same analyzeContent() and document-verification engine as chekkam&apos;s own web/mobile/bot surfaces — no second implementation, no different result.</li>
                <li>Free citizen-tier check, rate-limited by visitor IP — no signup, no API key, nothing to configure per institution.</li>
                <li>Runs entirely inside the iframe on chekkam&apos;s own origin, so it always matches Chekkam&apos;s current brand and stays current automatically — no rebuild needed on your side when Chekkam ships an update.</li>
                <li>Cannot sign or revoke documents — that stays a privileged, authenticated action for verified institution officers only.</li>
                <li>Every result still says a Chekkam analyst reviews reports before any public action — the widget never presents an AI result as final.</li>
              </ul>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">Live preview</div>
            <div className="mt-2 flex justify-center rounded-[var(--radius-chekkam)] border border-dashed border-chekkam-border bg-chekkam-tint p-4">
              <iframe
                src="/widget"
                width={Math.min(width, 380)}
                height={height}
                style={{ border: 0, borderRadius: 16, maxWidth: "100%" }}
                title="Chekkam verification widget preview"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
