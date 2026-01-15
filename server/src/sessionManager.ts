import { fetchPlayerSessions, fetchPlayerStats, getRateLimitRemainingMs, isRateLimitError } from "./trn/trnClient.js";
import { extractMetrics } from "./trn/extractMetrics.js";
import { fetchWithRetry } from "./trn/fetchWithRetry.js";
import {
  getPlayersBySession,
  getSession,
  insertSnapshot,
  setSessionActive,
  setSessionMatchIndex,
  updatePlayerMatchState,
  recordDbMetric
} from "./db.js";
import { addPollingLog } from "./sessionLogs.js";

const timers = new Map<number, NodeJS.Timeout>();
const locks = new Map<number, Promise<void>>();

interface CaptureOptions {
  retries: number;
  baseDelayMs: number;
}

async function withSessionLock<T>(sessionId: number, task: () => Promise<T>): Promise<T> {
  const prev = locks.get(sessionId) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(sessionId, prev.then(() => next));

  try {
    await prev;
    return await task();
  } finally {
    release!();
    if (locks.get(sessionId) === next) {
      locks.delete(sessionId);
    }
  }
}

function normalizeSessions(input: unknown): any[] {
  if (Array.isArray(input)) return input;
  const items = (input as any)?.data?.items ?? (input as any)?.data?.matches ?? (input as any)?.matches ?? [];
  if (Array.isArray(items)) return items;
  return [];
}

function flattenMatches(input: unknown): any[] {
  const sessions = normalizeSessions(input);
  const matches: any[] = [];
  sessions.forEach((session) => {
    if (Array.isArray(session?.matches)) {
      matches.push(...session.matches);
      return;
    }
    if (Array.isArray(session)) {
      matches.push(...session);
      return;
    }
    if (session && (session.id || session.matchId || session.metadata?.id)) {
      matches.push(session);
    }
  });
  return matches;
}

function getFocusPlaylistId(mode: string | null | undefined): number | null {
  if (mode === "solo") return 10;
  if (mode === "3v3") return 13;
  if (mode === "2v2") return 11;
  return null;
}

function getFocusPlaylistName(mode: string | null | undefined): string | null {
  if (mode === "solo") return "Ranked Duel 1v1";
  if (mode === "3v3") return "Ranked Standard 3v3";
  if (mode === "2v2") return "Ranked Doubles 2v2";
  return null;
}

function toPlaylistId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(num) ? num : null;
}

function getMatchPlaylistId(match: any): number | null {
  return (
    toPlaylistId(match?.metadata?.playlistId) ??
    toPlaylistId(match?.metadata?.playlist?.id) ??
    toPlaylistId(match?.playlistId) ??
    toPlaylistId(match?.playlist?.id) ??
    toPlaylistId(match?.attributes?.playlistId) ??
    toPlaylistId(match?.attributes?.playlist) ??
    toPlaylistId(match?.attributes?.playlist?.id) ??
    null
  );
}

