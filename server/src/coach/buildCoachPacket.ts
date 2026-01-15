import { db, getBaselineSnapshot, getLatestSnapshot, getPlayersBySession, getSession } from "../db.js";
import { DerivedMetrics } from "../types.js";
import { CoachPacket } from "./types.js";

const playlistLabels: Record<number, string> = {
  10: "Ranked Duel 1v1",
  11: "Ranked Doubles 2v2",
  13: "Ranked Standard 3v3"
};

function parseJson<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => typeof value === "number");
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function getPlaylistStats(derived: DerivedMetrics | null, playlistId: number) {
  return derived?.playlists?.[playlistId] ?? null;
}

function getPlaylistAverage(derived: DerivedMetrics | null, playlistId: number) {
  return derived?.playlistAverages?.[playlistId] ?? null;
}

function computeDelta(latest: number | null, baseline: number | null): number | null {
  if (typeof latest !== "number" || typeof baseline !== "number") return null;
  return latest - baseline;
}

export function buildCoachPacket(sessionId: number, focusPlaylistId = 11): CoachPacket {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const players = getPlayersBySession(sessionId);
  const focusLabel = playlistLabels[focusPlaylistId] ?? `Playlist ${focusPlaylistId}`;

  let latestAt: string | null = null;
  let sessionSeason: number | null = null;

  const playerPackets = players.map((player) => {
    const baseline = getBaselineSnapshot(player.id);
    const latest = getLatestSnapshot(player.id);
    const baselineDerived = parseJson<DerivedMetrics>(baseline?.derivedJson || "");
    const latestDerived = parseJson<DerivedMetrics>(latest?.derivedJson || "");

    if (latest?.capturedAt && (!latestAt || latest.capturedAt > latestAt)) {
      latestAt = latest.capturedAt;
    }

    const playlistStats = getPlaylistStats(latestDerived, focusPlaylistId);
    if (sessionSeason === null && typeof latestDerived?.currentSeason === "number") {
      sessionSeason = latestDerived.currentSeason;
    }

    const rankLabel = playlistStats?.tierName
      ? `${playlistStats.tierName}${playlistStats.divisionName ? ` ${playlistStats.divisionName}` : ""}`
      : null;

    return {
      playerId: player.id,
      platform: player.platform,
      gamertag: player.gamertag,
      rankLabel,
      rating: playlistStats?.rating ?? null,
      peakRatingSeason: playlistStats?.peakRating ?? null,
      matchesPlayedSeason: playlistStats?.matchesPlayed ?? null,
      winStreak: playlistStats
        ? {
            type: playlistStats.winStreakType ?? null,
            value: playlistStats.winStreakValue ?? null
          }
        : null
    };
  });

  const playlistAverages: CoachPacket["playlistAverages"] = {};
  const deltas: CoachPacket["deltas"] = {
    players: {},
    team: {
      winsDelta: null,
      lossesDelta: null,
      matchesPlayedDelta: null,
      sessionWinRate: null
    }
  };

  const trendHints: CoachPacket["trendHints"] = { players: {} };

  players.forEach((player) => {
    const baseline = getBaselineSnapshot(player.id);
    const latest = getLatestSnapshot(player.id);
    const baselineDerived = parseJson<DerivedMetrics>(baseline?.derivedJson || "");
    const latestDerived = parseJson<DerivedMetrics>(latest?.derivedJson || "");

    const baselinePlaylist = getPlaylistStats(baselineDerived, focusPlaylistId);
    const latestPlaylist = getPlaylistStats(latestDerived, focusPlaylistId);
    const baselineAverage = getPlaylistAverage(latestDerived ?? baselineDerived, focusPlaylistId);

    if (baselineAverage) {
      playlistAverages[player.id] = {
        avgGoalsPerGame: baselineAverage.avgGoalsPerGame ?? null,
        avgShotsPerGame: baselineAverage.avgShotsPerGame ?? null,
        avgSavesPerGame: baselineAverage.avgSavesPerGame ?? null,
        avgAssistsPerGame: baselineAverage.avgAssistsPerGame ?? null,
        avgMVPsPerGame: baselineAverage.avgMVPsPerGame ?? null,
        shotAccuracyPct: baselineAverage.shotAccuracyPct ?? null,
        goalsSavesRatio: baselineAverage.goalsSavesRatio ?? null,
        assistsGoalsRatio: baselineAverage.assistsGoalsRatio ?? null
      };
    }

    const winsDelta = computeDelta(latestDerived?.wins ?? null, baselineDerived?.wins ?? null);
    const lossesDelta = computeDelta(latestDerived?.losses ?? null, baselineDerived?.losses ?? null);
    const goalsDelta = computeDelta(latestDerived?.goals ?? null, baselineDerived?.goals ?? null);
    const assistsDelta = computeDelta(latestDerived?.assists ?? null, baselineDerived?.assists ?? null);
    const savesDelta = computeDelta(latestDerived?.saves ?? null, baselineDerived?.saves ?? null);
    const shotsDelta = computeDelta(latestDerived?.shots ?? null, baselineDerived?.shots ?? null);
    const ratingDelta = computeDelta(latestPlaylist?.rating ?? null, baselinePlaylist?.rating ?? null);
    const matchesPlayedDelta = computeDelta(latestPlaylist?.matchesPlayed ?? null, baselinePlaylist?.matchesPlayed ?? null);

    let sessionWinRate: number | null = null;
    if (typeof winsDelta === "number" && typeof lossesDelta === "number" && winsDelta + lossesDelta > 0) {
      sessionWinRate = winsDelta / (winsDelta + lossesDelta);
    } else if (typeof winsDelta === "number" && typeof matchesPlayedDelta === "number" && matchesPlayedDelta > 0) {
      sessionWinRate = winsDelta / matchesPlayedDelta;
    }

    let efficiencyGoalsPerShot: number | null = null;
    if (typeof goalsDelta === "number" && typeof shotsDelta === "number" && shotsDelta > 0) {
      efficiencyGoalsPerShot = goalsDelta / shotsDelta;
    } else if (baselineAverage?.shotAccuracyPct) {
      efficiencyGoalsPerShot = baselineAverage.shotAccuracyPct / 100;
    }

    let shotsPerGame: number | null = null;
    let savesPerGame: number | null = null;
    if (typeof shotsDelta === "number" && typeof matchesPlayedDelta === "number" && matchesPlayedDelta > 0) {
      shotsPerGame = shotsDelta / matchesPlayedDelta;
    } else if (baselineAverage?.avgShotsPerGame) {
      shotsPerGame = baselineAverage.avgShotsPerGame;
    }

    if (typeof savesDelta === "number" && typeof matchesPlayedDelta === "number" && matchesPlayedDelta > 0) {
      savesPerGame = savesDelta / matchesPlayedDelta;
    } else if (baselineAverage?.avgSavesPerGame) {
      savesPerGame = baselineAverage.avgSavesPerGame;
    }

    deltas.players[player.id] = {
      ratingDelta,
      winsDelta,
      lossesDelta,
      goalsDelta,
      assistsDelta,
      savesDelta,
      shotsDelta,
      matchesPlayedDelta,
      sessionWinRate,
      efficiencyGoalsPerShot,
      shotsPerGame,
      savesPerGame
    };

    const snapshots = db
      .prepare(
        "SELECT capturedAt, derivedJson FROM snapshots WHERE sessionId = ? AND playerId = ? ORDER BY capturedAt ASC"
      )
      .all(sessionId, player.id) as { capturedAt: string; derivedJson: string }[];

    const midpoint = Math.max(1, Math.floor(snapshots.length / 2));
    const firstHalf = snapshots.slice(0, midpoint);
    const secondHalf = snapshots.slice(midpoint);

    const firstRatings = firstHalf.map((snap) => getPlaylistStats(parseJson<DerivedMetrics>(snap.derivedJson), focusPlaylistId)?.rating ?? null);
    const secondRatings = secondHalf.map((snap) => getPlaylistStats(parseJson<DerivedMetrics>(snap.derivedJson), focusPlaylistId)?.rating ?? null);
    const firstAccuracy = firstHalf.map((snap) => getPlaylistAverage(parseJson<DerivedMetrics>(snap.derivedJson), focusPlaylistId)?.shotAccuracyPct ?? null);
    const secondAccuracy = secondHalf.map((snap) => getPlaylistAverage(parseJson<DerivedMetrics>(snap.derivedJson), focusPlaylistId)?.shotAccuracyPct ?? null);
    const firstShotsPg = firstHalf.map((snap) => getPlaylistAverage(parseJson<DerivedMetrics>(snap.derivedJson), focusPlaylistId)?.avgShotsPerGame ?? null);
    const secondShotsPg = secondHalf.map((snap) => getPlaylistAverage(parseJson<DerivedMetrics>(snap.derivedJson), focusPlaylistId)?.avgShotsPerGame ?? null);

    trendHints.players[player.id] = {
      ratingAvgFirstHalf: average(firstRatings),
      ratingAvgSecondHalf: average(secondRatings),
      shotAccuracyPctFirstHalf: average(firstAccuracy),
      shotAccuracyPctSecondHalf: average(secondAccuracy),
      shotsPerGameFirstHalf: average(firstShotsPg),
      shotsPerGameSecondHalf: average(secondShotsPg)
    };
  });

  const teamWins = Object.values(deltas.players)
    .map((playerDelta) => playerDelta.winsDelta)
    .filter((value): value is number => typeof value === "number");
  const teamLosses = Object.values(deltas.players)
    .map((playerDelta) => playerDelta.lossesDelta)
    .filter((value): value is number => typeof value === "number");
  const teamMatches = Object.values(deltas.players)
    .map((playerDelta) => playerDelta.matchesPlayedDelta)
    .filter((value): value is number => typeof value === "number");

  const winsDelta = teamWins.length > 0 ? Math.max(...teamWins) : null;
  const lossesDelta = teamLosses.length > 0 ? Math.max(...teamLosses) : null;
  const matchesPlayedDelta = teamMatches.length > 0 ? Math.max(...teamMatches) : null;

  deltas.team.winsDelta = winsDelta;
  deltas.team.lossesDelta = lossesDelta;
  deltas.team.matchesPlayedDelta = matchesPlayedDelta;

  if (typeof winsDelta === "number" && typeof lossesDelta === "number" && winsDelta + lossesDelta > 0) {
    deltas.team.sessionWinRate = winsDelta / (winsDelta + lossesDelta);
  } else if (typeof winsDelta === "number" && typeof matchesPlayedDelta === "number" && matchesPlayedDelta > 0) {
    deltas.team.sessionWinRate = winsDelta / matchesPlayedDelta;
  }

  return {
    mode: focusLabel,
    season: sessionSeason,
    focusPlaylistId,
    session: {
      id: session.id,
      name: session.name,
      startedAt: session.createdAt,
      latestAt,
      pollingIntervalSeconds: session.pollingIntervalSeconds
    },
    players: playerPackets,
    playlistAverages,
    deltas,
    trendHints
  };
}
