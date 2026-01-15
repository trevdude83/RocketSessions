export interface Session {
  id: number;
  userId?: number | null;
  name: string;
  mode: string;
  createdAt: string;
  pollingIntervalSeconds: number;
  isActive: number;
  matchIndex: number;
  manualMode: number;
  teamId: number | null;
  teamName?: string | null;
  includeCoachOnEnd: number;
  isEnded: number;
  endedAt: string | null;
}

export interface Player {
  id: number;
  sessionId: number;
  platform: "xbl";
  gamertag: string;
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
  playlists: Record<number, unknown> | null;
  playlistAverages: Record<number, unknown> | null;
}

export interface SnapshotSummary {
  id: number;
  playerId: number;
  capturedAt: string;
  derived: DerivedMetrics | null;
}

export interface SessionDetail {
  session: Session;
  team?: Team | null;
  players: Player[];
  baselineByPlayerId: Record<number, SnapshotSummary | null>;
  latestByPlayerId: Record<number, SnapshotSummary | null>;
}

export interface SummaryResponse {
  deltas: Record<number, Record<string, number | null>>;
  comparisons: Record<string, number | null>;
  sessionStats: Record<number, { wins: number | null; losses: number | null; winRate: number | null }>;
  teamStats: { wins: number | null; losses: number | null; winRate: number | null; gameCount: number };
}

export interface TimeseriesPoint {
  t: number;
  v: number | null;
}

export interface DbMetricPoint {
  t: string;
  sizeBytes: number;
  snapshotsCount: number;
}

export interface PollingLogEntry {
  id: number;
  createdAt: string;
  sessionId: number;
  playerId: number | null;
  gamertag: string | null;
  lastMatchId: string | null;
  lastMatchAt: string | null;
  latestMatchId: string | null;
  latestMatchAt: string | null;
  newMatches: number;
  totalMatches: number;
  error: string | null;
}

export interface CoachAuditEntry {
  id: number;
  createdAt: string;
  scope: "session" | "team";
  userId: number | null;
  sessionId: number | null;
  teamId: number | null;
  focusPlaylistId: number | null;
  model: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  tokensUsed: number | null;
  costUsd: number | null;
  success: number;
  error: string | null;
}


export interface CoachReport {
  headline: string;
  strengths: {
    title: string;
    evidence: string[];
    keepDoing: string[];
  }[];
  priorities: {
    title: string;
    evidence: string[];
    hypothesis: {
      text: string;
      confidence: "low" | "med" | "high";
    };
    actions: {
      action: string;
      why: string;
      target: string;
    }[];
    drills: string[];
  }[];
  nextSessionGoals: {
    metric: string;
    current: string;
    target: string;
    howToMeasure: string;
  }[];
  questionsForYou: string[];
}

export interface CoachReportListItem {
  id: number;
  createdAt: string;
  focusPlaylistId: number;
  model: string;
  report: CoachReport | null;
}

export interface Team {
  id: number;
  userId?: number | null;
  name: string;
  mode: string;
  createdAt: string;
  sessionsCount?: number;
  players?: { platform: "xbl"; gamertag: string }[];
  playersJson?: string;
  avatars?: Record<string, string | null>;
  stats?: TeamStatEntry[];
}

export interface TeamStatEntry {
  id: number;
  sessionId: number;
  createdAt: string;
  focusPlaylistId: number;
  deltas: Record<string, number | null> | null;
  derivedTeam: Record<string, number | null> | null;
  records: Record<string, string> | null;
  coachReportId: number | null;
  players?: Record<number, string>;
}

export interface TeamCoachReportListItem {
  id: number;
  createdAt: string;
  focusPlaylistId: number;
  model: string;
  sessionId: number;
  sessionName: string;
  report: CoachReport | null;
}


export interface TeamAggregateCoachReport {
  id: number;
  createdAt: string;
  model: string;
  report: CoachReport | null;
}

export interface PlayerPeakRating {
  playlistName: string | null;
  value: number | null;
  season: number | null;
  iconUrl: string | null;
  rankName: string | null;
  division: string | null;
}

export interface TeamPlayerPeakRating {
  gamertag: string;
  platform: "xbl";
  capturedAt: string | null;
  peakRating: PlayerPeakRating | null;
}

export interface TeamPlayerCurrentRank {
  gamertag: string;
  platform: "xbl";
  capturedAt: string | null;
  playlistName: string | null;
  rankLabel: string | null;
  rating: number | null;
  iconUrl: string | null;
  rankTierIndex: number | null;
  rankDivisionIndex: number | null;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user";
  status: "pending" | "active" | "disabled";
}
