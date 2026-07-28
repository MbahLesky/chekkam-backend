"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button, Card, EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui";

const SOURCE_TYPES = [
  "website",
  "facebook_page",
  "twitter_account",
  "telegram_channel",
  "youtube_channel",
  "tiktok_account",
  "instagram_account",
] as const;

type TrustedSource = {
  id: string;
  institution_id: string | null;
  institution_name: string | null;
  name: string;
  type: string;
  value: string;
  verified: boolean;
  created_at: string;
};

type Institution = { id: string; name: string };

const inputClass =
  "w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20";

/**
 * Admin-only source registry. This is the human verification gate that makes
 * a BBC/CRTV/social-account source match meaningful for citizen media checks.
 */
export default function TrustedSourcesDashboardPage() {
  const { lang, t } = useI18n();
  const supabase = getSupabaseBrowser();
  const [sources, setSources] = useState<TrustedSource[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof SOURCE_TYPES)[number]>("website");
  const [value, setValue] = useState("");
  const [institutionId, setInstitutionId] = useState("");

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      "Accept-Language": lang,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, [lang, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const [sourceResponse, institutionResponse] = await Promise.all([
        fetch(`/api/trusted-sources?lang=${lang}`, { headers }),
        fetch(`/api/institutions?lang=${lang}`, { headers }),
      ]);
      const sourceBody = await sourceResponse.json();
      if (!sourceResponse.ok) {
        throw new Error(sourceBody?.error?.message ?? t("somethingWrong"));
      }
      const institutionBody = await institutionResponse.json();
      setSources((sourceBody.sources ?? []) as TrustedSource[]);
      if (institutionResponse.ok) {
        setInstitutions((institutionBody.institutions ?? []) as Institution[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, lang, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when auth/language changes.
    void load();
  }, [load]);

  async function addSource(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/trusted-sources?lang=${lang}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          type,
          value,
          institution_id: institutionId || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setName("");
      setType("website");
      setValue("");
      setInstitutionId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setSaving(false);
    }
  }

  async function removeSource(source: TrustedSource) {
    if (!window.confirm(`Remove ${source.name} from official-source matching?`)) return;
    setError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/trusted-sources/${encodeURIComponent(source.id)}?lang=${lang}`, {
        method: "DELETE",
        headers,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">Source registry</div>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">Verified publisher sources</h1>
        <p className="mt-1 max-w-3xl text-sm text-chekkam-muted">
          Add only accounts and domains you have independently verified. A match confirms where a shared link was published; it does not prove every claim in a post or video.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-chekkam-ink">Verify a new source</h2>
        <form onSubmit={addSource} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Publisher or account name</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-1`} placeholder="CRTV News" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Source type</span>
            <select value={type} onChange={(event) => setType(event.target.value as (typeof SOURCE_TYPES)[number])} className={`${inputClass} mt-1`}>
              {SOURCE_TYPES.map((sourceType) => <option key={sourceType} value={sourceType}>{sourceType.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-chekkam-muted">Canonical public URL</span>
            <input required type="url" value={value} onChange={(event) => setValue(event.target.value)} className={`${inputClass} mt-1`} placeholder="https://www.tiktok.com/@crtv" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Linked Chekkam organisation (optional)</span>
            <select value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} className={`${inputClass} mt-1`}>
              <option value="">No linked organisation</option>
              {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" loading={saving} loadingText="Verifying source">Verify source</Button>
          </div>
        </form>
      </Card>

      {error && <ErrorState message={error} />}
      {loading ? <LoadingState message={t("loading")} /> : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-chekkam-tint text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-t border-chekkam-border">
                  <td className="px-4 py-3 text-chekkam-ink"><div className="font-medium">{source.name}</div><div className="text-xs text-chekkam-faint">{source.type.replaceAll("_", " ")}</div></td>
                  <td className="max-w-xs truncate px-4 py-3"><a href={source.value} target="_blank" rel="noreferrer" className="text-chekkam-primary hover:underline">{source.value}</a></td>
                  <td className="px-4 py-3 text-chekkam-muted">{source.institution_name ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge tone={source.verified ? "success" : "neutral"} label={source.verified ? "Verified" : "Not verified"} /></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => removeSource(source)} className="text-xs font-semibold text-status-danger hover:underline">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sources.length === 0 && <EmptyState message="No verified sources yet." />}
        </Card>
      )}
    </div>
  );
}
