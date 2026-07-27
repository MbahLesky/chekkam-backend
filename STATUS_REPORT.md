# Chekkam — Status Report

**Last updated:** 2026-07-27, closing gaps found in a full `docs/` audit requested after Task 11. Pitch is Thursday 30 July.
**Baseline at start of run:** `npm run lint` clean, `npm run build` succeeds (35 routes), `npm test` → 14 files / 68 tests.
**State after Task 8 (offline verification):** `npm run lint` clean, `npm run build` succeeds (37 routes), `npm test` → 17 files / 86 tests. All pushed to `origin/master` (commits `eec0ec1`..`a9651b3`).
**State after Task 9 (PDF digital-signature verification):** `npm run lint` clean, `npm run build` succeeds (38 routes), `npm test` → 19 files / 102 tests (exact numbers from the actual local run, not carried forward from memory).
**State after Task 10 (shared UI components):** `npm run lint` clean, `npm run build` succeeds (38 routes — presentation-only change, no new routes), `npm test` → 19 files / 102 tests unchanged (no new automated tests — see rationale below). Live-verified in a real browser against the running dev server (screenshots taken, not just compiled).
**State after Task 11 (local classifier):** `npm run lint` clean, `npm run build` succeeds (38 routes), `npm test` → 20 files / 110 tests. New migration `0010_ai_predictions_local_model_source.sql` applied to the live production DB (verified with a real insert+cleanup). Live-verified via real HTTP requests to `/api/extension/check` with `OPENAI_API_KEY` overridden empty, confirming `source: "local_model"` actually lands in the live `ai_predictions` table, not just in a unit test.

## ⚠️ Read this first: concurrent-writer risk (unchanged conclusion, now with more evidence)

Across this run, `origin/master` received commits from at least three other identities
(`bashiremouhamedel-web`, `MbahLesky`, plus unattributed direct pushes touching brand/button
styles and peer dependencies), fully uncoordinated with this session. Consequences observed
directly:
- A merge briefly dropped the `pdf-lib` dependency and a component's prop wiring, breaking the
  Railway build (fixed, commit `0e1c545`).
- Railway's live deployment is, as of this report, **several commits behind `origin/master`**:
  the CORS origin-matching fix appears partially live (production Vercel origin is now allowed)
  but `/api/enterprise/bulk-verify` and the verification-receipts routes still 404 live, over 30
  minutes after being pushed. This could mean a slow/queued deploy, a build failure not visible
  from outside, or another push resetting the deploy queue. **Needs a human to check the Railway
  dashboard directly** — this cannot be diagnosed further via HTTP probing alone.

**Recommendation, repeated from the Task 0 report because it's more urgent now, not less:** one
person/session should own `master` pushes for the remaining two build days, or move to a
review-gated PR flow. Every direct push is live within minutes via Railway's GitHub integration
with no CI gate in between — that's a lot of blast radius for an uncoordinated multi-writer
branch three days before a jury demo.

## What changed this run (commits `eec0ec1` → `a9651b3`)

