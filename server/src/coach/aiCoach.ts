import OpenAI from "openai";
import { z } from "zod";
import { CoachPacket, CoachReport, TeamCoachPacket } from "./types.js";

const reportSchema = z.object({
  headline: z.string(),
  strengths: z.array(
    z.object({
      title: z.string(),
      evidence: z.array(z.string()),
      keepDoing: z.array(z.string())
    })
  ),
  priorities: z.array(
    z.object({
      title: z.string(),
      evidence: z.array(z.string()),
      hypothesis: z.object({
        text: z.string(),
        confidence: z.enum(["low", "med", "high"])
      }),
      actions: z.array(
        z.object({
          action: z.string(),
          why: z.string(),
          target: z.string()
        })
      ),
      drills: z.array(z.string())
    })
  ),
  nextSessionGoals: z.array(
    z.object({
      metric: z.string(),
      current: z.string(),
      target: z.string(),
      howToMeasure: z.string()
    })
  ),
  questionsForYou: z.array(z.string())
});

const jsonSchema = {
  name: "coach_report",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "strengths", "priorities", "nextSessionGoals", "questionsForYou"],
    properties: {
      headline: { type: "string" },
      strengths: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "evidence", "keepDoing"],
          properties: {
            title: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            keepDoing: { type: "array", items: { type: "string" } }
          }
        }
      },
      priorities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "evidence", "hypothesis", "actions", "drills"],
          properties: {
            title: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            hypothesis: {
              type: "object",
              additionalProperties: false,
              required: ["text", "confidence"],
              properties: {
                text: { type: "string" },
                confidence: { type: "string", enum: ["low", "med", "high"] }
              }
            },
            actions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["action", "why", "target"],
                properties: {
                  action: { type: "string" },
                  why: { type: "string" },
                  target: { type: "string" }
                }
              }
            },
            drills: { type: "array", items: { type: "string" } }
          }
        }
      },
      nextSessionGoals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["metric", "current", "target", "howToMeasure"],
          properties: {
            metric: { type: "string" },
            current: { type: "string" },
            target: { type: "string" },
            howToMeasure: { type: "string" }
          }
        }
      },
      questionsForYou: { type: "array", items: { type: "string" } }
    }
  }
};

export const defaultTeamCoachPrompt = `You are Rocket League Team Coach AI.
You analyze a team across multiple sessions using ONLY the JSON packet provided.
You do NOT have replay data or in-match telemetry.

NON-NEGOTIABLE RULES
- Use only the metrics in the packet. Do not invent missing values.
- Do not claim knowledge of rotations, boost management, positioning, shot locations, kickoff outcomes, or opponents.
- If you infer a cause, label it as a hypothesis and include confidence: low | med | high.
- Every evidence item must cite specific numbers or explicit fields from the packet.
- Output must be strict JSON only, matching the required schema. No markdown, no extra text.

READINESS RULE
- If coachReadiness.status is "insufficient_data" OR dataQuality.sessionsWithMatches < 2:
  - Do not provide performance conclusions.
  - Provide a short explanation citing packet fields.
  - Provide a practical plan to collect usable data next session.
  - Provide 2-3 measurable goals based on available signals (e.g., play X matches, ensure matchesPlayedDelta > 0).
  - If noMatchReason suggests capture issues, include troubleshooting checks.

ANALYSIS PRIORITIES (when sufficient data exists)
1) Results trend: ratingDelta and rank changes for the focus playlist when available.
2) Volume vs efficiency: goals/shots and shotAccuracy, plus per-game rates where available.
3) Consistency: compare windows.last3 vs windows.prev3 vs windows.overall (use counts).
4) Team dynamics: per-player deltas (shots/goals/assists/saves) to infer roles.
5) Records: compare latest vs best/worst if present.

DATA QUALITY BEHAVIOR
- If metricsReliable is false for a session, treat it as non-analysable and do not draw conclusions from its zeros.
- If losses are derived or unreliable, say so and avoid strong claims about winRate.

COACHING STYLE
- Be concise, practical, and specific.
- Recommendations must include: action + why + measurable target.
- Prefer recommendations that match the focus playlist and team mode.`;

