import { Session, SessionDetail, SummaryResponse, TimeseriesPoint, SnapshotSummary, DbMetricPoint, CoachReport, CoachReportListItem, Team, TeamCoachReportListItem, TeamAggregateCoachReport, PollingLogEntry, TeamPlayerPeakRating, TeamPlayerCurrentRank } from "./types";

async function handleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

export async function listSessions(): Promise<Session[]> {
  const res = await fetch("/api/sessions");
  return handleJson<Session[]>(res);
}

export async function createSession(payload: {
  name: string;
  mode: string;
  pollingIntervalSeconds?: number;
  players?: { platform: "xbl"; gamertag: string }[];
  teamId?: number;
  teamName?: string;
  saveTeam?: boolean;
  includeCoachOnEnd?: boolean;
}): Promise<SessionDetail> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleJson<SessionDetail>(res);
}

export async function stopSession(sessionId: number): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
  await handleJson(res);
}

export async function startSession(sessionId: number): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/start`, { method: "POST" });
  await handleJson(res);
}

export async function endSession(sessionId: number, includeCoachOnEnd?: boolean): Promise<{ session: Session | null; teamStatsWritten: boolean; coachReportId: number | null }> {
  const res = await fetch(`/api/sessions/${sessionId}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ includeCoachOnEnd })
  });
  return handleJson(res);
}

export async function refreshSession(sessionId: number): Promise<SessionDetail> {
  const res = await fetch(`/api/sessions/${sessionId}/refresh`, { method: "POST" });
  return handleJson<SessionDetail>(res);
}

export async function refreshSessionWithCooldown(
  sessionId: number
): Promise<SessionDetail> {
  const res = await fetch(`/api/sessions/${sessionId}/refresh`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string; retryAfterMs?: number };
      if (res.status === 429 && typeof parsed.retryAfterMs === "number") {
        const error = new Error(parsed.error || "TRN rate limited") as Error & {
          retryAfterMs?: number;
        };
        error.retryAfterMs = parsed.retryAfterMs;
        throw error;
      }
    } catch {
      throw new Error(text || res.statusText);
    }
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<SessionDetail>;
}

export async function getSessionDetail(sessionId: number): Promise<SessionDetail> {
  const res = await fetch(`/api/sessions/${sessionId}`);
  return handleJson<SessionDetail>(res);
}

export async function getSummary(sessionId: number): Promise<SummaryResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/summary`);
  return handleJson<SummaryResponse>(res);
}

export async function getTimeseries(
  sessionId: number,
  playerId: number,
  metric: string
): Promise<TimeseriesPoint[]> {
  const res = await fetch(
    `/api/sessions/${sessionId}/timeseries?playerId=${playerId}&metric=${encodeURIComponent(metric)}`
  );
  return handleJson<TimeseriesPoint[]>(res);
}

export async function getSnapshots(
  sessionId: number,
  limit = 20
): Promise<SnapshotSummary[]> {
  const res = await fetch(`/api/sessions/${sessionId}/snapshots?limit=${limit}`);
  return handleJson<SnapshotSummary[]>(res);
}

export async function getRawSnapshots(
  sessionId: number,
  limit = 50
): Promise<
  {
    id: number;
    playerId: number;
    capturedAt: string;
    matchIndex: number | null;
    raw: unknown;
    derived: unknown;
  }[]
> {
  const res = await fetch(`/api/sessions/${sessionId}/snapshots/raw?limit=${limit}`);
  return handleJson(res);
}

export async function backfillSessionSnapshots(sessionId: number): Promise<{ updated: number; skipped: number }> {
  const res = await fetch(`/api/sessions/${sessionId}/snapshots/backfill`, { method: "POST" });
  return handleJson(res);
}

export async function backfillSnapshot(snapshotId: number): Promise<void> {
  const res = await fetch(`/api/snapshots/${snapshotId}/backfill`, { method: "POST" });
  await handleJson(res);
}

export async function getDbMetrics(sessionId: number, limit = 100): Promise<DbMetricPoint[]> {
  const res = await fetch(`/api/metrics/db?sessionId=${sessionId}&limit=${limit}`);
  return handleJson<DbMetricPoint[]>(res);
}

export async function getPollingLogs(limit = 200): Promise<PollingLogEntry[]> {
  const res = await fetch(`/api/logs/polling?limit=${limit}`);
  return handleJson<PollingLogEntry[]>(res);
}

export async function getTrnStatus(
  gamertag: string,
  platform = "xbl",
  force = false
): Promise<{
  ok: boolean;
  status: number;
  error: string | null;
  retryAfterMs: number | null;
  rateLimit?: { limit: number | null; remaining: number | null; resetAt: number | null };
  headers?: Record<string, string>;
}> {
  const res = await fetch(
    `/api/trn/status?platform=${encodeURIComponent(platform)}&gamertag=${encodeURIComponent(gamertag)}&force=${force ? "1" : "0"}`
  );
  return handleJson(res);
}

export async function createDemo(): Promise<SessionDetail> {
  const res = await fetch("/api/demo", { method: "POST" });
  return handleJson<SessionDetail>(res);
}

export async function deleteSession(sessionId: number): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
  await handleJson(res);
}

export async function setApiKey(apiKey: string): Promise<void> {
  const res = await fetch("/api/settings/api-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  });
  await handleJson(res);
}

export async function getApiKeyStatus(): Promise<{ configured: boolean }> {
  const res = await fetch("/api/settings/api-key");
  return handleJson(res);
}

export async function generateCoachReport(sessionId: number, focusPlaylistId?: number): Promise<CoachReport> {
  const res = await fetch(`/api/sessions/${sessionId}/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ focusPlaylistId })
  });
  return handleJson<CoachReport>(res);
}

