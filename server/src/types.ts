export type Platform = "xbl";

export interface SessionRow {
  id: number;
  name: string;
  mode: string;
  createdAt: string;
  pollingIntervalSeconds: number;
  isActive: number;
  matchIndex: number;
  teamId: number | null;
  includeCoachOnEnd: number;
  isEnded: number;
  endedAt: string | null;
}

export interface PlayerRow {
  id: number;
  sessionId: number;
  platform: Platform;
  gamertag: string;
  lastMatchId: string | null;
  lastMatchAt: string | null;
  lastMatchCount: number | null;
}

export interface TeamRow {
  id: number;
  name: string;
  mode: string;
  createdAt: string;
  playersJson: string;
}

export interface SessionTeamStatsRow {
  id: number;
  sessionId: number;
  teamId: number;
  createdAt: string;
  focusPlaylistId: number;
  deltasJson: string;
  derivedTeamJson: string;
  recordsJson: string;
  coachReportId: number | null;
}

export interface SnapshotRow {
  id: number;
  sessionId: number;
  playerId: number;
  capturedAt: string;
  matchIndex: number | null;
  rawJson: string;
  derivedJson: string;
}


export interface DerivedPlaylistStats {
  playlistId: number;
  name: string | null;
  rating: number | null;
  tierName: string | null;
  divisionName: string | null;
  divisionNumber: number | null;
  matchesPlayed: number | null;
  winStreakType: string | null;
  winStreakValue: number | null;
  peakRating: number | null;
}

export interface DerivedPlaylistAverage {
  playlistId: number;
  avgGoalsPerGame: number | null;
  avgShotsPerGame: number | null;
  avgSavesPerGame: number | null;
  avgAssistsPerGame: number | null;
  avgMVPsPerGame: number | null;
  shotAccuracyPct: number | null;
  goalsSavesRatio: number | null;
  assistsGoalsRatio: number | null;
}

export interface DerivedMetrics {
  lastUpdated: string | null;
  currentSeason: number | null;
  wins: number | null;
  losses: number | null;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  shots: number | null;
  winRate: number | null;
  goalShotRatio: number | null;
  mmr: number | null;
  rank: string | null;
  rankTierIndex: number | null;
  rankDivisionIndex: number | null;
  rankPoints: number | null;
  rankIconUrl: string | null;
  avatarUrl: string | null;
  playlists: Record<number, DerivedPlaylistStats> | null;
  playlistAverages: Record<number, DerivedPlaylistAverage> | null;
}

export interface PlayerInput {
  platform: Platform;
  gamertag: string;
}
