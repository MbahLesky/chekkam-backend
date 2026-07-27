# Safety Check API

The `security` endpoints power **Safety Check** — an on-demand tool where a
user submits a link, QR payload, file, or pasted text (e.g. a forwarded SMS
or email) to be checked for scam/malware indicators.

## Why this isn't "Device Security Scan"

An earlier version of this feature's spec asked for autonomous device
scanning: enumerating installed apps, reading SMS/browser history, and
background clipboard monitoring. All three are platform-blocked, not just
hard to build:

- **Installed-app/package scanning**: iOS has no third-party API for this at
  all. Android's `QUERY_ALL_PACKAGES` permission is Play-Store-restricted to
  a narrow set of app categories (dedicated antivirus/device-search apps
  with a mandatory declaration form) — a general trust/anti-scam app would
  very likely be rejected for requesting it.
- **SMS/browser-history reading**: no third-party API exists on either OS.
  Android restricts SMS access to the user's default SMS handler.
- **Background clipboard monitoring**: both OSes now show the user a visible
  "app pasted from clipboard" system alert specifically to prevent silent
  snooping — building this would actively undermine trust in a *trust* app.

Safety Check is the buildable, consent-respecting alternative: the user
explicitly submits exactly what they want checked, nothing is read
automatically or in the background.

All responses use the standard error envelope (`lib/errors.ts`) on failure.

## `POST /api/security/check`

Anonymous submission allowed (session, if present, attaches `user_id`).
Rate limited: 15 requests / 10 minutes / IP.

**Body** — either `multipart/form-data` with a `file` field (image/PDF), or
JSON:
```json
{ "input_type": "link" | "qr" | "text", "url": "...", "text": "...", "language": "en" }
```

Dispatches by input type, reusing existing engines rather than a new
analyzer per type ("one engine, many doors"):
- **link/qr**: `lib/url-intelligence.ts` (HTTPS check, typosquatting,
  redirect-chain analysis) combined with `analyzeContent()`.
- **file**: MIME-sniffed (never trusts the client's `Content-Type`), checked
  for embedded PDF JavaScript and extension/MIME mismatches, plus OCR +
  `analyzeContent()` on any extracted text (images only — PDFs skip this to
  avoid double-counting, since the PDF-JS check already covers PDF-specific
  risk).
- **text**: directly `analyzeContent()` — the same engine every other
  message-check path in this app uses.

**Response** `201` — the created `security_checks` row:
```json
{
  "id": "uuid",
  "input_type": "link",
  "risk_level": "low" | "medium" | "high" | "critical",
  "risk_score": 42,
  "findings": [ { "id": "...", "risk": 25, "explanation": "..." } ],
  "recommended_action": "..."
}
```

## `GET /api/security/history`

Same shape as `GET /api/reports`/`GET /api/ocr/history`: staff see every
check, everyone else is scoped to their own. Requires a bearer token.

## `GET /api/security/report/:id`

Requires auth + ownership (staff or the submitter) — unlike
`GET /api/reports/:id`'s deliberate anonymous access, submitted content here
can be more sensitive (a pasted SMS, an uploaded file), so this follows the
same posture as `GET /api/ocr/:id`.
