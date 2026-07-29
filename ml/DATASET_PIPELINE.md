# Local classifier data pipeline

This is a bounded training path for Chekkam's **text/URL scam-and-phishing
risk classifier**. It is not an image, video, voice-clone, document-forgery,
or general AI-content detector. A model trained through this path may help rank
a pasted message or URL for review; it must not be presented as proof that
content is fraudulent, legitimate, or AI-generated.

The committed application model remains the small `data/cameroon_seed.jsonl`
demo set. Nothing in this repository downloads data, calls an intelligence
feed, crawls a URL, or changes the demo model automatically.

## Sources and licensing

The allow-list is [data/dataset-manifest.v1.json](../data/dataset-manifest.v1.json).
It deliberately distinguishes:

- **Approved after human review:**
  [UCI PhiUSIIL Phishing URL (Website)](https://archive.ics.uci.edu/dataset/967/phiusil-phishing-url-dataset)
  (CC BY 4.0 on its source page) and
  [DiFrauD phishing email corpus](https://huggingface.co/datasets/difraud/difraud/tree/main/phishing)
  (MIT according to its dataset card).
- **Not approved yet:** live feeds such as PhishTank and OpenPhish. Their
  current terms and access controls must be reviewed before a maintainer makes
  a new manifest version that permits training use. Merely being publicly
  reachable is not permission to train on, redistribute, scrape, or publish a
  feed.

Before every acquisition, a maintainer must re-check the linked terms, keep
the required attribution/citation, and confirm no provider restrictions or
local privacy obligations block this use. Do not commit raw provider archives,
tokens, screenshots, captured credentials, personal data, or live malicious
links to this repository.

## Prepare reviewed rows

1. Download an allowed source **manually**, outside this repository, following
   its current terms. Never execute, visit, or crawl URLs from the source.
2. A trained reviewer removes unnecessary personal data and independently
   chooses Chekkam's `low`, `medium`, or `high` risk label. A provider's binary
   "phishing" label is evidence, not an automatic `high` risk label.
3. Save only the approved, normalized rows locally in
   `data/reviewed/<source>-reviewed.jsonl`, `.json`, or `.csv`. This folder is
   ignored by Git. A `.json` file is an array of the objects below; CSV must
   use the same field names.
4. Validate and train with the explicit opt-in commands below. Keep the
   source manifest, reviewer decision record, data snapshot checksum, and
   resulting model version together in secure project records.

Each JSONL line, JSON-array item, or CSV record must follow this schema.
`text` and `url` are optional individually, but at least one is required. When
both are supplied, training uses `text` plus a clearly marked `URL:` line. No
network request is made.

```json
{
  "schema_version": 1,
  "source_dataset": "uci_phiusiil_2024",
  "source_dataset_version": "2024-03-03",
  "source_record_id": "opaque-source-row-000001",
  "text": "Optional reviewed message context, with sensitive details removed.",
  "url": "https://example.invalid/login",
  "risk_level": "high",
  "category": "phishing",
  "language": "en",
  "review_status": "approved",
  "reviewed_by": "reviewer-team-01",
  "reviewed_at": "2026-07-29",
  "label_basis": "source_label_confirmed_by_human_review"
}
```

Use an opaque reviewer/team ID, not a person's full name. Preserve the source
record ID and dataset version so a bad label can be traced and removed. The
loader rejects unapproved sources, missing review metadata, duplicate source
records, and duplicate normalized text.

## Commands

From `chekkam-backend`:

```powershell
# Existing demo behavior: only the committed 124-row seed set.
python ml/train.py --dry-run

# Validate the local reviewed folder and calculate metrics without changing
# ml/model.json or ml/METRICS.md.
python ml/train.py --include-reviewed --dry-run

# After a human has approved the dataset and the dry run has been reviewed,
# regenerate the committed pure-TypeScript model and metrics.
python ml/train.py --include-reviewed

# Regression checks for manifest and reviewed-row validation.
python -m unittest ml.test_dataset_pipeline
```

`--include-reviewed` is intentionally required. With no flag, a clean clone
uses exactly the current seed-only model behavior. For an opt-in retraining,
the generated metrics record only source counts and manifest version as
provenance; they do not embed raw reviewer records.

## Evaluation boundary

Do not quote the generated random held-out accuracy as field performance.
Before any pilot claim, evaluate on a separate, time-split, human-reviewed
Cameroon-relevant set that was never used for training or threshold selection;
report class-wise precision/recall, false positives, false negatives, language
coverage, and failures. Keep `needs_human_review` and the deterministic safety
rules in place regardless of model score.
