"""
Trains a small TF-IDF + multinomial logistic regression classifier on
data/cameroon_seed.jsonl by default and exports ml/model.json for pure-TypeScript
inference (lib/ai/local-model.ts) — no scikit-learn dependency, so the exact
math is fully known and reproducible in both Python and TypeScript.

Deliberately unigram-only: with ~124 examples, bigram/char-ngram features
would mostly memorize exact phrases from single training rows rather than
learn generalizable signal. Predicts risk_level only (low/medium/high) —
category, indicators, and suspicious_phrases stay rule-based in
lib/ai/risk-analysis.ts, since this dataset is too small to learn a
reliable 9-way category classifier honestly.

Run: python ml/train.py
Reviewed rows (explicit opt-in): python ml/train.py --include-reviewed
"""
import argparse
import json
import math
import re
from pathlib import Path

import numpy as np

try:
    from dataset_pipeline import (
        DEFAULT_MANIFEST_PATH,
        DEFAULT_REVIEWED_DIR,
        load_manifest,
        load_reviewed_rows,
        load_seed_rows,
        source_counts,
    )
except ImportError:  # Supports ``python -m ml.train`` as well as direct execution.
    from ml.dataset_pipeline import (  # type: ignore[no-redef]
        DEFAULT_MANIFEST_PATH,
        DEFAULT_REVIEWED_DIR,
        load_manifest,
        load_reviewed_rows,
        load_seed_rows,
        source_counts,
    )

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "cameroon_seed.jsonl"
MODEL_PATH = ROOT / "ml" / "model.json"
METRICS_PATH = ROOT / "ml" / "METRICS.md"

CLASSES = ["low", "medium", "high"]
MIN_DF = 2
L2_LAMBDA = 0.02
LEARNING_RATE = 0.5
EPOCHS = 400
TEST_FRACTION = 0.2
SHUFFLE_SEED = 42

