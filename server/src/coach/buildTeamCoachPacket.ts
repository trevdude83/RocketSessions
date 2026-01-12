import { getBaselineSnapshot, getLatestSnapshot, getPlayersBySession, getSession, getTeam, listTeamStats } from "../db.js";
import { TeamCoachPacket } from "./types.js";
import { DerivedMetrics } from "../types.js";

const metricKeys = [
  "wins",
  "losses",
  "winRate",
  "goals",
  "assists",
  "saves",
  "shots",
  "goalsPerGame",
  "shotsPerGame",
  "savesPerGame",
  "assistsPerGame",
  "shotAccuracy",
  "matchesPlayed",
  "ratingStart",
  "ratingEnd",
  "ratingDelta"
];

const HISTORY_LIMIT = 20;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getFocusPlaylistName(mode: string): string {
  if (mode === "solo") return "Ranked Duel 1v1";
  if (mode === "3v3") return "Ranked Standard 3v3";
  return "Ranked Doubles 2v2";
}

function getFocusPlaylistId(mode: string): number {
  if (mode === "solo") return 10;
  if (mode === "3v3") return 13;
  return 11;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(num) ? num : null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getPlaylistStats(
  derived: DerivedMetrics | null,
  playlistId: number
): {
  rating: number | null;
  tierName: string | null;
  divisionName: string | null;
  winStreakType: string | null;
  winStreakValue: number | null;
} | null {
  const playlist = derived?.playlists?.[playlistId];
  if (!playlist || typeof playlist !== "object") return null;
  const stats = playlist as {
    rating?: number | null;
    tierName?: string | null;
    divisionName?: string | null;
    winStreakType?: string | null;
    winStreakValue?: number | null;
  };
  return {
    rating: toNumber(stats.rating),
    tierName: toText(stats.tierName),
    divisionName: toText(stats.divisionName),
    winStreakType: toText(stats.winStreakType),
    winStreakValue: toNumber(stats.winStreakValue)
  };
}

function formatRankLabel(tierName: string | null, divisionName: string | null): string | null {
  if (!tierName) return null;
  return divisionName ? `${tierName} ${divisionName}` : tierName;
}

function pickBestByRating<T extends { rating: number | null }>(items: T[]): T | null {
  const rated = items.filter((item) => typeof item.rating === "number") as (T & { rating: number })[];
  if (rated.length > 0) {
    return rated.reduce((best, current) => (current.rating > best.rating ? current : best));
  }
  return items.find((item) => item.rating !== null) ?? items[0] ?? null;
}

function computeSessionRatingInfo(
  sessionId: number,
  playlistId: number
): {
  ratingStart: number | null;
  ratingEnd: number | null;
  ratingDelta: number | null;
  rankStart: string | null;
  rankEnd: string | null;
  season: number | null;
  winStreakStart: { type: string | null; value: number | null } | null;
  winStreakEnd: { type: string | null; value: number | null } | null;
} {
  const players = getPlayersBySession(sessionId);
  const startCandidates: Array<{
    rating: number | null;
    rankLabel: string | null;
    winStreak: { type: string | null; value: number | null } | null;
  }> = [];
  const endCandidates: Array<{
    rating: number | null;
    rankLabel: string | null;
    winStreak: { type: string | null; value: number | null } | null;
  }> = [];
  let season: number | null = null;

  players.forEach((player) => {
    const baseline = getBaselineSnapshot(player.id);
    const latest = getLatestSnapshot(player.id);
    const baselineDerived = parseJson<DerivedMetrics>(baseline?.derivedJson || "");
    const latestDerived = parseJson<DerivedMetrics>(latest?.derivedJson || "");
    if (season === null) {
      const latestSeason = toNumber(latestDerived?.currentSeason);
      const baselineSeason = toNumber(baselineDerived?.currentSeason);
      season = latestSeason ?? baselineSeason ?? null;
    }
    const startStats = getPlaylistStats(baselineDerived, playlistId);
    const endStats = getPlaylistStats(latestDerived, playlistId);
    if (startStats) {
      startCandidates.push({
        rating: startStats.rating,
        rankLabel: formatRankLabel(startStats.tierName, startStats.divisionName),
        winStreak: {
          type: startStats.winStreakType,
          value: startStats.winStreakValue
        }
      });
    }
    if (endStats) {
      endCandidates.push({
        rating: endStats.rating,
        rankLabel: formatRankLabel(endStats.tierName, endStats.divisionName),
        winStreak: {
          type: endStats.winStreakType,
          value: endStats.winStreakValue
        }
      });
    }
  });

  const bestStart = pickBestByRating(startCandidates);
  const bestEnd = pickBestByRating(endCandidates);
  const ratingStart = bestStart?.rating ?? null;
  const ratingEnd = bestEnd?.rating ?? null;
  const ratingDelta =
    typeof ratingStart === "number" && typeof ratingEnd === "number"
      ? ratingEnd - ratingStart
      : null;

  return {
    ratingStart,
    ratingEnd,
    ratingDelta,
    rankStart: bestStart?.rankLabel ?? null,
    rankEnd: bestEnd?.rankLabel ?? null,
    season,
    winStreakStart: bestStart?.winStreak ?? null,
    winStreakEnd: bestEnd?.winStreak ?? null
  };
}

function getMetricValue(
  entry: {
    derivedTeam: Record<string, number | null>;
    matchesPlayed: number | null;
    ratingStart: number | null;
    ratingEnd: number | null;
    ratingDelta: number | null;
  },
  key: string
): number | null {
  if (key === "matchesPlayed") {
    return typeof entry.matchesPlayed === "number" ? entry.matchesPlayed : entry.derivedTeam.matchesPlayed ?? null;
  }
  if (key === "ratingStart") return entry.ratingStart;
  if (key === "ratingEnd") return entry.ratingEnd;
  if (key === "ratingDelta") return entry.ratingDelta;
  return entry.derivedTeam[key] ?? null;
}

function buildWindowMetrics(
  entries: Array<{
    derivedTeam: Record<string, number | null>;
    matchesPlayed: number | null;
    ratingStart: number | null;
    ratingEnd: number | null;
    ratingDelta: number | null;
  }>
): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};
  metricKeys.forEach((key) => {
    const values = entries
      .map((entry) => getMetricValue(entry, key))
      .filter((value): value is number => typeof value === "number");
    metrics[key] = average(values);
  });
  return metrics;
}