export const defaultSessionCoachPrompt = `You are Rocket League Session Coach AI.

You analyze a SINGLE PLAY SESSION using ONLY the JSON data provided.
You do NOT have replay footage, in-match telemetry, or opponent data.

STRICT RULES
- Use ONLY the metrics present in the input JSON.
- Do NOT invent or assume missing values.
- Do NOT claim knowledge of rotations, boost usage, positioning, shot locations, kickoff outcomes, mechanics, or opponents unless explicitly provided.
- If you infer a possible cause, label it clearly as a hypothesis and include confidence: low | medium | high.
- Every claim must be backed by explicit evidence from the data (numbers or nulls must be cited).
- If a metric is null, say it is unavailable and do not reason from it.
- Output MUST be valid JSON only. No markdown. No commentary outside JSON.

SESSION VALIDITY RULE
- If matchesPlayed is 0 OR didPlayMatches is false:
  - Do NOT provide performance conclusions.
  - Instead explain why the session is not analysable and provide clear guidance on how to capture usable data next time.

ANALYSIS PRIORITIES (when matches were played)
1. Results summary: wins, losses, winRate, ratingDelta (if available).
2. Offensive output: goals, shots, goalsPerGame, shotAccuracy.
3. Defensive contribution: saves, savesPerGame.
4. Team contribution: assists and balance between players (if per-player data exists).
5. Efficiency vs volume: relate output to shots and matches played.
6. Session quality: identify whether performance is above, below, or in line with expectations based on provided metrics only.

COACHING STYLE
- Be concise and practical.
- Recommendations must include:
  - what to do,
  - why (based on evidence),
  - a measurable target for the next session.
- Avoid generic advice.
- Prefer drills, focus areas, or measurable goals that align with the available metrics.

Return a JSON object that matches the required response schema exactly.`;

const fixPrompt = `Fix the JSON to match the required schema. Output only JSON.`;

export async function generateCoachReport(
  packet: CoachPacket | TeamCoachPacket,
  promptOverride?: string,
  basePrompt: string = defaultSessionCoachPrompt
): Promise<{
  report: CoachReport;
  model: string;
  tokensUsed: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  const prompt = promptOverride && promptOverride.trim().length > 0
    ? promptOverride.trim()
    : basePrompt;

  const input = [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(packet) }
  ];

  const response = await client.responses.create({
    model,
    input,
    text: { format: { type: "json_schema", name: "coach_report", schema: jsonSchema.schema, strict: true } }
  });

  let output = response.output_text?.trim() ?? "";
  let parsed = safeParseReport(output);

  if (!parsed) {
    const fixResponse = await client.responses.create({
      model,
      input: [
        { role: "system", content: prompt },
        { role: "user", content: fixPrompt },
        { role: "user", content: output }
      ]
    });
    output = fixResponse.output_text?.trim() ?? "";
    parsed = safeParseReport(output);
  }

  if (!parsed) {
    console.warn("Coach report parse failed.", { length: output.length });
    throw new Error("Failed to parse coach report JSON.");
  }

  const tokensUsed = typeof response.usage?.total_tokens === "number" ? response.usage.total_tokens : null;
  const inputTokens = typeof response.usage?.input_tokens === "number" ? response.usage.input_tokens : null;
  const outputTokens = typeof response.usage?.output_tokens === "number" ? response.usage.output_tokens : null;
  const cachedInputTokens = typeof response.usage?.input_tokens_details?.cached_tokens === "number"
    ? response.usage.input_tokens_details.cached_tokens
    : null;
  return {
    report: parsed,
    model,
    tokensUsed,
    inputTokens,
    outputTokens,
    cachedInputTokens
  };
}

function safeParseReport(text: string): CoachReport | null {
  if (!text) return null;
  try {
    const json = JSON.parse(text) as unknown;
    const parsed = reportSchema.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    return null;
  }
  return null;
}
