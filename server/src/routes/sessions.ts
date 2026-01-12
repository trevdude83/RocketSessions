import { db, createSession, createPlayers, createTeam, deleteSession, endSession, findTeamByRoster, getBaselineSnapshot, getDbMetrics, getLatestSnapshot, getLatestSnapshotByGamertag, getPlayersBySession, getRecentSnapshots, getSession, getSessionTeamStats, getTeam, insertCoachReport, insertSessionTeamStats, getLatestCoachReport, listCoachReports, listCoachReportsByTeam, listSessions, listTeamStats, listTeams, setSetting, getSetting, updateTeamName, insertTeamCoachReport, getLatestTeamCoachReport, listTeamCoachReports, getLatestAvatarUrlByGamertag } from "../db.js";
import { captureManualSnapshot, initializeSession, startPolling, stopPolling } from "../sessionManager.js";
import { fetchPlayerSessions, getRateLimitInfo, getRateLimitRemainingMs, getTrnStatus, isRateLimitError } from "../trn/trnClient.js";
import { extractMetrics } from "../trn/extractMetrics.js";
import { DerivedMetrics, PlayerInput } from "../types.js";
import { buildCoachPacket } from "../coach/buildCoachPacket.js";
import { buildTeamCoachPacket } from "../coach/buildTeamCoachPacket.js";
import { generateCoachReport, defaultCoachPrompt } from "../coach/aiCoach.js";
import { Router } from "express";
import fs from "fs";
import path from "path";
import { listPollingLogs } from "../sessionLogs.js";

const router = Router();

const sessionStatsCache = new Map<string, { wins: number | null; losses: number | null; winRate: number | null }>();
const sessionStatsCooldown = new Map<string, number>();

function parseJson<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toSessionDetail(sessionId: number) {
  const session = getSession(sessionId);
  if (!session) return null;
  const players = getPlayersBySession(sessionId);
  const team = session.teamId ? getTeam(session.teamId) : null;
  const baselineByPlayerId: Record<number, unknown> = {};
  const latestByPlayerId: Record<number, unknown> = {};

  players.forEach((player) => {
    const baseline = getBaselineSnapshot(player.id);
    const latest = getLatestSnapshot(player.id);
    baselineByPlayerId[player.id] = baseline
      ? {
          id: baseline.id,
          playerId: player.id,
          capturedAt: baseline.capturedAt,
          derived: parseJson<DerivedMetrics>(baseline.derivedJson)
        }
      : null;
    latestByPlayerId[player.id] = latest
      ? {
          id: latest.id,
          playerId: player.id,
          capturedAt: latest.capturedAt,
          derived: parseJson<DerivedMetrics>(latest.derivedJson)
        }
      : null;
  });

  return { session, team, players, baselineByPlayerId, latestByPlayerId };
}

router.get("/sessions", (req, res) => {
  res.json(listSessions());
});

router.get("/teams", (req, res) => {
  const teams = listTeams().map((team) => {
    const players = parseJson<PlayerInput[]>(team.playersJson) || [];
    const sessionsCountRow = db
      .prepare("SELECT COUNT(1) as count FROM session_team_stats WHERE teamId = ?")
      .get(team.id) as { count?: number } | undefined;
    const avatars: Record<string, string | null> = {};
    players.forEach((player) => {
      avatars[player.gamertag] = getLatestAvatarUrlByGamertag(player.gamertag);
    });
    return {
      ...team,
      players,
      sessionsCount: sessionsCountRow?.count ?? 0,
      avatars
    };
  });
  res.json(teams);
});


router.post("/teams", (req, res) => {
  const { name, mode, players } = req.body as { name?: string; mode?: string; players?: PlayerInput[] };
  if (!name || !mode || !Array.isArray(players)) {
    return res.status(400).json({ error: "Provide name, mode, and players." });
  }
  const expectedPlayers = modePlayerCount[mode];
  if (!expectedPlayers || players.length !== expectedPlayers) {
    return res.status(400).json({ error: `Mode ${mode} requires ${expectedPlayers} players.` });
  }
  const team = createTeam(name.trim(), mode, JSON.stringify(players));
  res.status(201).json({ ...team, players });
});

router.patch("/teams/:id", (req, res) => {
  const teamId = Number(req.params.id);
  const { name } = req.body as { name?: string };
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required." });
  }
  updateTeamName(teamId, name.trim());
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  res.json({ ...team, players: parseJson<PlayerInput[]>(team.playersJson) || [] });
});

router.get("/teams/:id", (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  const stats = listTeamStats(teamId).map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    createdAt: row.createdAt,
    focusPlaylistId: row.focusPlaylistId,
    deltas: parseJson(row.deltasJson),
    derivedTeam: parseJson(row.derivedTeamJson),
    records: parseJson(row.recordsJson),
    coachReportId: row.coachReportId,
    players: getPlayersBySession(row.sessionId).reduce((acc, player) => {
      acc[player.id] = player.gamertag;
      return acc;
    }, {} as Record<number, string>)
  }));
  const players = parseJson<PlayerInput[]>(team.playersJson) || [];
  const avatars: Record<string, string | null> = {};
  players.forEach((player) => {
    avatars[player.gamertag] = getLatestAvatarUrlByGamertag(player.gamertag);
  });
  res.json({ ...team, players, avatars, stats });
});

router.get("/teams/:id/reports", (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  const reports = listCoachReportsByTeam(teamId);
  res.json(
    reports.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      focusPlaylistId: row.focusPlaylistId,
      model: row.model,
      sessionId: row.sessionId,
      sessionName: row.sessionName,
      report: parseJson(row.reportJson)
    }))
  );
});

router.get("/teams/:id/peaks", (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  const players = parseJson<PlayerInput[]>(team.playersJson) || [];
  const payload = players.map((player) => {
    const latest = getLatestSnapshotByGamertag(player.gamertag);
    const raw = parseJson<unknown>(latest?.rawJson);
    const peakRating = raw ? parsePeakRating(raw, team.mode) : null;
    return {
      gamertag: player.gamertag,
      platform: player.platform,
      capturedAt: latest?.capturedAt ?? null,
      peakRating
    };
  });
  res.json(payload);
});