| # | Item | Result | Live-verified? |
|---|---|---|---|
| 0 | Codebase audit | Done — see below, folded into this report | N/A |
| 1 | CORS fix | **Done, code-verified** (6 new tests). Live-confirmed the exact bug before fixing (curl showed `access-control-allow-origin: null` for the Vercel origin); confirmed origin-matching now returns the correct header live post-deploy. `X-Api-Key` header addition and `/v1/*` matcher extension not yet confirmed live (see risk note above — Railway is behind) | Partial |
| 2 | RLS on `api_keys`/`api_usage_logs`/`liaison_contacts` | **Done.** Migration applied directly to the live production database (not just queued for next deploy). Verified with a real insert+read test: service-role can write, anon client cannot read a row known to exist | ✅ Yes |
| 3 | Printable certificate | Confirmed still intact after all the concurrent merges (code inspection + 14 passing tests); not re-run live this session since nothing in that code path changed | Prior session (2026-07-26) |
| 4 | Telegram webhook | **Done.** Registered live against the Railway URL; `getWebhookInfo` confirms it (0 pending updates, correct URL). New `TELEGRAM_WEBHOOK_SECRET` generated — see env var list. Railway itself still needs `TELEGRAM_BOT_TOKEN` + this secret set as env vars for the deployed route to actually reply (human task, no dashboard access from here) | Partial (registration yes, Railway env vars no) |
| 5 | Organization cockpit | **PARTIAL, deliberately scoped down.** `/dashboard` now role-aware (institution_officer → `/dashboard/documents`, others unchanged) — the core of FR-060. Full 4-zone cockpit (reports-about-us matching, broadcast UI, `lib/institution-templates.ts`, dedicated cockpit layout) **not built** — judged too high collision-risk against concurrent UI/brand work happening on this branch in real time, and too large to complete fully within remaining session time | ✅ Yes (build+test) |
| 6 | Bulk verification | **Done, backend-only, by design.** `POST /api/enterprise/bulk-verify`, CSV-of-IDs mode only (ZIP-of-files explicitly deferred — smaller attack surface, matches the spec's core demo line without the complexity). Dual auth (session/X-Api-Key). Dashboard UI (`/dashboard/enterprise/bulk`) not built. Migration applied to live DB | Not yet — Railway hasn't deployed this commit (see risk note) |
| 7 | Verification receipt | **Done, fully.** Create → PDF download → public signature re-verification, all live-tested against a running server and the real production database. **Found and fixed a real bug via that live test** that no unit test caught: signing the raw `created_at` string failed verification after a Postgres round-trip (`Z` vs `+00:00` suffix, same instant) — every fresh receipt failed its own check. Fixed by normalizing to epoch milliseconds; added a regression test. Migration applied to live DB | ✅ Yes (local server + prod DB), not yet Railway-deployed |
| 8 | Offline verification | **Done, backend primitives only, as scoped.** `lib/crypto/token.ts` (versioned, base64url, fixed-field-order signed token, 7 tests), `GET /api/institutions/public-keys` (public key cache endpoint), `GET /api/documents/:id/offline-token` (issues a token + QR). Deliberately does not touch `documents.qr_payload` or the existing `/verify/:id` flow — purely additive. Live-tested with real signing keys. Flutter-side on-device verification (`pointycastle`, key caching, airplane-mode UX, the "revocation not checked" caveat) is **not built** — cross-repo, large, explicitly P1 | ✅ Yes (backend only; no Flutter client exists yet to test end-to-end) |
| 9 | PDF digital-signature verification | **Done.** See detailed writeup below | ✅ Yes (local server, real third-party fixtures) |
| 10 | Shared UI component library | **Done, scoped to real duplication.** See detailed writeup below | ✅ Yes (browser screenshots against live dev server) |
| 11 | Local classifier | **Done, scope narrowed honestly.** See detailed writeup below | ✅ Yes (live HTTP request + live DB row confirmed) |
| 12-16 | Stretch (WhatsApp outbound, Messenger, C2PA, Trust Report, Share-to-Chekkam) | **Not attempted** — correctly out of scope; P0/P1 items above weren't all finished either | — |

## Task 9 detail — PDF digital-signature verification (FR-101)

**Scope, precisely:** this is Trust Report **Layer 1 only** (`Chekkam_Document_Intelligence_Spec.md`
§2). It checks a PDF's own embedded PKCS#7/CMS signature from *any* issuer — a foreign university,
an eIDAS body, a government agency — and does **not** touch the Chekkam registry at all. Layers
2-6 (C2PA, PDF structure forensics, image forensics, AI-generation heuristics, campaign
cross-reference) and the full `trust_reports` table/aggregation/dashboard UI (FR-100/107) are
separate, larger, unbuilt scope — deliberately not started, to avoid shipping a half-built
six-layer feature under time pressure.

**What was built:**
- `lib/documents/pdf-signature.ts` — `verifyPdfSignature(pdfBytes: Buffer)`, never throws. Extracts
  every `/ByteRange` + `/Contents` pair in document order (handles multi-signature PDFs — verifies
  the *last* signature, since that's the one whose coverage should reach the true end of file),
  reconstructs the actually-signed bytes, parses the PKCS#7 structure with `node-forge`, and
  performs the **real** two-step CMS verification: (1) the independently-computed digest of the
  signed bytes must match the `messageDigest` authenticated attribute, and (2) the RSA/EC signature
  over the DER-encoded authenticated-attribute SET must verify against the signer certificate's
  public key. This is not certificate parsing dressed up as verification — both checks are real
  and both are exercised by tests that fail if either is skipped.
- Returns one of: `no_signature_found`, `signature_unparseable` (malformed PKCS#7 — reported
  honestly rather than crashing or silently passing), `signed_valid_unmodified`, or
  `signed_but_modified_after_signing`.
- **Proof vs signals, kept explicit in the return shape:** `integrityProof` is `true` only when the
  signature is cryptographically valid *and* its coverage reaches end-of-file — that half is
  genuine deterministic proof. `issuerTrustChecked` is *always* `false`, because no Adobe
  AATL/EUTL chain validation is implemented — per spec §2/§5, an unrecognised issuer must be
  reported as unrecognised, never as untrusted or fraudulent. The API never claims more than it
  checked.
- `app/api/documents/pdf-signature-check/route.ts` — `POST`, public, rate-limited by IP (30/10min,
  same limiter as `verify-upload`), 20MB cap, no DB writes. This is a standalone endpoint, not
  wired into the registry verify flow, because it answers a different question ("does this
  foreign PDF carry its own valid signature") than `/api/documents/verify-upload` does ("is this
  in our registry").

**Validation approach — real fixtures, not self-authored data only.** Five real signed PDFs were
sourced from `github.com/vbuch/node-signpdf` (MIT-licensed, unrelated to this codebase) and
committed to `test-fixtures/pdf-signatures/`: a single-signature file, a file whose signature
placeholder is larger than its actual DER content (this is what caught a real bug — see below), a
two-signature (co-signed) file, an incrementally-updated file, and an unsigned file used as the
negative case. `lib/documents/pdf-signature.test.ts` (9 tests) checks all five plus a byte flipped
inside the signed range and bytes appended after a valid signature's coverage — both correctly
detected as `signed_but_modified_after_signing`.

**Two real bugs found and fixed via this process, not caught by writing code alone:**
1. The initial exploration approach stripped trailing `00` hex characters from the `/Contents`
   placeholder with a regex before DER-decoding, on the assumption that PDF signers zero-pad the
   reserved signature slot. That regex operates on **hex characters**, not **bytes** — stripping an
   odd count of zero *characters* desynchronizes byte alignment and corrupts the parse. This
   surfaced as a genuine parse failure against the `signed-once.pdf` fixture ("Unparsed DER bytes
   remain"), not a hypothetical. Fixed by using `forge.asn1.fromDer(bytes, { parseAllBytes: false })`
   instead, which lets the DER structure's own self-declared length govern parsing and ignores
   unused placeholder padding correctly.
2. `POST` with no body/content-type at all (a malformed request, not just a missing field) caused
   `req.formData()` to throw an error that wasn't a recognized `ValidationError`, falling through
   to a generic 500 instead of a 400. Caught by live-testing the actual route with curl, not by the
   unit tests (which only exercise the exported function, not the route's request-parsing edge
   case). Fixed by wrapping the `formData()` call and mapping any parse failure to the existing
   `fileRequired` validation error.

**Not done / deliberately deferred:** Adobe AATL/EUTL trust-chain validation (spec explicitly allows
reporting "unrecognised" instead — this is a substantial separate integration, not a quick add);
wiring this into a UI (no Trust Report screen exists yet — that's FR-107, a different task); ZIP or
multi-file batch checking (only single-file, matching the existing `verify-upload` pattern).

## Task 10 detail — Shared UI component library (FR-017/018)

**Re-assessed collision risk before starting:** this task was deferred earlier in the run as the
highest collision-risk item, given commits from `bashiremouhamedel-web`/`MbahLesky` touching
brand/button styles on this exact area. Re-checked `git fetch` + `git log` immediately before
starting: zero new commits from anyone else since this run began (every commit in the last several
hours is this session's own). The risk that justified deferring is no longer present right now —
re-deferring indefinitely on a stale risk assessment would just leave real, measurable duplication
in place for no remaining reason.

**What was actually duplicated (verified by grep, not assumed):** ~15+ call sites across
`app/dashboard/*.tsx` and `app/(auth)/*.tsx` hand-copied near-identical Tailwind class strings for
buttons (`rounded-[var(--radius-chekkam-sm)] bg-gradient-hero px-4 py-2 text-sm font-semibold
text-white shadow-chekkam-sm...`, etc.), loading/empty/error text states, and the card-panel
wrapper. One of these was a genuine **product bug**, not just a style inconsistency: the documents
table's status pill (`app/dashboard/documents/page.tsx`) rendered colour + text only, with no
icon — a direct violation of CLAUDE.md rule 9, "status is never colour alone." A second was a
genuine **off-brand colour**: the reports page's "mark under review" button used raw `bg-blue-600`,
not a Chekkam design token.

**What was built:** `components/ui/{Button,StatusBadge,States,Card}.tsx` (+ barrel `index.ts`).
Every class string in `Button.tsx`'s variants (`primary`/`solid`/`outline`/`danger`/`success`/
`ghost`/`tint`) was lifted verbatim from an existing call site — this does not introduce a new
visual style, it collects the one that already exists so it stops re-drifting. `StatusBadge` adds
an `aria-hidden` icon alongside the existing colour+label (fixing the rule-9 gap); the visible text
label still carries the accessible name, the icon is decorative reinforcement for sighted users
scanning by shape/colour.

**Real adoption, not just creation:** migrated `app/dashboard/documents/page.tsx` (the largest,
most repetitive dashboard page — 12 buttons, 2 status pills, loading/empty/error states, the table
card wrapper), plus `app/dashboard/reports/page.tsx` (5 buttons, including the off-brand blue one
now correctly mapped to the `outline` token, plus the stat tiles and filter bar) and
`app/dashboard/alerts/page.tsx` (3 buttons, 1 status pill). A component library adopted nowhere is
exactly the kind of superficial deliverable this project's own principles warn against, so real
call sites were migrated in the same change, not left for later.

**Verification approach:** no component-render test infrastructure exists in this repo (`vitest`
config is `environment: "node"`, no `@testing-library/react`/jsdom) — adding a whole new test
stack for a presentation-only change was judged disproportionate. Instead: `tsc --noEmit` and
`eslint` both clean, a full production `next build` succeeded, and then the actual UI was
live-verified in a real Chromium browser (via Playwright) against the running dev server —
logged in with the seeded admin account, screenshotted the documents list (confirming the new
icon+label+colour status pills), the document detail modal in both `active` and `revoked` states
(confirming `danger`/`success`/`ghost` button variants), the sign-document panel (confirming
`primary`/`solid` variants and the `loading` prop), and the alerts create-form and published-alert
card. No console/page errors observed in any of these flows.

**One incidental fix caught and corrected along the way:** while using the demo credentials to log
in for this check, discovered the `.env.example` commit made two tasks ago in this same run had
invented a demo password (`demopassword123!`) instead of checking `scripts/seed.ts`'s actual
fallback (`ChekkamDemo123!`). Fixed in a separate small commit immediately — the kind of small
factual error that's easy to introduce when writing documentation from memory instead of checking
the source, worth calling out rather than quietly folding into a larger commit.

**Not done / deliberately deferred:** `AppShell` (the existing `app/dashboard/layout.tsx` already
serves this role adequately; refactoring a working layout was judged higher-risk than the
remaining task value under time pressure). Mirroring these tokens into the Flutter theme
(`chekkam/lib/app/theme.dart`) — cross-repo, and this session's remaining time was better spent
finishing Task 11. Migrating every remaining page (`safety-alerts`, `check`, `verify`,
auth pages) — the three migrated pages were chosen as the highest-duplication, highest-value
targets; the pattern is now established for whoever picks up the rest.

## Task 11 detail — Local classifier (FR-026/027)

**Scope narrowed honestly, upfront:** the mega-prompt asked for a classifier trained on 100-150
Cameroon EN/FR/Pidgin examples. What got built predicts `risk_level` (low/medium/high) only —
not the full 9-category, multi-indicator schema `analyzeContent()`'s AI tier produces. With ~124
examples, a 9-way category classifier would not be honestly trainable (most categories would have
single-digit example counts); `category`/`indicators`/`reasons`/`suspicious_phrases` in this
tier's output are the same rule-based keyword detection the existing fallback already used,
factored into a shared `detectIndicators()` helper so there is still only one implementation of
"what counts as a suspicious signal," never two.

**Dataset (`data/cameroon_seed.jsonl`, 124 rows):** self-authored by this session, modeled on
publicly known Cameroonian scam patterns — mobile money fraud, fake MINPOSTEL/GCE-board notices,
fake recruitment, phishing links, impersonation, leaked-exam scams — split roughly EN 51 / FR 37
/ Pidgin 36, and low 47 / medium 28 / high 49. **This is not a collected/reviewed real dataset,**
and the Pidgin examples were written by the AI assistant, not a native speaker. `ml/METRICS.md`
states this limitation before showing a single number, per CLAUDE.md §10.4 ("training datasets,
Cameroon examples... need review before any accuracy/sovereignty claim").

**Pipeline:** `ml/train.py` — TF-IDF (unigram bag-of-words, raw count × smoothed IDF,
L2-normalized; bigrams deliberately excluded as overfit-prone at this dataset size) + multinomial
logistic regression via full-batch gradient descent, implemented in plain numpy (no scikit-learn
dependency) specifically so the exact math is known and portable. Exports `ml/model.json` (337
vocabulary terms, ~34KB). `lib/ai/local-model.ts` reimplements the identical tokenizer/TF-IDF/
softmax scoring in pure TypeScript, loaded via a static JSON import (no filesystem read, no
Python/network dependency at runtime).

**The port was independently verified, not assumed correct:** four test cases were scored in
Python directly against `model.json`, and those exact probability vectors (to 3 decimal places)
are asserted in `lib/ai/local-model.test.ts` — if the TypeScript tokenizer or math ever drifts
from the Python training code, this test catches it immediately rather than silently producing
different numbers in production than what was measured in `ml/METRICS.md`.

**Wired into `analyzeContent()` as a genuine third tier**, not a parallel path: AI (if
`OPENAI_API_KEY` set) → local model (this task) → pure keyword-only rule-based (now the final
safety net, exercised when the AI call fails *and* the local scorer hits an unexpected runtime
error — not when a file is "missing," since `model.json` is a committed static import, always
present in a successful build). Required a new migration,
`0010_ai_predictions_local_model_source.sql`, widening the `ai_predictions.source` CHECK
constraint — applied directly to the live database (verified with a real insert+delete before
trusting it, after first querying the live constraint's actual auto-generated name rather than
guessing).

**Live-verified, not just unit-tested:** started the dev server with `OPENAI_API_KEY` overridden
to empty, POSTed a real scam-style message and a real benign message to
`POST /api/extension/check`, got back correctly-differentiated `risk_level`/`risk_score`/
`category` in both cases, then queried the live `ai_predictions` table directly and confirmed the
row's `source` column actually reads `local_model` — proving the full path (HTTP → analyzeContent
→ local model → DB write) works, not just that the exported function returns a plausible value in
isolation.

**Test-set metrics (illustrative only, see `ml/METRICS.md`'s full caveats):** 87.5% accuracy on a
24-row held-out split — too small to be a real accuracy claim, but the confusion matrix shows the
one systematic weak spot honestly: `medium`-risk messages (only 5 in the test split) are
sometimes over-classified as `high`, which is the safer failure direction for a citizen-facing
tool, not the dangerous one.

**Not done:** category/indicator learning (see scope-narrowing note above); any claim beyond what
`ml/METRICS.md` states — this must not be presented in the pitch as a validated, production-grade
Cameroon-language model without the human review CLAUDE.md §10.4 requires.

## Gap-closing pass — after a full `docs/` audit (2026-07-27, post-Task-11)

A full audit of every file in `chekkam/docs/` found real gaps this report hadn't caught, plus
documentation drift. What got fixed:

**Documentation** (see `chekkam` repo's own commit for full detail — not duplicated here):
synced the real team table from `01_Project_Charter.md` into `Chekkam_Project_Overview.md`
(was four `[TO ADD]` placeholders despite the real team already existing elsewhere); reconciled
the two diverged SRS copies into one canonical `02_SRS.md` v3.2; brought `03_Database_Schema.md`
up to date through migration `0010`; fixed `08_Interface_Design.md`'s stale teal/Sora references;
marked five stale/superseded documents accordingly.

**FR-110 — Bulk verification dashboard UI, now built.** `/dashboard/enterprise/bulk`:
CSV/text upload, results table with `StatusBadge` per row, client-side CSV export, sidebar nav
entry. The API has existed since Task 6 with no UI reachable without curl — this closes that
gap. Live-verified in a real browser: uploaded a CSV of one genuine, one revoked, and one
nonexistent verification ID, confirmed all three render correctly, confirmed the CSV download
produces a correct file.

**FR-092 — Partner demo consumer app, now built.** `/partner-demo`: a standalone page styled as
a fictional third-party product ("Yaoundé Metropolitan University — Admissions Verification
Desk"), deliberately not using Chekkam's own `components/ui`/brand tokens. Two forms (message
check, document verification) call `app/api/partner-demo-proxy/{check,document-check}/route.ts`,
which hold a dedicated `PARTNER_DEMO_API_KEY` server-side (never sent to the browser) and forward
to the real public `/api/v1/partner/*` endpoints — not a shortcut through internal functions, so
this proves the actual partner API contract. Includes a collapsible raw-JSON panel per the spec.

Two real bugs were caught building this, not by inspection: (1) the proxy initially called
`process.env.APP_BASE_URL`, which is the *public-facing* URL used for QR/webhook links and can
point at a different deployed instance than the one serving the request — fixed to derive the
origin from the incoming request itself (`req.nextUrl.origin`); (2) the proxy then 404'd because
the actual partner routes live at `/api/v1/partner/*`, not `/v1/partner/*` as their own doc
comments, the SRS, and this demo's first draft all assumed — confirmed by testing both paths
directly, then fixed in both proxy routes, both real route files' comments, and the SRS.

**Real regression caught from concurrent activity, not from my own work:** a PR merged directly
to `master` while this session was running (`012d4b9`, from a teammate) regenerated
`package.json`/`package-lock.json` and silently dropped the `node-forge` dependency Task 9's PDF
signature verification requires (`@types/node-forge` survived in devDependencies; the runtime
package did not). `node_modules` still had the stale copy on disk, so nothing broke *yet* — the
next fresh install (Railway included) would have removed it and broken every route importing
`lib/documents/pdf-signature.ts`. Caught by diffing the concurrent merge's changes against
`package.json` rather than assuming they were unrelated to this session's work. Fixed and
verified with a full `tsc`/`eslint`/`build`/`test` pass.

**Also found:** the concurrent merge changed `npm test`'s script (dropped `--maxWorkers=1
--testTimeout=30000`) and regenerated `package-lock.json` (3549 lines churned) — re-verified the
full suite passes under the new script, which it does (109/109).

## P0 checklist (Final Build Spec §10), current honest state

- [x] No CORS errors for the production Vercel origin (code + one live check confirm this specific case; full re-verification blocked on Railway catching up)
- [ ] Flutter dart-defines confirmed set in Vercel project settings — **cannot verify without Vercel dashboard access**; the build script itself is correct
- [x] Staff login works with seeded accounts (unchanged, confirmed working in prior session)
- [x] `/dashboard/documents`, `/reports`, `/alerts` load and act on real data (unchanged)
- [x] Sign → Verification ID + PIN + QR (unchanged, tested)
- [x] Printable certificate PDF (built and live-verified in prior session; confirmed intact this session)
- [x] Genuine / Tampered / Revoked / Not Found via web upload and ID/PIN (live-verified prior session)
- [ ] Same four states via **Flutter app scan** and **Telegram** specifically — Telegram code exists and webhook is now registered, but an actual message-based verification round-trip through Telegram was not exercised this session (needs `TELEGRAM_BOT_TOKEN` on Railway first)
- [x] Message check returns risk level, reasons, recommended action, `source` (unchanged)
- [x] `GET /api/public-alerts` returns valid JSON when empty (confirmed by code read)
- [ ] Backup video recorded — **not something this session can do**

## RLS / security posture

All previously-unrestricted tables now have RLS: `api_keys`, `api_usage_logs`, `liaison_contacts`
(this run), plus everything from `0001_init.sql` onward. `bulk_verification_jobs` and
`verification_receipts` (new this run) both ship with RLS from their first migration, not added
later. Not yet done: an actual hostile-client RLS test sweep across *every* table (Coding
Standards §6: "every table policy tested by attempting the forbidden read/write") — only the
three flagged-unrestricted tables plus the two new ones were specifically verified this way.

## Files/routes added or changed this run

- `proxy.ts`, `proxy.test.ts` — CORS fix
- `supabase/migrations/0007_admin_rls.sql`, `0008_bulk_verification_jobs.sql`, `0009_verification_receipts.sql`
- `app/dashboard/page.tsx` — role-aware landing
- `app/api/enterprise/bulk-verify/route.ts`, `lib/documents/bulk-verify.ts` (+ test)
- `app/api/verification-receipts/route.ts`, `[id]/pdf/route.ts`, `verify/[receiptId]/route.ts`, `lib/documents/receipt.ts` (+ test)
- `lib/crypto/sign.ts` (`getChekkamReceiptSigningKey`), `lib/crypto/ids.ts` (`generateVerificationId` prefix param) — both additive
- `lib/crypto/token.ts` (+ test), `app/api/institutions/public-keys/route.ts`, `app/api/documents/[id]/offline-token/route.ts` — Task 8, offline verification backend primitives
- `lib/documents/pdf-signature.ts` (+ test), `app/api/documents/pdf-signature-check/route.ts`, `test-fixtures/pdf-signatures/*.pdf` — Task 9, PDF digital-signature verification. New dependency: `node-forge` (+ `@types/node-forge` dev-only)
- `components/ui/{Button,StatusBadge,States,Card,index}.ts(x)` — Task 10, shared UI components; adopted in `app/dashboard/{documents,reports,alerts}/page.tsx`
- `data/cameroon_seed.jsonl`, `ml/train.py`, `ml/model.json`, `ml/METRICS.md`, `lib/ai/local-model.ts` (+ test) — Task 11, local classifier. `lib/ai/risk-analysis.ts` refactored (`detectIndicators` extracted, `localModelFallback` added, `fallback()` composes the two non-AI tiers) and `lib/ai/predictions.ts` type widened. New migration `0010_ai_predictions_local_model_source.sql`, applied live
- `app/dashboard/enterprise/bulk/page.tsx` — FR-110 dashboard UI; new i18n strings in `components/i18n-provider.tsx`; one new nav entry in `app/dashboard/layout.tsx`
- `app/partner-demo/page.tsx`, `app/api/partner-demo-proxy/{check,document-check}/route.ts` — FR-092 demo consumer app. New env var `PARTNER_DEMO_API_KEY` (a dedicated partner key, minted via `scripts/issue-api-key.mjs`). Fixed a real path bug in the process: the actual partner routes live at `/api/v1/partner/*`, not `/v1/partner/*` — corrected in both new proxy routes, both real route files' own comments, and the SRS
- `package.json`/`package-lock.json` — restored the `node-forge` dependency a concurrent merge had silently dropped (see above)
