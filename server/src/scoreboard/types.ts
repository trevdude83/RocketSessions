export type ScoreboardTeam = "blue" | "orange";

export interface ScoreboardPlayerStats {
  name: string | null;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  shots: number | null;
  score: number | null;
}

export interface ScoreboardExtraction {
  match: {
    playlistName: string | null;
    isRanked: boolean | null;
    winningTeam: ScoreboardTeam | null;
  };
  teams: {
    blue: ScoreboardPlayerStats[];
    orange: ScoreboardPlayerStats[];
  };
}

export interface PlayerIdentity {
  playerId: number;
  gamertag: string;
  platform: string;
}

export interface MappedPlayer {
  extractedName: string | null;
  playerId: number | null;
  gamertag: string;
  platform: string;
  confidence: number | null;
}

