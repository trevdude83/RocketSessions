import { ScoreboardExtraction, ScoreboardTeam } from "./types.js";

export type DerivedMatch = {
  match: {
    playlistName: string | null;
    isRanked: boolean | null;
    winningTeam: ScoreboardTeam | null;
  };
  teams: {
    blue: TeamTotals;
    orange: TeamTotals;
  };
};

type TeamTotals = {
  goals: number | null;
  assists: number | null;
  saves: number | null;
  shots: number | null;
  score: number | null;
};

type TeamAccumulator = {
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  score: number;
};

export function deriveMatch(extraction: ScoreboardExtraction): DerivedMatch {
  return {
    match: extraction.match,
    teams: {
      blue: sumTeam(extraction.teams.blue),
      orange: sumTeam(extraction.teams.orange)
    }
  };
}

function sumTeam(players: { goals: number | null; assists: number | null; saves: number | null; shots: number | null; score: number | null }[]): TeamTotals {
  const totals = players.reduce(
    (acc: TeamAccumulator, player) => {
      if (typeof player.goals === "number") acc.goals += player.goals;
      if (typeof player.assists === "number") acc.assists += player.assists;
      if (typeof player.saves === "number") acc.saves += player.saves;
      if (typeof player.shots === "number") acc.shots += player.shots;
      if (typeof player.score === "number") acc.score += player.score;
      return acc;
    },
    { goals: 0, assists: 0, saves: 0, shots: 0, score: 0 }
  );

  return {
    goals: totals.goals || null,
    assists: totals.assists || null,
    saves: totals.saves || null,
    shots: totals.shots || null,
    score: totals.score || null
  };
}