router.get("/teams/:id/current-ranks", (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  const players = parseJson<PlayerInput[]>(team.playersJson) || [];
  const playlistId = getFocusPlaylistId(team.mode);
  const payload = players.map((player) => {
    const latest = getLatestSnapshotByGamertag(player.gamertag);
    const derived = parseJson<DerivedMetrics>(latest?.derivedJson);
    const playlist = derived?.playlists?.[playlistId] as Record<string, unknown> | undefined;
    const tierName = toText(playlist?.tierName);
    const divisionName = toText(playlist?.divisionName);
    const rating = toNumber(playlist?.rating);
    const iconUrl = toText(playlist?.iconUrl) ?? toText(derived?.rankIconUrl);
    const rankTierIndex = toNumber(derived?.rankTierIndex);
    const rankDivisionIndex = toNumber(derived?.rankDivisionIndex);
    const hasTextTier = typeof tierName === "string" && /[A-Za-z]/.test(tierName);
    const hasTextDivision = typeof divisionName === "string" && /[A-Za-z]/.test(divisionName);
    const rankLabel = hasTextTier
      ? hasTextDivision
        ? `${tierName} ${divisionName}`
        : tierName
      : toText(derived?.rank);
    return {
      gamertag: player.gamertag,
      platform: player.platform,
      capturedAt: latest?.capturedAt ?? null,
      playlistName: toText(playlist?.name),
      rankLabel,
      rating,
      iconUrl,
      rankTierIndex,
      rankDivisionIndex
    };
  });
  res.json(payload);
});

router.get("/sessions/:id", (req, res) => {
  const sessionId = Number(req.params.id);
  const detail = toSessionDetail(sessionId);
  if (!detail) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(detail);
});

const modePlayerCount: Record<string, number> = {
  solo: 1,
  "2v2": 2,
  "3v3": 3,
  "4v4": 4
};

router.post("/sessions", async (req, res) => {
  const { name, mode, pollingIntervalSeconds, players, teamId, teamName, saveTeam, includeCoachOnEnd } = req.body as {
    name?: string;
    mode?: string;
    pollingIntervalSeconds?: number;
    players?: PlayerInput[];
    teamId?: number;
    teamName?: string;
    saveTeam?: boolean;
    includeCoachOnEnd?: boolean;
  };

  if (!name) {
    return res.status(400).json({ error: "Provide name." });
  }

  let resolvedMode = mode || null;
  let resolvedPlayers: PlayerInput[] | null = Array.isArray(players) ? players : null;
  let resolvedTeamId: number | null = typeof teamId === "number" ? teamId : null;

  if (resolvedTeamId) {
    const team = getTeam(resolvedTeamId);
    if (!team) {
      return res.status(400).json({ error: "Selected team not found." });
    }
    resolvedMode = team.mode;
    const parsed = parseJson<PlayerInput[]>(team.playersJson);
    resolvedPlayers = Array.isArray(parsed) ? parsed : null;
  }

  if (!resolvedMode || !resolvedPlayers) {
    return res.status(400).json({ error: "Provide mode and players, or select a team." });
  }

  const expectedPlayers = modePlayerCount[resolvedMode];
  if (!expectedPlayers || resolvedPlayers.length !== expectedPlayers) {
    return res.status(400).json({ error: `Mode ${resolvedMode} requires ${expectedPlayers} players.` });
  }

  if (!resolvedTeamId) {
    const matchedTeam = findTeamByRoster(resolvedMode, resolvedPlayers);
    if (matchedTeam) {
      resolvedTeamId = matchedTeam.id;
    } else if (saveTeam || teamName) {
      if (!teamName || teamName.trim().length === 0) {
        return res.status(400).json({ error: "Team name is required to save a team." });
      }
      const team = createTeam(teamName.trim(), resolvedMode, JSON.stringify(resolvedPlayers));
      resolvedTeamId = team.id;
    }
  }

  const interval = pollingIntervalSeconds && pollingIntervalSeconds > 0
    ? Number(pollingIntervalSeconds)
    : 180;

  const session = createSession(name, resolvedMode, interval, resolvedTeamId, Boolean(includeCoachOnEnd));
  createPlayers(session.id, resolvedPlayers);

  await initializeSession(session.id);
  startPolling(session.id, interval);

  const detail = toSessionDetail(session.id);
  res.status(201).json(detail);
});

router.post("/sessions/:id/stop", (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.isEnded) return res.status(400).json({ error: "Session has ended" });
  stopPolling(sessionId);
  res.json({ ok: true });
});

router.delete("/sessions/:id", (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  stopPolling(sessionId);
  deleteSession(sessionId);
  res.json({ ok: true });
});

router.post("/sessions/:id/start", async (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.isEnded) return res.status(400).json({ error: "Session has ended" });
  startPolling(sessionId, session.pollingIntervalSeconds);
  res.json({ ok: true });
});

router.post("/sessions/:id/end", async (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.isEnded) return res.status(400).json({ error: "Session already ended" });

  stopPolling(sessionId);
  endSession(sessionId);

  const includeCoach = typeof req.body?.includeCoachOnEnd === "boolean"
    ? req.body.includeCoachOnEnd
    : Boolean(session.includeCoachOnEnd);

  let coachReportId: number | null = null;
  let teamStatsWritten = false;

  if (session.teamId) {
    const stats = computeSessionTeamStats(sessionId);
    if (stats) {
      if (includeCoach) {
        const packet = buildCoachPacket(sessionId, stats.focusPlaylistId);
        const prompt = getSetting("COACH_PROMPT");
        const { report, model, tokensUsed } = await generateCoachReport(packet, prompt || undefined);
        coachReportId = insertCoachReport(
          sessionId,
          session.teamId,
          stats.focusPlaylistId,
          JSON.stringify(packet),
          JSON.stringify(report),
          model,
          tokensUsed
        );
      }
      insertSessionTeamStats(
        sessionId,
        stats.teamId,
        stats.focusPlaylistId,
        JSON.stringify(stats.deltasByPlayer),
        JSON.stringify(stats.derivedTeam),
        JSON.stringify(stats.records),
        coachReportId
      );
      teamStatsWritten = true;
    }
  } else if (includeCoach) {
    const focusPlaylistId = getFocusPlaylistId(session.mode);
    const packet = buildCoachPacket(sessionId, focusPlaylistId);
    const prompt = getSetting("COACH_PROMPT");
    const { report, model, tokensUsed } = await generateCoachReport(packet, prompt || undefined);
    coachReportId = insertCoachReport(
      sessionId,
      null,
      focusPlaylistId,
      JSON.stringify(packet),
      JSON.stringify(report),
      model,
      tokensUsed
    );
  }

  const detail = toSessionDetail(sessionId);
  res.json({ session: detail?.session, teamStatsWritten, coachReportId });
});

