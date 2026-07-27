# Chekkam — Blockers (2026-07-27 autonomous build run)

Per the working method: anything stalled >20 minutes, or requiring access this session doesn't
have, logged here with the exact evidence rather than guessed at.

## 1. RESOLVED — Railway deployment was stuck for 2+ hours; root cause found and fixed

Standing blocker throughout this run, diagnosed via HTTP probing alone until the user logged
into Railway and gave this session CLI access (`railway login` completed by the user; `railway
link` to project `endearing-creativity`). With actual `railway logs --build --latest` access,
the real story became clear in minutes:

- **Root cause:** two native-binary npm packages (`lightningcss`, pulled in via
  `@tailwindcss/postcss` → `@tailwindcss/node`; then `@tailwindcss/oxide`, pulled in via
  `@tailwindcss/postcss` directly) are transitive optional dependencies. On this session's
  Windows dev machine, `npm install`/`npm ci` — even after fully deleting and regenerating
  `package-lock.json` — would not record either package's `linux-x64-gnu` optional binary in the
  lockfile, only ever the Windows one. Railway's Linux build environment then ran `npm ci`
  strictly against that lockfile and could never find the native `.node` file it needed, failing
  every build with `Cannot find module '../lightningcss.linux-x64-gnu.node'` (and, once that was
  fixed, the identical failure mode for `@tailwindcss/oxide-linux-x64-gnu`).
- **Fix:** added both packages as **direct** dependencies (not just transitive) at their
  already-resolved versions. npm resolves and records the full cross-platform optional-binary
  set correctly for direct dependencies (confirmed already working for `@napi-rs/canvas` and
  `sharp`, both direct deps) — it was specifically the *transitive-only* resolution path that
  was incomplete. Confirmed by grepping the regenerated lockfile for both `-linux-x64-gnu` entries
  before pushing, then by an actual successful Railway build (`railway up --ci`, "Deploy complete",
  all 51 routes compiled).
- **Separately found and fixed while investigating:** commit `dc04817` (the last commit Railway
  had actually attempted to build, from 2+ hours before this fix) predates this session's
  `node-forge` fix, the bulk-verify/partner-demo dashboard UIs, and every doc reconciliation —
  **Railway's GitHub auto-deploy webhook had stopped triggering entirely** after that build
  failed, and never resumed on its own for any of the ~10 commits pushed since. Manually
  triggered the fixed build via `railway up --ci` rather than waiting on the webhook; the human
  should check Railway's GitHub integration settings for why auto-deploy stopped, since relying
  on a manual trigger every time is not sustainable through the pitch.
- **Live-verified after the fix**, not just build-success: `/api/enterprise/bulk-verify` → 401
  (not 404), `/api/documents/pdf-signature-check` → 400 (not 405), `/api/institutions/public-keys`
  → 200 with real data, `/partner-demo` → 200, `/dashboard/enterprise/bulk` → 200, CORS
  `X-Api-Key` header present. Every route built across this entire session is now live.

**Bonus fix while in there:** `TELEGRAM_WEBHOOK_SECRET` on Railway was set to a `getUpdates` API
URL (containing the bot token) instead of a proper random secret — a copy-paste mistake, not a
code bug. Generated a real random secret, set it on Railway, re-registered it with Telegram's
`setWebhook`, and proved the fix with a real simulated webhook call: the route now returns `200
{"ok":true}` and its own deploy logs show it actually attempting a reply (`Telegram text send
failed: 400 "Bad Request: chat not found"` — failing only because the test used a fake chat ID;
a real user messaging the bot now gets a real reply). Also copied `WHATSAPP_ACCESS_TOKEN`'s
value into the correctly-named `WHATSAPP_CLOUD_API_TOKEN` (the code reads the latter name; only
the name was wrong, confirmed via Railway's `${{VAR}}` reference syntax so the raw secret was
never printed) — see item 10 below for what's still missing on WhatsApp.

## 2. Flutter/Vercel dart-define values cannot be confirmed from this session

`chekkam/vercel-build.sh` is correct — it injects `API_BASE_URL`, `SUPABASE_URL`, and
`SUPABASE_ANON_KEY` from Vercel project environment variables into the Flutter web build.
Whether those three variables are actually *set* in the Vercel project's dashboard is
unverifiable without Vercel access. If the CORS fix above doesn't fully resolve "Could not
reach the Chekkam server" once it's confirmed deployed, this is the next thing to check —
specifically watch for `API_BASE_URL` being unset, which compiles the app with an **empty
string**, not the code's own `10.0.2.2:3000` fallback (that fallback only applies when the
`--dart-define` flag is entirely absent, and `vercel-build.sh` always passes it, just
potentially with an empty value).

## 3. RESOLVED — Telegram bot now actually replies

