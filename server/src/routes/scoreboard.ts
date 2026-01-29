import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import multer from "multer";
import {
  db,
  createScoreboardDevice,
  createScoreboardIngest,
  findMatchByDedupe,
  findMatchBySignature,
  getScoreboardDeviceByHash,
  getScoreboardDevice,
  getScoreboardIngest,
  getScoreboardIngestByDedupe,
  getLatestScoreboardIngestForDevice,
  getMatch,
  getSession,
  getSetting,
  getTeam,
  getPlayersBySession,
  insertMatch,
  insertMatchPlayer,
  insertScoreboardIngestImage,
  insertScoreboardAudit,
  listMatchPlayers,
  listScoreboardDevices,
  listScoreboardAudit,
  listScoreboardIngestImages,
  listScoreboardIngests,
  setSetting,
  updateScoreboardDeviceSeen,
  setScoreboardDeviceEnabled,
  updateScoreboardIngest
} from "../db.js";
import { requireAdmin, requireAuth } from "../auth.js";
import { extractScoreboard } from "../scoreboard/visionExtractor.js";
import { mapPlayers } from "../scoreboard/playerMapper.js";
import { deriveMatch } from "../scoreboard/matchDeriver.js";
import { applyMatchToSession } from "../scoreboard/matchApplier.js";
import { hashBuffer } from "../scoreboard/dedupe.js";
import { computeOpenAiCostUsd } from "../openaiCost.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataDir = path.join(baseDir, "data", "scoreboards");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getFocusPlaylistId(mode: string | null | undefined): number {
  if (mode === "solo") return 10;
  if (mode === "3v3") return 13;
  return 11;
}

function hashDeviceKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function getDeviceToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const header = req.headers["x-device-key"];
  if (typeof header === "string") return header.trim();
  return null;
}

function deviceAuth(req: any, res: any, next: any) {
  const deviceId = Number(req.params.deviceId || req.body?.deviceId || req.query?.deviceId);
  const token = getDeviceToken(req);
  if (!token) return res.status(401).json({ error: "Missing device token" });
  const tokenHash = hashDeviceKey(token);
  const device = deviceId ? getScoreboardDevice(deviceId) : getScoreboardDeviceByHash(tokenHash);
  if (!device || !device.isEnabled) return res.status(403).json({ error: "Device not enabled" });
  if (!constantTimeEqual(tokenHash, device.deviceKeyHash)) {
    return res.status(403).json({ error: "Invalid device token" });
  }
  req.scoreboardDevice = device;
  updateScoreboardDeviceSeen(device.id, new Date().toISOString());
  next();
}

router.post("/devices/register", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  const deviceKey = crypto.randomBytes(32).toString("hex");
  const device = createScoreboardDevice(name && name.length > 0 ? name : null, hashDeviceKey(deviceKey));
  res.json({
    deviceId: device.id,
    deviceKey,
    pollUrl: `/api/v1/scoreboard/devices/${device.id}/context`,
    uploadUrl: `/api/v1/scoreboard/ingest`
  });
});

router.get("/devices/:deviceId/context", deviceAuth, (req: any, res) => {
  const session = getActiveSession();
  if (!session) {
    return res.json({
      serverTime: new Date().toISOString(),
      activeSession: null,
      playerIdentities: {},
      ingestHints: { cooldownSeconds: 10, maxImages: 3 }
    });
  }

  const team = session.teamId ? getTeam(session.teamId) : null;
  const players = getPlayersBySession(session.id);
  const playerIdentities = players.reduce((acc, player) => {
    acc[player.id] = { gamertag: player.gamertag, platform: player.platform };
    return acc;
  }, {} as Record<number, { gamertag: string; platform: string }>);

  res.json({
    serverTime: new Date().toISOString(),
    activeSession: {
      sessionId: session.id,
      teamId: session.teamId ?? null,
      teamName: team?.name ?? null,
      mode: session.mode,
      focus: { playlistId: getFocusPlaylistId(session.mode), playlistName: session.mode }
    },
    playerIdentities,
    ingestHints: { cooldownSeconds: 10, maxImages: 3 }
  });
});

router.get("/devices/:deviceId/status", deviceAuth, (req: any, res) => {
  const device = req.scoreboardDevice;
  const lastIngest = getLatestScoreboardIngestForDevice(device.id);
  res.json({
    serverTime: new Date().toISOString(),
    device: {
      id: device.id,
      name: device.name,
      lastSeenAt: device.lastSeenAt,
      isEnabled: Boolean(device.isEnabled)
    },
    lastIngest: lastIngest
      ? {
          id: lastIngest.id,
          status: lastIngest.status,
          receivedAt: lastIngest.receivedAt,
          errorMessage: lastIngest.errorMessage,
          matchId: lastIngest.matchId
        }
      : null
  });
});

