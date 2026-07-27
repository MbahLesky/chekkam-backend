import Link from "next/link";

/**
 * Public pricing/business-model page (competition criterion: Economic
 * viability). Figures are pulled verbatim from
 * chekkam/docs/10_Business_Model_and_Financials.md — never invented here.
 * Display only, no checkout/payment flow: CLAUDE.md's non-negotiable rule
 * ("pre-revenue pilot posture... do not add billing, payment, self-serve
 * commercial onboarding") and the business doc's own §9 ("no payment
 * surface exists in the platform," a documented competition-eligibility
 * position) both rule that out deliberately, not by omission.
 */
export const metadata = { title: "Pricing & Business Model — Chekkam" };

type Tier = {
  name: string;
  who: string;
  price: string;
  priceNote?: string;
  features: string[];
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Citizen",
    who: "Any individual",
    price: "0 FCFA",
    priceNote: "free, indefinitely",
    features: ["Message risk checks", "Single document verification", "QR scan", "Public & safety alerts"],
    highlight: true,
  },
  {
    name: "Institution — Starter",
    who: "Small school, single office",
    price: "0 FCFA",
    priceNote: "up to 100 documents/year",
    features: ["Document signing", "Revocation", "Officer cockpit", "Impersonation reports"],
  },
  {
    name: "Institution — Standard",
    who: "School, ministry dept, employer",
    price: "50,000 FCFA",
    priceNote: "/ month",
    features: ["Unlimited signing", "Full cockpit", "Broadcast tools", "Priority support"],
  },
  {
    name: "Institution — Per-document",
    who: "Occasional / seasonal issuers",
    price: "150 FCFA",
    priceNote: "/ signed document",
    features: ["Alternative to subscription", "Built for exam-season spikes"],
  },
  {
    name: "Enterprise Verification",
    who: "HR departments, admissions offices",
    price: "150 FCFA",
    priceNote: "/ bulk certificate check",
    features: ["CSV/ZIP bulk upload", "Results table + export", "Verification receipts included"],
  },
  {
    name: "Partner API",
    who: "Banks, telecoms, fintech, platforms",
    price: "25 FCFA",
    priceNote: "/ call (volume tiers below)",
    features: ["Embedded in your own systems", "Message + document checks", "Usage metered & logged"],
  },
  {
    name: "Verification Receipt",
    who: "Any verifier needing proof",
    price: "500 FCFA",
    priceNote: "/ signed receipt",
    features: ["Chekkam-signed PDF", "Due-diligence evidence", "Own QR + verification ID"],
  },
];

const API_VOLUME_TIERS = [
  { calls: "0 – 1,000 / month", price: "25 FCFA / call", ceiling: "25,000 FCFA" },
  { calls: "1,001 – 10,000 / month", price: "20 FCFA / call", ceiling: "200,000 FCFA" },
  { calls: "10,001 – 50,000 / month", price: "15 FCFA / call", ceiling: "750,000 FCFA" },
  { calls: "50,001+ / month", price: "10 FCFA / call", ceiling: "negotiated" },
];

const VALUE_ROWS = [
  {
    payer: "Employer (50 hires/year)",
    problem: "50 phone calls/letters to issuing schools; days to weeks of HR time; risk of a fraudulent hire",
    cost: "50 × 150 FCFA = 7,500 FCFA / year",
    why: "A single bad hire costs vastly more than 7,500 FCFA",
  },
  {
    payer: "University admissions (2,000 applicants)",
    problem: "Manual spot-checking only; most certificates never verified",
    cost: "2,000 × 150 FCFA = 300,000 FCFA / year",
    why: "Full verification instead of sampling, at a fraction of one staff salary",
  },
  {
    payer: "Bank (10,000 onboardings/month)",
    problem: "Manual document review; fraud losses",
    cost: "10,000 × 20 FCFA = 200,000 FCFA / month",
    why: "Embedded in existing KYC flow; reduces fraud exposure",
  },
  {
    payer: "School issuing 2,000 certificates/year",
    problem: "Reputational damage from forgeries; disputes; ad-hoc phone verification requests",
    cost: "50,000 FCFA / month, or 0 on Starter",
    why: "Protects the institution's name; offloads verification requests entirely",
  },
];