export async function getLatestCoachReport(
  sessionId: number,
  focusPlaylistId?: number
): Promise<{ id: number; createdAt: string; focusPlaylistId: number; model: string; report: CoachReport | null }> {
  const res = await fetch(`/api/sessions/${sessionId}/coach/latest?focusPlaylistId=${focusPlaylistId ?? 11}`);
  return handleJson(res);
}

export async function listCoachReports(
  sessionId: number,
  focusPlaylistId?: number
): Promise<CoachReportListItem[]> {
  const query = typeof focusPlaylistId === "number" ? `?focusPlaylistId=${focusPlaylistId}` : "";
  const res = await fetch(`/api/sessions/${sessionId}/coach/reports${query}`);
  return handleJson(res);
}

export async function setOpenAiKey(apiKey: string, model?: string): Promise<void> {
  const res = await fetch("/api/settings/openai-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, model })
  });
  await handleJson(res);
}

export async function getOpenAiStatus(): Promise<{ configured: boolean; model: string | null }> {
  const res = await fetch("/api/settings/openai-key");
  return handleJson(res);
}

export async function getCoachPrompt(): Promise<{ prompt: string | null }> {
  const res = await fetch("/api/settings/coach-prompt");
  return handleJson(res);
}

export async function setCoachPrompt(prompt: string): Promise<void> {
  const res = await fetch("/api/settings/coach-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  await handleJson(res);
}

export async function getCoachPacket(sessionId: number, focusPlaylistId?: number): Promise<{ focusPlaylistId: number; prompt: string | null; packet: unknown }> {
  const res = await fetch(`/api/sessions/${sessionId}/coach/packet?focusPlaylistId=${focusPlaylistId ?? 11}`);
  return handleJson(res);
}

export async function getDefaultCoachPrompt(): Promise<{ prompt: string }> {
  const res = await fetch("/api/settings/coach-prompt/default");
  return handleJson(res);
}

export async function listTeams(): Promise<Team[]> {
  const res = await fetch("/api/teams");
  return handleJson(res);
}

export async function getTeam(teamId: number): Promise<Team> {
  const res = await fetch(`/api/teams/${teamId}`);
  return handleJson(res);
}

export async function updateTeamName(teamId: number, name: string): Promise<Team> {
  const res = await fetch(`/api/teams/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleJson(res);
}

export async function listTeamCoachReports(teamId: number): Promise<TeamCoachReportListItem[]> {
  const res = await fetch(`/api/teams/${teamId}/reports`);
  return handleJson(res);
}

export async function generateTeamCoachReport(teamId: number): Promise<CoachReport> {
  const res = await fetch(`/api/teams/${teamId}/coach`, { method: "POST" });
  return handleJson(res);
}

export async function getLatestTeamCoachReport(teamId: number): Promise<TeamAggregateCoachReport> {
  const res = await fetch(`/api/teams/${teamId}/coach/latest`);
  return handleJson(res);
}

export async function listTeamAggregateCoachReports(teamId: number): Promise<TeamAggregateCoachReport[]> {
  const res = await fetch(`/api/teams/${teamId}/coach/reports`);
  return handleJson(res);
}

export async function getTeamPeakRatings(teamId: number): Promise<TeamPlayerPeakRating[]> {
  const res = await fetch(`/api/teams/${teamId}/peaks`);
  return handleJson(res);
}

export async function getTeamCurrentRanks(teamId: number): Promise<TeamPlayerCurrentRank[]> {
  const res = await fetch(`/api/teams/${teamId}/current-ranks`);
  return handleJson(res);
}


export async function getTeamCoachPrompt(): Promise<{ prompt: string | null }> {
  const res = await fetch("/api/settings/team-coach-prompt");
  return handleJson(res);
}

export async function setTeamCoachPrompt(prompt: string): Promise<void> {
  const res = await fetch("/api/settings/team-coach-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  await handleJson(res);
}

export async function getDefaultTeamCoachPrompt(): Promise<{ prompt: string }> {
  const res = await fetch("/api/settings/team-coach-prompt/default");
  return handleJson(res);
}

export async function getTeamCoachPacket(teamId: number): Promise<{ prompt: string | null; packet: unknown }> {
  const res = await fetch(`/api/teams/${teamId}/coach/packet`);
  return handleJson(res);
}
