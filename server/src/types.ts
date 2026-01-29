export type Platform = "xbl";

export interface SessionRow {
  id: number;
  userId: number | null;
  name: string;
  mode: string;
  createdAt: string;
  pollingIntervalSeconds: number;
  isActive: number;
  matchIndex: number;
  manualMode: number;
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
  userId: number | null;
  name: string;
  mode: string;
  createdAt: string;
  playersJson: string;
}

export interface UserRow {
  id: number;
  username: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
  status: "pending" | "active" | "disabled";
  createdAt: string;
  approvedAt: string | null;
  lastLoginAt: string | null;
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

export interface ScoreboardDeviceRow {
  id: number;
  name: string | null;
  deviceKeyHash: string;
  createdAt: string;
  lastSeenAt: string | null;
  isEnabled: number;
}

export interface ScoreboardIngestRow {
  id: number;
  deviceId: number;
  receivedAt: string;
  status: "received" | "extracting" | "extracted" | "failed" | "pending_match";
  errorMessage: string | null;
  sessionId: number | null;
  teamId: number | null;
  focusPlaylistId: number | null;
  dedupeKey: string | null;
  matchId: number | null;
  signatureKey?: string | null;
}

export interface MatchRow {
  id: number;
  sessionId: number | null;
  teamId: number | null;
  source: string;
  createdAt: string;
  rawExtractionJson: string;
  derivedMatchJson: string;
  extractionConfidence: number | null;
  dedupeKey: string | null;
  signatureKey: string | null;
}

export interface MatchPlayerRow {
  id: number;
  matchId: number;
  playerId: number | null;
  gamertag: string;
  platform: Platform;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  shots: number | null;
  score: number | null;
  isWinner: number | null;
  nameMatchConfidence: number | null;
}

export interface ScoreboardAuditRow {
  id: number;
  createdAt: string;
  deviceId: number | null;
  ingestId: number | null;
  sessionId: number | null;
  teamId: number | null;
  model: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  tokensUsed: number | null;
  costUsd: number | null;
  success: number;
  error: string | null;
}

export interface ScoreboardUnmatchedRow {
  id: number;
  ingestId: number;
  createdAt: string;
  status: "pending" | "assigned" | "ignored";
  mode: string | null;
  teamSize: number | null;
  blueNamesJson: string;
  orangeNamesJson: string;
  candidatesJson: string | null;
  rawExtractionJson: string;
  derivedMatchJson: string;
  signatureKey: string | null;
  assignedSessionId: number | null;
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
  score: number | null;
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
