import modelData from "@/ml/model.json";

/**
 * Pure-TypeScript inference for the local risk-level classifier (FR-026/027).
 * Reimplements ml/train.py's TF-IDF (raw term count × smoothed IDF,
 * L2-normalized) + softmax regression scoring exactly — same tokenizer
 * pattern, same IDF formula, same weight/bias shapes loaded straight from
 * ml/model.json. No network call, no third-party key: this exists so
 * analyzeContent() has a real fallback tier between the OpenAI call and the
 * keyword-only rule-based fallback (see ml/METRICS.md for what this model
 * does and does not know, and its honest, small-dataset limitations).
 */

type LocalModel = {
  version: number;
  classes: string[];
  vocab: Record<string, number>;
  idf: number[];
  weights: number[][];
  bias: number[];
  tokenizer: { pattern: string; lowercase: boolean; ngram: string };
};

const model = modelData as LocalModel;
const TOKEN_PATTERN = new RegExp(model.tokenizer.pattern, "gu");

export type LocalModelPrediction = {
  risk_level: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  scores: Record<string, number>;
};

function tokenize(text: string): string[] {
  const matches = text.match(TOKEN_PATTERN) ?? [];
  return model.tokenizer.lowercase ? matches.map((t) => t.toLowerCase()) : matches;
}

function vectorize(tokens: string[]): number[] {
  const vec = new Array(Object.keys(model.vocab).length).fill(0);
  for (const term of tokens) {
    const idx = model.vocab[term];
    if (idx !== undefined) vec[idx] += 1;
  }
  for (let i = 0; i < vec.length; i++) vec[i] *= model.idf[i];
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Never throws. `ml/model.json` is a committed file loaded via a static
 * import, so it is always present in any build that compiled successfully —
 * this can't gracefully paper over a missing file the way an absent env var
 * can. The null return is a safety net for unexpected runtime failures
 * during scoring itself (e.g. malformed data reaching this far), not a
 * "key/file presence" gate.
 */
export function predictLocalRiskLevel(text: string): LocalModelPrediction | null {
  try {
    const vec = vectorize(tokenize(text));
    const logits = model.bias.map((b, classIdx) => {
      let sum = b;
      for (let i = 0; i < vec.length; i++) sum += vec[i] * model.weights[i][classIdx];
      return sum;
    });
    const probs = softmax(logits);
    const scores: Record<string, number> = {};
    model.classes.forEach((cls, i) => (scores[cls] = probs[i]));

    const bestIdx = probs.indexOf(Math.max(...probs));
    const risk_level = model.classes[bestIdx] as "low" | "medium" | "high";
    const topProb = probs[bestIdx];
    const confidence = topProb >= 0.66 ? "high" : topProb >= 0.45 ? "medium" : "low";

    return { risk_level, confidence, scores };
  } catch {
    return null;
  }
}