router.post("/sessions/:id/refresh", async (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const remaining = getRateLimitRemainingMs();
  if (remaining > 0) {
    return res.status(429).json({ error: "TRN rate limited. Try again later.", retryAfterMs: remaining });
  }
  try {
    await captureManualSnapshot(sessionId);
  } catch (error) {
    if (isRateLimitError(error)) {
      return res.status(429).json({ error: "TRN rate limited. Try again later.", retryAfterMs: error.retryAfterMs });
    }
    throw error;
  }
  const detail = toSessionDetail(sessionId);
  res.json(detail);
});

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(num) ? num : null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseSeason(value: unknown): number | null {
  const asNum = toNumber(value);
  if (asNum !== null) return asNum;
  if (typeof value !== "string") return null;
  const match = value.match(/\((\d+)\)/) ?? value.match(/\b(\d+)\b/);
  return match ? toNumber(match[1]) : null;
}

function parsePeakRating(payload: unknown, mode?: string | null): {
  playlistName: string | null;
  value: number | null;
  season: number | null;
  iconUrl: string | null;
  rankName: string | null;
  division: string | null;
} | null {
  const segments = (payload as any)?.data?.segments;
  if (!Array.isArray(segments)) return null;
  const peaks = segments.filter((segment: any) => segment?.type === "peak-rating");
  if (!peaks.length) return null;

  const entries = peaks
    .map((segment: any) => {
      const peak = segment?.stats?.peakRating;
      const value = toNumber(peak?.value ?? peak?.displayValue);
      if (value === null) return null;
      return {
        playlistName: toText(segment?.metadata?.name),
        value,
        season: parseSeason(segment?.attributes?.season ?? peak?.metadata?.season),
        iconUrl: toText(peak?.metadata?.iconUrl),
        rankName: toText(peak?.metadata?.name),
        division: toText(peak?.metadata?.division)
      };
    })
    .filter(Boolean) as {
    playlistName: string | null;
    value: number | null;
    season: number | null;
    iconUrl: string | null;
    rankName: string | null;
    division: string | null;
  }[];

  if (!entries.length) return null;
  const modePlaylistName = mode === "solo"
    ? "Ranked Duel 1v1"
    : mode === "3v3"
    ? "Ranked Standard 3v3"
    : mode === "2v2"
    ? "Ranked Doubles 2v2"
    : null;
  const filtered = modePlaylistName
    ? entries.filter((entry) => entry.playlistName === modePlaylistName)
    : entries;
  const candidates = filtered.length > 0 ? filtered : entries;
  return candidates.reduce((best, current) => {
    if (best.value === null) return current;
    if (current.value === null) return best;
    return current.value > best.value ? current : best;
  });
}

function normalizeSessions(input: unknown): any[] {
  if (Array.isArray(input)) return input;
  const items = (input as any)?.data?.items ?? (input as any)?.data?.matches ?? (input as any)?.matches ?? [];
  if (Array.isArray(items)) return items;
  return [];
}

function getFocusPlaylistName(mode: string): string | null {
  if (mode === "solo") return "Ranked Duel 1v1";
  if (mode === "3v3") return "Ranked Standard 3v3";
  if (mode === "2v2") return "Ranked Doubles 2v2";
  return null;
}

function toPlaylistId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(num) ? num : null;
}

function getMatchPlaylistId(match: any): number | null {
  return (
    toPlaylistId(match?.metadata?.playlistId) ??
    toPlaylistId(match?.metadata?.playlist?.id) ??
    toPlaylistId(match?.playlistId) ??
    toPlaylistId(match?.playlist?.id) ??
    toPlaylistId(match?.attributes?.playlistId) ??
    toPlaylistId(match?.attributes?.playlist) ??
    toPlaylistId(match?.attributes?.playlist?.id) ??
    null
  );
}

function getMatchPlaylistName(match: any): string | null {
  const raw =
    match?.metadata?.playlistName ??
    match?.metadata?.playlist?.name ??
    match?.playlist?.name ??
    match?.attributes?.playlistName ??
    match?.attributes?.playlist?.name ??
    null;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

function filterMatchesForMode(matches: any[], mode: string | null | undefined): any[] {
  const targetId = getFocusPlaylistId(mode ?? "");
  const targetName = getFocusPlaylistName(mode ?? "");
  if (!targetId && !targetName) return matches;
  const withSignal = matches.filter((match) => getMatchPlaylistId(match) !== null || getMatchPlaylistName(match) !== null);
  const base = withSignal.length > 0 ? withSignal : matches;
  if (base.length === 0) return base;
  return base.filter((match) => {
    const playlistId = getMatchPlaylistId(match);
    const playlistName = getMatchPlaylistName(match);
    return (targetId !== null && playlistId === targetId) || (targetName !== null && playlistName === targetName);
  });
}

function getFocusPlaylistId(mode: string): number {
  if (mode === "solo") return 10;
  if (mode === "3v3") return 13;
  return 11;
}

function computeRecords(
  existingStats: ReturnType<typeof listTeamStats>,
  derivedTeam: Record<string, number | null>
): Record<string, string> {
  const recordable = [
    "wins",
    "losses",
    "goals",
    "assists",
    "saves",
    "shots",
    "winRate",
    "goalsPerGame",
    "shotsPerGame",
    "savesPerGame",
    "assistsPerGame",
    "shotAccuracy"
  ];
  const records: Record<string, string> = {};
  const history = existingStats.map((row) => parseJson<Record<string, number | null>>(row.derivedTeamJson) || {});

  recordable.forEach((metric) => {
    const current = derivedTeam[metric];
    if (typeof current !== "number") return;
    const values = history
      .map((entry) => entry[metric])
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) return;
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (current > max) records[metric] = "high";
    if (current < min) records[metric] = records[metric] ? `${records[metric]},low` : "low";
  });
  return records;
}

