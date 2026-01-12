export interface CoachPacketPlayer {
  playerId: number;
  platform: "xbl";
  gamertag: string;
  rankLabel: string | null;
  rating: number | null;
  peakRatingSeason: number | null;
  matchesPlayedSeason: number | null;
  winStreak: { type: string | null; value: number | null } | null;
}

export interface CoachPacket {
  mode: string;
  season: number | null;
  focusPlaylistId: number;
  session: {
    id: number;
    name: string;
    startedAt: string;
    latestAt: string | null;
    pollingIntervalSeconds: number;
  };
  players: CoachPacketPlayer[];
  playlistAverages: Record<
    number,
    {
      avgGoalsPerGame: number | null;
      avgShotsPerGame: number | null;
      avgSavesPerGame: number | null;
      avgAssistsPerGame: number | null;
      avgMVPsPerGame: number | null;
      shotAccuracyPct: number | null;
      goalsSavesRatio: number | null;
      assistsGoalsRatio: number | null;
    }
  >;
  deltas: {
    players: Record<
      number,
      {
        ratingDelta: number | null;
        winsDelta: number | null;
        lossesDelta: number | null;
        goalsDelta: number | null;
        assistsDelta: number | null;
        savesDelta: number | null;
        shotsDelta: number | null;
        matchesPlayedDelta: number | null;
        sessionWinRate: number | null;
        efficiencyGoalsPerShot: number | null;
        shotsPerGame: number | null;
        savesPerGame: number | null;
      }
    >;
    team: {
      winsDelta: number | null;
      lossesDelta: number | null;
      matchesPlayedDelta: number | null;
      sessionWinRate: number | null;
    };
  };
  trendHints: {
    players: Record<
      number,
      {
        ratingAvgFirstHalf: number | null;
        ratingAvgSecondHalf: number | null;
        shotAccuracyPctFirstHalf: number | null;
        shotAccuracyPctSecondHalf: number | null;
        shotsPerGameFirstHalf: number | null;
        shotsPerGameSecondHalf: number | null;
      }
    >;
  };
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

export interface TeamCoachPacket {
  team: {
    id: number;
    name: string;
    mode: string;
  };
  focus: {
    playlistId: number;
    playlistName: string;
    season: number | null;
  };
  playerIdentities: Record<number, { gamertag: string; platform: "xbl" }>;
  recommendedMinimums: {
    sessionsWithMatchesForBasics: number;
    sessionsWithMatchesForTrends: number;
    matchesPerSessionTarget: number;
  };
  sessions: {
    count: number;
    latestAt: string | null;
    earliestAt: string | null;
  };
  dataQuality: {
    sessionsWithMatches: number;
    sessionsWithoutMatches: number;
    lossesDerivationMethod: "matchesMinusWins" | "unknown";
    notes: string[];
  };
  coachReadiness: {
    status: "insufficient_data" | "limited" | "good";
    reasons: string[];
  };
  summaries: {
    latest: Record<string, number | null>;
    averages: Record<string, number | null>;
    best: Record<string, number | null>;
    worst: Record<string, number | null>;
  };
  trends: Record<
    string,
    {
      firstHalfAvg: number | null;
      secondHalfAvg: number | null;
      firstHalfCount: number;
      secondHalfCount: number;
    }
  >;
  windows: {
    last3: {
      count: number;
      metrics: Record<string, number | null>;
    };
    prev3: {
      count: number;
      metrics: Record<string, number | null>;
    };
    overall: {
      count: number;
      metrics: Record<string, number | null>;
    };
  };
  history: Array<{
    sessionId: number;
    createdAt: string;
    derivedTeam: Record<string, number | null>;
    deltasByPlayer: Record<number, Record<string, number | null>> | null;
    players: Record<number, string>;
    matchesPlayed: number | null;
    didPlayMatches: boolean;
    sessionDurationMinutes: number | null;
    metricsReliable: boolean;
    lossesDerived: boolean;
    lossesReliable: boolean;
    noMatchReason: "idle" | "trn_delay" | "unknown" | null;
    ratingStart: number | null;
    ratingEnd: number | null;
    ratingDelta: number | null;
    rankStart: string | null;
    rankEnd: string | null;
    season: number | null;
    winStreakStart: { type: string | null; value: number | null } | null;
    winStreakEnd: { type: string | null; value: number | null } | null;
  }>;
}
