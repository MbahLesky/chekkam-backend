# Chekkam — Blockers (2026-07-27 autonomous build run)

Per the working method: anything stalled >20 minutes, or requiring access this session doesn't
have, logged here with the exact evidence rather than guessed at.

## 1. Railway deployment appears to be behind `origin/master`

**Evidence:**
```
$ curl -s -D - -H "Origin: https://chekkam.vercel.app" \
  https://chekkam-backend-production.up.railway.app/api/public-alerts
access-control-allow-origin: https://chekkam.vercel.app   # correct, this part deployed
access-control-allow-headers: Content-Type, Authorization  # WRONG — origin/master has
                                                             # "Content-Type, Authorization, X-Api-Key"

$ curl -s -o /dev/null -w "%{http_code}" -X POST \
  https://chekkam-backend-production.up.railway.app/api/enterprise/bulk-verify
404   # this route was pushed to origin/master over 30 minutes before this check
```
`git show origin/master:proxy.ts` confirms the `X-Api-Key` header addition IS present in the
branch — so the deployed instance is not running current `origin/master`, despite Railway's
GitHub integration normally auto-deploying on push.

**What I tried:** re-checked after a 20s wait; re-confirmed against `git log origin/master`
that the pushes genuinely landed. Cannot go further without Railway dashboard/CLI access
(the local Railway CLI here is unauthenticated — `railway login` requires interactive browser
auth only a human can complete).

**Exact next step for the human:** open the Railway dashboard → Deployments tab for
`chekkam-backend` → check whether a deploy is queued/building/failed. If failed, the build logs
will show why (this exact failure mode — a bad merge breaking `npm run build` — already
happened once this week, see git history around commit `2d85be3a`).

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

## 3. Telegram bot won't actually reply until Railway has its own tokens

The webhook is registered with Telegram (confirmed via `getWebhookInfo`) and points at the
correct Railway URL. But `TELEGRAM_BOT_TOKEN` and the newly-generated `TELEGRAM_WEBHOOK_SECRET`
need to be added to Railway's environment variables for the deployed `/api/webhooks/telegram`
route to actually process and reply to messages — this session has no Railway dashboard access
to do that part.

## 4. WhatsApp Cloud API test-number provisioning

Code is complete (signature validation, full inbound/outbound) — the remaining gap is entirely
a Meta Business dashboard task (test number, app secret, verify token, allow-listed recipients),
which no amount of code access resolves.

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
