import { describe, test, expect } from "vitest";
import { predictLocalRiskLevel } from "./local-model";

/**
 * Reference probabilities below were computed independently in Python
 * (numpy, reading the same ml/model.json) to confirm the TS port's
 * tokenizer + TF-IDF + softmax-regression math matches ml/train.py exactly,
 * not just that it runs without throwing.
 */
describe("predictLocalRiskLevel", () => {
  test("matches the Python reference implementation's probabilities (scam scholarship example)", () => {
    const result = predictLocalRiskLevel(
      "Congratulations! You have been selected for a MINPOSTEL scholarship. Send your PIN code via Mobile Money now to claim it urgently."
    );
    expect(result).not.toBeNull();
    expect(result!.scores.low).toBeCloseTo(0.2768, 3);
    expect(result!.scores.medium).toBeCloseTo(0.2019, 3);
    expect(result!.scores.high).toBeCloseTo(0.5213, 3);
    expect(result!.risk_level).toBe("high");
  });

  test("matches the Python reference implementation's probabilities (benign meeting notice)", () => {
    const result = predictLocalRiskLevel("The parent teacher meeting is moved to Saturday 9am.");
    expect(result!.scores.low).toBeCloseTo(0.5862, 3);
    expect(result!.scores.medium).toBeCloseTo(0.1753, 3);
    expect(result!.scores.high).toBeCloseTo(0.2385, 3);
    expect(result!.risk_level).toBe("low");
  });

  test("matches the Python reference implementation's probabilities (ambiguous recruiter message)", () => {
    const result = predictLocalRiskLevel(
      "A recruiter reached out about a remote job, salary seems high but no fees mentioned yet."
    );
    expect(result!.scores.low).toBeCloseTo(0.3282, 3);
    expect(result!.scores.medium).toBeCloseTo(0.3912, 3);
    expect(result!.scores.high).toBeCloseTo(0.2806, 3);
    expect(result!.risk_level).toBe("medium");
  });

  test("matches the Python reference implementation's probabilities (Pidgin scam example)", () => {
    const result = predictLocalRiskLevel(
      "Na urgent make you send ya PIN code sharp sharp for Orange Money account."
    );
    expect(result!.scores.low).toBeCloseTo(0.2207, 3);
    expect(result!.scores.medium).toBeCloseTo(0.1725, 3);
    expect(result!.scores.high).toBeCloseTo(0.6068, 3);
    expect(result!.risk_level).toBe("high");
  });

  test("never throws on empty input", () => {
    expect(() => predictLocalRiskLevel("")).not.toThrow();
    expect(predictLocalRiskLevel("")).not.toBeNull();
  });

  test("never throws on text containing no vocabulary terms at all", () => {
    expect(() => predictLocalRiskLevel("!!! 12345 @@@ ###")).not.toThrow();
  });

  test("confidence reflects the top class probability margin", () => {
    // Top probability 0.6068 (see the Pidgin scam test above) sits between
    // the 0.45 and 0.66 thresholds, so this is a "medium confidence" call —
    // an honest reflection of a small model, not miscalibration.
    const result = predictLocalRiskLevel(
      "Na urgent make you send ya PIN code sharp sharp for Orange Money account."
    );
    expect(result!.confidence).toBe("medium");

    const veryLowSignal = predictLocalRiskLevel("hello there how are you doing today");
    expect(["low", "medium", "high"]).toContain(veryLowSignal!.confidence);
  });
});
