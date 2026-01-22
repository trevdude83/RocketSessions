import { DerivedMetrics, DerivedPlaylistAverage, DerivedPlaylistStats } from "../types.js";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function getStat(stats: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!stats) return null;
  for (const key of keys) {
    const entry = (stats as Record<string, any>)[key];
    if (entry && typeof entry === "object") {
      const val = entry.value ?? entry.displayValue ?? entry.percentile ?? entry.rank;
      const num = toNumber(val);
      if (num !== null) return num;
    }
    const flat = toNumber(entry);
    if (flat !== null) return flat;
  }
  return null;
}

function getStatString(stats: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!stats) return null;
  for (const key of keys) {
    const entry = (stats as Record<string, any>)[key];
    if (entry && typeof entry === "object") {
      const val = entry.displayValue ?? entry.value ?? entry.label;
      if (typeof val === "string" && val.trim().length > 0) return val;
    }
    if (typeof entry === "string" && entry.trim().length > 0) return entry;
  }
  return null;
}

const modePlaylistName: Record<string, string> = {
  solo: "Ranked Duel 1v1",
  "2v2": "Ranked Doubles 2v2",
  "3v3": "Ranked Standard 3v3"
};

const trackedPlaylistIds = new Set([10, 11, 13]);

function buildPlaylistStats(segment: any): DerivedPlaylistStats | null {
  const playlistId = Number(segment?.attributes?.playlistId ?? segment?.attributes?.playlist);
  if (!Number.isFinite(playlistId)) return null;
  if (!trackedPlaylistIds.has(playlistId)) return null;
  const stats = segment?.stats ?? {};

  const rating = getStat(stats, ["rating"]);
  const tierName = getStatString(stats, ["tier"]) ?? stats?.tier?.metadata?.name ?? null;
  const divisionName = getStatString(stats, ["division"]) ?? stats?.division?.metadata?.name ?? null;
  const divisionNumber = getStat(stats, ["division"]);
  const matchesPlayed = getStat(stats, ["matchesPlayed"]);
  const winStreakType = stats?.winStreak?.metadata?.type ?? null;
  const winStreakValue = getStat(stats, ["winStreak"]);
  const peakRating = getStat(stats, ["peakRating"]);

  return {
    playlistId,
    name: typeof segment?.metadata?.name === "string" ? segment.metadata.name : null,
    rating,
    tierName: typeof tierName === "string" ? tierName : null,
    divisionName: typeof divisionName === "string" ? divisionName : null,
    divisionNumber,
    matchesPlayed,
    winStreakType: typeof winStreakType === "string" ? winStreakType : null,
    winStreakValue,
    peakRating
  };
}

function buildPlaylistAverage(segment: any): DerivedPlaylistAverage | null {
  const playlistId = Number(segment?.attributes?.playlist ?? segment?.attributes?.playlistId);
  if (!Number.isFinite(playlistId)) return null;
  if (!trackedPlaylistIds.has(playlistId)) return null;
  const stats = segment?.stats ?? {};

  return {
    playlistId,
    avgGoalsPerGame: getStat(stats, ["avgGoalsPerGame"]),
    avgShotsPerGame: getStat(stats, ["avgShotsPerGame"]),
    avgSavesPerGame: getStat(stats, ["avgSavesPerGame"]),
    avgAssistsPerGame: getStat(stats, ["avgAssistsPerGame"]),
    avgMVPsPerGame: getStat(stats, ["avgMVPsPerGame"]),
    shotAccuracyPct: getStat(stats, ["goalsShotsRatio"]),
    goalsSavesRatio: getStat(stats, ["goalsSavesRatio"]),
    assistsGoalsRatio: getStat(stats, ["assistsGoalsRatio"])
  };
}

function getIconUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractFromTrackerV2(payload: any, mode?: string): Partial<DerivedMetrics> | null {
  const segments = payload?.data?.segments ?? [];
  const lastUpdated = payload?.data?.metadata?.lastUpdated?.value ?? null;
  const currentSeason = payload?.data?.metadata?.currentSeason ?? null;
  if (!Array.isArray(segments)) return null;

  const overview = segments.find((segment) => segment?.type === "overview")?.stats;
  const playlists: Record<number, DerivedPlaylistStats> = {};
  const playlistAverages: Record<number, DerivedPlaylistAverage> = {};

  segments.forEach((segment) => {
    if (segment?.type === "playlist") {
      const stats = buildPlaylistStats(segment);
      if (stats) playlists[stats.playlistId] = stats;
    }
    if (segment?.type === "playlistAverage") {
      const avg = buildPlaylistAverage(segment);
      if (avg) playlistAverages[avg.playlistId] = avg;
    }
  });
  const playlistName = mode ? modePlaylistName[mode] : null;
  const playlist = playlistName
    ? segments.find((segment) => segment?.type === "playlist" && segment?.metadata?.name === playlistName)
    : null;

  if (!overview && !playlist) return null;

  const playlistStats = playlist?.stats ?? undefined;
  const wins = getStat(playlistStats, ["wins"]) ?? getStat(overview, ["wins"]);
  let losses = getStat(playlistStats, ["losses"]) ?? getStat(overview, ["losses"]);
  const matchesPlayed = getStat(playlistStats, ["matchesPlayed"]) ?? getStat(overview, ["matchesPlayed"]);
  const goals = getStat(overview, ["goals"]);
  const assists = getStat(overview, ["assists"]);
  const saves = getStat(overview, ["saves"]);
  const shots = getStat(overview, ["shots"]);
  const goalShotRatio = getStat(overview, ["goalShotRatio"]);

  if (losses === null && wins !== null && matchesPlayed !== null) {
    const computed = matchesPlayed - wins;
    losses = computed >= 0 ? computed : null;
  }

  let winRate: number | null = null;
  if (wins !== null && losses !== null && wins + losses > 0) {
    winRate = wins / (wins + losses);
  } else if (wins !== null && matchesPlayed !== null && matchesPlayed > 0) {
    winRate = wins / matchesPlayed;
  }

  let mmr: number | null = null;
  let rank: string | null = null;
  let rankTierIndex: number | null = null;
  let rankDivisionIndex: number | null = null;
  let rankPoints: number | null = null;
  let rankIconUrl: string | null = null;

  if (playlist && mode !== "4v4") {
    const stats = playlist.stats ?? {};
    mmr = getStat(stats, ["rating"]);
    rankTierIndex = getStat(stats, ["tier"]);
    rankDivisionIndex = getStat(stats, ["division"]);
    if (rankTierIndex !== null) {
      const division = rankDivisionIndex ?? 0;
      rankPoints = rankTierIndex * 10 + division;
    }
    const tierName =
      getStatString(stats, ["tier"]) ?? playlist?.stats?.tier?.metadata?.name ?? null;
    const divisionName =
      getStatString(stats, ["division"]) ?? playlist?.stats?.division?.metadata?.name ?? null;
    if (tierName) {
      rank = divisionName ? `${tierName} ${divisionName}` : String(tierName);
    }
    rankIconUrl =
      getIconUrl(playlist?.stats?.tier?.metadata?.iconUrl) ??
      getIconUrl(playlist?.stats?.rating?.metadata?.iconUrl) ??
      null;
  }

  return {
    lastUpdated: typeof lastUpdated === "string" ? lastUpdated : null,
    currentSeason: typeof currentSeason === "number" ? currentSeason : null,
    wins,
    losses,
    goals,
    assists,
    saves,
    shots,
    score: null,
    winRate,
    goalShotRatio,
    mmr,
    rank,
    rankTierIndex,
    rankDivisionIndex,
    rankPoints,
    rankIconUrl,
    avatarUrl:
      typeof payload?.data?.platformInfo?.avatarUrl === "string"
        ? payload.data.platformInfo.avatarUrl
        : null,
    playlists: Object.keys(playlists).length > 0 ? playlists : null,
    playlistAverages: Object.keys(playlistAverages).length > 0 ? playlistAverages : null
  };
}

