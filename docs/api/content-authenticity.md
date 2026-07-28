# AI Content Authenticity API

Best-effort, **advisory-only** assessment of whether submitted text, an
image, or a document shows indicators of AI generation, manipulation, or
fabrication.

## This is not a forensic tool

Detecting AI-generated content — by asking an LLM to self-assess text, or a
vision model to reason over an image — is a known-unreliable signal, not a
verdict. `lib/ai/content-authenticity.ts` enforces this structurally:
**`confidence` is capped at `"medium"`, never `"high"`**, no matter what the
underlying model reports. Every UI surface must present results as advisory
(the same "automated first look, needs human review" framing used
everywhere else in this app), never as a definitive answer.

## `POST /api/ai/content-authenticity`

Anonymous submission allowed. Rate limited: 10 requests / 10 minutes / IP.

**Body** — JSON `{ "content_type": "text", "text": "..." }`, or
`multipart/form-data` with a `file` field (PNG/JPEG/WEBP/PDF), or a `kind`
field set to `video`/`audio` (see below).

- **text**: `analyzeTextAuthenticity()` — LLM self-assessment for generic
  structure, lack of specific detail, repetitive phrasing.
- **image**: `analyzeImageAuthenticity()` — vision-model assessment
  (unnatural textures, inconsistent lighting, distorted detail) plus a
  coarse EXIF-presence check as a weak supplementary signal.
- **document** (PDF): OCR (`lib/ai/ocr.ts`, reused, not duplicated) then a
  fabrication-focused prompt — a different question from the scam-risk
  classifier (`lib/ai/risk-analysis.ts`), not a copy of it.
- **video/audio**: returns `status: "not_supported"` immediately. No
  frame-by-frame or audio-sync deepfake pipeline is built — that's a
  specialized CV/ML undertaking out of scope for this phase. The database
  schema (`content_authenticity_checks.content_type`) already includes
  `video`/`audio` so this can be filled in later without a migration.

**Response** `201` — the created `content_authenticity_checks` row:
```json
{
  "id": "uuid",
  "content_type": "image",
  "status": "done" | "unavailable" | "not_supported" | "failed",
  "ai_likelihood": "low" | "medium" | "high" | "unknown",
  "confidence": "low" | "medium" | null,
  "indicators": { "...": "..." },
  "explanation": ["..."]
}
```

`status: "unavailable"` means `OPENAI_API_KEY` isn't configured or the call
failed — same honesty convention as `lib/ai/ocr.ts` (no fabricated result).

## `GET /api/ai/content-authenticity/history` / `/:id`

Same shape and auth posture as the equivalent OCR endpoints
(`docs/api/ocr.md`): history requires a bearer token (staff see everything,
everyone else their own); detail requires auth + ownership.
