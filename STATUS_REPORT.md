# Chekkam — Status Report

**Last updated:** 2026-07-27, continuing the autonomous build run (Task 9). Pitch is Thursday 30 July.
**Baseline at start of run:** `npm run lint` clean, `npm run build` succeeds (35 routes), `npm test` → 14 files / 68 tests.
**State after Task 8 (offline verification):** `npm run lint` clean, `npm run build` succeeds (37 routes), `npm test` → 17 files / 86 tests. All pushed to `origin/master` (commits `eec0ec1`..`a9651b3`).
**State after Task 9 (PDF digital-signature verification):** `npm run lint` clean, `npm run build` succeeds (38 routes), `npm test` → 19 files / 102 tests (exact numbers from the actual local run, not carried forward from memory).

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
| 10 | Shared UI component library | **Not attempted.** Explicitly the highest collision-risk item given concurrent brand/button-style commits landing on this exact area of the codebase during this run | — |
| 11 | Local classifier | **Not attempted.** Needs a real training pipeline, dataset acquisition/licensing checks, and Cameroon seed-data authoring — a multi-hour effort on its own, not something to rush | — |
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