TOKEN_PATTERN = re.compile(r"[a-zA-ZÀ-ÿ]+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_PATTERN.findall(text)]


def load_rows(
    include_reviewed: bool = False,
    reviewed_dir: Path = DEFAULT_REVIEWED_DIR,
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
) -> list[dict]:
    """Return the seed set, plus reviewed rows only when explicitly requested."""

    rows = load_seed_rows(DATA_PATH)
    if include_reviewed:
        rows.extend(load_reviewed_rows(reviewed_dir, manifest_path))
    return rows


def build_vocab(token_lists: list[list[str]]) -> tuple[dict[str, int], np.ndarray]:
    df: dict[str, int] = {}
    for tokens in token_lists:
        for term in set(tokens):
            df[term] = df.get(term, 0) + 1
    vocab_terms = sorted(t for t, c in df.items() if c >= MIN_DF)
    vocab = {term: i for i, term in enumerate(vocab_terms)}
    n_docs = len(token_lists)
    idf = np.array(
        [math.log((1 + n_docs) / (1 + df[term])) + 1.0 for term in vocab_terms],
        dtype=np.float64,
    )
    return vocab, idf


def vectorize(tokens: list[str], vocab: dict[str, int], idf: np.ndarray) -> np.ndarray:
    vec = np.zeros(len(vocab), dtype=np.float64)
    for term in tokens:
        idx = vocab.get(term)
        if idx is not None:
            vec[idx] += 1.0
    vec *= idf
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    exp = np.exp(z)
    return exp / exp.sum(axis=1, keepdims=True)


def train_softmax_regression(X: np.ndarray, y_idx: np.ndarray, n_classes: int) -> tuple[np.ndarray, np.ndarray]:
    n_samples, n_features = X.shape
    W = np.zeros((n_features, n_classes), dtype=np.float64)
    b = np.zeros(n_classes, dtype=np.float64)
    Y = np.zeros((n_samples, n_classes), dtype=np.float64)
    Y[np.arange(n_samples), y_idx] = 1.0

    for _ in range(EPOCHS):
        logits = X @ W + b
        probs = softmax(logits)
        grad_logits = (probs - Y) / n_samples
        grad_W = X.T @ grad_logits + L2_LAMBDA * W
        grad_b = grad_logits.sum(axis=0)
        W -= LEARNING_RATE * grad_W
        b -= LEARNING_RATE * grad_b

    return W, b


def evaluate(X: np.ndarray, y_idx: np.ndarray, W: np.ndarray, b: np.ndarray) -> dict:
    probs = softmax(X @ W + b)
    preds = probs.argmax(axis=1)
    n_classes = len(CLASSES)
    confusion = np.zeros((n_classes, n_classes), dtype=int)
    for true_i, pred_i in zip(y_idx, preds):
        confusion[true_i, pred_i] += 1

    per_class = {}
    for i, label in enumerate(CLASSES):
        tp = confusion[i, i]
        fp = confusion[:, i].sum() - tp
        fn = confusion[i, :].sum() - tp
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        per_class[label] = {"precision": precision, "recall": recall, "f1": f1, "support": int((y_idx == i).sum())}

    accuracy = (preds == y_idx).mean()
    return {"accuracy": accuracy, "per_class": per_class, "confusion": confusion.tolist()}


def print_training_summary(train_metrics: dict, test_metrics: dict, vocab_size: int, n_train: int, n_test: int) -> None:
    print(f"Vocabulary size: {vocab_size}")
    print(f"Train accuracy: {train_metrics['accuracy']:.3f} (n={n_train})")
    print(f"Test accuracy: {test_metrics['accuracy']:.3f} (n={n_test})")
    for label, metrics in test_metrics["per_class"].items():
        print(
            f"  {label}: precision={metrics['precision']:.2f} "
            f"recall={metrics['recall']:.2f} f1={metrics['f1']:.2f} "
            f"support={metrics['support']}"
        )
    print(f"Test confusion matrix (rows=true, cols=pred, order={CLASSES}):")
    for row in test_metrics["confusion"]:
        print(f"  {row}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Train the local text/URL risk model. The committed seed-only model is the default; "
            "external rows require --include-reviewed."
        )
    )
    parser.add_argument(
        "--include-reviewed",
        action="store_true",
        help="add validated local data/reviewed JSONL, JSON-array, or CSV rows to the committed seed set",
    )
    parser.add_argument(
        "--reviewed-dir",
        type=Path,
        default=DEFAULT_REVIEWED_DIR,
        help="directory containing reviewed JSONL, JSON-array, or CSV files (default: data/reviewed)",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="versioned dataset source manifest (default: data/dataset-manifest.v1.json)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate/train and print metrics without replacing model.json or METRICS.md",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None):
    args = parse_args(argv)
    rows = load_rows(
        include_reviewed=args.include_reviewed,
        reviewed_dir=args.reviewed_dir,
        manifest_path=args.manifest,
    )
    provenance = {
        "mode": "seed_plus_reviewed" if args.include_reviewed else "seed_only",
        "source_counts": source_counts(rows),
        "reviewed_rows": 0,
    }
    provenance["reviewed_rows"] = sum(
        count for source, count in provenance["source_counts"].items() if source != "cameroon_seed_v1"
    )
    if args.include_reviewed:
        provenance["manifest_version"] = load_manifest(args.manifest)["manifest_version"]

    rng = np.random.default_rng(SHUFFLE_SEED)
    order = rng.permutation(len(rows))
    rows = [rows[i] for i in order]

    n_test = max(1, int(len(rows) * TEST_FRACTION))
    test_rows, train_rows = rows[:n_test], rows[n_test:]

    train_tokens = [tokenize(r["text"]) for r in train_rows]
    vocab, idf = build_vocab(train_tokens)

    X_train = np.array([vectorize(t, vocab, idf) for t in train_tokens])
    y_train = np.array([CLASSES.index(r["risk_level"]) for r in train_rows])

    X_test = np.array([vectorize(tokenize(r["text"]), vocab, idf) for r in test_rows])
    y_test = np.array([CLASSES.index(r["risk_level"]) for r in test_rows])

    W, b = train_softmax_regression(X_train, y_train, len(CLASSES))

    train_metrics = evaluate(X_train, y_train, W, b)
    test_metrics = evaluate(X_test, y_test, W, b)

    print_training_summary(train_metrics, test_metrics, len(vocab), len(train_rows), len(test_rows))
    if args.include_reviewed:
        print(
            f"Reviewed rows: {provenance['reviewed_rows']} "
            f"(sources: {provenance['source_counts']})"
        )
    if args.dry_run:
        print("Dry run: model.json and METRICS.md were not changed.")
        return

    MODEL_PATH.write_text(
        json.dumps(
            {
                "version": 1,
                "classes": CLASSES,
                "vocab": vocab,
                "idf": idf.tolist(),
                "weights": W.tolist(),
                "bias": b.tolist(),
                "tokenizer": {"pattern": "[a-zA-ZÀ-ÿ]+", "lowercase": True, "ngram": "unigram"},
                "trained_on": len(train_rows),
                "held_out": len(test_rows),
            }
        ),
        encoding="utf-8",
    )

    write_metrics_doc(
        train_metrics,
        test_metrics,
        len(vocab),
        len(train_rows),
        len(test_rows),
        provenance=provenance,
    )


