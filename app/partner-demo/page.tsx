"use client";

import { useState } from "react";

/**
 * Standalone partner demo consumer app (FR-092). Deliberately NOT styled
 * with Chekkam's components/ui or brand tokens — the whole point is to
 * show the verification engine embedded inside a third-party product's own
 * look, not another Chekkam-branded screen. Both forms call
 * app/api/partner-demo-proxy/*, which hold PARTNER_DEMO_API_KEY server-side
 * and forward to the real public /v1/partner/* endpoints — the browser
 * never sees the key.
 */
export default function PartnerDemoPage() {
  return (
    <div className="min-h-screen bg-[#f4f1ea] font-serif text-[#1a2332]">
      <header className="border-b-4 border-[#c9a227] bg-[#1e3a5f] px-6 py-5 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <div className="text-xl font-bold tracking-wide">Yaoundé Metropolitan University</div>
            <div className="text-sm text-[#c9a227]">Admissions Verification Desk</div>
          </div>
          <span className="rounded border border-white/30 px-2.5 py-1 text-xs uppercase tracking-wider text-white/70">
            Demo integration
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <p className="text-sm text-[#4a4a4a]">
          This page is a fictional third-party product used only to demonstrate the Chekkam
          Partner API. Every result below is fetched server-side through a real{" "}
          <code className="rounded bg-[#e8e0cc] px-1 py-0.5 text-xs">X-Api-Key</code>-authenticated
          call to <code className="rounded bg-[#e8e0cc] px-1 py-0.5 text-xs">/api/v1/partner/*</code> —
          nothing here is mocked.
        </p>

        <MessageCheckPanel />
        <DocumentCheckPanel />
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-[#c9bfa0] bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-bold text-[#1e3a5f]">{title}</h2>
      {children}
    </section>
  );
}

function RawJsonPanel({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-[#1e3a5f] underline"
      >
        {open ? "Hide raw API response" : "Show raw API response"}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded bg-[#1a2332] p-3 text-xs text-[#e8e0cc]">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function MessageCheckPanel() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/partner-demo-proxy/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Something went wrong.");
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel title="Check an applicant message">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <textarea
          required
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste a suspicious message an applicant forwarded to admissions..."
          className="w-full rounded border border-[#c9bfa0] bg-[#faf8f2] px-3 py-2 text-sm outline-none focus:border-[#1e3a5f]"
        />
        <button
          type="submit"
          disabled={loading}
          className="self-start rounded bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Checking..." : "Check message"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-[#8b2020]">{error}</p>}
      {result && (
        <div className="mt-4 rounded border border-[#c9bfa0] bg-[#faf8f2] p-3 text-sm">
          <p>
            <span className="font-semibold">Risk level:</span> {String(result.risk_level)} (
            {String(result.risk_score)}/100)
          </p>
          <p className="mt-1">
            <span className="font-semibold">Category:</span> {String(result.category)}
          </p>
          <p className="mt-1">{String(result.recommended_action)}</p>
          <RawJsonPanel data={result} />
        </div>
      )}
    </Panel>
  );
}

function DocumentCheckPanel() {
  const [verificationId, setVerificationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!verificationId && !file) {
      setError("Enter a verification ID or choose a file.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (verificationId) form.set("verification_id", verificationId);
      if (file) form.set("file", file);
      const res = await fetch("/api/partner-demo-proxy/document-check", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Something went wrong.");
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel title="Verify a submitted certificate">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-[#4a4a4a]">Verification ID or PIN</span>
          <input
            value={verificationId}
            onChange={(e) => setVerificationId(e.target.value)}
            placeholder="CHK-XXXX-XXXX"
            className="mt-1 w-full rounded border border-[#c9bfa0] bg-[#faf8f2] px-3 py-2 text-sm font-mono outline-none focus:border-[#1e3a5f]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[#4a4a4a]">or upload the file</span>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="self-start rounded bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Verifying..." : "Verify document"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-[#8b2020]">{error}</p>}
      {result && (
        <div className="mt-4 rounded border border-[#c9bfa0] bg-[#faf8f2] p-3 text-sm">
          <p>
            <span className="font-semibold">Status:</span> {String(result.status)}
          </p>
          <RawJsonPanel data={result} />
        </div>
      )}
    </Panel>
  );
}
