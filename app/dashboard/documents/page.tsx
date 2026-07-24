"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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
};

const inputClass =
  "w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20";

export default function DocumentsDashboardPage() {
  const { lang, t } = useI18n();
  const supabase = getSupabaseBrowser();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Document | null>(null);
  const [signResult, setSignResult] = useState<SignResult | null>(null);

  async function getAccessToken(): Promise<string | undefined> {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return session?.access_token;
  }

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

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading && <p className="text-sm text-chekkam-muted">{t("loading")}</p>}

      <div className="overflow-hidden rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised shadow-chekkam-sm">
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
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      doc.status === "active"
                        ? "bg-status-success/12 text-status-success"
                        : "bg-status-neutral/12 text-status-neutral"
                    }`}
                  >
                    {doc.status === "active" ? t("active") : t("revoked")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(doc);
                    }}
                    className="text-xs font-semibold text-chekkam-primary hover:underline"
                  >
                    {t("viewDetails")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && documents.length === 0 && (
          <p className="p-6 text-center text-sm text-chekkam-muted">{t("noDocuments")}</p>
        )}
      </div>

      {signResult && <SignResultModal result={signResult} onClose={() => setSignResult(null)} />}
      {selected && <DocumentDetailModal document={selected} onClose={() => setSelected(null)} onRevoke={revoke} />}
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
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-4 py-2 text-sm font-semibold text-white shadow-chekkam-sm"
      >
        {open ? t("cancel") : t("signNewDocument")}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-8 z-10 mt-3 flex w-96 flex-col gap-3 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-lg"
        >
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("institutionId")}</span>
            <input required value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} placeholder="a1c2d3e4-...." className={`${inputClass} mt-1 font-[family-name:var(--font-data)]`} />
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
            <span className="text-xs font-medium text-chekkam-muted">{t("documentFile")}</span>
            <input required type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm text-chekkam-muted file:mr-3 file:rounded-[var(--radius-chekkam-sm)] file:border-0 file:bg-chekkam-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-chekkam-ink" />
          </label>
          {error && <p className="text-sm text-status-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-[var(--radius-chekkam-sm)] bg-chekkam-primary px-4 py-2 text-sm font-semibold text-white shadow-chekkam-sm disabled:opacity-60"
          >
            {loading ? t("signing") : t("signDocument")}
          </button>
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

function SignResultModal({ result, onClose }: { result: SignResult; onClose: () => void }) {
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
      <button onClick={onClose} className="mt-5 w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-primary px-4 py-2 text-sm font-semibold text-chekkam-primary">
        {t("done")}
      </button>
    </ModalShell>
  );
}

function DocumentDetailModal({
  document,
  onClose,
  onRevoke,
}: {
  document: Document;
  onClose: () => void;
  onRevoke: (id: string, reason: string) => void;
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
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            document.status === "active" ? "bg-status-success/12 text-status-success" : "bg-status-neutral/12 text-status-neutral"
          }`}
        >
          {document.status === "active" ? t("active") : t("revoked")}
        </span>
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <Row label={t("institution")} value={document.institution_name ?? "-"} />
        <Row label={t("recipient")} value={document.recipient_name ?? "-"} />
        <Row label={t("verificationId")} value={document.verification_id} mono />
        {document.pin_code && <Row label="PIN" value={document.pin_code} mono />}
        <Row label={t("fileHash")} value={document.file_hash} mono breakAll />
        <Row label={t("signature")} value={document.signature} mono breakAll />
        <Row label={t("issued")} value={new Date(document.issued_at).toLocaleString(locale)} />
        {document.revoked_at && <Row label={t("revoked")} value={new Date(document.revoked_at).toLocaleString(locale)} />}
        {document.revocation_reason && <Row label={t("revocationReason")} value={document.revocation_reason} />}
      </dl>

      {document.status === "active" && (
        <div className="mt-5 border-t border-chekkam-border pt-5">
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("reasonForRevoking")}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("revokePlaceholder")} className={`${inputClass} mt-1`} />
          </label>
          <button onClick={() => onRevoke(document.id, reason)} disabled={!reason.trim()} className="mt-3 rounded-[var(--radius-chekkam-sm)] bg-status-danger px-4 py-2 text-sm font-semibold text-white shadow-chekkam-sm disabled:opacity-50">
            {t("revokeDocument")}
          </button>
        </div>
      )}

      <button onClick={onClose} className="mt-5 w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border px-4 py-2 text-sm font-semibold text-chekkam-muted">
        {t("close")}
      </button>
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