function computeSessionTeamStats(sessionId: number) {
  const session = getSession(sessionId);
  if (!session || !session.teamId) return null;
  if (getSessionTeamStats(sessionId)) return null;
  const players = getPlayersBySession(sessionId);
  const focusPlaylistId = getFocusPlaylistId(session.mode);

  const deltasByPlayer: Record<number, Record<string, number | null>> = {};
  const teamTotals = {
    wins: null as number | null,
    losses: null as number | null,
    goals: 0,
    assists: 0,
    saves: 0,
    shots: 0,
    matchesPlayed: null as number | null
  };

  players.forEach((player) => {
    const baseline = getBaselineSnapshot(player.id);
    const latest = getLatestSnapshot(player.id);
    const baselineDerived = parseJson<DerivedMetrics>(baseline?.derivedJson || "");
    const latestDerived = parseJson<DerivedMetrics>(latest?.derivedJson || "");
    const playlistBase = baselineDerived?.playlists?.[focusPlaylistId] ?? null;
    const playlistLatest = latestDerived?.playlists?.[focusPlaylistId] ?? null;

    const winsDelta = toNumber(latestDerived?.wins) !== null && toNumber(baselineDerived?.wins) !== null
      ? (latestDerived?.wins as number) - (baselineDerived?.wins as number)
      : null;
    const baselineLosses = toNumber(baselineDerived?.losses);
    const latestLosses = toNumber(latestDerived?.losses);
    let lossesDelta = baselineLosses !== null && latestLosses !== null
      ? latestLosses - baselineLosses
      : null;
    const goalsDelta = toNumber(latestDerived?.goals) !== null && toNumber(baselineDerived?.goals) !== null
      ? (latestDerived?.goals as number) - (baselineDerived?.goals as number)
      : null;
    const assistsDelta = toNumber(latestDerived?.assists) !== null && toNumber(baselineDerived?.assists) !== null
      ? (latestDerived?.assists as number) - (baselineDerived?.assists as number)
      : null;
    const savesDelta = toNumber(latestDerived?.saves) !== null && toNumber(baselineDerived?.saves) !== null
      ? (latestDerived?.saves as number) - (baselineDerived?.saves as number)
      : null;
    const shotsDelta = toNumber(latestDerived?.shots) !== null && toNumber(baselineDerived?.shots) !== null
      ? (latestDerived?.shots as number) - (baselineDerived?.shots as number)
      : null;
    const matchesPlayedDelta = toNumber(playlistLatest?.matchesPlayed) !== null && toNumber(playlistBase?.matchesPlayed) !== null
      ? (playlistLatest?.matchesPlayed as number) - (playlistBase?.matchesPlayed as number)
      : null;
    if (lossesDelta === null && typeof winsDelta === "number" && typeof matchesPlayedDelta === "number") {
      const computed = matchesPlayedDelta - winsDelta;
      lossesDelta = computed >= 0 ? computed : null;
    }

    deltasByPlayer[player.id] = {
      wins: winsDelta,
      losses: lossesDelta,
      goals: goalsDelta,
      assists: assistsDelta,
      saves: savesDelta,
      shots: shotsDelta,
      matchesPlayed: matchesPlayedDelta
    };

    if (typeof goalsDelta === "number") teamTotals.goals += goalsDelta;
    if (typeof assistsDelta === "number") teamTotals.assists += assistsDelta;
    if (typeof savesDelta === "number") teamTotals.saves += savesDelta;
    if (typeof shotsDelta === "number") teamTotals.shots += shotsDelta;

    if (typeof winsDelta === "number") {
      teamTotals.wins = teamTotals.wins === null ? winsDelta : Math.max(teamTotals.wins, winsDelta);
    }
    if (typeof lossesDelta === "number") {
      teamTotals.losses = teamTotals.losses === null ? lossesDelta : Math.max(teamTotals.losses, lossesDelta);
    }
    if (typeof matchesPlayedDelta === "number") {
      teamTotals.matchesPlayed = teamTotals.matchesPlayed === null ? matchesPlayedDelta : Math.max(teamTotals.matchesPlayed, matchesPlayedDelta);
    }
  });

  const wins = teamTotals.wins;
  const losses = teamTotals.losses;
  const matchesPlayed = teamTotals.matchesPlayed;
  const winRate =
    typeof wins === "number" && typeof losses === "number" && wins + losses > 0
      ? wins / (wins + losses)
      : typeof wins === "number" && typeof matchesPlayed === "number" && matchesPlayed > 0
      ? wins / matchesPlayed
      : null;

  const goalsPerGame =
    typeof matchesPlayed === "number" && matchesPlayed > 0 ? teamTotals.goals / matchesPlayed : null;
  const shotsPerGame =
    typeof matchesPlayed === "number" && matchesPlayed > 0 ? teamTotals.shots / matchesPlayed : null;
  const savesPerGame =
    typeof matchesPlayed === "number" && matchesPlayed > 0 ? teamTotals.saves / matchesPlayed : null;
  const assistsPerGame =
    typeof matchesPlayed === "number" && matchesPlayed > 0 ? teamTotals.assists / matchesPlayed : null;
  const shotAccuracy =
    teamTotals.shots > 0 ? teamTotals.goals / teamTotals.shots : null;

  const derivedTeam = {
    wins,
    losses,
    goals: teamTotals.goals,
    assists: teamTotals.assists,
    saves: teamTotals.saves,
    shots: teamTotals.shots,
    matchesPlayed,
    winRate,
    goalsPerGame,
    shotsPerGame,
    savesPerGame,
    assistsPerGame,
    shotAccuracy
  };

  const existingStats = listTeamStats(session.teamId);
  const records = computeRecords(existingStats, derivedTeam);

  return {
    teamId: session.teamId,
    focusPlaylistId,
    deltasByPlayer,
    derivedTeam,
    records
  };
}


async function computeSessionStats(
  sessionCreatedAt: string,
  platform: string,
  gamertag: string,
  mode: string
): Promise<{ wins: number | null; losses: number | null; winRate: number | null }> {
  const cacheKey = `${platform}:${gamertag}:${mode}`.toLowerCase();
  const cooldownUntil = sessionStatsCooldown.get(cacheKey) ?? 0;
  if (cooldownUntil > Date.now()) {
    return sessionStatsCache.get(cacheKey) ?? { wins: null, losses: null, winRate: null };
  }

  try {
    const sessions = normalizeSessions(await fetchPlayerSessions(platform as any, gamertag));
    const since = new Date(sessionCreatedAt).getTime();
    let wins = 0;
    let matches = 0;

    const matchesList = filterMatchesForMode(
      sessions.flatMap((session) => session?.matches ?? (Array.isArray(session) ? session : [])),
      mode
    );
    matchesList.forEach((match: any) => {
      const dateValue = match?.date instanceof Date ? match.date.getTime() : new Date(match?.date).getTime();
      if (!Number.isFinite(dateValue) || dateValue < since) return;
      const matchWins = toNumber(match?.stats?.wins);
      const matchPlayed = toNumber(match?.stats?.matchesPlayed);
      if (matchWins !== null) wins += matchWins;
      if (matchPlayed !== null) matches += matchPlayed;
    });

    if (matches <= 0) {
      return { wins: null, losses: null, winRate: null };
    }

    const losses = matches - wins;
    const winRate = wins / matches;
    const result = {
      wins,
      losses: losses >= 0 ? losses : null,
      winRate
    };
    sessionStatsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    if (isRateLimitError(error)) {
      sessionStatsCooldown.set(cacheKey, Date.now() + error.retryAfterMs);
      return sessionStatsCache.get(cacheKey) ?? { wins: null, losses: null, winRate: null };
    }
    console.warn(`Failed to fetch sessions for ${gamertag}:`, error);
    return { wins: null, losses: null, winRate: null };
  }
}