Both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` were already on Railway (the user must
have added them since the last report) — but the secret's value was wrong (see item 1). Fixed
and live-verified with a real simulated webhook call: 200 response, and the deploy logs show a
genuine reply attempt. A real Telegram user messaging the bot now gets a real reply.

## 4. WhatsApp Cloud API — partially fixed, two real gaps remain

`WHATSAPP_VERIFY_TOKEN` was already set correctly. `WHATSAPP_ACCESS_TOKEN` was set but under the
wrong name (code reads `WHATSAPP_CLOUD_API_TOKEN`) — fixed by copying the value across via
Railway's `${{VAR}}` reference syntax, so the raw secret was never exposed in any command output.

**Still genuinely missing, not just misnamed:**
- `WHATSAPP_APP_SECRET` — not set at all. Without it, incoming webhook requests are not
  signature-checked (the code logs a warning and proceeds anyway — safe default, but not
  production-ready).
- `WHATSAPP_PHONE_NUMBER_ID` — not set. Railway has `WHATSAPP_BUSINESS_ACCOUNT_ID` instead, which
  is a **different** Meta identifier (the WABA ID, not the phone number ID) — copying it across
  would silently misconfigure outbound sending rather than fix it, so this was deliberately left
  alone rather than guessed at. Get the actual phone_number_id from Meta's WhatsApp API dashboard
  (Business Settings → WhatsApp Accounts → the specific number) and set it directly.

## 4a. Facebook Messenger credentials are configured for a feature that was never built

Railway has `FB_APP_ID`, `FB_APP_SECRET`, `FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_VERIFY_TOKEN`,
`META_APP_ID`, and `META_APP_SECRET` all set — but `app/api/webhooks/messenger/route.ts` does not
exist anywhere in this codebase (confirmed during the `docs/` audit: FR-086 Messenger was never
started, correctly out of scope per CLAUDE.md's five named "Verify everywhere" surfaces, which
don't include Messenger). These variables are currently inert. Either build the route (if
Messenger genuinely matters for the pitch) or note that this credential set exists for future use
— not a bug, just worth knowing it's there and unconnected.

## 5. `/api/documents/verify-upload` likely has the same "malformed body → 500" bug just fixed in Task 9

While building `app/api/documents/pdf-signature-check/route.ts`, live-testing a POST with no
multipart body found that `req.formData()` throws when the request has no body/content-type at
all, and that thrown error isn't a recognized `ValidationError` — it falls through to a generic
500 instead of a 400. Fixed in the new route by wrapping the call. **Not fixed** in the
pre-existing `app/api/documents/verify-upload/route.ts`, which has the identical
`const form = await req.formData();` pattern unguarded — that route was not touched this task to
keep the change scoped to Task 9. Worth a two-line fix (wrap in try/catch, same as the new route)
before the pitch, since it's citizen-facing and a malformed request is not an exotic input.

## 6. Shared UI components not yet adopted on every page

Task 10 built `components/ui/{Button,StatusBadge,States,Card}` and migrated the three
highest-duplication dashboard pages (`documents`, `reports`, `alerts`). `safety-alerts`, the
public `check`/`verify` pages, and the auth pages still have their own hand-copied button/state
classes — not a regression (they worked before and still work), just not yet consistent with the
new shared components. Low-risk, mechanical follow-up whenever someone has a spare hour.

## 7. Local classifier dataset needs human review before any accuracy claim

`data/cameroon_seed.jsonl` (124 rows) is self-authored, modeled on known scam patterns, not a
collected/reviewed real dataset — Pidgin examples specifically were not written by a native
speaker. `ml/METRICS.md` states this explicitly. Per CLAUDE.md §10.4, do not present this
classifier's ~87.5% test-set accuracy as a validated production accuracy figure in the pitch
without a human (ideally a Cameroonian linguist or fraud-response SME) reviewing the dataset
first. This is not a code defect — it's a human sign-off this session cannot obtain on its own.

## All 12 P0/P1/P2 tasks from this run have now been attempted

Offline verification (Task 8), PDF digital-signature verification (Task 9), the shared UI
component library (Task 10), and the local classifier (Task 11) were all completed — see
STATUS_REPORT.md for what "complete" means for each (several were deliberately scoped down
rather than built superficially at full spec width; the report says exactly where and why).

## 8. `PARTNER_DEMO_API_KEY` is set locally only — not on Railway

A new demo-only partner API key was minted for `/partner-demo` (FR-092) and added to the local
`.env`. It needs to be set on Railway (as its own new key — do not reuse the local value; mint a
fresh one there, same as every other credential this session has recommended) before this page
works in production. Without it, `/partner-demo` still loads correctly and shows a clear
"not configured" error on both forms rather than crashing — this is a configuration step, not a
code gap.

## 9. Concurrent-writer risk materialized into a real regression this time, not just a hypothetical

Documented repeatedly in this file across the whole session as a risk; this pass found a concrete
instance: a teammate's PR, merged directly to `master` mid-session, silently dropped the
`node-forge` dependency (see STATUS_REPORT.md's gap-closing section for the full story). It was
caught and fixed here, but it demonstrates the exact failure mode already warned about — an
uncoordinated push changing `package.json` without anyone running the affected feature's tests
before merging. The recommendation from Task 0 stands, more urgently with three days left: one
person/session should own `master` pushes, or move to a review-gated PR flow with CI that at
least runs `npm run build` before merge.
