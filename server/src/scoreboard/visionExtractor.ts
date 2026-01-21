import OpenAI from "openai";
import fs from "fs/promises";
import { z } from "zod";
import { ScoreboardExtraction } from "./types.js";

const playerSchema = z.object({
  name: z.string().nullable(),
  goals: z.number().nullable(),
  assists: z.number().nullable(),
  saves: z.number().nullable(),
  shots: z.number().nullable(),
  score: z.number().nullable()
});

const extractionSchema = z.object({
  match: z.object({
    playlistName: z.string().nullable(),
    isRanked: z.boolean().nullable(),
    winningTeam: z.enum(["blue", "orange"]).nullable()
  }),
  teams: z.object({
    blue: z.array(playerSchema),
    orange: z.array(playerSchema)
  })
});

export type ScoreboardExtractionResult = {
  extraction: ScoreboardExtraction;
  confidence: number | null;
  rawText: string;
  model: string | null;
  tokensUsed: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
};

const SYSTEM_PROMPT = [
  "You are a vision parser for Rocket League scoreboard images.",
  "Extract stats into strict JSON.",
  "Use null only if a value is genuinely unreadable or off-screen.",
  "If a stat cell is clearly blank or shows 0, return 0.",
  "Do not guess or invent missing fields.",
  "Output only JSON matching the required schema."
].join(" ");

const USER_PROMPT = `Return JSON with this schema:
{
  "match": {
    "playlistName": string|null,
    "isRanked": boolean|null,
    "winningTeam": "blue"|"orange"|null
  },
  "teams": {
    "blue": [{ "name": string|null, "goals": number|null, "assists": number|null, "saves": number|null, "shots": number|null, "score": number|null }],
    "orange": [{ "name": string|null, "goals": number|null, "assists": number|null, "saves": number|null, "shots": number|null, "score": number|null }]
  }
}
Rules:
- Each player row should include all five stats (score, goals, assists, saves, shots) if visible.
- Use 0 for clearly visible zeros/blank cells, null only if unreadable or missing from the image.
- Preserve brackets and clan tags in names exactly as shown.`;

export async function extractScoreboard(
  imagePaths: string[],
  options: { model?: string | null } = {}
): Promise<ScoreboardExtractionResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      extraction: {
        match: { playlistName: null, isRanked: null, winningTeam: null },
        teams: { blue: [], orange: [] }
      },
      confidence: null,
      rawText: "OPENAI_API_KEY missing",
      model: null,
      tokensUsed: null,
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null
    };
  }

  const model = options.model || process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const buffers = await Promise.all(imagePaths.map((path) => fs.readFile(path)));

  function buildImage(detail: "low" | "high", buffer: Buffer) {
    return {
      type: "input_image",
      image_url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      detail
    } as any;
  }

  let lastError: Error | null = null;
  for (const buffer of buffers) {
    try {
      const image = buildImage("high", buffer);
      const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: USER_PROMPT },
              image
            ]
          }
        ],
        text: {
          format: { type: "json_object" }
        }
      } as any);

      const output = response.output_text || "";
      const parsed = parseScoreboardExtraction(output);
      if (!parsed) throw new Error("Failed to parse extraction JSON.");

      const result = buildResult(parsed, output, model, response.usage);
      if (needsRetry(parsed)) {
        const high = await client.responses.create({
          model,
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "input_text", text: USER_PROMPT },
                buildImage("high", buffer)
              ]
            }
          ],
          text: {
            format: { type: "json_object" }
          }
        } as any);
        const highOutput = high.output_text || "";
        const highParsed = parseScoreboardExtraction(highOutput);
        if (highParsed) {
          return buildResult(highParsed, highOutput, model, high.usage);
        }
      }

      return result;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Scoreboard extraction failed.");
}

export function parseScoreboardExtraction(text: string): ScoreboardExtraction | null {
  try {
    const parsed = JSON.parse(text);
    return extractionSchema.parse(parsed) as ScoreboardExtraction;
  } catch {
    return null;
  }
}

function buildResult(
  parsed: ScoreboardExtraction,
  rawText: string,
  model: string,
  usage?: OpenAI.Responses.ResponseUsage
): ScoreboardExtractionResult {
  return {
    extraction: parsed,
    confidence: null,
    rawText,
    model,
    tokensUsed: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
    inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
    outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
    cachedInputTokens: typeof usage?.input_tokens_details?.cached_tokens === "number"
      ? usage.input_tokens_details.cached_tokens
      : null
  };
}

function needsRetry(extraction: ScoreboardExtraction): boolean {
  const allPlayers = [...extraction.teams.blue, ...extraction.teams.orange];
  const rowsWithName = allPlayers.filter((player) => player.name && player.name.trim().length > 0);
  if (rowsWithName.length === 0) return true;

  let nullHeavyRows = 0;
  let missingShots = 0;
  let zeroRows = 0;
  rowsWithName.forEach((player) => {
    const values = [player.goals, player.assists, player.saves, player.shots, player.score];
    const nulls = values.filter((value) => value === null).length;
    const zeros = values.filter((value) => value === 0).length;
    if (nulls >= 3) nullHeavyRows += 1;
    if (player.shots === null) missingShots += 1;
    if (zeros === values.length) zeroRows += 1;
  });

  return (
    zeroRows > 0 ||
    nullHeavyRows > 0 ||
    missingShots >= Math.max(1, Math.ceil(rowsWithName.length / 2))
  );
}
