export type AiConfig = {
  apiKey: string | undefined;
  model: string;
  timeoutMs: number;
};

/** Central place for AI-related env/config reads (see docs/api/reports.md). */
export function getAiConfig(): AiConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    timeoutMs: 8_000,
  };
}