const OUTLOOK = [
  { year: "Year 1 — Pilot", total: "1,050,000 FCFA", usd: "~1,750 USD", note: "Grant- and pilot-funded. Objective is registry density, not revenue." },
  { year: "Year 2 — Early commercial", total: "21,640,000 FCFA", usd: "~36,067 USD", note: "15 institutions, 3 API partners, bulk checks scaling." },
  { year: "Year 3 — Scale", total: "77,000,000 FCFA", usd: "~128,333 USD", note: "A modest, believable Cameroonian SME trajectory — not a national-mandate projection." },
];

export default function PricingPage() {
  return (
    <div className="force-light flex flex-1 flex-col">
      <section className="relative overflow-hidden bg-gradient-hero px-6 py-20 text-center text-white">
        <div className="relative mx-auto max-w-2xl">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Chekkam
          </Link>
          <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/70">
            Business model
          </div>
          <h1 className="mt-2 font-[family-name:var(--font-heading)] text-4xl font-semibold tracking-tight sm:text-5xl">
            Pricing that funds trust, not gatekeeping
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-white/75">
            Citizens check for free, forever. Institutions sign for free or near-free. Revenue
            comes from the party with both the budget and the urgency: whoever needs the answer
            right now.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 py-14">
        <div className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm sm:p-8">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-chekkam-ink">
            The strategic insight — flip who pays
          </h2>
          <p className="mt-3 text-sm text-chekkam-muted">
            Most verification projects assume the <em>issuer</em> pays: &quot;schools and
            ministries will pay us to sign their documents.&quot; That model is weak in Cameroon —
            public institutions have thin discretionary budgets and slow procurement cycles.
          </p>
          <p className="mt-3 text-sm text-chekkam-muted">
            <strong className="text-chekkam-ink">Chekkam charges the verifier.</strong> The person
            who urgently needs an answer — an employer hiring, a bank onboarding, a university
            admitting — has both the budget and the urgency. This mirrors Nigeria&apos;s WAEC
            fee-per-verification precedent, where the checking party pays.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 rounded-[var(--radius-chekkam-sm)] bg-chekkam-tint p-5 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">Issuer</div>
              <div className="mt-1 font-medium text-chekkam-ink">School / ministry</div>
              <div className="mt-1 text-chekkam-muted">signs documents — cheap or free, builds the registry</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">Verifier</div>
              <div className="mt-1 font-medium text-chekkam-ink">Employer / bank / university</div>
              <div className="mt-1 text-chekkam-muted">pays to verify — priced, funds the platform</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-14">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          Tiers
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-[var(--radius-chekkam)] border p-6 shadow-chekkam-sm ${
                tier.highlight
                  ? "border-chekkam-primary bg-gradient-seal text-white"
                  : "border-chekkam-border bg-chekkam-surface-raised"
              }`}
            >
              {tier.highlight && (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
                  Always free
                </span>
              )}
              <h3
                className={`mt-3 font-[family-name:var(--font-heading)] text-lg font-semibold ${
                  tier.highlight ? "text-white" : "text-chekkam-ink"
                }`}
              >
                {tier.name}
              </h3>
              <p className={`mt-1 text-xs ${tier.highlight ? "text-white/70" : "text-chekkam-faint"}`}>{tier.who}</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className={`text-2xl font-semibold ${tier.highlight ? "text-white" : "text-chekkam-ink"}`}>
                  {tier.price}
                </span>
                {tier.priceNote && (
                  <span className={`text-xs ${tier.highlight ? "text-white/70" : "text-chekkam-faint"}`}>
                    {tier.priceNote}
                  </span>
                )}
              </div>
              <ul className={`mt-4 flex flex-col gap-1.5 text-sm ${tier.highlight ? "text-white/85" : "text-chekkam-muted"}`}>
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span aria-hidden="true">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm">
          <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-chekkam-ink">
            Partner API volume tiers
          </h3>
          <p className="mt-1 text-sm text-chekkam-muted">
            25 FCFA is roughly the cost of a single SMS. Verifying a customer&apos;s document at
            that price replaces a manual process costing staff hours — an order-of-magnitude value
            ratio, not a marginal one.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
                <tr>
                  <th className="py-2 pr-4">Monthly calls</th>
                  <th className="py-2 pr-4">Price per call</th>
                  <th className="py-2">Cost at tier ceiling</th>
                </tr>
              </thead>
              <tbody>
                {API_VOLUME_TIERS.map((row) => (
                  <tr key={row.calls} className="border-t border-chekkam-border">
                    <td className="py-2 pr-4 text-chekkam-ink">{row.calls}</td>
                    <td className="py-2 pr-4 text-chekkam-ink">{row.price}</td>
                    <td className="py-2 text-chekkam-muted">{row.ceiling}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-14">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          Why they&apos;d actually pay
        </h2>
        <p className="mt-2 text-sm text-chekkam-muted">
          The value ratio, payer by payer — not a hypothetical market, a concrete comparison.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          {VALUE_ROWS.map((row) => (
            <div
              key={row.payer}
              className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm sm:grid sm:grid-cols-[1fr_1.4fr_0.9fr] sm:gap-5"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-chekkam-primary">Payer</div>
                <div className="mt-1 font-medium text-chekkam-ink">{row.payer}</div>
                <div className="mt-2 text-sm font-semibold text-chekkam-ink">{row.cost}</div>
              </div>
              <div className="mt-3 sm:mt-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
                  Cost of the problem today
                </div>
                <p className="mt-1 text-sm text-chekkam-muted">{row.problem}</p>
              </div>
              <div className="mt-3 sm:mt-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
                  Why they&apos;d buy
                </div>
                <p className="mt-1 text-sm text-chekkam-muted">{row.why}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          Illustrative three-year outlook
        </h2>
        <p className="mt-2 text-sm text-chekkam-muted">
          Deliberately modest. Assumes a conservative institutional ramp, one paid API pilot at a
          time, and recognizes zero revenue during the competition period — Chekkam is pre-revenue
          and not commercially operational.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {OUTLOOK.map((row) => (
            <div key={row.year} className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-chekkam-faint">{row.year}</div>
              <div className="mt-1.5 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
                {row.total}
              </div>
              <div className="text-xs text-chekkam-faint">{row.usd}</div>
              <p className="mt-2 text-sm text-chekkam-muted">{row.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[var(--radius-chekkam)] border border-status-warning bg-status-warning/10 p-4 text-sm text-chekkam-ink">
          <strong>Pre-revenue, pilot posture.</strong> This page describes the model Chekkam will
          use post-competition — it is not a live checkout. No payment surface exists in the
          platform today; institutional relationships are pilot/MOU-based, and API keys are
          admin-issued only.
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link href="/signup" className="rounded-[var(--radius-chekkam-sm)] bg-gradient-hero px-5 py-2.5 font-semibold text-white shadow-chekkam-sm transition hover:brightness-110">
            Register an institution
          </Link>
          <Link href="/widget/embed" className="rounded-[var(--radius-chekkam-sm)] border border-chekkam-primary px-5 py-2.5 font-semibold text-chekkam-primary transition hover:bg-chekkam-tint">
            Get the embeddable widget →
          </Link>
          <Link href="/" className="rounded-[var(--radius-chekkam-sm)] border border-chekkam-border px-5 py-2.5 font-semibold text-chekkam-muted transition hover:bg-chekkam-tint">
            Back to Chekkam
          </Link>
        </div>
      </section>
    </div>
  );
}