def write_metrics_doc(
    train_metrics,
    test_metrics,
    vocab_size,
    n_train,
    n_test,
    *,
    provenance: dict | None = None,
):
    lines = [
        "# Local classifier — training metrics",
        "",
        "**Generated by `ml/train.py`. Re-run it to regenerate this file — do not hand-edit the numbers below.**",
        "",
        "## Dataset provenance and honest limitations",
        "",
        "`data/cameroon_seed.jsonl` (124 rows) is a **self-authored illustrative seed set**, modeled",
        "on publicly known Cameroonian scam patterns (mobile money fraud, fake scholarships, fake",
        "recruitment, phishing links, impersonation of institutions, fake government notices). It is",
        "**not** a collection of real, reported user messages, and it has **not** been reviewed by a",
        "Cameroonian linguist or a fraud-response subject-matter expert. Pidgin examples were written",
        "by the AI assistant building this feature, not by a native Pidgin speaker — treat them as a",
        "reasonable approximation, not an authoritative reference. Per CLAUDE.md §10.4, any claim about",
        "this classifier's real-world accuracy needs human review before it is used in a pitch or",
        "publication; the metrics below describe performance against this small, self-authored",
        "dataset's own held-out split only.",
        "",
        f"- Total examples: {n_train + n_test} (train: {n_train}, held-out test: {n_test})",
        "- A held-out set of ~25 rows is too small for statistically reliable precision/recall —",
        "  treat every number below as illustrative, not a production accuracy claim.",
        "- Unigram bag-of-words only (no bigrams/char n-grams): with this few examples, higher-order",
        "  n-grams mostly memorize exact training phrases rather than learn generalizable signal.",
        "- Predicts `risk_level` (low/medium/high) only. `category`, `indicators`, and",
        "  `suspicious_phrases` in the local-model tier are produced by the existing rule-based",
        "  keyword logic in `lib/ai/risk-analysis.ts`, not learned — this dataset is too small to",
        "  honestly support a 9-way category classifier.",
        "",
        "## Model",
        "",
        f"- Vocabulary size (min document frequency = {MIN_DF}): {vocab_size}",
        "- TF-IDF (raw term count × smoothed IDF, L2-normalized) + multinomial (softmax) logistic",
        f"  regression, {EPOCHS} full-batch gradient descent epochs, learning rate {LEARNING_RATE},",
        f"  L2 regularization λ={L2_LAMBDA}, zero-initialized weights.",
        "",
        "## Results",
        "",
        f"**Train accuracy:** {train_metrics['accuracy']:.1%} (n={n_train})",
        f"**Test accuracy:** {test_metrics['accuracy']:.1%} (n={n_test})",
        "",
        "The train/test gap below is the expected signature of a tiny dataset, not necessarily",
        "overfitting in the pathological sense — with so few held-out examples per class, a couple of",
        "misclassifications swing the test numbers substantially.",
        "",
        "### Per-class (test set)",
        "",
        "| Class | Precision | Recall | F1 | Support |",
        "|---|---:|---:|---:|---:|",
    ]
    if provenance and provenance.get("reviewed_rows"):
        source_summary = ", ".join(
            f"{source}: {count}" for source, count in provenance["source_counts"].items()
        )
        model_heading = lines.index("## Model")
        lines[model_heading:model_heading] = [
            "### Reviewed external rows (explicit opt-in)",
            "",
            "This run included human-approved external rows under the versioned source manifest.",
            f"- Manifest version: {provenance.get('manifest_version', 'unknown')}",
            f"- Source counts: {source_summary}",
            "- Provider labels were not accepted automatically; every included row carried a human",
            "  approval record. These held-out figures are still not field accuracy or a claim that",
            "  the model can determine whether content is legitimate or AI-generated.",
            "",
        ]
    for label, m in test_metrics["per_class"].items():
        lines.append(f"| {label} | {m['precision']:.2f} | {m['recall']:.2f} | {m['f1']:.2f} | {m['support']} |")

    lines += [
        "",
        f"### Confusion matrix (test set, rows = true, columns = predicted, order = {CLASSES})",
        "",
        "```",
    ]
    for row in test_metrics["confusion"]:
        lines.append(str(row))
    lines += [
        "```",
        "",
        "## Known failure modes",
        "",
        "- Short, ambiguous messages with no scam keywords but unusual context (the `medium` class)",
        "  are the hardest to separate from genuine `low`-risk messages — this class also has the",
        "  fewest training examples (28 of 124), which compounds the difficulty honestly rather than",
        "  hiding it.",
        "- The model has only ever seen FCFA-denominated, Cameroon-context examples; it has no basis",
        "  for judging content in a different currency or national context.",
        "- Pure keyword-adjacent scams that avoid this dataset's vocabulary entirely (e.g., a novel",
        "  scam phrased without any of urgency/payment/fee/institution-name language) will likely be",
        "  under-scored — this is a known, expected gap of a small bag-of-words model, not a claim",
        "  that the model is either better or worse than the existing rule-based fallback in general.",
        "",
        "## Where this fits in `analyzeContent()`",
        "",
        "This local model is an additional fallback tier, not a replacement for either existing tier:",
        "AI (when `OPENAI_API_KEY` is set) remains first; if the AI call is unavailable or fails, this",
        "local model runs (no API key or network call needed). `ml/model.json` is a committed file",
        "loaded via a static import, so it is always present in a successful build — it cannot be",
        "\"missing\" the way an env var can. The keyword-only rule-based fallback remains the final",
        "safety net for an unexpected runtime scoring failure instead. `source` in the result",
        "distinguishes all three so the UI/pitch never conflates them.",
    ]
    METRICS_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
