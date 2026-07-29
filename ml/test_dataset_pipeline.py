"""Regression checks for the reviewed external-data contract.

Run with: ``python -m unittest ml.test_dataset_pipeline``
"""

from __future__ import annotations

import json
import csv
import tempfile
import unittest
from pathlib import Path

from ml.dataset_pipeline import (
    DatasetValidationError,
    load_manifest,
    load_reviewed_rows,
)
from ml import train
from ml.train import load_rows


class ReviewedDatasetPipelineTests(unittest.TestCase):
    def valid_row(self) -> dict[str, str | int]:
        return {
            "schema_version": 1,
            "source_dataset": "uci_phiusiil_2024",
            "source_dataset_version": "2024-03-03",
            "source_record_id": "row-1",
            "url": "https://example.invalid/account-check",
            "risk_level": "high",
            "category": "phishing",
            "language": "en",
            "review_status": "approved",
            "reviewed_by": "reviewer-team-01",
            "reviewed_at": "2026-07-29",
            "label_basis": "source_label_confirmed_by_human_review",
        }

    def write_rows(self, directory: Path, rows: list[dict[str, str | int]]) -> None:
        (directory / "reviewed.jsonl").write_text(
            "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
        )

    def test_manifest_has_versioned_reviewable_source(self) -> None:
        manifest = load_manifest()
        self.assertEqual(manifest["manifest_version"], 1)
        sources = {source["id"]: source for source in manifest["sources"]}
        self.assertEqual(
            sources["uci_phiusiil_2024"]["training_approval"],
            "approved_after_human_review",
        )
        self.assertEqual(
            sources["difraud_phishing_c459612"]["training_approval"],
            "approved_after_human_review",
        )
        self.assertEqual(
            sources["phishtank_online_valid"]["training_approval"],
            "not_approved_without_terms_review",
        )

    def test_url_only_reviewed_row_is_normalized_without_network_access(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            self.write_rows(directory, [self.valid_row()])
            rows = load_reviewed_rows(directory)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["text"], "URL: https://example.invalid/account-check")

    def test_csv_reviewed_row_uses_the_same_validation_contract(self) -> None:
        row = self.valid_row()
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            with (directory / "reviewed.csv").open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(row))
                writer.writeheader()
                writer.writerow(row)
            rows = load_reviewed_rows(directory)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source_dataset"], "uci_phiusiil_2024")

    def test_json_array_reviewed_row_uses_the_same_validation_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            (directory / "reviewed.json").write_text(
                json.dumps([self.valid_row()]), encoding="utf-8"
            )
            rows = load_reviewed_rows(directory)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["risk_level"], "high")

    def test_training_loader_adds_reviewed_rows_only_when_opted_in(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            self.write_rows(directory, [self.valid_row()])
            seed_only = load_rows()
            with_reviewed = load_rows(include_reviewed=True, reviewed_dir=directory)

        self.assertEqual(len(seed_only), 124)
        self.assertEqual(len(with_reviewed), 125)
        self.assertEqual(with_reviewed[-1]["source_dataset"], "uci_phiusiil_2024")

    def test_generated_metrics_identify_opt_in_data_provenance(self) -> None:
        metrics = {
            "accuracy": 0.5,
            "per_class": {
                "low": {"precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 1},
                "medium": {"precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 1},
                "high": {"precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 1},
            },
            "confusion": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            original_metrics_path = train.METRICS_PATH
            try:
                train.METRICS_PATH = Path(temp_dir) / "METRICS.md"
                train.write_metrics_doc(
                    metrics,
                    metrics,
                    vocab_size=3,
                    n_train=3,
                    n_test=3,
                    provenance={
                        "manifest_version": 1,
                        "reviewed_rows": 1,
                        "source_counts": {"cameroon_seed_v1": 5, "uci_phiusiil_2024": 1},
                    },
                )
                contents = train.METRICS_PATH.read_text(encoding="utf-8")
            finally:
                train.METRICS_PATH = original_metrics_path

        self.assertIn("Reviewed external rows", contents)
        self.assertIn("uci_phiusiil_2024: 1", contents)

    def test_unapproved_feed_is_rejected_even_when_row_is_marked_approved(self) -> None:
        row = self.valid_row()
        row["source_dataset"] = "phishtank_online_valid"
        row["source_dataset_version"] = "live_feed"
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            self.write_rows(directory, [row])
            with self.assertRaisesRegex(DatasetValidationError, "not approved"):
                load_reviewed_rows(directory)

    def test_duplicate_source_record_is_rejected(self) -> None:
        duplicate = self.valid_row()
        duplicate["text"] = "Different text cannot overwrite the same source record."
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            self.write_rows(directory, [self.valid_row(), duplicate])
            with self.assertRaisesRegex(DatasetValidationError, "duplicate source_dataset/source_record_id"):
                load_reviewed_rows(directory)


if __name__ == "__main__":
    unittest.main()