router.get("/sessions/:id/summary", async (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const players = getPlayersBySession(sessionId);
  const deltas: Record<number, Record<string, number | null>> = {};
  const comparisons: Record<string, number | null> = {};
  const sessionStats: Record<number, { wins: number | null; losses: number | null; winRate: number | null }> = {};
  let teamWins: number | null = null;
  let teamLosses: number | null = null;

  const metrics = [
    "wins",
    "losses",
    "goals",
    "assists",
    "saves",
    "shots",
    "winRate",
    "goalShotRatio",
    "mmr"
  ];

  players.forEach((player) => {
    const baseline = getBaselineSnapshot(player.id);
    const latest = getLatestSnapshot(player.id);
    const baselineDerived = parseJson<DerivedMetrics>(baseline?.derivedJson || "");
    const latestDerived = parseJson<DerivedMetrics>(latest?.derivedJson || "");

    deltas[player.id] = {};

    metrics.forEach((metric) => {
      const baseValue = baselineDerived?.[metric as keyof DerivedMetrics] ?? null;
      const latestValue = latestDerived?.[metric as keyof DerivedMetrics] ?? null;
      if (typeof baseValue === "number" && typeof latestValue === "number") {
        deltas[player.id][metric] = latestValue - baseValue;
      } else {
        deltas[player.id][metric] = null;
      }
    });
  });

  await Promise.all(
    players.map(async (player) => {
      sessionStats[player.id] = await computeSessionStats(
        session.createdAt,
        player.platform,
        player.gamertag,
        session.mode
      );
    })
  );

  const sessionValues = Object.values(sessionStats);
  const winsValues = sessionValues.map((value) => value.wins).filter((v) => typeof v === "number") as number[];
  const lossesValues = sessionValues.map((value) => value.losses).filter((v) => typeof v === "number") as number[];
  if (winsValues.length > 0) {
    teamWins = Math.max(...winsValues);
  }
  if (lossesValues.length > 0) {
    teamLosses = Math.max(...lossesValues);
  }

  if (teamWins === null || teamLosses === null) {
    const deltaWins = players
      .map((player) => deltas[player.id]?.wins)
      .filter((value) => typeof value === "number") as number[];
    const deltaLosses = players
      .map((player) => deltas[player.id]?.losses)
      .filter((value) => typeof value === "number") as number[];

    if (teamWins === null && deltaWins.length > 0) {
      teamWins = Math.max(...deltaWins);
    }
    if (teamLosses === null && deltaLosses.length > 0) {
      teamLosses = Math.max(...deltaLosses);
    }
    if (teamLosses === null && typeof teamWins === "number" && (session.matchIndex ?? 0) > 0) {
      const computedLosses = (session.matchIndex ?? 0) - teamWins;
      teamLosses = computedLosses >= 0 ? computedLosses : null;
    }
  }

  const focusPlaylistId = getFocusPlaylistId(session.mode);
  const matchesPlayedValues = players.map((player) => {
    const baseline = getBaselineSnapshot(player.id);
    const latest = getLatestSnapshot(player.id);
    const baselineDerived = parseJson<DerivedMetrics>(baseline?.derivedJson || "");
    const latestDerived = parseJson<DerivedMetrics>(latest?.derivedJson || "");
    const playlistBase = baselineDerived?.playlists?.[focusPlaylistId] ?? null;
    const playlistLatest = latestDerived?.playlists?.[focusPlaylistId] ?? null;
    const delta = toNumber(playlistLatest?.matchesPlayed) !== null && toNumber(playlistBase?.matchesPlayed) !== null
      ? (playlistLatest?.matchesPlayed as number) - (playlistBase?.matchesPlayed as number)
      : null;
    return typeof delta === "number" ? delta : null;
  }).filter((value): value is number => typeof value === "number");

  let teamGameCount = matchesPlayedValues.length > 0 ? Math.max(...matchesPlayedValues) : (session.matchIndex ?? 0);
  if (teamGameCount <= 0 && typeof teamWins === "number") {
    teamGameCount = teamWins + (typeof teamLosses === "number" ? teamLosses : 0);
  }
  if (teamLosses === null && typeof teamWins === "number" && teamGameCount > 0) {
    const computedLosses = teamGameCount - teamWins;
    teamLosses = computedLosses >= 0 ? computedLosses : null;
  }

  const teamWinRate =
    typeof teamWins === "number" && typeof teamLosses === "number" && teamWins + teamLosses > 0
      ? teamWins / (teamWins + teamLosses)
      : null;

  metrics.forEach((metric) => {
    const [p1, p2] = players;
    if (!p1 || !p2) return;
    const a = deltas[p1.id]?.[metric];
    const b = deltas[p2.id]?.[metric];
    if (typeof a === "number" && typeof b === "number") {
      if (a === b) comparisons[metric] = null;
      else comparisons[metric] = a > b ? p1.id : p2.id;
    } else {
      comparisons[metric] = null;
    }
  });

  res.json({
    deltas,
    comparisons,
    sessionStats,
    teamStats: {
      wins: teamWins,
      losses: teamLosses,
      winRate: teamWinRate,
      gameCount: teamGameCount
    }
  });
});