router.post("/ingest", deviceAuth, upload.array("images", 3), (req: any, res) => {
  const device = req.scoreboardDevice;
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "Provide images." });
  }

  const sessionId = req.body?.sessionId ? Number(req.body.sessionId) : null;
  const session = sessionId ? getSession(sessionId) : getActiveSession();
  const team = session?.teamId ? getTeam(session.teamId) : null;
  const focusPlaylistId = session ? getFocusPlaylistId(session.mode) : null;

  const primaryBuffer = files[0].buffer;
  const dedupeKey = hashBuffer(primaryBuffer);
  const existingIngest = getScoreboardIngestByDedupe(dedupeKey);
  if (existingIngest) {
    return res.json({ ingestId: existingIngest.id, status: existingIngest.status, dedupeKey });
  }

  const existingMatch = findMatchByDedupe(dedupeKey);
  if (existingMatch) {
    const ingest = createScoreboardIngest({
      deviceId: device.id,
      receivedAt: new Date().toISOString(),
      status: "extracted",
      errorMessage: "Duplicate scoreboard image.",
      sessionId: existingMatch.sessionId ?? session?.id ?? null,
      teamId: existingMatch.teamId ?? team?.id ?? null,
      focusPlaylistId,
      dedupeKey,
      matchId: existingMatch.id
    });
    return res.json({ ingestId: ingest.id, status: ingest.status, dedupeKey });
  }

  const ingest = createScoreboardIngest({
    deviceId: device.id,
    receivedAt: new Date().toISOString(),
    status: "received",
    errorMessage: null,
    sessionId: session?.id ?? null,
    teamId: team?.id ?? null,
    focusPlaylistId,
    dedupeKey,
    matchId: null
  });

  const ingestDir = path.join(dataDir, String(ingest.id));
  ensureDir(ingestDir);

  files.forEach((file, index) => {
    const ext = file.mimetype.includes("png") ? "png" : "jpg";
    const filename = `scoreboard-${index + 1}.${ext}`;
    const filePath = path.join(ingestDir, filename);
    fs.writeFileSync(filePath, file.buffer);
    insertScoreboardIngestImage(ingest.id, filePath);
  });

  res.json({ ingestId: ingest.id, status: ingest.status });
});

router.post("/ingest/:ingestId/process", deviceAuth, async (req: any, res) => {
  const ingestId = Number(req.params.ingestId);
  const device = req.scoreboardDevice;
  const result = await processIngest(ingestId, device?.id ?? null);
  res.status(result.status).json(result.body);
});

router.get("/ingest/:ingestId", deviceAuth, (req, res) => {
  const ingestId = Number(req.params.ingestId);
  const ingest = getScoreboardIngest(ingestId);
  if (!ingest) return res.status(404).json({ error: "Ingest not found" });
  res.json({
    ingestId: ingest.id,
    status: ingest.status,
    errorMessage: ingest.errorMessage,
    matchId: ingest.matchId
  });
});

router.get("/ingest/:ingestId/detail", deviceAuth, (req, res) => {
  const ingestId = Number(req.params.ingestId);
  const ingest = getScoreboardIngest(ingestId);
  if (!ingest) return res.status(404).json({ error: "Ingest not found" });
  if (req.scoreboardDevice?.id && ingest.deviceId !== req.scoreboardDevice.id) {
    return res.status(403).json({ error: "Device does not own ingest" });
  }

  const match = ingest.matchId ? getMatch(ingest.matchId) : undefined;
  const players = match ? listMatchPlayers(match.id) : [];
  const rawExtraction = match?.rawExtractionJson ? safeJsonParse(match.rawExtractionJson) : null;
  const derivedMatch = match?.derivedMatchJson ? safeJsonParse(match.derivedMatchJson) : null;

  res.json({
    ingest: {
      id: ingest.id,
      status: ingest.status,
      errorMessage: ingest.errorMessage,
      sessionId: ingest.sessionId,
      teamId: ingest.teamId,
      focusPlaylistId: ingest.focusPlaylistId,
      matchId: ingest.matchId
    },
    match: match
      ? {
          id: match.id,
          sessionId: match.sessionId,
          teamId: match.teamId,
          source: match.source,
          createdAt: match.createdAt,
          extractionConfidence: match.extractionConfidence,
          dedupeKey: match.dedupeKey,
          signatureKey: match.signatureKey
        }
      : null,
    players,
    rawExtraction,
    derivedMatch
  });
});

