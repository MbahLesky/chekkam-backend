"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button, StatusBadge, LoadingState, EmptyState, ErrorState, Card } from "@/components/ui";

type SignResult = {
  id: string;
  verification_id: string;
  pin_code: string;
  qr_payload: string;
  qr_image: string;
  status: string;
};

type Document = {
  id: string;
  institution_id: string;
  institution_name: string | null;
  document_type: string;
  recipient_name: string | null;
  status: "active" | "revoked";
  file_hash: string;
  signature: string;
  verification_id: string;
  pin_code: string | null;
  qr_payload: string;
  issued_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  expiry_date: string | null;
};

type SignableInstitution = {
  id: string;
  name: string;
  type: string | null;
  verified: boolean;
  status: "active" | "pending" | "suspended";
};

const inputClass =
  "w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20";

// Verification-label download is restricted to the same roles the API route enforces
// (institution_officer/admin/super_admin) - this is UI politeness, not the
// security boundary, which lives server-side in app/api/documents/[id]/verification-label.
const VERIFICATION_LABEL_ROLES = new Set(["institution_officer", "admin", "super_admin"]);

export default function DocumentsDashboardPage() {
  const { lang, t } = useI18n();
  const supabase = getSupabaseBrowser();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Document | null>(null);
  const [signResult, setSignResult] = useState<SignResult | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [labelLoadingId, setLabelLoadingId] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);

  const getAccessToken = useCallback(async (): Promise<string | undefined> => {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return session?.access_token;
  }, [supabase]);

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      "Accept-Language": lang,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, [supabase, lang]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => setRole(data?.role ?? null));
    });
  }, [supabase]);

  const canDownloadVerificationLabel = !!role && VERIFICATION_LABEL_ROLES.has(role);

  const downloadVerificationLabel = useCallback(
    async (doc: { id: string; verification_id: string }) => {
      setLabelLoadingId(doc.id);
      setLabelError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/documents/${doc.id}/verification-label?lang=${lang}`, { headers });
        if (!res.ok) {
          let message = t("failedDownloadVerificationLabel");
          try {
            const body = await res.json();
            message = body?.error?.message ?? message;
          } catch {
            // non-JSON error body; keep the generic message
          }
          throw new Error(message);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement("a");
        link.href = url;
        link.download = `Verification-Label-${doc.verification_id}.pdf`;
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        setLabelError(err instanceof Error ? err.message : t("failedDownloadVerificationLabel"));
      } finally {
        setLabelLoadingId(null);
      }
    },
    [authHeaders, lang, t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/documents?lang=${lang}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setDocuments(body.documents as Document[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, lang, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/language-change
    load();
  }, [load]);

  async function revoke(id: string, reason: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/documents/${id}/revoke?lang=${lang}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    }
  }

  async function restore(id: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/documents/${id}/restore?lang=${lang}`, {
        method: "POST",
        headers,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
            {t("documentRegistry")}
          </div>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
            {t("documents")}
          </h1>
          <p className="mt-1 text-sm text-chekkam-muted">{t("documentsIntro")}</p>
        </div>
        <SignDocumentPanel
          getAccessToken={getAccessToken}
          onSigned={(result) => {
            setSignResult(result);
            load();
          }}
        />
      </div>

      {error && <ErrorState message={error} />}
      {labelError && <ErrorState message={labelError} />}
      {loading && <LoadingState message={t("loading")} />}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-chekkam-tint text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
            <tr>
              <th className="px-4 py-3">{t("institution")}</th>
              <th className="px-4 py-3">{t("documentType")}</th>
              <th className="px-4 py-3">{t("recipient")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3 text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className="cursor-pointer border-t border-chekkam-border hover:bg-chekkam-tint/60"
                onClick={() => setSelected(doc)}
              >
                <td className="px-4 py-3 text-chekkam-ink">{doc.institution_name ?? "-"}</td>
                <td className="px-4 py-3 text-chekkam-ink">{doc.document_type}</td>
                <td className="px-4 py-3 text-chekkam-muted">{doc.recipient_name ?? "-"}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    tone={doc.status === "active" ? "success" : "neutral"}
                    label={doc.status === "active" ? t("active") : t("revoked")}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {canDownloadVerificationLabel && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadVerificationLabel(doc);
                        }}
                        disabled={labelLoadingId === doc.id}
                        className="text-xs font-semibold text-chekkam-primary hover:underline disabled:opacity-50"
                      >
                        {labelLoadingId === doc.id
                          ? t("preparingVerificationLabel")
                          : t("downloadVerificationLabel")}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(doc);
                      }}
                      className="text-xs font-semibold text-chekkam-primary hover:underline"
                    >
                      {t("viewDetails")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && documents.length === 0 && <EmptyState message={t("noDocuments")} />}
      </Card>

      {signResult && (
        <SignResultModal
          result={signResult}
          onClose={() => setSignResult(null)}
          onDownloadVerificationLabel={downloadVerificationLabel}
          labelLoading={labelLoadingId === signResult.id}
        />
      )}
      {selected && (
        <DocumentDetailModal
          document={selected}
          onClose={() => setSelected(null)}
          onRevoke={revoke}
          onRestore={restore}
        />
      )}
    </div>
  );
}

