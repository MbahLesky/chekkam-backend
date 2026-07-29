"""Safe loading and validation for local-classifier training rows.

This module intentionally does not download feeds, crawl phishing pages, or
turn a provider label into a training label automatically. External data must
first be reviewed and normalized into ``data/reviewed/*.jsonl``, ``.json``, or
``.csv`` under the contract documented in ``ml/DATASET_PIPELINE.md``.

Only reviewed rows from a source allowed in the versioned manifest may be
added to the seed set. The default application build remains trained on the
committed Cameroon seed data alone.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "data" / "cameroon_seed.jsonl"
DEFAULT_MANIFEST_PATH = ROOT / "data" / "dataset-manifest.v1.json"
DEFAULT_REVIEWED_DIR = ROOT / "data" / "reviewed"

MANIFEST_VERSION = 1
REVIEWED_ROW_SCHEMA_VERSION = 1
RISK_LEVELS = {"low", "medium", "high"}
EXTERNAL_TRAINING_APPROVAL = "approved_after_human_review"


class DatasetValidationError(ValueError):
    """A row or source manifest does not meet the reviewed-data contract."""


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise DatasetValidationError(f"Dataset file does not exist: {path}")

    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise DatasetValidationError(
                    f"{path}:{line_number}: invalid JSON: {exc.msg}"
                ) from exc
            if not isinstance(row, dict):
                raise DatasetValidationError(
                    f"{path}:{line_number}: each JSONL value must be an object"
                )
            rows.append(row)
    return rows


def _read_csv(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise DatasetValidationError(f"Dataset file does not exist: {path}")

    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise DatasetValidationError(f"{path}: CSV needs a header row")
        rows: list[dict[str, Any]] = []
        for line_number, row in enumerate(reader, start=2):
            if None in row:
                raise DatasetValidationError(
                    f"{path}:{line_number}: CSV has more values than header columns"
                )
            rows.append(dict(row))
    return rows


def _read_json_array(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise DatasetValidationError(f"Dataset file does not exist: {path}")
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DatasetValidationError(f"{path}: invalid JSON: {exc.msg}") from exc
    if not isinstance(rows, list):
        raise DatasetValidationError(f"{path}: JSON reviewed data must be an array")
    if not all(isinstance(row, dict) for row in rows):
        raise DatasetValidationError(f"{path}: each JSON array value must be an object")
    return rows


def _read_reviewed_file(path: Path) -> list[dict[str, Any]]:
    if path.suffix == ".jsonl":
        return _read_jsonl(path)
    if path.suffix == ".json":
        return _read_json_array(path)
    if path.suffix == ".csv":
        return _read_csv(path)
    raise DatasetValidationError(f"Unsupported reviewed-data format: {path}")


def load_manifest(path: Path = DEFAULT_MANIFEST_PATH) -> dict[str, Any]:
    """Load the source allow-list and reject malformed/unversioned manifests."""

    if not path.is_file():
        raise DatasetValidationError(f"Dataset manifest does not exist: {path}")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DatasetValidationError(f"Invalid dataset manifest JSON: {exc.msg}") from exc

    if not isinstance(manifest, dict):
        raise DatasetValidationError("Dataset manifest must be a JSON object")
    if manifest.get("manifest_version") != MANIFEST_VERSION:
        raise DatasetValidationError(
            f"Unsupported manifest version {manifest.get('manifest_version')!r}; "
            f"expected {MANIFEST_VERSION}"
        )
    if not isinstance(manifest.get("sources"), list):
        raise DatasetValidationError("Dataset manifest requires a sources array")

    seen_source_ids: set[str] = set()
    for source in manifest["sources"]:
        if not isinstance(source, dict):
            raise DatasetValidationError("Each manifest source must be an object")
        source_id = source.get("id")
        if not isinstance(source_id, str) or not source_id:
            raise DatasetValidationError("Each manifest source needs a non-empty id")
        if source_id in seen_source_ids:
            raise DatasetValidationError(f"Duplicate source id in manifest: {source_id}")
        seen_source_ids.add(source_id)
        if not isinstance(source.get("dataset_version"), str) or not source["dataset_version"]:
            raise DatasetValidationError(
                f"Manifest source {source_id} needs a non-empty dataset_version"
            )
    return manifest


def _source_index(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {source["id"]: source for source in manifest["sources"]}


def _require_string(row: dict[str, Any], field: str, context: str) -> str:
    value = row.get(field)
    if not isinstance(value, str) or not value.strip():
        raise DatasetValidationError(f"{context}: {field} must be a non-empty string")
    return value.strip()


def _validate_review_date(value: str, context: str) -> None:
    try:
        dt.date.fromisoformat(value)
    except ValueError as exc:
        raise DatasetValidationError(
            f"{context}: reviewed_at must be an ISO date (YYYY-MM-DD)"
        ) from exc


def build_training_text(row: dict[str, Any], context: str) -> str:
    """Make one lexical input from reviewed text and/or a URL.

    No URL is fetched or dereferenced. A URL-only row contributes lexical URL
    components, not webpage, image, video, or attachment content.
    """

    text_value = row.get("text")
    url_value = row.get("url")
    text = text_value.strip() if isinstance(text_value, str) else ""
    url = url_value.strip() if isinstance(url_value, str) else ""

    if not text and not url:
        raise DatasetValidationError(f"{context}: provide at least one of text or url")
    if len(text) > 20_000:
        raise DatasetValidationError(f"{context}: text exceeds the 20,000-character limit")
    if len(url) > 4_096:
        raise DatasetValidationError(f"{context}: url exceeds the 4,096-character limit")

    if not text:
        return f"URL: {url}"
    if url and url not in text:
        return f"{text}\nURL: {url}"
    return text


def validate_seed_row(row: dict[str, Any], context: str) -> dict[str, Any]:
    """Validate the committed demo seed without changing its schema."""

    text = _require_string(row, "text", context)
    risk_level = _require_string(row, "risk_level", context)
    if risk_level not in RISK_LEVELS:
        raise DatasetValidationError(f"{context}: risk_level must be one of {sorted(RISK_LEVELS)}")
    result = dict(row)
    result["text"] = text
    return result


def validate_reviewed_row(
    row: dict[str, Any], *, source_index: dict[str, dict[str, Any]], context: str
) -> dict[str, Any]:
    """Validate and normalize one human-approved external row."""

    if str(row.get("schema_version")) != str(REVIEWED_ROW_SCHEMA_VERSION):
        raise DatasetValidationError(
            f"{context}: schema_version must be {REVIEWED_ROW_SCHEMA_VERSION}"
        )

    source_dataset = _require_string(row, "source_dataset", context)
    source = source_index.get(source_dataset)
    if source is None:
        raise DatasetValidationError(f"{context}: source_dataset is not in the manifest")
    if source.get("training_approval") != EXTERNAL_TRAINING_APPROVAL:
        raise DatasetValidationError(
            f"{context}: source_dataset {source_dataset!r} is not approved for reviewed training"
        )

    source_dataset_version = _require_string(row, "source_dataset_version", context)
    if source_dataset_version != source["dataset_version"]:
        raise DatasetValidationError(
            f"{context}: source_dataset_version must match manifest version "
            f"{source['dataset_version']!r}"
        )

    risk_level = _require_string(row, "risk_level", context)
    if risk_level not in RISK_LEVELS:
        raise DatasetValidationError(f"{context}: risk_level must be one of {sorted(RISK_LEVELS)}")
    if _require_string(row, "review_status", context) != "approved":
        raise DatasetValidationError(f"{context}: review_status must be approved")

    reviewed_at = _require_string(row, "reviewed_at", context)
    _validate_review_date(reviewed_at, context)
    source_record_id = _require_string(row, "source_record_id", context)
    reviewer_id = _require_string(row, "reviewed_by", context)
    category = _require_string(row, "category", context)
    language = _require_string(row, "language", context)
    label_basis = _require_string(row, "label_basis", context)
    text = build_training_text(row, context)

    result = dict(row)
    result.update(
        {
            "source_dataset": source_dataset,
            "source_dataset_version": source_dataset_version,
            "source_record_id": source_record_id,
            "reviewed_by": reviewer_id,
            "reviewed_at": reviewed_at,
            "risk_level": risk_level,
            "category": category,
            "language": language,
            "label_basis": label_basis,
            "text": text,
        }
    )
    return result


def load_seed_rows(path: Path = SEED_PATH) -> list[dict[str, Any]]:
    rows = _read_jsonl(path)
    return [validate_seed_row(row, f"{path}:{index}") for index, row in enumerate(rows, start=1)]


def load_reviewed_rows(
    reviewed_dir: Path = DEFAULT_REVIEWED_DIR,
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
) -> list[dict[str, Any]]:
    """Load reviewed JSONL, JSON-array, and CSV files in deterministic order.

    An empty or missing review directory is valid, allowing a fresh clone to
    retain the committed seed-only behavior.
    """

    manifest = load_manifest(manifest_path)
    sources = _source_index(manifest)
    if not reviewed_dir.exists():
        return []
    if not reviewed_dir.is_dir():
        raise DatasetValidationError(f"Reviewed-data path is not a directory: {reviewed_dir}")

    rows: list[dict[str, Any]] = []
    seen_records: set[tuple[str, str]] = set()
    seen_text_fingerprints: set[str] = set()
    reviewed_files = sorted(
        [*reviewed_dir.glob("*.jsonl"), *reviewed_dir.glob("*.json"), *reviewed_dir.glob("*.csv")]
    )
    for path in reviewed_files:
        for line_number, raw_row in enumerate(_read_reviewed_file(path), start=1):
            context = f"{path}:{line_number}"
            row = validate_reviewed_row(raw_row, source_index=sources, context=context)
            record_key = (row["source_dataset"], row["source_record_id"])
            if record_key in seen_records:
                raise DatasetValidationError(
                    f"{context}: duplicate source_dataset/source_record_id {record_key!r}"
                )
            seen_records.add(record_key)

            fingerprint = hashlib.sha256(row["text"].casefold().encode("utf-8")).hexdigest()
            if fingerprint in seen_text_fingerprints:
                raise DatasetValidationError(
                    f"{context}: duplicate training text across reviewed rows"
                )
            seen_text_fingerprints.add(fingerprint)
            rows.append(row)
    return rows


def source_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Return a stable provenance summary suitable for generated metrics."""

    counts: dict[str, int] = {"cameroon_seed_v1": 0}
    for row in rows:
        source = row.get("source_dataset", "cameroon_seed_v1")
        counts[source] = counts.get(source, 0) + 1
    return dict(sorted((source, count) for source, count in counts.items() if count))