router.get("/sessions/:id/timeseries", (req, res) => {
  const sessionId = Number(req.params.id);
  const playerId = Number(req.query.playerId);
  const metric = String(req.query.metric || "");

  if (!sessionId || !playerId || !metric) {
    return res.status(400).json({ error: "Missing playerId or metric" });
  }

  const snapshots = db
    .prepare(
      "SELECT capturedAt, derivedJson, matchIndex FROM snapshots WHERE sessionId = ? AND playerId = ? ORDER BY capturedAt ASC"
    )
    .all(sessionId, playerId) as { capturedAt: string; derivedJson: string; matchIndex: number | null }[];

  const baseline = db
    .prepare("SELECT derivedJson FROM snapshots WHERE playerId = ? ORDER BY capturedAt ASC LIMIT 1")
    .get(playerId) as { derivedJson: string } | undefined;
  const baselineDerived = parseJson<DerivedMetrics>(baseline?.derivedJson || "");

  const latestByMatchIndex = new Map<number, { t: number; derived: DerivedMetrics | null }>();
  snapshots.forEach((snapshot) => {
    if (snapshot.matchIndex === null || snapshot.matchIndex === undefined) return;
    const derived = parseJson<DerivedMetrics>(snapshot.derivedJson);
    latestByMatchIndex.set(snapshot.matchIndex, { t: snapshot.matchIndex, derived });
  });

  const additiveMetrics = new Set([
    "wins",
    "losses",
    "goals",
    "assists",
    "saves",
    "shots",
    "mmr"
  ]);

  const points = Array.from(latestByMatchIndex.values())
    .sort((a, b) => a.t - b.t)
    .map((snapshot) => {
    const derived = snapshot.derived;
    if (!derived) return { t: snapshot.t, v: null };

    if (metric === "winRate") {
      const wins = derived.wins;
      const losses = derived.losses;
      const baseWins = baselineDerived?.wins ?? null;
      const baseLosses = baselineDerived?.losses ?? null;
      if (typeof wins === "number" && typeof losses === "number" && typeof baseWins === "number" && typeof baseLosses === "number") {
        const deltaWins = wins - baseWins;
        const deltaLosses = losses - baseLosses;
        const total = deltaWins + deltaLosses;
        return { t: snapshot.t, v: total > 0 ? deltaWins / total : null };
      }
      return { t: snapshot.t, v: null };
    }

    if (metric === "goalShotRatio") {
      const goals = derived.goals;
      const shots = derived.shots;
      const baseGoals = baselineDerived?.goals ?? null;
      const baseShots = baselineDerived?.shots ?? null;
      if (typeof goals === "number" && typeof shots === "number" && typeof baseGoals === "number" && typeof baseShots === "number") {
        const deltaGoals = goals - baseGoals;
        const deltaShots = shots - baseShots;
        return { t: snapshot.t, v: deltaShots > 0 ? deltaGoals / deltaShots : null };
      }
      return { t: snapshot.t, v: null };
    }

    const value = (derived as Record<string, number | null>)[metric] ?? null;
    const baselineValue = (baselineDerived as Record<string, number | null> | null)?.[metric] ?? null;

    if (metric === "rankPoints") {
      return { t: snapshot.t, v: typeof value === "number" ? value : null };
    }

    if (additiveMetrics.has(metric) && typeof value === "number" && typeof baselineValue === "number") {
      return { t: snapshot.t, v: value - baselineValue };
    }

    if (typeof value === "number" && typeof baselineValue === "number") {
      return { t: snapshot.t, v: value - baselineValue };
    }

    return { t: snapshot.t, v: null };
  });

  res.json(points);
});

router.get("/sessions/:id/snapshots", (req, res) => {
  const sessionId = Number(req.params.id);
  const limit = Number(req.query.limit || 20);
  const rows = getRecentSnapshots(sessionId, limit);
  const payload = rows.map((row) => ({
    id: row.id,
    playerId: row.playerId,
    capturedAt: row.capturedAt,
    derived: parseJson<DerivedMetrics>(row.derivedJson)
  }));
  res.json(payload);
});

router.post("/sessions/:id/snapshots/backfill", (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const rows = db
    .prepare(
      "SELECT id, rawJson FROM snapshots WHERE sessionId = ?"
    )
    .all(sessionId) as { id: number; rawJson: string }[];

  const update = db.prepare("UPDATE snapshots SET derivedJson = ? WHERE id = ?");
  let updated = 0;
  let skipped = 0;

  const run = db.transaction(() => {
    rows.forEach((row) => {
      const raw = parseJson<unknown>(row.rawJson);
      if (!raw) {
        skipped += 1;
        return;
      }
      const derived = extractMetrics(raw, session.mode);
      update.run(JSON.stringify(derived), row.id);
      updated += 1;
    });
  });

  run();
  res.json({ updated, skipped });
});

router.post("/snapshots/:id/backfill", (req, res) => {
  const snapshotId = Number(req.params.id);
  const row = db
    .prepare(
      "SELECT snapshots.id, snapshots.rawJson, sessions.mode FROM snapshots JOIN sessions ON sessions.id = snapshots.sessionId WHERE snapshots.id = ?"
    )
    .get(snapshotId) as { id: number; rawJson: string; mode: string } | undefined;

  if (!row) return res.status(404).json({ error: "Snapshot not found" });
  const raw = parseJson<unknown>(row.rawJson);
  if (!raw) return res.status(400).json({ error: "Snapshot rawJson was invalid" });

  const derived = extractMetrics(raw, row.mode);
  db.prepare("UPDATE snapshots SET derivedJson = ? WHERE id = ?").run(JSON.stringify(derived), row.id);
  res.json({ ok: true });
});

router.get("/sessions/:id/snapshots/raw", (req, res) => {
  const sessionId = Number(req.params.id);
  const limit = Number(req.query.limit || 50);
  const rows = db
    .prepare(
      "SELECT id, playerId, capturedAt, matchIndex, rawJson, derivedJson FROM snapshots WHERE sessionId = ? ORDER BY capturedAt DESC LIMIT ?"
    )
    .all(sessionId, limit) as {
    id: number;
    playerId: number;
    capturedAt: string;
    matchIndex: number | null;
    rawJson: string;
    derivedJson: string;
  }[];

  const payload = rows.map((row) => ({
    id: row.id,
    playerId: row.playerId,
    capturedAt: row.capturedAt,
    matchIndex: row.matchIndex,
    raw: parseJson<unknown>(row.rawJson),
    derived: parseJson<DerivedMetrics>(row.derivedJson)
  }));

  res.json(payload);
});

router.get("/trn/status", async (req, res) => {
  const platform = (req.query.platform as string) || "xbl";
  const gamertag = req.query.gamertag as string | undefined;
  const force = req.query.force === "1" || req.query.force === "true";
  if (!gamertag) {
    return res.status(400).json({ error: "Missing gamertag" });
  }
  const result = await getTrnStatus(platform as any, gamertag, { force });
  res.json({ ...result, rateLimit: getRateLimitInfo() });
});

router.get("/metrics/db", (req, res) => {
  const sessionId = req.query.sessionId ? Number(req.query.sessionId) : null;
  const limit = Number(req.query.limit || 100);
  const rows = getDbMetrics(Number.isFinite(sessionId as number) ? (sessionId as number) : null, limit);
  const points = rows
    .map((row) => ({ t: row.capturedAt, sizeBytes: row.dbSizeBytes, snapshotsCount: row.snapshotsCount }))
    .reverse();
  res.json(points);
});

