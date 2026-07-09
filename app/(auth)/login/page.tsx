"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { AuthShell } from "@/components/auth-shell";

const DEMO_ADMIN_EMAIL = "admin@chekkam.demo";
const DEMO_ADMIN_PASSWORD = "ChekkamDemo123!";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!supabase) {
    return (
      <AuthShell eyebrow="Setup needed" title="Supabase isn't configured yet">
        <p className="text-sm text-chekkam-muted">
          Set <code className="font-[family-name:var(--font-data)] text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-[family-name:var(--font-data)] text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
          <code className="font-[family-name:var(--font-data)] text-xs">.env.local</code>, then restart the dev server.
        </p>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <AuthShell eyebrow="Staff access" title="Sign in to Chekkam" subtitle="For analysts, institution officers, and admins.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20"
          />
        </label>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-4 py-2.5 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <Link href="/signup" className="text-center text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
          Register your institution
        </Link>
      </form>

      <div className="mt-5 rounded-[var(--radius-chekkam-sm)] border border-dashed border-chekkam-border bg-chekkam-tint p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
          Prototype — open for testing
        </p>
        <p className="mt-1.5 text-xs text-chekkam-muted">
          This is a live account with full admin access, seeded for anyone reviewing the prototype.
        </p>
        <p className="mt-2 font-[family-name:var(--font-data)] text-xs text-chekkam-ink">
          {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail(DEMO_ADMIN_EMAIL);
            setPassword(DEMO_ADMIN_PASSWORD);
          }}
          className="mt-2 text-xs font-semibold text-chekkam-primary hover:underline"
        >
          Fill in demo credentials
        </button>
      </div>
    </AuthShell>
  );
}