function SignDocumentPanel({
  getAccessToken,
  onSigned,
}: {
  getAccessToken: () => Promise<string | undefined>;
  onSigned: (result: SignResult) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [institutionId, setInstitutionId] = useState("");
  const [documentType, setDocumentType] = useState("certificate");
  const [recipientName, setRecipientName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [institutions, setInstitutions] = useState<SignableInstitution[]>([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadInstitutions() {
      setInstitutionsLoading(true);
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/institutions/mine", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
        const available = (body.institutions ?? []) as SignableInstitution[];
        if (cancelled) return;
        setInstitutions(available);
        setInstitutionId((current) =>
          current && available.some((institution) => institution.id === current)
            ? current
            : (available[0]?.id ?? "")
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("somethingWrong"));
      } finally {
        if (!cancelled) setInstitutionsLoading(false);
      }
    }
    void loadInstitutions();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, open, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institutionId) {
      setError(t("noSigningInstitution"));
      return;
    }
    if (!file) {
      setError(t("chooseFileToSign"));
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const form = new FormData();
      form.set("institution_id", institutionId);
      form.set("document_type", documentType);
      form.set("recipient_name", recipientName);
      if (expiryDate) form.set("expiry_date", expiryDate);
      form.set("file", file);

      const res = await fetch("/api/documents/sign", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedSignDocument"));
      onSigned(body as SignResult);
      setOpen(false);
      setInstitutionId("");
      setRecipientName("");
      setExpiryDate("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shrink-0">
      <Button onClick={() => setOpen((v) => !v)}>{open ? t("cancel") : t("signNewDocument")}</Button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-8 z-10 mt-3 flex w-96 flex-col gap-3 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-lg"
        >
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("signingInstitution")}</span>
            <select
              required
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              disabled={institutionsLoading || institutions.length === 0}
              className={`${inputClass} mt-1`}
            >
              <option value="">{institutionsLoading ? t("loading") : t("selectSigningInstitution")}</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}{institution.verified ? " — verified" : ""}
                </option>
              ))}
            </select>
            {!institutionsLoading && institutions.length === 0 && (
              <p className="mt-1 text-xs text-status-danger">{t("noSigningInstitution")}</p>
            )}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("documentType")}</span>
            <input required value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("recipientOptional")}</span>
            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("expiryDateOptional")}</span>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("documentFile")}</span>
            <input required type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm text-chekkam-muted file:mr-3 file:rounded-[var(--radius-chekkam-sm)] file:border-0 file:bg-chekkam-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-chekkam-ink" />
          </label>
          {error && <ErrorState message={error} />}
          <Button type="submit" variant="solid" loading={loading} loadingText={t("signing")}>
            {t("signDocument")}
          </Button>
        </form>
      )}
    </div>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-7 shadow-chekkam-lg">
        {children}
      </div>
    </div>
  );
}

