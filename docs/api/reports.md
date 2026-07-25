# Reports API

The `reports` endpoints are the core intake path for citizen-submitted content
(SRS §6.1) and the foundation the AI risk-analysis subsystem is built on
(`lib/ai/risk-analysis.ts`). This is the only analyzer in the codebase — do not
write a second one; new content types plug into `analyzeContent()`.

All responses use the standard error envelope (`lib/errors.ts`) on failure:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "raw_content" } }
```

## `POST /api/reports`

Submit suspicious content for analysis. Anonymous submission is allowed
(FR-005) — a session, if present, attaches `reporter_id`.

**Body**

| Field | Type | Notes |
|---|---|---|
| `content_type` | `"text" \| "link" \| "image" \| "file"` | required |
| `raw_content` | string | required for `text`/`link` |
| `file_url` | string (URL) | required for `image`/`file` |
| `channel` | enum | default `"mobile"` |
| `language` | enum | default `"unknown"` |
| `lat`, `lng` | number | optional |
| `evidence_id` | uuid | optional — links a prior `POST /api/ocr/upload` result (`docs/api/ocr.md`) to this report by setting `evidence.report_id`. Best-effort: an unknown/foreign ID is a silent no-op, never a failed submission. |

`text`/`link` content is analyzed synchronously (AI risk analysis + campaign
matching) before the response is returned. `image`/`file` content is left
`pending` for analyst review — there is no server-side OCR-then-analyze
pipeline; the client is expected to call `POST /api/ocr/upload` first, then
submit the extracted text here as `content_type: "text"` with `evidence_id`
set, reusing this same endpoint rather than a second one (see
`lib/features/ocr` / `report_form_screen.dart`'s "Image" option in the
frontend for the reference implementation).

**Response** `201`
```json
{ "id": "uuid", "status": "pending" | "analyzed", "message": "..." }
```
Fetch the full analysis via `GET /api/reports/:id`.

## `GET /api/reports`

Filterable list. **Requires a bearer token.** Behavior depends on the caller's
role:

- **Staff** (`analyst`/`admin`/`super_admin`): full list across all reporters,
  filterable by `status`, `risk_level`, `category`, `channel` query params —
  this is the analyst dashboard view (FR-081).
- **Everyone else** (citizen): always scoped to their own submitted reports
  (`reporter_id = <their id>`), regardless of other filters — this is the "my
  reports" history view. The same status/risk_level/category/channel filters
  still apply on top of that scoping.

No token → `401 UNAUTHORIZED`.

**Response** `200`
```json
{ "reports": [ { "id": "uuid", "status": "analyzed", "risk_level": "high", "...": "..." } ] }
```

## `GET /api/reports/:id`

Full analysis detail for one report (SRS §6.1). Deliberately **unauthenticated
by design** — the report's UUID itself acts as the lookup secret, since
anonymous submitters (no session) have no other way to check their own
report's status. Do not add auth here; it would break anonymous reporting.

When the report belongs to a scam campaign (`lib/campaigns/matcher.ts`), the
response includes `related_reports`: other reports in the same campaign,
`id`/`risk_level`/`category`/`created_at` only — never another citizen's
`raw_content` or `reporter_id` (same redaction posture as
`lib/privacy/redact.ts`). Empty array if there's no campaign. This reuses the
existing campaign-matching infrastructure; it is not a new similarity engine.

## `PATCH /api/reports/:id`

Analyst status transition. Requires `analyst`/`admin`/`super_admin`. Writes an
`audit_logs` row and, when the new status is a final one
(`verified_threat`/`false_report`/`dismissed`), pushes a notification to the
submitter if they have a consented device token.

## AI prediction audit log

Every call to `analyzeContent()` — from this route or any of its other three
callers (`/api/extension/check`, `/v1/partner/check`, the WhatsApp/Telegram bot
router) — writes one row to `ai_predictions` (`lib/ai/predictions.ts`):
model, input type, latency, and outcome (`source: "ai" | "rule_based_fallback"`,
plus an `error` field on the fallback paths). This is distinct from the
`reports` table, which only holds the *current* result per report; a report
that's re-analyzed later would have multiple `ai_predictions` rows. Staff-only
read via RLS (`ai_predictions_select_staff`), intended as the data source for
a future admin AI-analytics view — nothing reads it yet in this phase.

Logging is best-effort and never throws — a logging failure must never break
the citizen-facing analysis response.