router.get("/admin/devices", requireAuth, requireAdmin, (req, res) => {
  res.json(listScoreboardDevices());
});

router.post("/admin/devices/:deviceId/enable", requireAuth, requireAdmin, (req, res) => {
  const deviceId = Number(req.params.deviceId);
  if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
  const enabled = Boolean(req.body?.enabled);
  setScoreboardDeviceEnabled(deviceId, enabled);
  res.json({ ok: true, deviceId, enabled });
});

router.get("/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const retentionRaw = getSetting("SCOREBOARD_RETENTION_DAYS");
  const retentionDays = retentionRaw ? Number(retentionRaw) : null;
  res.json({ retentionDays: Number.isFinite(retentionDays) ? retentionDays : null });
});

router.post("/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const retention = req.body?.retentionDays;
  if (retention === null || retention === undefined || retention === "") {
    setSetting("SCOREBOARD_RETENTION_DAYS", "");
    return res.json({ ok: true, retentionDays: null });
  }
  const parsed = Number(retention);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return res.status(400).json({ error: "retentionDays must be a positive number." });
  }
  setSetting("SCOREBOARD_RETENTION_DAYS", String(Math.floor(parsed)));
  res.json({ ok: true, retentionDays: Math.floor(parsed) });
});

router.get("/admin/ingests", requireAuth, requireAdmin, (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json(listScoreboardIngests(Number.isFinite(limit) ? limit : 50));
});

router.get("/admin/audit", requireAuth, requireAdmin, (req, res) => {
  const limit = Number(req.query.limit ?? 200);
  res.json(listScoreboardAudit(Number.isFinite(limit) ? limit : 200));
});

router.post("/admin/ingests/:ingestId/process", requireAuth, requireAdmin, async (req, res) => {
  const ingestId = Number(req.params.ingestId);
  const result = await processIngest(ingestId, null);
  res.status(result.status).json(result.body);
});

