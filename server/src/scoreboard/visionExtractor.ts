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
  "Extract stats into strict JSON with nulls for unreadable values.",
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
}`;

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

  const images = await Promise.all(
    imagePaths.map(async (path) => {
      const data = await fs.readFile(path);
      return {
        type: "input_image",
        image_url: `data:image/jpeg;base64,${data.toString("base64")}`,
        detail: "low"
      } as any;
    })
  );

  let lastError: Error | null = null;
  for (const image of images) {
    try {
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
      if (!parsed) {
        throw new Error("Failed to parse extraction JSON.");
      }
      return {
        extraction: parsed,
        confidence: null,
        rawText: output,
        model,
        tokensUsed: typeof response.usage?.total_tokens === "number" ? response.usage.total_tokens : null,
        inputTokens: typeof response.usage?.input_tokens === "number" ? response.usage.input_tokens : null,
        outputTokens: typeof response.usage?.output_tokens === "number" ? response.usage.output_tokens : null,
        cachedInputTokens: typeof response.usage?.input_tokens_details?.cached_tokens === "number"
          ? response.usage.input_tokens_details.cached_tokens
          : null
      };
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
