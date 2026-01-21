export function computeOpenAiCostUsd(
  model: string | null,
  inputTokens: number | null,
  cachedInputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (!model || typeof inputTokens !== "number" || typeof outputTokens !== "number") return null;
  const lower = model.toLowerCase();
  if (!lower.includes("gpt-4o-mini")) return null;
  const cached = typeof cachedInputTokens === "number" ? cachedInputTokens : 0;
  const regularInput = Math.max(0, inputTokens - cached);
  const inputCost = (regularInput / 1_000_000) * 0.15;
  const cachedCost = (cached / 1_000_000) * 0.075;
  const outputCost = (outputTokens / 1_000_000) * 0.6;
  return inputCost + cachedCost + outputCost;
}
