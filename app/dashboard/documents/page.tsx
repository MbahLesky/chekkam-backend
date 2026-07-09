"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
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

/**
 * Document signing & registry (SRS FR-040-047, §3.7). Institution officers
 * see and sign only their own institution's documents; analysts/admins see
 * everything. Sign here, then verify from the Flutter app's scan/PIN screen
 * or the public /verify page — same engine, no duplication.
 */
export default function DocumentsDashboardPage() {
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

  async function authHeaders() {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/documents", { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load documents.");
      setDocuments(body.documents as Document[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, [load]);

  async function revoke(id: string, reason: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/documents/${id}/revoke`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to revoke document.");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
            Document registry
          </div>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
            Documents
          </h1>
          <p className="mt-1 text-sm text-chekkam-muted">
            Sign, revoke, and look up every document your institution has issued.
          </p>
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
      {loading && <p className="text-sm text-chekkam-muted">Loading…</p>}

      <div className="overflow-hidden rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised shadow-chekkam-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-chekkam-tint text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
            <tr>
              <th className="px-4 py-3">Institution</th>
              <th className="px-4 py-3">Document type</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className="cursor-pointer border-t border-chekkam-border hover:bg-chekkam-tint/60"
                onClick={() => setSelected(doc)}
              >
                <td className="px-4 py-3 text-chekkam-ink">{doc.institution_name ?? "—"}</td>
                <td className="px-4 py-3 text-chekkam-ink">{doc.document_type}</td>
                <td className="px-4 py-3 text-chekkam-muted">{doc.recipient_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      doc.status === "active"
                        ? "bg-status-success/12 text-status-success"
                        : "bg-status-neutral/12 text-status-neutral"
                    }`}
                  >
                    {doc.status === "active" ? "Active" : "Revoked"}
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
                    View details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && documents.length === 0 && (
          <p className="p-6 text-center text-sm text-chekkam-muted">
            No documents yet — sign one above to get started.
          </p>
        )}
      </div>

      {signResult && <SignResultModal result={signResult} onClose={() => setSignResult(null)} />}
      {selected && (
        <DocumentDetailModal document={selected} onClose={() => setSelected(null)} onRevoke={revoke} />
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
      setError("Choose a file to sign.");
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
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to sign document.");
      onSigned(body as SignResult);
      setOpen(false);
      setInstitutionId("");
      setRecipientName("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
        {open ? "Cancel" : "Sign new document"}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-8 z-10 mt-3 flex w-96 flex-col gap-3 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-lg"
        >
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Institution ID (uuid)</span>
            <input
              required
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              placeholder="a1c2d3e4-...."
              className={`${inputClass} mt-1 font-[family-name:var(--font-data)]`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Document type</span>
            <input
              required
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Recipient name (optional)</span>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Document file</span>
            <input
              required
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-chekkam-muted file:mr-3 file:rounded-[var(--radius-chekkam-sm)] file:border-0 file:bg-chekkam-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-chekkam-ink"
            />
          </label>
          {error && <p className="text-sm text-status-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-[var(--radius-chekkam-sm)] bg-chekkam-primary px-4 py-2 text-sm font-semibold text-white shadow-chekkam-sm disabled:opacity-60"
          >
            {loading ? "Signing…" : "Sign document"}
          </button>
        </form>
      )}
    </div>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-7 shadow-chekkam-lg"
      >
        {children}
      </div>
    </div>
  );
}

function SignResultModal({ result, onClose }: { result: SignResult; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-status-success">
        Signed successfully
      </div>
      <div className="flex flex-col items-start gap-5 rounded-[var(--radius-chekkam)] bg-gradient-seal p-6 text-white sm:flex-row sm:items-center">
        <Image
          src={result.qr_image}
          alt="Verification QR code"
          width={140}
          height={140}
          unoptimized
          className="h-32 w-32 rounded-[var(--radius-chekkam-sm)] bg-white p-2 shadow-chekkam-sm"
        />
        <dl className="text-sm">
          <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">Verification ID</dt>
          <dd className="mb-3 font-[family-name:var(--font-data)] text-base font-medium">
            {result.verification_id}
          </dd>
          <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">PIN</dt>
          <dd className="font-[family-name:var(--font-data)] text-base font-medium">{result.pin_code}</dd>
        </dl>
      </div>
      <button
        onClick={onClose}
        className="mt-5 w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-primary px-4 py-2 text-sm font-semibold text-chekkam-primary"
      >
        Done
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
  const [reason, setReason] = useState("");

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-chekkam-ink">
          {document.document_type}
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            document.status === "active"
              ? "bg-status-success/12 text-status-success"
              : "bg-status-neutral/12 text-status-neutral"
          }`}
        >
          {document.status === "active" ? "Active" : "Revoked"}
        </span>
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <Row label="Institution" value={document.institution_name ?? "—"} />
        <Row label="Recipient" value={document.recipient_name ?? "—"} />
        <Row label="Verification ID" value={document.verification_id} mono />
        {document.pin_code && <Row label="PIN" value={document.pin_code} mono />}
        <Row label="File hash (SHA-256)" value={document.file_hash} mono breakAll />
        <Row label="Signature" value={document.signature} mono breakAll />
        <Row label="Issued" value={new Date(document.issued_at).toLocaleString()} />
        {document.revoked_at && (
          <Row label="Revoked" value={new Date(document.revoked_at).toLocaleString()} />
        )}
        {document.revocation_reason && <Row label="Revocation reason" value={document.revocation_reason} />}
      </dl>

      {document.status === "active" && (
        <div className="mt-5 border-t border-chekkam-border pt-5">
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">Reason for revoking</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. issued in error"
              className={`${inputClass} mt-1`}
            />
          </label>
          <button
            onClick={() => onRevoke(document.id, reason)}
            disabled={!reason.trim()}
            className="mt-3 rounded-[var(--radius-chekkam-sm)] bg-status-danger px-4 py-2 text-sm font-semibold text-white shadow-chekkam-sm disabled:opacity-50"
          >
            Revoke document
          </button>
        </div>
      )}

      <button
        onClick={onClose}
        className="mt-5 w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border px-4 py-2 text-sm font-semibold text-chekkam-muted"
      >
        Close
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
      <dd
        className={`text-chekkam-ink ${mono ? "font-[family-name:var(--font-data)] text-xs" : "text-sm"} ${breakAll ? "break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
