import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden bg-gradient-lagoon px-6 py-24 text-center text-white">
        <div className="relative mx-auto max-w-2xl">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/12 text-3xl shadow-chekkam-lg">
            ✓
          </span>
          <h1 className="mt-7 font-[family-name:var(--font-heading)] text-5xl font-semibold tracking-tight">
            Chekkam
          </h1>
          <p className="mt-3 font-[family-name:var(--font-heading)] text-xl italic text-chekkam-bright">
            One check. Total trust.
          </p>
          <p className="mx-auto mt-6 max-w-md text-white/70">
            Check a suspicious message, verify an official document, or see human-reviewed public
            alerts — free, right here, no app install needed.
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-6 py-14 sm:grid-cols-3">
        <ActionCard
          href="/check"
          eyebrow="Citizens"
          title="Check a message"
          detail="Paste a suspicious text or link and get an AI risk result, reviewed by a human analyst."
        />
        <ActionCard
          href="/verify"
          eyebrow="Citizens"
          title="Verify a document"
          detail="Enter a verification ID/PIN or upload the file — works even for a forwarded scan."
        />
        <ActionCard
          href="/alerts"
          eyebrow="Citizens"
          title="Public alerts"
          detail="See warnings about active scams and campaigns, published only after review."
        />
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16">
        <div className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm sm:flex sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
              Institutions &amp; analysts
            </div>
            <p className="mt-1 text-sm text-chekkam-muted">
              Sign official documents with a cryptographic seal, review reports, and publish alerts —
              every action requires a human before anything reaches the public.
            </p>
          </div>
          <div className="mt-4 flex shrink-0 gap-3 sm:mt-0">
            <Link
              href="/login"
              className="rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-5 py-2 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110"
            >
              Staff sign-in
            </Link>
            <Link
              href="/signup"
              className="rounded-[var(--radius-chekkam-sm)] border border-chekkam-primary px-5 py-2 text-sm font-semibold text-chekkam-primary transition hover:bg-chekkam-tint"
            >
              Register an institution
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
}: {
  href: string;
  eyebrow: string;
  title: string;
  detail: string;
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
        Try it →
      </span>
    </Link>
  );
}
