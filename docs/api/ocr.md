# OCR API

The `ocr` endpoints extract text from an uploaded image or PDF, using the
vision-capable engine in `lib/ai/ocr.ts`. Results are stored in the shared
`evidence` table (also used by document verification), not a separate table.

All responses use the standard error envelope (`lib/errors.ts`) on failure:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "file" } }
```

## `POST /api/ocr/upload`

Extract text from an uploaded file. Anonymous submission is allowed (same
policy as `/api/reports` and `/api/documents/verify-upload`) — a session, if
present, attaches `uploaded_by`.

**Body**: `multipart/form-data`, field `file` (required).

- Max size: 10MB.
- Allowed types: PNG, JPEG, WEBP, PDF — verified by magic bytes (`file-type`
  package), never the client-supplied `Content-Type`.
- Rate limited: 10 requests / 10 minutes / IP.

**Processing**:
- **Images** go straight to the vision model (same OpenAI setup as
  `analyzeContent()` — `OPENAI_API_KEY`/`OPENAI_MODEL`, `lib/ai/config.ts`).
- **PDFs** try their embedded text layer first (`pdf-parse`); if that yields
  next to nothing (a scanned document with no real text layer), up to the
  first 5 pages are rendered to images and OCR'd the same way as a photo.

**Response** `201` — the created `evidence` row:
```json
{
  "id": "uuid",
  "file_hash": "sha256 hex",
  "file_type": "image/png",
  "status": "done" | "unavailable" | "failed",
  "ocr_text": "...",
  "confidence": "low" | "medium" | "high",
  "source": "vision_ai" | "pdf_text_layer" | "pdf_vision_ocr",
  "processing_time_ms": 1234,
  "uploaded_by": "uuid | null",
  "created_at": "..."
}
```

`status: "unavailable"` means `OPENAI_API_KEY` isn't configured or every
attempt failed — unlike `analyzeContent()`'s rule-based fallback, there is no
honest non-AI way to do OCR, so this endpoint says so rather than fabricating
a result. `status: "failed"` means an unexpected error occurred (e.g. a
corrupt file); `ocr_text`/`confidence`/`source` are `null` in both cases.

## `GET /api/ocr/:id`

Full detail for one OCR result. **Requires a bearer token and ownership**
(staff, or the uploader). This is a deliberate deviation from
`GET /api/reports/:id` (unauthenticated by design, UUID as bearer secret) —
OCR content can carry personal document data, which is more sensitive than a
risk label. An anonymous uploader already gets their full result inline in
the upload response; they just can't come back for it later without an
account.

`404` if not found, `403` if authenticated but not staff/owner.

## `GET /api/ocr/history`

Filterable list, same shape as `GET /api/reports`: staff get every
submission, everyone else is scoped to their own (`uploaded_by = self`). No
token → `401`.

**Response** `200`:
```json
{ "ocr_results": [ { "id": "uuid", "status": "done", "...": "..." } ] }
```

## Storage

Uploaded bytes are stored in the private `ocr-uploads` Supabase Storage
bucket (migration `0005_ocr_evidence.sql`). Nothing reads from it directly —
all access goes through these API routes via the service-role client, same
as every other Supabase interaction in this repo.

## Scope note

This phase deliberately stays synchronous — no async job queue (the `ai_jobs`
table from Phase 1 is still unused). Scanned-PDF rasterization is capped at 5
pages for this reason; if that cap becomes a real problem, that's the signal
to give `ai_jobs` its first consumer rather than raising the cap indefinitely.