function readSettingsFile(settingsPath: string): Record<string, string> {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettingsFile(settingsPath: string, updates: Record<string, string | null>): void {
  const existing = readSettingsFile(settingsPath);
  const next: Record<string, string> = { ...existing };
  Object.entries(updates).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim().length > 0) {
      next[key] = value.trim();
    }
  });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), "utf8");
}

function getSettingsPaths() {
  const dbDir = path.dirname(db.name);
  const rootDataDir = path.resolve(dbDir, "..", "..", "data");
  return {
    primary: path.join(dbDir, "app-settings.json"),
    secondary: path.join(rootDataDir, "app-settings.json")
  };
}

router.post("/settings/api-key", (req, res) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ error: "Missing apiKey" });
  }
  const trimmed = apiKey.trim();
  process.env.TRN_API_KEY = trimmed;
  setSetting("TRN_API_KEY", trimmed);
  const settingsPaths = getSettingsPaths();
  const written: string[] = [];
  [settingsPaths.primary, settingsPaths.secondary].forEach((settingsPath) => {
    try {
      writeSettingsFile(settingsPath, { TRN_API_KEY: trimmed });
      written.push(settingsPath);
    } catch (error) {
      console.error("Failed to write settings file:", settingsPath, error);
    }
  });
  const stored = getSetting("TRN_API_KEY") || trimmed;
  if (!stored) {
    console.error("Failed to persist TRN_API_KEY to app_settings.");
    return res.status(500).json({ error: "Failed to persist API key" });
  }
  res.json({ ok: true, written });
});

router.get("/settings/api-key", (req, res) => {
  let value = process.env.TRN_API_KEY || getSetting("TRN_API_KEY");
  if (!value) {
    const settingsPaths = getSettingsPaths();
    for (const settingsPath of [settingsPaths.primary, settingsPaths.secondary]) {
      if (fs.existsSync(settingsPath)) {
        try {
          const parsed = readSettingsFile(settingsPath);
          value = parsed.TRN_API_KEY || null;
          if (value) break;
        } catch (error) {
          console.error("Failed to read settings file:", settingsPath, error);
        }
      }
    }
  }
  if (value && !process.env.TRN_API_KEY) {
    process.env.TRN_API_KEY = value;
  }
  res.json({ configured: Boolean(value) });
});

router.post("/settings/openai-key", (req, res) => {
  const { apiKey, model } = req.body as { apiKey?: string; model?: string };
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ error: "Missing apiKey" });
  }
  const trimmed = apiKey.trim();
  process.env.OPENAI_API_KEY = trimmed;
  setSetting("OPENAI_API_KEY", trimmed);
  if (typeof model === "string" && model.trim().length > 0) {
    process.env.OPENAI_MODEL = model.trim();
    setSetting("OPENAI_MODEL", model.trim());
  }
  const settingsPaths = getSettingsPaths();
  const written: string[] = [];
  [settingsPaths.primary, settingsPaths.secondary].forEach((settingsPath) => {
    try {
      writeSettingsFile(settingsPath, {
        OPENAI_API_KEY: trimmed,
        OPENAI_MODEL: typeof model === "string" ? model.trim() : null
      });
      written.push(settingsPath);
    } catch (error) {
      console.error("Failed to write settings file:", settingsPath, error);
    }
  });
  const stored = getSetting("OPENAI_API_KEY") || trimmed;
  if (!stored) {
    console.error("Failed to persist OPENAI_API_KEY to app_settings.");
    return res.status(500).json({ error: "Failed to persist API key" });
  }
  res.json({ ok: true, written });
});

router.get("/settings/openai-key", (req, res) => {
  let value = process.env.OPENAI_API_KEY || getSetting("OPENAI_API_KEY");
  let model = process.env.OPENAI_MODEL || getSetting("OPENAI_MODEL") || null;
  if (!value) {
    const settingsPaths = getSettingsPaths();
    for (const settingsPath of [settingsPaths.primary, settingsPaths.secondary]) {
      if (fs.existsSync(settingsPath)) {
        try {
          const parsed = readSettingsFile(settingsPath);
          value = parsed.OPENAI_API_KEY || null;
          model = parsed.OPENAI_MODEL || model;
          if (value) break;
        } catch (error) {
          console.error("Failed to read settings file:", settingsPath, error);
        }
      }
    }
  }
  if (value && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = value;
  }
  if (model && !process.env.OPENAI_MODEL) {
    process.env.OPENAI_MODEL = model;
  }
  res.json({ configured: Boolean(value), model });
});

router.post("/settings/coach-prompt", (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing prompt" });
  }
  const trimmed = prompt.trim();
  setSetting("COACH_PROMPT", trimmed);
  const settingsPaths = getSettingsPaths();
  const written: string[] = [];
  [settingsPaths.primary, settingsPaths.secondary].forEach((settingsPath) => {
    try {
      writeSettingsFile(settingsPath, { COACH_PROMPT: trimmed });
      written.push(settingsPath);
    } catch (error) {
      console.error("Failed to write settings file:", settingsPath, error);
    }
  });
  res.json({ ok: true, written });
});

router.post("/settings/team-coach-prompt", (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing prompt" });
  }
  const trimmed = prompt.trim();
  setSetting("TEAM_COACH_PROMPT", trimmed);
  const settingsPaths = getSettingsPaths();
  const written: string[] = [];
  [settingsPaths.primary, settingsPaths.secondary].forEach((settingsPath) => {
    try {
      writeSettingsFile(settingsPath, { TEAM_COACH_PROMPT: trimmed });
      written.push(settingsPath);
    } catch (error) {
      console.error("Failed to write settings file:", settingsPath, error);
    }
  });
  res.json({ ok: true, written });
});

router.get("/settings/team-coach-prompt/default", (req, res) => {
  res.json({ prompt: defaultCoachPrompt });
});

router.get("/settings/team-coach-prompt", (req, res) => {
  let prompt = getSetting("TEAM_COACH_PROMPT");
  if (!prompt) {
    const settingsPaths = getSettingsPaths();
    for (const settingsPath of [settingsPaths.primary, settingsPaths.secondary]) {
      if (fs.existsSync(settingsPath)) {
        const parsed = readSettingsFile(settingsPath);
        if (parsed.TEAM_COACH_PROMPT) {
          prompt = parsed.TEAM_COACH_PROMPT;
          break;
        }
      }
    }
  }
  res.json({ prompt: prompt || null });
});