function SignResultModal({
  result,
  onClose,
  onDownloadVerificationLabel,
  labelLoading,
}: {
  result: SignResult;
  onClose: () => void;
  onDownloadVerificationLabel: (doc: { id: string; verification_id: string }) => void;
  labelLoading: boolean;
}) {
  const { t } = useI18n();
  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-status-success">
        {t("signedSuccessfully")}
      </div>
      <div className="flex flex-col items-start gap-5 rounded-[var(--radius-chekkam)] bg-gradient-seal p-6 text-white sm:flex-row sm:items-center">
        <Image src={result.qr_image} alt={t("verificationId")} width={140} height={140} unoptimized className="h-32 w-32 rounded-[var(--radius-chekkam-sm)] bg-white p-2 shadow-chekkam-sm" />
        <dl className="text-sm">
          <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">{t("verificationId")}</dt>
          <dd className="mb-3 font-[family-name:var(--font-data)] text-base font-medium">{result.verification_id}</dd>
          <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">PIN</dt>
          <dd className="font-[family-name:var(--font-data)] text-base font-medium">{result.pin_code}</dd>
        </dl>
      </div>
      {/* Gate 1: the success state's one clear next action. */}
      <Button
        onClick={() => onDownloadVerificationLabel(result)}
        loading={labelLoading}
        loadingText={t("preparingVerificationLabel")}
        variant="solid"
        className="mt-5 w-full"
      >
        {t("downloadVerificationLabel")}
      </Button>
      <a
        href={result.qr_payload}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border px-4 py-2.5 text-center text-sm font-semibold text-chekkam-primary transition hover:bg-chekkam-tint"
      >
        Open public verification page
      </a>
      <p className="mt-2 text-center text-xs text-chekkam-faint">{t("verificationLabelHint")}</p>
      <Button onClick={onClose} variant="ghost" className="mt-3 w-full">
        {t("done")}
      </Button>
    </ModalShell>
  );
}

function DocumentDetailModal({
  document,
  onClose,
  onRevoke,
  onRestore,
}: {
  document: Document;
  onClose: () => void;
  onRevoke: (id: string, reason: string) => void;
  onRestore: (id: string) => void;
}) {
  const { lang, t } = useI18n();
  const [reason, setReason] = useState("");
  const locale = lang === "fr" ? "fr-FR" : "en-US";

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-chekkam-ink">
          {document.document_type}
        </h2>
        <StatusBadge
          tone={document.status === "active" ? "success" : "neutral"}
          label={document.status === "active" ? t("active") : t("revoked")}
        />
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <Row label={t("institution")} value={document.institution_name ?? "-"} />
        <Row label={t("recipient")} value={document.recipient_name ?? "-"} />
        <Row label={t("verificationId")} value={document.verification_id} mono />
        {document.pin_code && <Row label="PIN" value={document.pin_code} mono />}
        <Row label={t("fileHash")} value={document.file_hash} mono breakAll />
        <Row label={t("signature")} value={document.signature} mono breakAll />
        <Row label={t("issued")} value={new Date(document.issued_at).toLocaleString(locale)} />
        {document.expiry_date && (
          <Row label={t("expires")} value={new Date(document.expiry_date).toLocaleDateString(locale)} />
        )}
        {document.revoked_at && <Row label={t("revoked")} value={new Date(document.revoked_at).toLocaleString(locale)} />}
        {document.revocation_reason && <Row label={t("revocationReason")} value={document.revocation_reason} />}
      </dl>

      {document.status === "active" ? (
        <div className="mt-5 border-t border-chekkam-border pt-5">
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("reasonForRevoking")}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("revokePlaceholder")} className={`${inputClass} mt-1`} />
          </label>
          <Button onClick={() => onRevoke(document.id, reason)} disabled={!reason.trim()} variant="danger" className="mt-3">
            {t("revokeDocument")}
          </Button>
        </div>
      ) : (
        <div className="mt-5 border-t border-chekkam-border pt-5">
          <Button onClick={() => onRestore(document.id)} variant="success">
            {t("restoreDocument")}
          </Button>
        </div>
      )}

      <Button onClick={onClose} variant="ghost" className="mt-5 w-full">
        {t("close")}
      </Button>
    </ModalShell>
  );
}

function Row({
  label,
  value,
  mono,
  breakAll,
}: {
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-chekkam-faint">{label}</dt>
      <dd className={`text-chekkam-ink ${mono ? "font-[family-name:var(--font-data)] text-xs" : "text-sm"} ${breakAll ? "break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