function getActiveSession() {
  return db
    .prepare("SELECT * FROM sessions WHERE isActive = 1 AND isEnded = 0 ORDER BY createdAt DESC LIMIT 1")
    .get() as { id: number; teamId: number | null; mode: string; matchIndex: number } | undefined;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function processIngest(
  ingestId: number,
  deviceId: number | null
): Promise<{ status: number; body: { ingestId: number; status: string; matchId?: number; error?: string } }> {
  const ingest = getScoreboardIngest(ingestId);
  if (!ingest) {
    return { status: 404, body: { ingestId, status: "failed", error: "Ingest not found" } };
  }
  if (deviceId && ingest.deviceId !== deviceId) {
    return { status: 403, body: { ingestId, status: "failed", error: "Device does not own ingest" } };
  }
  if (ingest.status === "extracted" && ingest.matchId) {
    return { status: 200, body: { ingestId, status: ingest.status, matchId: ingest.matchId } };
  }
  if (ingest.status === "extracting") {
    return { status: 409, body: { ingestId, status: ingest.status, error: "Ingest already processing" } };
  }

  updateScoreboardIngest(ingestId, { status: "extracting", errorMessage: null });

  try {
    const images = listScoreboardIngestImages(ingestId).map((row) => row.imagePath);
    if (images.length === 0) throw new Error("No images stored for ingest.");

    const extractionResult = await extractScoreboard(images);
    if (!extractionResult.model && extractionResult.rawText.includes("OPENAI_API_KEY missing")) {
      throw new Error("OpenAI is not configured for scoreboard extraction.");
    }
    const extraction = extractionResult.extraction;

    const session = ingest.sessionId ? getSession(ingest.sessionId) : null;
    const team = ingest.teamId ? getTeam(ingest.teamId) : null;
    const sessionPlayers = session ? getPlayersBySession(session.id) : [];
    const playerIdentities = sessionPlayers.map((player) => ({
      playerId: player.id,
      gamertag: player.gamertag,
      platform: player.platform
    }));

    const mappedBlue = mapPlayers(extraction.teams.blue, playerIdentities);
    const mappedOrange = mapPlayers(extraction.teams.orange, playerIdentities);

    const derivedMatch = deriveMatch(extraction);
    const signatureKey = extractionResult.dedupeSignature;
    const existingMatch = findMatchBySignature(signatureKey, session?.id ?? null);
    if (existingMatch) {
      updateScoreboardIngest(ingestId, {
        status: "extracted",
        errorMessage: "Duplicate scoreboard stats.",
        matchId: existingMatch.id
      });
      return { status: 200, body: { ingestId, status: "extracted", matchId: existingMatch.id } };
    }

    const match = insertMatch({
      sessionId: session?.id ?? null,
      teamId: team?.id ?? null,
      source: "vision",
      createdAt: new Date().toISOString(),
      rawExtractionJson: JSON.stringify(extraction),
      derivedMatchJson: JSON.stringify(derivedMatch),
      extractionConfidence: extractionResult.confidence,
      dedupeKey: ingest.dedupeKey,
      signatureKey
    });

    extraction.teams.blue.forEach((player, index) => {
      const mapped = mappedBlue[index];
      insertMatchPlayer({
        matchId: match.id,
        playerId: mapped?.playerId ?? null,
        gamertag: mapped?.gamertag ?? player.name ?? "Unknown",
        platform: mapped?.platform ?? "xbl",
        goals: player.goals,
        assists: player.assists,
        saves: player.saves,
        shots: player.shots,
        score: player.score,
        isWinner: extraction.match.winningTeam ? extraction.match.winningTeam === "blue" : null,
        nameMatchConfidence: mapped?.confidence ?? null
      });
    });

    extraction.teams.orange.forEach((player, index) => {
      const mapped = mappedOrange[index];
      insertMatchPlayer({
        matchId: match.id,
        playerId: mapped?.playerId ?? null,
        gamertag: mapped?.gamertag ?? player.name ?? "Unknown",
        platform: mapped?.platform ?? "xbl",
        goals: player.goals,
        assists: player.assists,
        saves: player.saves,
        shots: player.shots,
        score: player.score,
        isWinner: extraction.match.winningTeam ? extraction.match.winningTeam === "orange" : null,
        nameMatchConfidence: mapped?.confidence ?? null
      });
    });

    if (session) {
      const matchIndex = Math.max(session.matchIndex + 1, 1);
      applyMatchToSession({
        sessionId: session.id,
        matchIndex,
        createdAt: match.createdAt,
        winningTeam: extraction.match.winningTeam,
        players: [
          ...extraction.teams.blue.map((player, index) => ({
            playerId: mappedBlue[index]?.playerId ?? null,
            gamertag: mappedBlue[index]?.gamertag ?? player.name ?? "Unknown",
            platform: mappedBlue[index]?.platform ?? "xbl",
            goals: player.goals,
            assists: player.assists,
            saves: player.saves,
            shots: player.shots,
            score: player.score,
            team: "blue" as const
          })),
          ...extraction.teams.orange.map((player, index) => ({
            playerId: mappedOrange[index]?.playerId ?? null,
            gamertag: mappedOrange[index]?.gamertag ?? player.name ?? "Unknown",
            platform: mappedOrange[index]?.platform ?? "xbl",
            goals: player.goals,
            assists: player.assists,
            saves: player.saves,
            shots: player.shots,
            score: player.score,
            team: "orange" as const
          }))
        ]
      });
    }

    insertScoreboardAudit({
      deviceId: ingest.deviceId,
      ingestId: ingest.id,
      sessionId: ingest.sessionId,
      teamId: ingest.teamId,
      model: extractionResult.model,
      inputTokens: extractionResult.inputTokens,
      cachedInputTokens: extractionResult.cachedInputTokens,
      outputTokens: extractionResult.outputTokens,
      tokensUsed: extractionResult.tokensUsed,
      costUsd: computeOpenAiCostUsd(
        extractionResult.model,
        extractionResult.inputTokens,
        extractionResult.cachedInputTokens,
        extractionResult.outputTokens
      ),
      success: true,
      error: null
    });

    updateScoreboardIngest(ingestId, {
      status: "extracted",
      errorMessage: null,
      matchId: match.id
    });

    return { status: 200, body: { ingestId, status: "extracted", matchId: match.id } };
  } catch (error: any) {
    insertScoreboardAudit({
      deviceId: ingest.deviceId,
      ingestId: ingest.id,
      sessionId: ingest.sessionId,
      teamId: ingest.teamId,
      model: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      tokensUsed: null,
      costUsd: null,
      success: false,
      error: error?.message || "Failed to process ingest"
    });
    updateScoreboardIngest(ingestId, {
      status: "failed",
      errorMessage: error?.message || "Failed to process ingest"
    });
    return {
      status: 500,
      body: { ingestId, status: "failed", error: error?.message || "Failed to process ingest" }
    };
  }
}

export default router;
