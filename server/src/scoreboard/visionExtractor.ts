import OpenAI from "openai";
import fs from "fs/promises";
import sharp from "sharp";
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

const columnSchema = z.object({
  blue: z.array(z.number().nullable()),
  orange: z.array(z.number().nullable())
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
  dedupeSignature: string;
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
- Preserve brackets and clan tags in names exactly as shown.
- Column order is: SCORE, GOALS, ASSISTS, SAVES, SHOTS, then PING. Do not read PING values as SHOTS.`;

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
  const processedImages = await Promise.all(buffers.map((buffer) => preprocessBuffer(buffer)));

  function buildImage(detail: "low" | "high", image: { buffer: Buffer; mime: string }) {
    const mime = image.mime || "image/jpeg";
    return {
      type: "input_image",
      image_url: `data:${mime};base64,${image.buffer.toString("base64")}`,
      detail
    } as any;
  }

  let lastError: Error | null = null;
  const usageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0
  };

  function addUsage(usage?: OpenAI.Responses.ResponseUsage) {
    if (!usage) return;
    if (typeof usage.input_tokens === "number") usageTotals.inputTokens += usage.input_tokens;
    if (typeof usage.output_tokens === "number") usageTotals.outputTokens += usage.output_tokens;
    if (typeof usage.total_tokens === "number") usageTotals.totalTokens += usage.total_tokens;
    if (typeof usage.input_tokens_details?.cached_tokens === "number") {
      usageTotals.cachedInputTokens += usage.input_tokens_details.cached_tokens;
    }
  }

  for (const imageItem of processedImages) {
    try {
      const image = buildImage("high", imageItem);
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
      addUsage(response.usage);
      const parsed = parseScoreboardExtraction(output);
      if (!parsed) throw new Error("Failed to parse extraction JSON.");

      const result = buildResult(parsed, output, model, usageTotals);
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
        addUsage(high.usage);
        const highParsed = parseScoreboardExtraction(highOutput);
        if (highParsed) {
          const refined = await applyFocusedPasses(client, model, imageItem, highParsed, addUsage);
          return buildResult(refined, highOutput, model, usageTotals);
        }
      }

      const refined = await applyFocusedPasses(client, model, imageItem, result.extraction, addUsage);
      return buildResult(refined, output, model, usageTotals);
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
  usageTotals: { inputTokens: number; outputTokens: number; cachedInputTokens: number; totalTokens: number }
): ScoreboardExtractionResult {
  return {
    extraction: parsed,
    confidence: null,
    rawText,
    model,
    tokensUsed: usageTotals.totalTokens || null,
    inputTokens: usageTotals.inputTokens || null,
    outputTokens: usageTotals.outputTokens || null,
    cachedInputTokens: usageTotals.cachedInputTokens || null,
    dedupeSignature: buildDedupeSignature(parsed)
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

function normalizeForSignature(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildDedupeSignature(extraction: ScoreboardExtraction): string {
  const teamKey = (team: ScoreboardTeam) =>
    extraction.teams[team].map((player) => {
      const name = normalizeForSignature(player.name ?? "");
      const stats = [
        player.score ?? "",
        player.goals ?? "",
        player.assists ?? "",
        player.saves ?? "",
        player.shots ?? ""
      ].join("|");
      return `${name}:${stats}`;
    });

  const payload = {
    winningTeam: extraction.match.winningTeam ?? "",
    blue: teamKey("blue"),
    orange: teamKey("orange")
  };
  return JSON.stringify(payload);
}

async function applyFocusedPasses(
  client: OpenAI,
  model: string,
  image: { buffer: Buffer; mime: string },
  extraction: ScoreboardExtraction,
  addUsage: (usage?: OpenAI.Responses.ResponseUsage) => void
): Promise<ScoreboardExtraction> {
  const multiPassEnabled = (process.env.SCOREBOARD_MULTI_PASS ?? "0") === "1";
  if (!multiPassEnabled) return extraction;

  const blueNames = extraction.teams.blue.map((player) => player.name ?? "");
  const orangeNames = extraction.teams.orange.map((player) => player.name ?? "");
  const stats = ["score", "goals", "assists", "saves", "shots"] as const;
  let updated = { ...extraction, teams: { ...extraction.teams } };

  for (const stat of stats) {
    const values = await extractColumn(client, model, image, stat, blueNames, orangeNames, addUsage);
    if (!values) continue;
    if (values.blue.length === extraction.teams.blue.length) {
      updated = {
        ...updated,
        teams: {
          ...updated.teams,
          blue: updated.teams.blue.map((player, index) => ({
            ...player,
            [stat]: values.blue[index] ?? player[stat]
          }))
        }
      };
    }
    if (values.orange.length === extraction.teams.orange.length) {
      updated = {
        ...updated,
        teams: {
          ...updated.teams,
          orange: updated.teams.orange.map((player, index) => ({
            ...player,
            [stat]: values.orange[index] ?? player[stat]
          }))
        }
      };
    }
  }

  return updated;
}

async function extractColumn(
  client: OpenAI,
  model: string,
  image: { buffer: Buffer; mime: string },
  stat: "score" | "goals" | "assists" | "saves" | "shots",
  blueNames: string[],
  orangeNames: string[],
  addUsage: (usage?: OpenAI.Responses.ResponseUsage) => void
): Promise<{ blue: (number | null)[]; orange: (number | null)[] } | null> {
  const prompt = `Read ONLY the "${stat}" column for each player row.
Return JSON: { "blue": number[]|nulls, "orange": number[]|nulls }.
Blue rows (top to bottom): ${blueNames.map((name) => `"${name}"`).join(", ") || "none"}.
Orange rows (top to bottom): ${orangeNames.map((name) => `"${name}"`).join(", ") || "none"}.
Use null only if unreadable. Use 0 for visible zeros.`;

  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: "You are a precise OCR extractor for a single scoreboard column." },
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:${image.mime};base64,${image.buffer.toString("base64")}`,
            detail: "high"
          }
        ]
      }
    ],
    text: { format: { type: "json_object" } }
  } as any);

  addUsage(response.usage);
  const output = response.output_text || "";
  try {
    const parsed = columnSchema.parse(JSON.parse(output));
    return parsed;
  } catch {
    return null;
  }
}

async function preprocessBuffer(buffer: Buffer): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const targetWidth = width ? Math.min(Math.round(width * 1.5), 2200) : undefined;
    let pipeline = image;
    if (targetWidth && width && targetWidth > width) {
      pipeline = pipeline.resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 });
    }
    const output = await pipeline.sharpen().png({ compressionLevel: 3 }).toBuffer();
    return { buffer: output, mime: "image/png" };
  } catch {
    return { buffer, mime: "image/jpeg" };
  }
}
