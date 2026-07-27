# Chekkam — Status Report

**Last updated:** 2026-07-27, end of a full-day autonomous build run. Pitch is Thursday 30 July.
**Baseline at start of run:** `npm run lint` clean, `npm run build` succeeds (35 routes), `npm test` → 14 files / 68 tests.
**State at end of run:** `npm run lint` clean, `npm run build` succeeds (37 routes), `npm test` → 17 files / 86 tests. All pushed to `origin/master` (commits `eec0ec1`..`a9651b3`).

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
| 8 | Offline verification | **Not attempted.** Needs a real change to the QR payload format + Flutter-side `pointycastle` on-device ECDSA — large, cross-repo, and explicitly P1/"post-P0 only, don't let it endanger P0" per the UX spec. Given remaining time, correctly deferred | — |
| 9 | PDF digital-signature verification | **Not attempted.** Needs `node-forge`/`pkijs`/`asn1js` integration and real signed-PDF test fixtures to validate against; genuinely complex to get right without those, and time did not allow doing it properly rather than superficially | — |
| 10 | Shared UI component library | **Not attempted.** Explicitly the highest collision-risk item given concurrent brand/button-style commits landing on this exact area of the codebase during this run | — |
| 11 | Local classifier | **Not attempted.** Needs a real training pipeline, dataset acquisition/licensing checks, and Cameroon seed-data authoring — a multi-hour effort on its own, not something to rush | — |
| 12-16 | Stretch (WhatsApp outbound, Messenger, C2PA, Trust Report, Share-to-Chekkam) | **Not attempted** — correctly out of scope; P0/P1 items above weren't all finished either | — |

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
