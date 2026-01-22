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
    (acc: TeamAccumulator & { seen: Record<keyof TeamAccumulator, boolean> }, player) => {
      if (typeof player.goals === "number") {
        acc.goals += player.goals;
        acc.seen.goals = true;
      }
      if (typeof player.assists === "number") {
        acc.assists += player.assists;
        acc.seen.assists = true;
      }
      if (typeof player.saves === "number") {
        acc.saves += player.saves;
        acc.seen.saves = true;
      }
      if (typeof player.shots === "number") {
        acc.shots += player.shots;
        acc.seen.shots = true;
      }
      if (typeof player.score === "number") {
        acc.score += player.score;
        acc.seen.score = true;
      }
      return acc;
    },
    { goals: 0, assists: 0, saves: 0, shots: 0, score: 0, seen: { goals: false, assists: false, saves: false, shots: false, score: false } }
  );

  return {
    goals: totals.seen.goals ? totals.goals : null,
    assists: totals.seen.assists ? totals.assists : null,
    saves: totals.seen.saves ? totals.saves : null,
    shots: totals.seen.shots ? totals.shots : null,
    score: totals.seen.score ? totals.score : null
  };
}
