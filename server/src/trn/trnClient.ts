import { createRequire } from "module";
import { Platform } from "../types.js";

const require = createRequire(import.meta.url);
require("trn-rocket-league");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

let globalRateLimitUntil = 0;
let rateLimitInfo: {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
} = { limit: null, remaining: null, resetAt: null };

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, seconds * 1000));
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    const delta = Math.max(0, dateMs - Date.now());
    return Math.min(MAX_RETRY_AFTER_MS, delta);
  }
  return null;
}

export function getRateLimitRemainingMs(): number {
  const cooldownMs = Math.max(0, globalRateLimitUntil - Date.now());
  if (cooldownMs > 0) return cooldownMs;
  if (rateLimitInfo.remaining === 0 && rateLimitInfo.resetAt) {
    return Math.max(0, rateLimitInfo.resetAt - Date.now());
  }
  return 0;
}

export function getRateLimitInfo() {
  return { ...rateLimitInfo };
}

function getBaseUrl(): string {
  const value = process.env.PLAYER_STATS_API_BASE_URL;
  if (!value) {
    throw new Error("Player stats API base URL is not configured.");
  }
  return value;
}

function parseResetAtMs(value: string | null): number | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num > 1e12) return num;
  if (num > 1e9) return num * 1000;
  return Date.now() + num * 1000;
}

function updateRateLimitInfo(headers: Headers): void {
  const limit = Number(headers.get("x-ratelimit-limit"));
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const resetAt = parseResetAtMs(headers.get("x-ratelimit-reset"));
  rateLimitInfo = {
    limit: Number.isFinite(limit) ? limit : null,
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt
  };
}

class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9"
  };
  const apiKey = process.env.PLAYER_STATS_API_KEY || process.env.TRN_API_KEY;
  if (apiKey) {
    headers["TRN-Api-Key"] = apiKey;
  }
  return headers;
}

async function fetchJson(url: string): Promise<unknown> {
  const remaining = getRateLimitRemainingMs();
  if (remaining > 0) {
    throw new RateLimitError("Stats API rate limit cooldown.", remaining);
  }

  const response = await fetch(url, {
    headers: buildHeaders()
  });

  updateRateLimitInfo(response.headers);
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = parseRetryAfterMs(response.headers.get("retry-after")) ?? 60_000;
      globalRateLimitUntil = Math.max(globalRateLimitUntil, Date.now() + retryAfter);
      throw new RateLimitError("Stats API rate limit (429).", retryAfter);
    }
    if (response.status === 403 && !process.env.PLAYER_STATS_API_KEY && !process.env.TRN_API_KEY) {
      throw new Error("Stats API 403. Set a player stats API key in System Admin.");
    }
    if (text.includes("error code: 1015")) {
      const retryAfter = 60_000;
      globalRateLimitUntil = Math.max(globalRateLimitUntil, Date.now() + retryAfter);
      throw new RateLimitError("Stats API rate limit (1015).", retryAfter);
    }
    throw new Error(`Stats API error ${response.status}: ${text.slice(0, 120)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    if (text.includes("error code: 1015")) {
      const retryAfter = 60_000;
      globalRateLimitUntil = Math.max(globalRateLimitUntil, Date.now() + retryAfter);
      throw new RateLimitError("Stats API rate limit (1015).", retryAfter);
    }
    throw new Error("Stats API response was not valid JSON.");
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return Boolean((error as RateLimitError)?.retryAfterMs);
}

export async function fetchPlayerStats(platform: Platform, gamertag: string): Promise<unknown> {
  const url = `${getBaseUrl()}/${encodeURIComponent(platform)}/${encodeURIComponent(gamertag)}`;
  return fetchJson(url);
}

export async function fetchPlayerSessions(platform: Platform, gamertag: string): Promise<unknown> {
  const url = `${getBaseUrl()}/${encodeURIComponent(platform)}/${encodeURIComponent(gamertag)}/sessions`;
  return fetchJson(url);
}

export async function getStatsApiStatus(
  platform: Platform,
  gamertag: string,
  options: { force?: boolean } = {}
): Promise<{
  ok: boolean;
  status: number;
  error: string | null;
  retryAfterMs: number | null;
  headers: Record<string, string>;
}> {
  const remaining = getRateLimitRemainingMs();
  if (!options.force && remaining > 0) {
    return {
      ok: false,
      status: 429,
      error: "Rate limit cooldown active.",
      retryAfterMs: remaining,
      headers: {}
    };
  }

  const url = `${getBaseUrl()}/${encodeURIComponent(platform)}/${encodeURIComponent(gamertag)}`;
  try {
    const response = await fetch(url, { headers: buildHeaders() });
    const headers = Object.fromEntries(response.headers.entries());
    const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `Stats API error ${response.status}`,
      retryAfterMs: retryAfter ?? null,
      headers
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error: error?.message || "Request failed",
      retryAfterMs: null,
      headers: {}
    };
  }
}