function getMatchPlaylistName(match: any): string | null {
  const raw =
    match?.metadata?.playlistName ??
    match?.metadata?.playlist?.name ??
    match?.playlist?.name ??
    match?.attributes?.playlistName ??
    match?.attributes?.playlist?.name ??
    null;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

function filterMatchesForMode(matches: any[], mode: string | null | undefined): any[] {
  const targetId = getFocusPlaylistId(mode);
  const targetName = getFocusPlaylistName(mode);
  if (!targetId && !targetName) return matches;
  const withSignal = matches.filter((match) => getMatchPlaylistId(match) !== null || getMatchPlaylistName(match) !== null);
  const base = withSignal.length > 0 ? withSignal : matches;
  if (base.length === 0) return base;
  return base.filter((match) => {
    const playlistId = getMatchPlaylistId(match);
    const playlistName = getMatchPlaylistName(match);
    return (targetId !== null && playlistId === targetId) || (targetName !== null && playlistName === targetName);
  });
}

function getMatchId(match: any): string | null {
  const raw =
    match?.id ??
    match?.matchId ??
    match?.metadata?.id ??
    match?.attributes?.id ??
    null;
  return raw ? String(raw) : null;
}

function getMatchTime(match: any): number | null {
  const raw =
    match?.date ??
    match?.createdAt ??
    match?.endDate ??
    match?.timestamp ??
    match?.metadata?.date ??
    match?.attributes?.date ??
    null;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    const ms = raw > 1e12 ? raw : raw > 1e9 ? raw * 1000 : raw;
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

function sortMatchesByTime(matches: any[]): any[] {
  const withTime = matches.map((match) => ({ match, time: getMatchTime(match) }));
  if (withTime.every((entry) => entry.time === null)) return matches.slice();
  return withTime
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
    .map((entry) => entry.match);
}

function getLatestMatch(matches: any[]): any | null {
  if (!matches.length) return null;
  const ordered = sortMatchesByTime(matches);
  return ordered[0] ?? null;
}

function countNewMatches(matches: any[], lastMatchId: string | null, lastMatchAt: string | null): number {
  if (!matches.length) return 0;
  const ordered = sortMatchesByTime(matches);
  if (lastMatchId) {
    const index = ordered.findIndex((match) => getMatchId(match) === lastMatchId);
    if (index >= 0) return index;
  }
  if (!lastMatchAt) return 0;
  const lastTime = Date.parse(lastMatchAt);
  if (!Number.isFinite(lastTime)) return 0;
  return ordered.filter((match) => {
    const matchTime = getMatchTime(match);
    return matchTime !== null && matchTime > lastTime;
  }).length;
}

async function captureProfileSnapshots(sessionId: number, matchIndex: number | null, options: CaptureOptions = { retries: 3, baseDelayMs: 500 }): Promise<void> {
  const players = getPlayersBySession(sessionId);
  const session = getSession(sessionId);
  const mode = session?.mode;
  const capturedAt = new Date().toISOString();

  for (const player of players) {
    try {
      const raw = await fetchWithRetry(
        () => fetchPlayerStats(player.platform, player.gamertag),
        options
      );
      const derived = extractMetrics(raw, mode);
      insertSnapshot(
        sessionId,
        player.id,
        capturedAt,
        matchIndex,
        JSON.stringify(raw),
        JSON.stringify(derived)
      );
    } catch (error) {
      if (isRateLimitError(error)) {
        const seconds = Math.ceil(error.retryAfterMs / 1000);
        console.warn(`TRN rate limited for ${player.gamertag}. Cooldown ${seconds}s.`);
        continue;
      }
      console.warn(
        `Failed to fetch stats for ${player.gamertag} in session ${sessionId}:`,
        error
      );
    }
  }

  recordDbMetric(sessionId);
}

export async function initializeSession(sessionId: number): Promise<void> {
  await withSessionLock(sessionId, async () => {
    const players = getPlayersBySession(sessionId);
    const session = getSession(sessionId);
    setSessionMatchIndex(sessionId, 0);

    await captureProfileSnapshots(sessionId, 0);

    for (const player of players) {
      try {
        const sessions = await fetchWithRetry(
          () => fetchPlayerSessions(player.platform, player.gamertag),
          { retries: 3, baseDelayMs: 500 }
        );
        const matches = filterMatchesForMode(flattenMatches(sessions), session?.mode);
        const latest = getLatestMatch(matches);
        if (latest) {
          const latestId = getMatchId(latest);
          const latestAtMs = getMatchTime(latest);
          updatePlayerMatchState(
            player.id,
            latestId,
            latestAtMs ? new Date(latestAtMs).toISOString() : null,
            matches.length
          );
        }
      } catch (error) {
        console.warn(`Failed to fetch sessions for ${player.gamertag}:`, error);
      }
    }
  });
}

export async function pollForNewMatchSnapshots(sessionId: number): Promise<void> {
  await withSessionLock(sessionId, async () => {
    const session = getSession(sessionId);
    if (!session) return;
    if (session.manualMode) return;
    if (getRateLimitRemainingMs() > 0) return;

    const players = getPlayersBySession(sessionId);
    let maxNewMatches = 0;

    for (const player of players) {
      try {
        const sessions = await fetchWithRetry(
          () => fetchPlayerSessions(player.platform, player.gamertag),
          { retries: 3, baseDelayMs: 500 }
        );
        const matches = filterMatchesForMode(flattenMatches(sessions), session.mode);
        const hasTime = matches.some((match) => getMatchTime(match) !== null);
        const lastMatchInList = player.lastMatchId
          ? matches.some((match) => getMatchId(match) === player.lastMatchId)
          : false;
        const latest = getLatestMatch(matches);
        const latestMatchId = getMatchId(latest);
        const latestMatchAt = getMatchTime(latest) ? new Date(getMatchTime(latest)!).toISOString() : null;
        const matchesCount = matches.length;
        if (matches.length === 0) {
          updatePlayerMatchState(player.id, null, null, 0);
          addPollingLog({
            createdAt: new Date().toISOString(),
            sessionId,
            playerId: player.id,
            gamertag: player.gamertag,
            lastMatchId: player.lastMatchId,
            lastMatchAt: player.lastMatchAt,
            latestMatchId,
            latestMatchAt,
            newMatches: 0,
            totalMatches: 0,
            error: null
          });
          continue;
        }

        if (!player.lastMatchAt && !player.lastMatchId) {
          if (latest) {
            updatePlayerMatchState(
              player.id,
              latestMatchId,
              latestMatchAt,
              matchesCount
            );
          }
          addPollingLog({
            createdAt: new Date().toISOString(),
            sessionId,
            playerId: player.id,
            gamertag: player.gamertag,
            lastMatchId: player.lastMatchId,
            lastMatchAt: player.lastMatchAt,
            latestMatchId,
            latestMatchAt,
            newMatches: 0,
            totalMatches: matchesCount,
            error: null
          });
          continue;
        }

        let newMatches = countNewMatches(matches, player.lastMatchId, player.lastMatchAt);
        if (!hasTime) {
          newMatches = 0;
        }
        if (
          newMatches === 0 &&
          typeof player.lastMatchCount === "number" &&
          matchesCount > player.lastMatchCount
        ) {
          newMatches = matchesCount - player.lastMatchCount;
        }
        if (
          newMatches === 0 &&
          !hasTime &&
          latestMatchId &&
          player.lastMatchId &&
          latestMatchId !== player.lastMatchId &&
          !lastMatchInList
        ) {
          // Fallback when TRN caps match history and timestamps are missing.
          newMatches = 1;
        }
        addPollingLog({
          createdAt: new Date().toISOString(),
          sessionId,
          playerId: player.id,
          gamertag: player.gamertag,
          lastMatchId: player.lastMatchId,
          lastMatchAt: player.lastMatchAt,
          latestMatchId,
          latestMatchAt,
          newMatches,
          totalMatches: matchesCount,
          error: null
        });
        if (newMatches > 0) {
          maxNewMatches = Math.max(maxNewMatches, newMatches);
        }
        updatePlayerMatchState(
          player.id,
          latestMatchId ?? player.lastMatchId,
          latestMatchAt ?? player.lastMatchAt,
          matchesCount
        );
      } catch (error) {
        addPollingLog({
          createdAt: new Date().toISOString(),
          sessionId,
          playerId: player.id,
          gamertag: player.gamertag,
          lastMatchId: player.lastMatchId,
          lastMatchAt: player.lastMatchAt,
          latestMatchId: null,
          latestMatchAt: null,
          newMatches: 0,
          totalMatches: 0,
          error: error instanceof Error ? error.message : "Polling error"
        });
        console.warn(`Failed to poll sessions for ${player.gamertag}:`, error);
      }
    }

    if (maxNewMatches <= 0) return;

    const nextMatchIndex = session.matchIndex + maxNewMatches;
    setSessionMatchIndex(sessionId, nextMatchIndex);
    await captureProfileSnapshots(sessionId, nextMatchIndex);
  });
}

export async function captureManualSnapshot(sessionId: number): Promise<void> {
  await withSessionLock(sessionId, async () => {
    const session = getSession(sessionId);
    if (!session) return;
    const remaining = getRateLimitRemainingMs();
    if (remaining > 0) {
      const error = new Error("TRN rate limit cooldown.");
      (error as any).retryAfterMs = remaining;
      throw error;
    }
    await captureProfileSnapshots(sessionId, session.matchIndex ?? 0, { retries: 0, baseDelayMs: 500 });
  });
}

export function startPolling(sessionId: number, intervalSeconds: number): void {
  if (timers.has(sessionId)) return;
  const timer = setInterval(() => {
    void pollForNewMatchSnapshots(sessionId);
  }, intervalSeconds * 1000);
  timers.set(sessionId, timer);
  setSessionActive(sessionId, true);
}

export function stopPolling(sessionId: number): void {
  const timer = timers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    timers.delete(sessionId);
  }
  setSessionActive(sessionId, false);
}
