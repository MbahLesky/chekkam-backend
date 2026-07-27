import Link from "next/link";

/**
 * DRAFT privacy policy (CLAUDE.md §10.5: retention periods, consent text,
 * data-access/deletion procedure, hosting jurisdiction, and Cameroon-law
 * review need a responsible owner — this page states what the system
 * actually does today, honestly, and marks everything requiring a legal/
 * business decision as pending rather than inventing it). Exists so app
 * platforms (Meta, Google, etc.) requiring a privacy policy URL during
 * development/review have a real, reachable page — not a final legal
 * document. Replace this content with reviewed copy before any public
 * launch or App Review submission that isn't purely for development mode.
 */
export const metadata = { title: "Privacy Policy — Chekkam" };

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <Link href="/" className="text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
        ← Chekkam
      </Link>

      <div className="mt-6 rounded-[var(--radius-chekkam)] border border-status-warning bg-status-warning/10 p-4 text-sm text-chekkam-ink">
        <strong>Draft, not a final legal document.</strong> This describes what Chekkam&apos;s systems
        actually do today. Retention periods, formal legal jurisdiction, and a designated Data
        Protection Officer have not yet been finalized by the project&apos;s owners — see the marked
        sections below. This page exists so app platforms requiring a privacy policy URL during
        development have a real one to reference.
      </div>

      <h1 className="mt-6 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
        Privacy Policy
      </h1>
      <p className="mt-1 text-sm text-chekkam-faint">Last updated: 27 July 2026 (draft)</p>

      <div className="mt-6 flex flex-col gap-6 text-sm text-chekkam-ink">
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">What Chekkam is</h2>
          <p className="mt-2 text-chekkam-muted">
            Chekkam (&quot;check am&quot;) lets citizens check suspicious messages and verify official
            documents, and lets institutions cryptographically sign documents. It is built for a
            Cameroon audience and is currently a pre-launch prototype, not a commercially
            released product.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">What we collect</h2>
          <ul className="mt-2 list-inside list-disc text-chekkam-muted">
            <li>
              Content you submit to be checked (text, links, or files) — used only to produce a
              risk result and, where you report it, to help identify scam campaigns.
            </li>
            <li>
              Documents submitted for verification — we store a cryptographic hash and signature,
              not the original file, unless you are an institution officer signing a document on
              an institution&apos;s behalf.
            </li>
            <li>
              Account information for staff/institution accounts (email, role) via Supabase Auth.
            </li>
            <li>
              If you contact Chekkam via Telegram or WhatsApp, your chat identifier is stored only
              as a salted hash, never in raw form.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            Third-party processing
          </h2>
          <p className="mt-2 text-chekkam-muted">
            When configured, submitted message content may be sent to OpenAI for automated risk
            analysis. If that service is unavailable, a local, deterministic rule-based check runs
            instead — no message content leaves our servers in that case. Every automated result
            is advisory only: a human reviews reports before anything is published publicly.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            What we never make public
          </h2>
          <p className="mt-2 text-chekkam-muted">
            Reporter identities, raw phone numbers or chat handles, precise locations, and
            evidence files are never included in public alerts. Published alerts use cautious,
            non-accusatory language and never name a private individual without verified, legally
            appropriate evidence.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            Data retention — pending
          </h2>
          <p className="mt-2 text-chekkam-muted">
            A specific retention and deletion schedule has not yet been finalized by the project
            owners. Until it is, submitted content is retained as long as reasonably needed to
            operate the service.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            Your rights — pending a formal process
          </h2>
          <p className="mt-2 text-chekkam-muted">
            To request access to or deletion of your data today, email{" "}
            <a href="mailto:nurdined3@gmail.com" className="text-chekkam-primary hover:underline">
              nurdined3@gmail.com
            </a>
            . A formal, documented data-access/deletion procedure and a named Data Protection
            Officer are pending — this inbox is monitored by the project&apos;s team in the meantime.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            Hosting and jurisdiction — pending
          </h2>
          <p className="mt-2 text-chekkam-muted">
            Infrastructure is currently hosted on Railway and Supabase. Formal confirmation of
            hosting region, applicable jurisdiction, and Cameroon Law 2024/017 compliance review
            is pending review by the project&apos;s owners.
          </p>
        </section>
      </div>
    </div>
  );
}
