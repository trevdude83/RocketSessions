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
  createScoreboardUnmatched,
  findMatchByDedupe,
  findMatchBySignature,
  getScoreboardDeviceByHash,
  getScoreboardDevice,
  getScoreboardIngest,
  getScoreboardUnmatched,
  getScoreboardUnmatchedByIngestId,
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
  listScoreboardUnmatched,
  listMatchPlayers,
  listScoreboardDevices,
  listScoreboardAudit,
  listScoreboardIngestImages,
  listScoreboardIngests,
  setSetting,
  updateScoreboardUnmatched,
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
import { ScoreboardExtraction } from "../scoreboard/types.js";
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

router.get("/admin/unmatched", requireAuth, requireAdmin, (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const rows = listScoreboardUnmatched(Number.isFinite(limit) ? limit : 50);
  res.json(
    rows.map((row) => ({
      id: row.id,
      ingestId: row.ingestId,
      createdAt: row.createdAt,
      status: row.status,
      mode: row.mode,
      teamSize: row.teamSize,
      blueNames: safeJsonParseArray(row.blueNamesJson),
      orangeNames: safeJsonParseArray(row.orangeNamesJson),
      candidates: safeJsonParse(row.candidatesJson || "")
    }))
  );
});

router.post("/admin/unmatched/:unmatchedId/assign", requireAuth, requireAdmin, (req, res) => {
  const unmatchedId = Number(req.params.unmatchedId);
  const sessionId = Number(req.body?.sessionId);
  if (!unmatchedId || !sessionId) {
    return res.status(400).json({ error: "Missing unmatchedId or sessionId" });
  }

  const unmatched = getScoreboardUnmatched(unmatchedId);
  if (!unmatched) return res.status(404).json({ error: "Unmatched ingest not found" });

  const ingest = getScoreboardIngest(unmatched.ingestId);
  if (!ingest) return res.status(404).json({ error: "Ingest not found" });

  const session = getSession(sessionId);
  if (!session || session.isEnded) {
    return res.status(400).json({ error: "Session not available for assignment" });
  }

  const extraction = safeJsonParse<ScoreboardExtraction>(unmatched.rawExtractionJson);
  const derivedMatch = safeJsonParse(unmatched.derivedMatchJson) ?? (extraction ? deriveMatch(extraction) : null);
  if (!extraction || !derivedMatch) {
    return res.status(500).json({ error: "Stored extraction is invalid" });
  }

  const existingMatch = unmatched.signatureKey ? findMatchBySignature(unmatched.signatureKey, sessionId) : null;
  if (existingMatch) {
    updateScoreboardIngest(ingest.id, {
      status: "extracted",
      errorMessage: "Duplicate scoreboard stats.",
      matchId: existingMatch.id,
      sessionId: session.id,
      teamId: session.teamId ?? null,
      focusPlaylistId: getFocusPlaylistId(session.mode)
    });
    updateScoreboardUnmatched(unmatched.id, { status: "assigned", assignedSessionId: session.id });
    return res.json({ ok: true, matchId: existingMatch.id, deduped: true });
  }

  const sessionPlayers = getPlayersBySession(session.id);
  const playerIdentities = sessionPlayers.map((player) => ({
    playerId: player.id,
    gamertag: player.gamertag,
    platform: player.platform
  }));

  const mappedBlue = mapPlayers(extraction.teams.blue, playerIdentities);
  const mappedOrange = mapPlayers(extraction.teams.orange, playerIdentities);

  const match = insertMatch({
    sessionId: session.id,
    teamId: session.teamId ?? null,
    source: "vision",
    createdAt: new Date().toISOString(),
    rawExtractionJson: JSON.stringify(extraction),
    derivedMatchJson: JSON.stringify(derivedMatch),
    extractionConfidence: null,
    dedupeKey: ingest.dedupeKey,
    signatureKey: unmatched.signatureKey
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

  updateScoreboardIngest(ingest.id, {
    status: "extracted",
    errorMessage: null,
    matchId: match.id,
    sessionId: session.id,
    teamId: session.teamId ?? null,
    focusPlaylistId: getFocusPlaylistId(session.mode)
  });
  updateScoreboardUnmatched(unmatched.id, { status: "assigned", assignedSessionId: session.id });

  res.json({ ok: true, matchId: match.id, deduped: false });
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

function listActiveSessions() {
  return db
    .prepare("SELECT * FROM sessions WHERE isActive = 1 AND isEnded = 0 ORDER BY createdAt DESC")
    .all() as { id: number; teamId: number | null; mode: string; createdAt: string }[];
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function safeJsonParseArray(value: string): string[] {
  const parsed = safeJsonParse<string[]>(value);
  return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
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

    const derivedMatch = deriveMatch(extraction);
    const signatureKey = extractionResult.dedupeSignature;
    const matchDecision = resolveSessionMatch(extraction);
    if (matchDecision.status !== "matched") {
      const existingUnmatched = getScoreboardUnmatchedByIngestId(ingestId);
      if (!existingUnmatched) {
        createScoreboardUnmatched({
          ingestId,
          mode: matchDecision.mode,
          teamSize: matchDecision.teamSize,
          blueNames: matchDecision.blueNames,
          orangeNames: matchDecision.orangeNames,
          candidates: matchDecision.candidates,
          rawExtractionJson: JSON.stringify(extraction),
          derivedMatchJson: JSON.stringify(derivedMatch),
          signatureKey
        });
      } else {
        updateScoreboardUnmatched(existingUnmatched.id, { candidates: matchDecision.candidates });
      }

      updateScoreboardIngest(ingestId, {
        status: "pending_match",
        errorMessage: matchDecision.reason || "No high-confidence session match.",
        sessionId: null,
        teamId: null,
        focusPlaylistId: matchDecision.focusPlaylistId ?? null,
        dedupeKey: ingest.dedupeKey,
        matchId: null
      });

      insertScoreboardAudit({
        deviceId: ingest.deviceId,
        ingestId: ingest.id,
        sessionId: null,
        teamId: null,
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

      return { status: 200, body: { ingestId, status: "pending_match", error: matchDecision.reason } };
    }

    const session = getSession(matchDecision.sessionId);
    const team = session?.teamId ? getTeam(session.teamId) : null;
    const sessionPlayers = session ? getPlayersBySession(session.id) : [];
    const playerIdentities = sessionPlayers.map((player) => ({
      playerId: player.id,
      gamertag: player.gamertag,
      platform: player.platform
    }));

    const mappedBlue = mapPlayers(extraction.teams.blue, playerIdentities);
    const mappedOrange = mapPlayers(extraction.teams.orange, playerIdentities);

    const existingMatch = findMatchBySignature(signatureKey, session?.id ?? null);
    if (existingMatch) {
      updateScoreboardIngest(ingestId, {
        status: "extracted",
        errorMessage: "Duplicate scoreboard stats.",
        matchId: existingMatch.id
      });
      return { status: 200, body: { ingestId, status: "extracted", matchId: existingMatch.id } };
    }

    updateScoreboardIngest(ingestId, {
      sessionId: session?.id ?? null,
      teamId: team?.id ?? null,
      focusPlaylistId: matchDecision.focusPlaylistId ?? null
    });

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

type SessionMatchCandidate = {
  sessionId: number;
  teamId: number | null;
  mode: string;
  score: number;
  matchedCount: number;
  exactCount: number;
  fuzzyCount: number;
  side: "blue" | "orange";
};

function resolveSessionMatch(extraction: ScoreboardExtraction): {
  status: "matched" | "ambiguous" | "unmatched";
  sessionId?: number;
  reason?: string;
  candidates: SessionMatchCandidate[];
  blueNames: string[];
  orangeNames: string[];
  teamSize: number | null;
  mode: string | null;
  focusPlaylistId: number | null;
} {
  const blueNames = extraction.teams.blue.map((player) => player.name ?? "").filter((name) => name.trim().length > 0);
  const orangeNames = extraction.teams.orange.map((player) => player.name ?? "").filter((name) => name.trim().length > 0);
  const blueCount = blueNames.length;
  const orangeCount = orangeNames.length;
  const teamSize = blueCount > 0 && orangeCount > 0 && blueCount === orangeCount ? blueCount : null;
  const mode = teamSize ? toMode(teamSize) : null;

  const sessions = listActiveSessions().filter((session) => (mode ? session.mode === mode : true));
  const candidates: SessionMatchCandidate[] = [];

  sessions.forEach((session) => {
    const roster = getPlayersBySession(session.id).map((player) => player.gamertag);
    if (roster.length === 0) return;
    if (teamSize !== null && roster.length !== teamSize) return;
    const blueScore = scoreRosterMatch(roster, blueNames, "blue");
    const orangeScore = scoreRosterMatch(roster, orangeNames, "orange");
    const pick = blueScore.score >= orangeScore.score ? blueScore : orangeScore;
    candidates.push({
      sessionId: session.id,
      teamId: session.teamId ?? null,
      mode: session.mode,
      score: pick.score,
      matchedCount: pick.matchedCount,
      exactCount: pick.exactCount,
      fuzzyCount: pick.fuzzyCount,
      side: pick.side
    });
  });

  const sorted = candidates.sort((a, b) => b.score - a.score);
  const rosterSize = teamSize ?? null;
  const minAutoScore = rosterSize ? rosterSize * 2 - 1 : 0;
  const highConfidence = sorted.filter(
    (candidate) =>
      rosterSize !== null &&
      candidate.matchedCount >= rosterSize &&
      candidate.score >= minAutoScore
  );

  if (highConfidence.length === 1) {
    return {
      status: "matched",
      sessionId: highConfidence[0].sessionId,
      candidates: sorted.slice(0, 5),
      blueNames,
      orangeNames,
      teamSize,
      mode,
      focusPlaylistId: mode ? getFocusPlaylistId(mode) : null
    };
  }

  if (highConfidence.length > 1) {
    return {
      status: "ambiguous",
      reason: "Multiple sessions match this roster.",
      candidates: sorted.slice(0, 5),
      blueNames,
      orangeNames,
      teamSize,
      mode,
      focusPlaylistId: mode ? getFocusPlaylistId(mode) : null
    };
  }

  return {
    status: "unmatched",
    reason: "No high-confidence session match.",
    candidates: sorted.slice(0, 5),
    blueNames,
    orangeNames,
    teamSize,
    mode,
    focusPlaylistId: mode ? getFocusPlaylistId(mode) : null
  };
}

function toMode(teamSize: number): string | null {
  if (teamSize === 1) return "solo";
  if (teamSize === 2) return "2v2";
  if (teamSize === 3) return "3v3";
  if (teamSize === 4) return "4v4";
  return null;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function matchScore(target: string, candidate: string): { score: number; exact: boolean; fuzzy: boolean } {
  const a = normalizeName(target);
  const b = normalizeName(candidate);
  if (!a || !b) return { score: 0, exact: false, fuzzy: false };
  if (a === b) return { score: 2, exact: true, fuzzy: false };
  if (a.length >= 4 && b.includes(a)) return { score: 1, exact: false, fuzzy: true };
  if (b.length >= 4 && a.includes(b)) return { score: 1, exact: false, fuzzy: true };
  const distance = editDistance(a, b);
  if (distance <= 1 || (Math.max(a.length, b.length) <= 6 && distance <= 2)) {
    return { score: 1, exact: false, fuzzy: true };
  }
  return { score: 0, exact: false, fuzzy: false };
}

function scoreRosterMatch(roster: string[], names: string[], side: "blue" | "orange") {
  const used = new Set<number>();
  let score = 0;
  let matchedCount = 0;
  let exactCount = 0;
  let fuzzyCount = 0;

  roster.forEach((player) => {
    let bestIndex = -1;
    let best = { score: 0, exact: false, fuzzy: false };
    names.forEach((name, index) => {
      if (used.has(index)) return;
      const candidateScore = matchScore(player, name);
      if (candidateScore.score > best.score) {
        best = candidateScore;
        bestIndex = index;
      }
    });
    if (best.score > 0 && bestIndex >= 0) {
      used.add(bestIndex);
      score += best.score;
      matchedCount += 1;
      if (best.exact) exactCount += 1;
      if (best.fuzzy) fuzzyCount += 1;
    }
  });

  return { score, matchedCount, exactCount, fuzzyCount, side };
}

export default router;
