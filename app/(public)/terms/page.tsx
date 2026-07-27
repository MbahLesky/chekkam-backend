import Link from "next/link";

/**
 * DRAFT terms of service — see privacy/page.tsx's header comment for the
 * same rationale. Not reviewed legal copy; exists so a real URL is
 * available where one is required (e.g. Meta App Settings) during
 * development. Replace before any public launch.
 */
export const metadata = { title: "Terms of Service — Chekkam" };

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <Link href="/" className="text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
        ← Chekkam
      </Link>

      <div className="mt-6 rounded-[var(--radius-chekkam)] border border-status-warning bg-status-warning/10 p-4 text-sm text-chekkam-ink">
        <strong>Draft, not a final legal document.</strong> This has not been reviewed by legal
        counsel. It exists so a real URL is available where one is required during development.
      </div>

      <h1 className="mt-6 font-[family-name:var(--font-heading)] text-3xl font-semibold text-chekkam-ink">
        Terms of Service
      </h1>
      <p className="mt-1 text-sm text-chekkam-faint">Last updated: 27 July 2026 (draft)</p>

      <div className="mt-6 flex flex-col gap-6 text-sm text-chekkam-ink">
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">Current status</h2>
          <p className="mt-2 text-chekkam-muted">
            Chekkam is a pre-launch prototype built for the 2026 ICT Innovation Week competition.
            It is not yet a commercially released product, and features described elsewhere on
            this site may change or be incomplete.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            What Chekkam is not
          </h2>
          <p className="mt-2 text-chekkam-muted">
            Chekkam&apos;s risk checks and document verification are informational aids reviewed by
            humans before any public action is taken — they are not a substitute for legal,
            financial, or professional advice, and safety-alert features are never a substitute
            for contacting emergency services directly.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            Acceptable use
          </h2>
          <p className="mt-2 text-chekkam-muted">
            Don&apos;t submit content you don&apos;t have the right to share, attempt to abuse or overload
            the service, or use it to harass or falsely accuse a named individual.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            Document signing
          </h2>
          <p className="mt-2 text-chekkam-muted">
            Institution accounts that sign documents are responsible for the accuracy of what they
            sign. Chekkam cryptographically attests that a signed document has not been altered
            since signing — it does not independently verify the underlying facts the document
            describes.
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-chekkam-muted">
            Questions about these terms:{" "}
            <a href="mailto:nurdined3@gmail.com" className="text-chekkam-primary hover:underline">
              nurdined3@gmail.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
            Governing law — pending
          </h2>
          <p className="mt-2 text-chekkam-muted">
            A specific governing-law/jurisdiction clause has not yet been finalized by the
            project&apos;s owners.
          </p>
        </section>
      </div>

      <div className="mt-8 text-sm">
        <Link href="/privacy" className="font-medium text-chekkam-primary hover:underline">
          Privacy Policy →
        </Link>
      </div>
    </div>
  );
}