export function buildTeamCoachPacket(teamId: number): TeamCoachPacket {
  const team = getTeam(teamId);
  if (!team) {
    throw new Error("Team not found");
  }
  const stats = listTeamStats(teamId);
  if (stats.length === 0) {
    throw new Error("No completed sessions for this team.");
  }

  const trimmed = stats.slice(0, HISTORY_LIMIT);
  const focusPlaylistId = getFocusPlaylistId(team.mode);
  const history = trimmed.map((row) => {
    const baseDerivedTeam = parseJson<Record<string, number | null>>(row.derivedTeamJson) ?? {};
    const deltasByPlayer =
      parseJson<Record<number, Record<string, number | null>>>(row.deltasJson) ?? null;
    const players = getPlayersBySession(row.sessionId).reduce((acc, player) => {
      acc[player.id] = player.gamertag;
      return acc;
    }, {} as Record<number, string>);
    const matchesPlayed = toNumber(baseDerivedTeam.matchesPlayed);
    const didPlayMatches = typeof matchesPlayed === "number" && matchesPlayed > 0;
    const baseLosses = toNumber(baseDerivedTeam.losses);
    const wins = toNumber(baseDerivedTeam.wins);
    const computedLosses =
      baseLosses === null && typeof wins === "number" && typeof matchesPlayed === "number"
        ? Math.max(0, matchesPlayed - wins)
        : null;
    const lossesDerived = baseLosses === null && computedLosses !== null;
    const lossesReliable = baseLosses !== null;
    const derivedTeam =
      lossesDerived ? { ...baseDerivedTeam, losses: computedLosses } : baseDerivedTeam;
    const session = getSession(row.sessionId);
    const sessionDurationMinutes =
      session?.createdAt && session?.endedAt
        ? Math.max(0, (new Date(session.endedAt).getTime() - new Date(session.createdAt).getTime()) / 60000)
        : null;
    let noMatchReason: "idle" | "trn_delay" | "unknown" | null = null;
    if (!didPlayMatches) {
      if (typeof sessionDurationMinutes === "number") {
        noMatchReason = sessionDurationMinutes < 3 ? "idle" : "trn_delay";
      } else {
        noMatchReason = "unknown";
      }
    }
    const ratingInfo = computeSessionRatingInfo(row.sessionId, focusPlaylistId);
    return {
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      derivedTeam,
      deltasByPlayer,
      players,
      matchesPlayed,
      didPlayMatches,
      sessionDurationMinutes,
      metricsReliable: didPlayMatches,
      lossesDerived,
      lossesReliable,
      noMatchReason,
      ratingStart: ratingInfo.ratingStart,
      ratingEnd: ratingInfo.ratingEnd,
      ratingDelta: ratingInfo.ratingDelta,
      rankStart: ratingInfo.rankStart,
      rankEnd: ratingInfo.rankEnd,
      season: ratingInfo.season,
      winStreakStart: ratingInfo.winStreakStart,
      winStreakEnd: ratingInfo.winStreakEnd
    };
  });

  const summaries = {
    latest: {} as Record<string, number | null>,
    averages: {} as Record<string, number | null>,
    best: {} as Record<string, number | null>,
    worst: {} as Record<string, number | null>
  };

  const latestEntry = history[0];
  metricKeys.forEach((key) => {
    const values = history
      .map((entry) => getMetricValue(entry, key))
      .filter((value): value is number => typeof value === "number");
    const latestValue = latestEntry ? getMetricValue(latestEntry, key) : null;
    summaries.latest[key] = typeof latestValue === "number" ? latestValue : null;
    summaries.averages[key] = average(values);
    summaries.best[key] = values.length ? Math.max(...values) : null;
    summaries.worst[key] = values.length ? Math.min(...values) : null;
  });

  const half = Math.max(1, Math.floor(history.length / 2));
  const firstHalf = history.slice(half);
  const secondHalf = history.slice(0, half);
  const trends: TeamCoachPacket["trends"] = {};
  metricKeys.forEach((key) => {
    const firstValues = firstHalf
      .map((entry) => getMetricValue(entry, key))
      .filter((value): value is number => typeof value === "number");
    const secondValues = secondHalf
      .map((entry) => getMetricValue(entry, key))
      .filter((value): value is number => typeof value === "number");
    trends[key] = {
      firstHalfAvg: average(firstValues),
      secondHalfAvg: average(secondValues),
      firstHalfCount: firstValues.length,
      secondHalfCount: secondValues.length
    };
  });

  const last3 = history.slice(0, 3);
  const prev3 = history.slice(3, 6);

  const sessionsWithMatches = history.filter((entry) => entry.didPlayMatches).length;
  const sessionsWithoutMatches = history.length - sessionsWithMatches;
  const lossesDerived = history.some((entry) => entry.lossesDerived);
  const notes: string[] = [];
  if (sessionsWithoutMatches > 0) {
    notes.push("Some sessions have 0 matches played; may be idle or TRN delay.");
  }
  if (lossesDerived) {
    notes.push("Losses were derived from matches played for some sessions.");
  }

  const focusPlaylistName = getFocusPlaylistName(team.mode);
  const focusSeason = history.find((entry) => typeof entry.season === "number")?.season ?? null;
  const recommendedMinimums = {
    sessionsWithMatchesForBasics: 2,
    sessionsWithMatchesForTrends: 6,
    matchesPerSessionTarget: 3
  };
  const playerIdentities = trimmed.reduce((acc, row) => {
    getPlayersBySession(row.sessionId).forEach((player) => {
      acc[player.id] = { gamertag: player.gamertag, platform: player.platform };
    });
    return acc;
  }, {} as Record<number, { gamertag: string; platform: "xbl" }>);

  return {
    team: {
      id: team.id,
      name: team.name,
      mode: team.mode
    },
    focus: {
      playlistId: focusPlaylistId,
      playlistName: focusPlaylistName,
      season: focusSeason
    },
    playerIdentities,
    recommendedMinimums,
    sessions: {
      count: history.length,
      latestAt: history[0]?.createdAt ?? null,
      earliestAt: history[history.length - 1]?.createdAt ?? null
    },
    dataQuality: {
      sessionsWithMatches,
      sessionsWithoutMatches,
      lossesDerivationMethod: lossesDerived ? "matchesMinusWins" : "unknown",
      notes
    },
    coachReadiness: {
      status:
        sessionsWithMatches < recommendedMinimums.sessionsWithMatchesForBasics
          ? "insufficient_data"
          : sessionsWithMatches < recommendedMinimums.sessionsWithMatchesForTrends
          ? "limited"
          : "good",
      reasons:
        sessionsWithMatches < recommendedMinimums.sessionsWithMatchesForBasics
          ? ["No sessions with matches played yet."]
          : sessionsWithMatches < recommendedMinimums.sessionsWithMatchesForTrends
          ? ["Not enough sessions for stable trends."]
          : []
    },
    summaries,
    trends,
    windows: {
      last3: {
        count: last3.length,
        metrics: buildWindowMetrics(last3)
      },
      prev3: {
        count: prev3.length,
        metrics: buildWindowMetrics(prev3)
      },
      overall: {
        count: history.length,
        metrics: buildWindowMetrics(history)
      }
    },
    history
  };
}