router.get("/settings/coach-prompt/default", (req, res) => {
  res.json({ prompt: defaultCoachPrompt });
});

router.get("/settings/coach-prompt", (req, res) => {
  let prompt = getSetting("COACH_PROMPT");
  if (!prompt) {
    const settingsPaths = getSettingsPaths();
    for (const settingsPath of [settingsPaths.primary, settingsPaths.secondary]) {
      if (fs.existsSync(settingsPath)) {
        const parsed = readSettingsFile(settingsPath);
        if (parsed.COACH_PROMPT) {
          prompt = parsed.COACH_PROMPT;
          break;
        }
      }
    }
  }
  res.json({ prompt: prompt || null });
});

router.get("/settings/debug", (req, res) => {
  const rows = db.prepare("SELECT key FROM app_settings").all() as { key: string }[];
  const settingsPaths = getSettingsPaths();
  res.json({
    dbPath: db.name,
    settingsPath: settingsPaths.primary,
    settingsPathAlt: settingsPaths.secondary,
    settingsPathExists: fs.existsSync(settingsPaths.primary),
    settingsPathAltExists: fs.existsSync(settingsPaths.secondary),
    keys: rows.map((row) => row.key),
    configured: Boolean(process.env.TRN_API_KEY || getSetting("TRN_API_KEY"))
  });
});

router.get("/sessions/:id/raw", (req, res) => {
  const sessionId = Number(req.params.id);
  const playerId = Number(req.query.playerId);
  if (!sessionId || !playerId) {
    return res.status(400).json({ error: "Missing sessionId or playerId" });
  }
  const latest = db
    .prepare("SELECT rawJson, derivedJson FROM snapshots WHERE sessionId = ? AND playerId = ? ORDER BY capturedAt DESC LIMIT 1")
    .get(sessionId, playerId) as { rawJson: string; derivedJson: string } | undefined;
  if (!latest) return res.status(404).json({ error: "No snapshot found" });
  res.json({
    raw: parseJson<unknown>(latest.rawJson),
    derived: parseJson<DerivedMetrics>(latest.derivedJson)
  });
});

router.get("/logs/polling", (req, res) => {
  const limit = Number(req.query.limit || 200);
  res.json(listPollingLogs(Number.isFinite(limit) ? limit : 200));
});

router.post("/sessions/:id/coach", async (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const focusPlaylistId = Number.isFinite(Number(req.body?.focusPlaylistId))
    ? Number(req.body.focusPlaylistId)
    : 11;

  try {
    const packet = buildCoachPacket(sessionId, focusPlaylistId);
    const prompt = getSetting("COACH_PROMPT");
    const { report, model, tokensUsed } = await generateCoachReport(packet, prompt || undefined);
    insertCoachReport(sessionId, session.teamId ?? null, focusPlaylistId, JSON.stringify(packet), JSON.stringify(report), model, tokensUsed);
    res.json(report);
  } catch (error: any) {
    console.error("Failed to generate coach report:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to generate coach report" });
  }
});

router.get("/sessions/:id/coach/packet", (req, res) => {
  const sessionId = Number(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const focusPlaylistId = Number.isFinite(Number(req.query.focusPlaylistId))
    ? Number(req.query.focusPlaylistId)
    : 11;
  try {
    const packet = buildCoachPacket(sessionId, focusPlaylistId);
    const prompt = getSetting("COACH_PROMPT");
    res.json({ focusPlaylistId, prompt: prompt || null, packet });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to build coach packet" });
  }
});

router.get("/sessions/:id/coach/latest", (req, res) => {
  const sessionId = Number(req.params.id);
  const focusPlaylistId = Number.isFinite(Number(req.query.focusPlaylistId))
    ? Number(req.query.focusPlaylistId)
    : 11;
  const report = getLatestCoachReport(sessionId, focusPlaylistId);
  if (!report) return res.status(404).json({ error: "No coach report found" });
  res.json({
    id: report.id,
    createdAt: report.createdAt,
    focusPlaylistId: report.focusPlaylistId,
    model: report.model,
    report: parseJson(report.reportJson)
  });
});

router.get("/sessions/:id/coach/reports", (req, res) => {
  const sessionId = Number(req.params.id);
  const focusPlaylistId = Number.isFinite(Number(req.query.focusPlaylistId))
    ? Number(req.query.focusPlaylistId)
    : undefined;
  const reports = listCoachReports(sessionId, focusPlaylistId);
  res.json(
    reports.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      focusPlaylistId: row.focusPlaylistId,
      model: row.model,
      report: parseJson(row.reportJson)
    }))
  );
});

router.get("/teams/:id/coach/packet", (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  try {
    const packet = buildTeamCoachPacket(teamId);
    const prompt = getSetting("TEAM_COACH_PROMPT");
    res.json({ prompt: prompt || null, packet });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to build team coach packet" });
  }
});

router.post("/teams/:id/coach", async (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  try {
    const packet = buildTeamCoachPacket(teamId);
    const prompt = getSetting("TEAM_COACH_PROMPT");
    const { report, model, tokensUsed } = await generateCoachReport(packet, prompt || undefined);
    insertTeamCoachReport(teamId, JSON.stringify(packet), JSON.stringify(report), model, tokensUsed);
    res.json(report);
  } catch (error: any) {
    console.error("Failed to generate team coach report:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to generate team coach report" });
  }
});

router.get("/teams/:id/coach/latest", (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  const report = getLatestTeamCoachReport(teamId);
  if (!report) return res.status(404).json({ error: "No team coach report found" });
  res.json({
    id: report.id,
    createdAt: report.createdAt,
    model: report.model,
    report: parseJson(report.reportJson)
  });
});

router.get("/teams/:id/coach/reports", (req, res) => {
  const teamId = Number(req.params.id);
  const team = getTeam(teamId);
  if (!team) return res.status(404).json({ error: "Team not found" });
  const reports = listTeamCoachReports(teamId);
  res.json(
    reports.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      model: row.model,
      report: parseJson(row.reportJson)
    }))
  );
});

router.post("/demo", async (req, res) => {
  const session = createSession("Demo Session", "2v2", 60, null, false);
  createPlayers(session.id, [
    { platform: "xbl", gamertag: "DemoPlayerOne" },
    { platform: "xbl", gamertag: "DemoPlayerTwo" }
  ]);
  await initializeSession(session.id);
  startPolling(session.id, 60);
  const detail = toSessionDetail(session.id);
  res.status(201).json(detail);
});

export default router;