function extractFromLegacyProfile(payload: any): Partial<DerivedMetrics> | null {
  const overview = payload?.stats?.overview;
  if (!overview || typeof overview !== "object") return null;

  const wins = toNumber(overview.wins);
  let losses = toNumber(overview.losses);
  const goals = toNumber(overview.goals);
  const assists = toNumber(overview.assists);
  const saves = toNumber(overview.saves);
  const shots = toNumber(overview.shots);
  const goalShotRatio = toNumber(overview.goalShotRatio);

  let winRate: number | null = null;
  const totalMatches = toNumber(payload?.stats?.totalMatchesPlayed);
  if (losses === null && wins !== null && totalMatches !== null) {
    const computed = totalMatches - wins;
    losses = computed >= 0 ? computed : null;
  }
  if (wins !== null && losses !== null && wins + losses > 0) {
    winRate = wins / (wins + losses);
  } else if (wins !== null && totalMatches !== null && totalMatches > 0) {
    winRate = wins / totalMatches;
  }

  let mmr: number | null = null;
  let rank: string | null = null;
  let rankTierIndex: number | null = null;
  let rankDivisionIndex: number | null = null;
  let rankPoints: number | null = null;
  let rankIconUrl: string | null = null;
  const avatarUrl =
    typeof payload?.avatarURL === "string"
      ? payload.avatarURL
      : typeof payload?.avatarUrl === "string"
      ? payload.avatarUrl
      : null;
  const ranked = payload?.stats?.ranked;
  if (ranked && typeof ranked === "object") {
    const preferredPlaylists = ["double", "standard", "duel"];
    const playlists: any[] = [];

    preferredPlaylists.forEach((key) => {
      if (ranked[key]) playlists.push(ranked[key]);
    });

    Object.values(ranked).forEach((playlist) => {
      if (!playlists.includes(playlist)) playlists.push(playlist);
    });

    for (const playlist of playlists) {
      if (!playlist || typeof playlist !== "object") continue;
      if (mmr === null) {
        mmr = toNumber(playlist.mmr);
      }
      if (!rank && playlist.rank?.tier?.name) {
        const tierName = String(playlist.rank.tier.name);
        const divisionName = playlist.rank.division?.name ? ` ${playlist.rank.division.name}` : "";
        rank = `${tierName}${divisionName}`.trim();
      }
      if (!rankIconUrl && playlist.rank?.tier?.iconUrl) {
        rankIconUrl = getIconUrl(playlist.rank.tier.iconUrl);
      }
      if (rankTierIndex === null && typeof playlist.rank?.tier?.index === "number") {
        rankTierIndex = playlist.rank.tier.index;
      }
      if (rankDivisionIndex === null && typeof playlist.rank?.division?.index === "number") {
        rankDivisionIndex = playlist.rank.division.index;
      }
      if (rankPoints === null && rankTierIndex !== null) {
        const division = rankDivisionIndex ?? 0;
        rankPoints = rankTierIndex * 10 + division;
      }
      if (mmr !== null || rank || rankPoints !== null) break;
    }
  }

  return {
    lastUpdated: null,
    currentSeason: null,
    wins,
    losses,
    goals,
    assists,
    saves,
    shots,
    score: null,
    winRate,
    goalShotRatio,
    mmr,
    rank,
    rankTierIndex,
    rankDivisionIndex,
    rankPoints,
    rankIconUrl,
    avatarUrl,
    playlists: null,
    playlistAverages: null
  };
}

export function extractMetrics(payload: unknown, mode?: string): DerivedMetrics {
  const v2Metrics = extractFromTrackerV2(payload as any, mode);
  if (v2Metrics) {
  return {
    lastUpdated: v2Metrics.lastUpdated ?? null,
    currentSeason: v2Metrics.currentSeason ?? null,
      wins: v2Metrics.wins ?? null,
      losses: v2Metrics.losses ?? null,
      goals: v2Metrics.goals ?? null,
      assists: v2Metrics.assists ?? null,
      saves: v2Metrics.saves ?? null,
      shots: v2Metrics.shots ?? null,
      score: v2Metrics.score ?? null,
      winRate: v2Metrics.winRate ?? null,
      goalShotRatio: v2Metrics.goalShotRatio ?? null,
      mmr: mode === "4v4" ? null : v2Metrics.mmr ?? null,
    rank: mode === "4v4" ? null : v2Metrics.rank ?? null,
    rankTierIndex: mode === "4v4" ? null : v2Metrics.rankTierIndex ?? null,
    rankDivisionIndex: mode === "4v4" ? null : v2Metrics.rankDivisionIndex ?? null,
    rankPoints: mode === "4v4" ? null : v2Metrics.rankPoints ?? null,
    rankIconUrl: mode === "4v4" ? null : v2Metrics.rankIconUrl ?? null,
    avatarUrl: v2Metrics.avatarUrl ?? null,
      playlists: v2Metrics.playlists ?? null,
      playlistAverages: v2Metrics.playlistAverages ?? null
    };
  }

  const legacy = extractFromLegacyProfile(payload as any);
  if (legacy) {
    return {
      lastUpdated: legacy.lastUpdated ?? null,
      currentSeason: legacy.currentSeason ?? null,
      wins: legacy.wins ?? null,
      losses: legacy.losses ?? null,
      goals: legacy.goals ?? null,
      assists: legacy.assists ?? null,
      saves: legacy.saves ?? null,
      shots: legacy.shots ?? null,
      score: legacy.score ?? null,
      winRate: legacy.winRate ?? null,
      goalShotRatio: legacy.goalShotRatio ?? null,
      mmr: legacy.mmr ?? null,
    rank: legacy.rank ?? null,
    rankTierIndex: legacy.rankTierIndex ?? null,
    rankDivisionIndex: legacy.rankDivisionIndex ?? null,
    rankPoints: legacy.rankPoints ?? null,
    rankIconUrl: legacy.rankIconUrl ?? null,
    avatarUrl: legacy.avatarUrl ?? null,
      playlists: legacy.playlists ?? null,
      playlistAverages: legacy.playlistAverages ?? null
    };
  }

  return {
    lastUpdated: null,
    currentSeason: null,
    wins: null,
    losses: null,
    goals: null,
    assists: null,
    saves: null,
    shots: null,
    score: null,
    winRate: null,
    goalShotRatio: null,
    mmr: null,
    rank: null,
    rankTierIndex: null,
    rankDivisionIndex: null,
    rankPoints: null,
    rankIconUrl: null,
    avatarUrl: null,
    playlists: null,
    playlistAverages: null
  };
}
