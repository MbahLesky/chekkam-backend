# Chekkam — Status Report (Task 0 audit)

**Generated:** 2026-07-27, against `origin/master` HEAD `b74989d` after `git pull` + fresh `npm install`.
**Baseline verified before any code change:** `npm run lint` clean, `npm run build` succeeds (35 routes), `npm test` → 14 files / 68 tests pass.

## ⚠️ Read this first: concurrent-writer risk

`git log` shows commits from at least three other identities pushing to `origin/master` **in the last few hours**, uncoordinated: `bashiremouhamedel-web`, `MbahLesky`, plus direct commits (`feat: update button styles...`, `feat: add peer dependencies...`). One of those merges briefly dropped the `pdf-lib` dependency and broke the Railway build (fixed in commit `0e1c545`); another already fixed forward a test-coverage regression I introduced while fixing that. **This means the Handoff Brief's "current live state" table is already stale in places — this report reflects what's actually in the code right now, not what the brief assumes.** Recommend one person/session owns `master` pushes for the remaining build days, or work happens on branches with reviewed merges.

## P0

| Item | Status | Where |
|---|---|---|
| CORS middleware | **PARTIAL** | `proxy.ts` — exists, but matcher is `/api/:path*` only (no `/v1/:path*`), origin check is exact-string match only (no `*.vercel.app` wildcard), allowed headers missing `X-Api-Key`. **Live-confirmed broken right now**: `curl` against Railway with `Origin: https://chekkam.vercel.app` returns `access-control-allow-origin: null`. This is the actual cause of "Could not reach the Chekkam server." Fixing now (Task 1). |
| Flutter dart-defines in Vercel build | **IN PLACE** (code) / **UNVERIFIED** (Vercel project config) | `chekkam/vercel-build.sh` correctly injects all three `--dart-define`s from Vercel env vars. Bug risk: the script passes `--dart-define=API_BASE_URL="${API_BASE_URL:-}"` unconditionally — if that Vercel env var is unset, Dart's `String.fromEnvironment` receives an explicit empty string (not the code's `10.0.2.2:3000` fallback, which only applies when the flag is absent entirely). **Only a human can confirm/set these three Vercel project env vars** — cannot be verified or fixed from this session. |
| `/dashboard` route | **IN PLACE** | `app/dashboard/page.tsx` — resolves, redirects to `/reports`. Not yet role-aware (see cockpit, P1 #9 below) — every role lands on the same place today. |
| Staff login | **IN PLACE** | `app/login/page.tsx`, seeded accounts confirmed working in a prior live test this week. |
| Documents sign route | **IN PLACE** | `app/api/documents/sign/route.ts` + `lib/documents/sign-document.ts`. Live-verified 2026-07-26. |
| verify-upload | **IN PLACE** | `app/api/documents/verify-upload/route.ts`. Live-verified. |
| verify/[verificationId] | **IN PLACE** | `app/api/documents/verify/[verificationId]/route.ts`. Live-verified. |
| revoke | **IN PLACE** | `app/api/documents/[id]/revoke/route.ts`, plus a `restore` counterpart (`[id]/restore/route.ts`) not in the original spec but present and tested. |
| Certificate PDF | **IN PLACE** | `app/api/documents/[id]/certificate/route.ts` + `lib/documents/certificate.ts` (pdf-lib). Live-verified end-to-end 2026-07-26 including on a revoked document. Dashboard button present on `/dashboard/documents`. |
| `analyzeContent` + `source` field | **PARTIAL** | `lib/ai/risk-analysis.ts` returns `source: "ai" | "rule_based_fallback"` — type has no `"local_model"` member yet because the local classifier (P1 #15) doesn't exist. Not a defect on its own; will need extending when the classifier lands. |
| `GET /api/public-alerts` empty-safe | **IN PLACE** | Returns `{ alerts: [] }`, never an error, confirmed by reading the route. |
| RLS on `api_keys`, `api_usage_logs`, `liaison_contacts` | **MISSING** — confirmed | `supabase/migrations/*.sql`: these three tables are created in `0001_init.sql` with **no** `enable row level security` statement anywhere in any migration. This is a real, live gap on the production database. Fixing now (Task 2). |

## P1

| Item | Status | Where |
|---|---|---|
| Telegram webhook + intents | **IN PLACE**, more complete than the brief assumes | `app/api/webhooks/telegram/route.ts` — secret-token validation, text/photo/document handling, `/sign` via reply-to-message, graceful error fallback. `scripts/set-telegram-webhook.mjs` exists. **What's actually missing is the manual step**: registering the webhook against a live bot token and running `getWebhookInfo` to confirm — cannot be done from this session without `TELEGRAM_BOT_TOKEN` access to Railway. |
| Cockpit | **MISSING** | No role-aware landing exists — `/dashboard` redirects every role to `/reports` unconditionally. The four zones' *endpoints* mostly exist (sign, revoke/restore, certificate, `from-report`) but there is no dedicated `/dashboard/documents`-as-cockpit UI, no `lib/institution-templates.ts`, no "reports about us" matching UI, no broadcast UI. |
| Bulk verify | **MISSING** | No `app/api/enterprise/*` directory, no `bulk_verification_jobs` table. |
| PDF digital-signature check | **MISSING** | No `node-forge`/`pkijs`/`asn1js` in `package.json`, no signature-extraction code found. |
| Verification receipt | **MISSING** | No `verification_receipts` table, no receipt route. |
| components/ui library | **MISSING** | No `components/ui/` directory at all. Status badges are still re-inlined per page (confirmed in `app/dashboard/documents/page.tsx` during earlier work this week). |
| Local classifier | **MISSING** | No `ml/` directory, no `lib/ai/local-model.ts`, no `data/cameroon_seed.jsonl`. |

## P2

| Item | Status | Where |
|---|---|---|
| WhatsApp outbound | **IN PLACE**, more complete than the brief assumes | `app/api/webhooks/whatsapp/route.ts` — `X-Hub-Signature-256` HMAC validation (timing-safe compare), full inbound parsing, outbound text/image replies via `lib/channels/send.ts`. Only the Cloud API test-number provisioning is outstanding (human/Meta-dashboard task). |
| Messenger webhook | **MISSING** | No `app/api/webhooks/messenger` route. |
| C2PA | **MISSING** | No `c2pa-node` dependency, no manifest-parsing code. |
| Trust report | **MISSING** | No `trust_reports` table, no route. |
| Share intent | **PARTIAL** | `share_plus: ^12.0.2` is a pubspec dependency (outbound sharing capability present); no evidence of *inbound* share-target handling (`receive_sharing_intent`-equivalent) wired into a report pre-fill screen. |
| `ACTION_PROCESS_TEXT` | **PARTIAL** | The Android intent-filter is already declared in `AndroidManifest.xml`. Whether the Dart side actually receives and routes that intent to a pre-filled report screen is unverified — needs a device test, not just a manifest check. |
| Extension inline badges | **MISSING** (out of this repo's scope this session — separate `chekkam-extension` repo, not audited this pass) | |
| Partner demo app | **MISSING** | No separate demo-consumer app found. |

## Net assessment

The Handoff Brief undersells WhatsApp and Telegram (both are essentially code-complete; what remains is credential provisioning, a human task) and correctly identifies CORS, RLS, and the cockpit/bulk-verify/receipts/offline/PDF-signature/classifier/component-library items as genuinely absent. Given the realistic time available in a single session and the demonstrated concurrent-writer risk on `master`, this run will prioritize P0 items that are concrete, verifiable, and low-collision-risk (CORS, RLS) before attempting larger P1 builds, committing and pushing after each fully-verified step rather than batching.
