import { PlayerIdentity, ScoreboardPlayerStats } from "./types.js";

export function normalizeName(value: string | null | undefined): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - distance / maxLen;
}

export function mapPlayers(
  extracted: ScoreboardPlayerStats[],
  identities: PlayerIdentity[],
  threshold = 0.6
): { playerId: number | null; gamertag: string; platform: string; confidence: number | null; extractedName: string | null }[] {
  const normalizedIdentities: Array<PlayerIdentity & { normalized: string }> = identities.map((player) => ({
    ...player,
    normalized: normalizeName(player.gamertag)
  }));

  return extracted.map((entry) => {
    const normalizedName = normalizeName(entry.name);
    let bestScore = 0;
    let bestMatch: PlayerIdentity | null = null;
    for (const player of normalizedIdentities) {
      const score = similarity(normalizedName, player.normalized);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = player;
      }
    }

    if (bestMatch && bestScore >= threshold) {
      return {
        playerId: bestMatch.playerId,
        gamertag: bestMatch.gamertag,
        platform: bestMatch.platform,
        confidence: Number(bestScore.toFixed(2)),
        extractedName: entry.name
      };
    }

    return {
      playerId: null,
      gamertag: entry.name || "Unknown",
      platform: "xbl",
      confidence: normalizedName ? Number(bestScore.toFixed(2)) : null,
      extractedName: entry.name
    };
  });
}
