import { DerivedMetrics } from "../types.js";
import { getLatestSnapshot, insertSnapshot, setSessionMatchIndex } from "../db.js";
import { ScoreboardTeam } from "./types.js";

type PlayerMatchInput = {
  playerId: number | null;
  gamertag: string;
  platform: string;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  shots: number | null;
  score: number | null;
  team: ScoreboardTeam;
};

export function applyMatchToSession(input: {
  sessionId: number;
  matchIndex: number;
  createdAt: string;
  winningTeam: ScoreboardTeam | null;
  players: PlayerMatchInput[];
}): void {
  input.players.forEach((player) => {
    if (!player.playerId) return;
    const latest = getLatestSnapshot(player.playerId);
    const prevDerived = latest ? safeParseDerived(latest.derivedJson) : null;
    const updated = applyPlayerTotals(prevDerived, player, input.winningTeam, input.createdAt);
    const rawJson = JSON.stringify({
      source: "vision",
      matchIndex: input.matchIndex,
      gamertag: player.gamertag
    });
    insertSnapshot(
      input.sessionId,
      player.playerId,
      input.createdAt,
      input.matchIndex,
      rawJson,
      JSON.stringify(updated)
    );
  });

  setSessionMatchIndex(input.sessionId, input.matchIndex);
}

function applyPlayerTotals(
  previous: DerivedMetrics | null,
  match: PlayerMatchInput,
  winningTeam: ScoreboardTeam | null,
  createdAt: string
): DerivedMetrics {
  const prevWins = numberOrZero(previous?.wins);
  const prevLosses = numberOrZero(previous?.losses);
  const prevGoals = numberOrZero(previous?.goals);
  const prevAssists = numberOrZero(previous?.assists);
  const prevSaves = numberOrZero(previous?.saves);
  const prevShots = numberOrZero(previous?.shots);

  const winDelta = winningTeam ? (match.team === winningTeam ? 1 : 0) : 0;
  const lossDelta = winningTeam ? (match.team === winningTeam ? 0 : 1) : 0;

  const wins = prevWins + winDelta;
  const losses = prevLosses + lossDelta;
  const goals = prevGoals + numberOrZero(match.goals);
  const assists = prevAssists + numberOrZero(match.assists);
  const saves = prevSaves + numberOrZero(match.saves);
  const shots = prevShots + numberOrZero(match.shots);

  return {
    lastUpdated: createdAt,
    currentSeason: previous?.currentSeason ?? null,
    wins,
    losses,
    goals,
    assists,
    saves,
    shots,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    goalShotRatio: shots > 0 ? goals / shots : null,
    mmr: previous?.mmr ?? null,
    rank: previous?.rank ?? null,
    rankTierIndex: previous?.rankTierIndex ?? null,
    rankDivisionIndex: previous?.rankDivisionIndex ?? null,
    rankPoints: previous?.rankPoints ?? null,
    rankIconUrl: previous?.rankIconUrl ?? null,
    avatarUrl: previous?.avatarUrl ?? null,
    playlists: previous?.playlists ?? null,
    playlistAverages: previous?.playlistAverages ?? null
  };
}

function numberOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeParseDerived(value: string): DerivedMetrics | null {
  try {
    return JSON.parse(value) as DerivedMetrics;
  } catch {
    return null;
  }
}

