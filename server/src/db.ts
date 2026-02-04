import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MatchRow, MatchPlayerRow, PlayerInput, PlayerRow, ScoreboardDeviceRow, ScoreboardIngestRow, ScoreboardAuditRow, ScoreboardUnmatchedRow, SessionRow, SnapshotRow, TeamRow, SessionTeamStatsRow } from "./types.js";

const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const serverDataDir = path.join(baseDir, "data");
const serverDbPath = path.join(serverDataDir, "rl.sqlite");
const cwdDataDir = path.join(process.cwd(), "data");
const cwdDbPath = path.join(cwdDataDir, "rl.sqlite");

const serverDbExists = fs.existsSync(serverDbPath);
const cwdDbExists = fs.existsSync(cwdDbPath);

let dbPath = serverDbPath;
if (serverDbExists && cwdDbExists) {
  const serverSize = fs.statSync(serverDbPath).size;
  const cwdSize = fs.statSync(cwdDbPath).size;
  dbPath = serverSize >= cwdSize ? serverDbPath : cwdDbPath;
} else if (cwdDbExists) {
  dbPath = cwdDbPath;
}

const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT '2v2',
    createdAt TEXT NOT NULL,
    pollingIntervalSeconds INTEGER NOT NULL,
    isActive INTEGER NOT NULL,
    matchIndex INTEGER NOT NULL DEFAULT 0,
    manualMode INTEGER NOT NULL DEFAULT 0,
    teamId INTEGER,
    includeCoachOnEnd INTEGER NOT NULL DEFAULT 0,
    isEnded INTEGER NOT NULL DEFAULT 0,
    endedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    playersJson TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    platform TEXT NOT NULL,
    gamertag TEXT NOT NULL,
    lastMatchId TEXT,
    lastMatchAt TEXT,
    lastMatchCount INTEGER
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    playerId INTEGER NOT NULL,
    capturedAt TEXT NOT NULL,
    matchIndex INTEGER,
    rawJson TEXT NOT NULL,
    derivedJson TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS db_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    capturedAt TEXT NOT NULL,
    dbSizeBytes INTEGER NOT NULL,
    snapshotsCount INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coach_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    teamId INTEGER,
    createdAt TEXT NOT NULL,
    focusPlaylistId INTEGER NOT NULL,
    coachPacketJson TEXT NOT NULL,
    reportJson TEXT NOT NULL,
    model TEXT NOT NULL,
    tokensUsed INTEGER
  );

  CREATE TABLE IF NOT EXISTS team_coach_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teamId INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    coachPacketJson TEXT NOT NULL,
    reportJson TEXT NOT NULL,
    model TEXT NOT NULL,
    tokensUsed INTEGER
  );

  CREATE TABLE IF NOT EXISTS coach_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createdAt TEXT NOT NULL,
    scope TEXT NOT NULL,
    userId INTEGER,
    sessionId INTEGER,
    teamId INTEGER,
    focusPlaylistId INTEGER,
    model TEXT,
    inputTokens INTEGER,
    cachedInputTokens INTEGER,
    outputTokens INTEGER,
    tokensUsed INTEGER,
    costUsd REAL,
    success INTEGER NOT NULL,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS session_team_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    teamId INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    focusPlaylistId INTEGER NOT NULL,
    deltasJson TEXT NOT NULL,
    derivedTeamJson TEXT NOT NULL,
    recordsJson TEXT NOT NULL,
    coachReportId INTEGER
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL,
    approvedAt TEXT,
    lastLoginAt TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    impersonatedUserId INTEGER,
    impersonatedByUserId INTEGER,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    ip TEXT,
    userAgent TEXT
  );

  CREATE TABLE IF NOT EXISTS session_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    sharedByUserId INTEGER,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scoreboard_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    deviceKeyHash TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    lastSeenAt TEXT,
    isEnabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS scoreboard_ingests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId INTEGER NOT NULL,
    receivedAt TEXT NOT NULL,
    status TEXT NOT NULL,
    errorMessage TEXT,
    sessionId INTEGER,
    teamId INTEGER,
    focusPlaylistId INTEGER,
    dedupeKey TEXT,
    matchId INTEGER
  );

  CREATE TABLE IF NOT EXISTS scoreboard_ingest_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestId INTEGER NOT NULL,
    imagePath TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scoreboard_unmatched (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestId INTEGER NOT NULL UNIQUE,
    createdAt TEXT NOT NULL,
    status TEXT NOT NULL,
    mode TEXT,
    teamSize INTEGER,
    blueNamesJson TEXT NOT NULL,
    orangeNamesJson TEXT NOT NULL,
    candidatesJson TEXT,
    rawExtractionJson TEXT NOT NULL,
    derivedMatchJson TEXT NOT NULL,
    signatureKey TEXT,
    assignedSessionId INTEGER
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    teamId INTEGER,
    source TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    rawExtractionJson TEXT NOT NULL,
    derivedMatchJson TEXT NOT NULL,
    extractionConfidence REAL,
    dedupeKey TEXT,
    signatureKey TEXT
  );

  CREATE TABLE IF NOT EXISTS match_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matchId INTEGER NOT NULL,
    playerId INTEGER,
    gamertag TEXT NOT NULL,
    platform TEXT NOT NULL,
    goals INTEGER,
    assists INTEGER,
    saves INTEGER,
    shots INTEGER,
    score INTEGER,
    isWinner INTEGER,
    nameMatchConfidence REAL
  );

  CREATE TABLE IF NOT EXISTS scoreboard_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createdAt TEXT NOT NULL,
    deviceId INTEGER,
    ingestId INTEGER,
    sessionId INTEGER,
    teamId INTEGER,
    model TEXT,
    inputTokens INTEGER,
    cachedInputTokens INTEGER,
    outputTokens INTEGER,
    tokensUsed INTEGER,
    costUsd REAL,
    success INTEGER NOT NULL,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS team_rank_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teamId INTEGER NOT NULL,
    gamertag TEXT NOT NULL,
    normalizedGamertag TEXT NOT NULL,
    kind TEXT NOT NULL,
    payloadJson TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    source TEXT
  );
`);

try {
  db.exec("DROP TABLE IF EXISTS polling_logs");
} catch {}

  db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scoreboard_devices_key ON scoreboard_devices(deviceKeyHash);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scoreboard_ingests_dedupe ON scoreboard_ingests(dedupeKey);
  CREATE INDEX IF NOT EXISTS idx_scoreboard_ingests_device ON scoreboard_ingests(deviceId);
  CREATE INDEX IF NOT EXISTS idx_scoreboard_ingests_session ON scoreboard_ingests(sessionId);
  CREATE INDEX IF NOT EXISTS idx_scoreboard_ingest_images_ingest ON scoreboard_ingest_images(ingestId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scoreboard_unmatched_ingest ON scoreboard_unmatched(ingestId);
  CREATE INDEX IF NOT EXISTS idx_scoreboard_unmatched_created ON scoreboard_unmatched(createdAt);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_dedupe ON matches(dedupeKey);
    CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(sessionId);
    CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(matchId);
    CREATE INDEX IF NOT EXISTS idx_scoreboard_audit_created ON scoreboard_audit(createdAt);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_rank_overrides_unique ON team_rank_overrides(teamId, normalizedGamertag, kind);
    CREATE INDEX IF NOT EXISTS idx_team_rank_overrides_team ON team_rank_overrides(teamId);
  `);

try {
  db.exec("ALTER TABLE sessions ADD COLUMN matchIndex INTEGER NOT NULL DEFAULT 0");
} catch {}
try {
  db.exec("ALTER TABLE sessions ADD COLUMN manualMode INTEGER NOT NULL DEFAULT 0");
} catch {}

try {
  db.exec("ALTER TABLE sessions ADD COLUMN userId INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT '2v2'");
} catch {}
try {
  db.exec("ALTER TABLE sessions ADD COLUMN teamId INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE sessions ADD COLUMN includeCoachOnEnd INTEGER NOT NULL DEFAULT 0");
} catch {}
try {
  db.exec("ALTER TABLE sessions ADD COLUMN isEnded INTEGER NOT NULL DEFAULT 0");
} catch {}
try {
  db.exec("ALTER TABLE sessions ADD COLUMN endedAt TEXT");
} catch {}
try {
  db.exec("ALTER TABLE players ADD COLUMN lastMatchId TEXT");
} catch {}

try {
  db.exec("ALTER TABLE players ADD COLUMN lastMatchAt TEXT");
} catch {}
try {
  db.exec("ALTER TABLE players ADD COLUMN lastMatchCount INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE players ADD COLUMN lastMatchCount INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE snapshots ADD COLUMN matchIndex INTEGER");
} catch {}
  try {
    db.exec("ALTER TABLE matches ADD COLUMN signatureKey TEXT");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_matches_signature ON matches(signatureKey)");
  } catch {}

try {
  db.exec("ALTER TABLE db_metrics ADD COLUMN sessionId INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE db_metrics ADD COLUMN capturedAt TEXT");
} catch {}

try {
  db.exec("ALTER TABLE db_metrics ADD COLUMN dbSizeBytes INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE db_metrics ADD COLUMN snapshotsCount INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE app_settings ADD COLUMN value TEXT NOT NULL");
} catch {}

try {
  db.exec("ALTER TABLE coach_reports ADD COLUMN createdAt TEXT");
} catch {}

try {
  db.exec("ALTER TABLE coach_reports ADD COLUMN focusPlaylistId INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE coach_reports ADD COLUMN coachPacketJson TEXT");
} catch {}

try {
  db.exec("ALTER TABLE coach_reports ADD COLUMN reportJson TEXT");
} catch {}

try {
  db.exec("ALTER TABLE coach_reports ADD COLUMN model TEXT");
} catch {}

try {
  db.exec("ALTER TABLE coach_reports ADD COLUMN tokensUsed INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE coach_reports ADD COLUMN teamId INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE teams ADD COLUMN userId INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE team_coach_reports ADD COLUMN teamId INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE team_coach_reports ADD COLUMN createdAt TEXT");
} catch {}
try {
  db.exec("ALTER TABLE team_coach_reports ADD COLUMN coachPacketJson TEXT");
} catch {}
try {
  db.exec("ALTER TABLE team_coach_reports ADD COLUMN reportJson TEXT");
} catch {}
try {
  db.exec("ALTER TABLE team_coach_reports ADD COLUMN model TEXT");
} catch {}
try {
  db.exec("ALTER TABLE team_coach_reports ADD COLUMN tokensUsed INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE coach_audit ADD COLUMN inputTokens INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE coach_audit ADD COLUMN cachedInputTokens INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE coach_audit ADD COLUMN outputTokens INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE coach_audit ADD COLUMN tokensUsed INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE coach_audit ADD COLUMN costUsd REAL");
} catch {}

try {
  db.exec("ALTER TABLE session_team_stats ADD COLUMN focusPlaylistId INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE session_team_stats ADD COLUMN deltasJson TEXT");
} catch {}
try {
  db.exec("ALTER TABLE session_team_stats ADD COLUMN derivedTeamJson TEXT");
} catch {}
try {
  db.exec("ALTER TABLE session_team_stats ADD COLUMN recordsJson TEXT");
} catch {}
try {
  db.exec("ALTER TABLE session_team_stats ADD COLUMN coachReportId INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE auth_sessions ADD COLUMN impersonatedUserId INTEGER");
} catch {}
try {
  db.exec("ALTER TABLE auth_sessions ADD COLUMN impersonatedByUserId INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE team_rank_overrides ADD COLUMN normalizedGamertag TEXT NOT NULL");
} catch {}

export function createSession(
  userId: number | null,
  name: string,
  mode: string,
  pollingIntervalSeconds: number,
  teamId: number | null,
  includeCoachOnEnd: boolean,
  manualMode: boolean
): SessionRow {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO sessions (userId, name, mode, createdAt, pollingIntervalSeconds, isActive, matchIndex, manualMode, teamId, includeCoachOnEnd, isEnded) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, 0)"
  );
  const result = stmt.run(
    userId,
    name,
    mode,
    createdAt,
    pollingIntervalSeconds,
    manualMode ? 1 : 0,
    teamId,
    includeCoachOnEnd ? 1 : 0
  );
  return {
    id: Number(result.lastInsertRowid),
    userId,
    name,
    mode,
    createdAt,
    pollingIntervalSeconds,
    isActive: 1,
    matchIndex: 0,
    manualMode: manualMode ? 1 : 0,
    teamId,
    includeCoachOnEnd: includeCoachOnEnd ? 1 : 0,
    isEnded: 0,
    endedAt: null
  };
}

export function setSessionActive(sessionId: number, isActive: boolean): void {
  const stmt = db.prepare("UPDATE sessions SET isActive = ? WHERE id = ?");
  stmt.run(isActive ? 1 : 0, sessionId);
}

export function setSessionMatchIndex(sessionId: number, matchIndex: number): void {
  const stmt = db.prepare("UPDATE sessions SET matchIndex = ? WHERE id = ?");
  stmt.run(matchIndex, sessionId);
}

export function setSessionManualMode(sessionId: number, manualMode: boolean): void {
  const stmt = db.prepare("UPDATE sessions SET manualMode = ? WHERE id = ?");
  stmt.run(manualMode ? 1 : 0, sessionId);
}

export function listSessions(): (SessionRow & { teamName?: string | null })[] {
  return db
    .prepare(
      "SELECT sessions.*, teams.name as teamName FROM sessions LEFT JOIN teams ON teams.id = sessions.teamId ORDER BY createdAt DESC"
    )
    .all() as (SessionRow & { teamName?: string | null })[];
}

export function getSession(sessionId: number): SessionRow | undefined {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
}

export function listSessionsForUser(userId: number, isAdmin: boolean): (SessionRow & { teamName?: string | null })[] {
  if (isAdmin) return listSessions();
  return db
    .prepare(
      `SELECT DISTINCT sessions.*, teams.name as teamName
       FROM sessions
       LEFT JOIN teams ON teams.id = sessions.teamId
       LEFT JOIN session_shares ON session_shares.sessionId = sessions.id
       WHERE sessions.userId = ? OR session_shares.userId = ?
       ORDER BY sessions.createdAt DESC`
    )
    .all(userId, userId) as (SessionRow & { teamName?: string | null })[];
}

export function getSessionForUser(sessionId: number, userId: number, isAdmin: boolean): SessionRow | undefined {
  if (isAdmin) return getSession(sessionId);
  return db
    .prepare(
      `SELECT DISTINCT sessions.*
       FROM sessions
       LEFT JOIN session_shares ON session_shares.sessionId = sessions.id
       WHERE sessions.id = ? AND (sessions.userId = ? OR session_shares.userId = ?)`
    )
    .get(sessionId, userId, userId) as SessionRow | undefined;
}

export function endSession(sessionId: number): void {
  db.prepare("UPDATE sessions SET isActive = 0, isEnded = 1, endedAt = ? WHERE id = ?")
    .run(new Date().toISOString(), sessionId);
}

export function createTeam(userId: number | null, name: string, mode: string, playersJson: string): TeamRow {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO teams (userId, name, mode, createdAt, playersJson) VALUES (?, ?, ?, ?, ?)")
    .run(userId, name, mode, createdAt, playersJson);
  return {
    id: Number(result.lastInsertRowid),
    userId,
    name,
    mode,
    createdAt,
    playersJson
  };
}

export function listTeams(): TeamRow[] {
  return db.prepare("SELECT * FROM teams ORDER BY createdAt DESC").all() as TeamRow[];
}

export function listTeamsForUser(userId: number, isAdmin: boolean): TeamRow[] {
  if (isAdmin) return listTeams();
  return db.prepare("SELECT * FROM teams WHERE userId = ? ORDER BY createdAt DESC").all(userId) as TeamRow[];
}

function rosterKey(players: PlayerInput[]): string {
  return players
    .map((player) => `${player.platform}:${player.gamertag.trim().toLowerCase()}`)
    .sort()
    .join("|");
}

function parseTeamPlayers(value: string): PlayerInput[] | null {
  try {
    const parsed = JSON.parse(value) as PlayerInput[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function findTeamByRoster(userId: number | null, mode: string, players: PlayerInput[]): TeamRow | undefined {
  const targetKey = rosterKey(players);
  return listTeams().find((team) => {
    if (userId !== null && team.userId !== userId) return false;
    if (team.mode !== mode) return false;
    const teamPlayers = parseTeamPlayers(team.playersJson);
    if (!teamPlayers) return false;
    return rosterKey(teamPlayers) === targetKey;
  });
}

export function getTeam(teamId: number): TeamRow | undefined {
  return db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId) as TeamRow | undefined;
}

export function getTeamForUser(teamId: number, userId: number, isAdmin: boolean): TeamRow | undefined {
  if (isAdmin) return getTeam(teamId);
  return db.prepare("SELECT * FROM teams WHERE id = ? AND userId = ?").get(teamId, userId) as TeamRow | undefined;
}

export function updateTeamName(teamId: number, name: string): void {
  db.prepare("UPDATE teams SET name = ? WHERE id = ?").run(name, teamId);
}

export function createPlayers(sessionId: number, players: PlayerInput[]): PlayerRow[] {
  const stmt = db.prepare(
    "INSERT INTO players (sessionId, platform, gamertag) VALUES (?, ?, ?)"
  );
  const rows: PlayerRow[] = [];
  const insertMany = db.transaction((items: PlayerInput[]) => {
    items.forEach((player) => {
      const result = stmt.run(sessionId, player.platform, player.gamertag);
      rows.push({
        id: Number(result.lastInsertRowid),
        sessionId,
        platform: player.platform,
        gamertag: player.gamertag,
        lastMatchId: null,
        lastMatchAt: null,
        lastMatchCount: null
      });
    });
  });
  insertMany(players);
  return rows;
}

export function getPlayersBySession(sessionId: number): PlayerRow[] {
  return db.prepare("SELECT * FROM players WHERE sessionId = ?").all(sessionId) as PlayerRow[];
}

export function updatePlayerMatchState(
  playerId: number,
  lastMatchId: string | null,
  lastMatchAt: string | null,
  lastMatchCount: number | null
): void {
  const stmt = db.prepare("UPDATE players SET lastMatchId = ?, lastMatchAt = ?, lastMatchCount = ? WHERE id = ?");
  stmt.run(lastMatchId, lastMatchAt, lastMatchCount, playerId);
}

export function insertSnapshot(
  sessionId: number,
  playerId: number,
  capturedAt: string,
  matchIndex: number | null,
  rawJson: string,
  derivedJson: string
): SnapshotRow {
  const stmt = db.prepare(
    "INSERT INTO snapshots (sessionId, playerId, capturedAt, matchIndex, rawJson, derivedJson) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const result = stmt.run(sessionId, playerId, capturedAt, matchIndex, rawJson, derivedJson);
  return {
    id: Number(result.lastInsertRowid),
    sessionId,
    playerId,
    capturedAt,
    matchIndex,
    rawJson,
    derivedJson
  };
}

export function getBaselineSnapshot(playerId: number): SnapshotRow | undefined {
  const baseline = db
    .prepare("SELECT * FROM snapshots WHERE playerId = ? AND matchIndex IS NULL ORDER BY capturedAt ASC LIMIT 1")
    .get(playerId) as SnapshotRow | undefined;
  if (baseline) return baseline;
  return db
    .prepare("SELECT * FROM snapshots WHERE playerId = ? ORDER BY capturedAt ASC LIMIT 1")
    .get(playerId) as SnapshotRow | undefined;
}

export function getLatestSnapshot(playerId: number): SnapshotRow | undefined {
  return db
    .prepare("SELECT * FROM snapshots WHERE playerId = ? ORDER BY capturedAt DESC LIMIT 1")
    .get(playerId) as SnapshotRow | undefined;
}

export function getLatestSnapshotByGamertag(gamertag: string): SnapshotRow | undefined {
  return db
    .prepare(
      "SELECT snapshots.* FROM snapshots JOIN players ON players.id = snapshots.playerId WHERE players.gamertag = ? ORDER BY snapshots.capturedAt DESC LIMIT 1"
    )
    .get(gamertag) as SnapshotRow | undefined;
}

export function getSnapshotsForPlayer(playerId: number): SnapshotRow[] {
  return db
    .prepare("SELECT * FROM snapshots WHERE playerId = ? ORDER BY capturedAt ASC")
    .all(playerId) as SnapshotRow[];
}

export function getRecentSnapshots(sessionId: number, limit: number): SnapshotRow[] {
  return db
    .prepare(
      "SELECT * FROM snapshots WHERE sessionId = ? ORDER BY capturedAt DESC LIMIT ?"
    )
    .all(sessionId, limit) as SnapshotRow[];
}

export function deleteSession(sessionId: number): void {
  const deleteSnapshots = db.prepare("DELETE FROM snapshots WHERE sessionId = ?");
  const deletePlayers = db.prepare("DELETE FROM players WHERE sessionId = ?");
  const deleteSessionRow = db.prepare("DELETE FROM sessions WHERE id = ?");
  const deleteTeamStats = db.prepare("DELETE FROM session_team_stats WHERE sessionId = ?");
  const deleteCoachReports = db.prepare("DELETE FROM coach_reports WHERE sessionId = ?");
  const deleteCoachAudit = db.prepare("DELETE FROM coach_audit WHERE sessionId = ?");
  const deleteSessionShares = db.prepare("DELETE FROM session_shares WHERE sessionId = ?");

  const run = db.transaction(() => {
    deleteSnapshots.run(sessionId);
    deletePlayers.run(sessionId);
    deleteTeamStats.run(sessionId);
    deleteCoachReports.run(sessionId);
    deleteCoachAudit.run(sessionId);
    deleteSessionShares.run(sessionId);
    deleteSessionRow.run(sessionId);
  });

  run();
}

export function recordDbMetric(sessionId: number): void {
  const capturedAt = new Date().toISOString();
  const dbSizeBytes = fs.statSync(dbPath).size;
  const snapshotsCountRow = db
    .prepare("SELECT COUNT(1) as count FROM snapshots WHERE sessionId = ?")
    .get(sessionId) as { count: number };
  const snapshotsCount = snapshotsCountRow?.count ?? 0;
  db.prepare(
    "INSERT INTO db_metrics (sessionId, capturedAt, dbSizeBytes, snapshotsCount) VALUES (?, ?, ?, ?)"
  ).run(sessionId, capturedAt, dbSizeBytes, snapshotsCount);
}

export function getDbMetrics(sessionId: number | null, limit: number): { capturedAt: string; dbSizeBytes: number; snapshotsCount: number }[] {
  if (typeof sessionId === "number") {
    return db
      .prepare(
        "SELECT capturedAt, dbSizeBytes, snapshotsCount FROM db_metrics WHERE sessionId = ? ORDER BY capturedAt DESC LIMIT ?"
      )
      .all(sessionId, limit) as { capturedAt: string; dbSizeBytes: number; snapshotsCount: number }[];
  }
  return db
    .prepare(
      "SELECT capturedAt, dbSizeBytes, snapshotsCount FROM db_metrics ORDER BY capturedAt DESC LIMIT ?"
    )
    .all(limit) as { capturedAt: string; dbSizeBytes: number; snapshotsCount: number }[];
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function insertCoachAudit(entry: {
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
  success: boolean;
  error: string | null;
}): void {
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO coach_audit (createdAt, scope, userId, sessionId, teamId, focusPlaylistId, model, inputTokens, cachedInputTokens, outputTokens, tokensUsed, costUsd, success, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    createdAt,
    entry.scope,
    entry.userId,
    entry.sessionId,
    entry.teamId,
    entry.focusPlaylistId,
    entry.model,
    entry.inputTokens,
    entry.cachedInputTokens,
    entry.outputTokens,
    entry.tokensUsed,
    entry.costUsd,
    entry.success ? 1 : 0,
    entry.error
  );
}

export function listCoachAudit(limit: number): {
  id: number;
  createdAt: string;
  scope: string;
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
}[] {
  return db
    .prepare(
      "SELECT id, createdAt, scope, userId, sessionId, teamId, focusPlaylistId, model, inputTokens, cachedInputTokens, outputTokens, tokensUsed, costUsd, success, error FROM coach_audit ORDER BY createdAt DESC LIMIT ?"
    )
    .all(limit) as {
    id: number;
    createdAt: string;
    scope: string;
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
  }[];
}

export function insertCoachReport(
  sessionId: number,
  teamId: number | null,
  focusPlaylistId: number,
  coachPacketJson: string,
  reportJson: string,
  model: string,
  tokensUsed: number | null
): number {
  const createdAt = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO coach_reports (sessionId, teamId, createdAt, focusPlaylistId, coachPacketJson, reportJson, model, tokensUsed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(sessionId, teamId, createdAt, focusPlaylistId, coachPacketJson, reportJson, model, tokensUsed);
  return Number(result.lastInsertRowid);
}

export function getLatestCoachReport(sessionId: number, focusPlaylistId: number): { id: number; createdAt: string; focusPlaylistId: number; reportJson: string; model: string } | undefined {
  return db.prepare(
    "SELECT id, createdAt, focusPlaylistId, reportJson, model FROM coach_reports WHERE sessionId = ? AND focusPlaylistId = ? ORDER BY createdAt DESC LIMIT 1"
  ).get(sessionId, focusPlaylistId) as { id: number; createdAt: string; focusPlaylistId: number; reportJson: string; model: string } | undefined;
}

export function listCoachReports(sessionId: number, focusPlaylistId?: number): { id: number; createdAt: string; focusPlaylistId: number; reportJson: string; model: string }[] {
  if (typeof focusPlaylistId === "number") {
    return db.prepare(
      "SELECT id, createdAt, focusPlaylistId, reportJson, model FROM coach_reports WHERE sessionId = ? AND focusPlaylistId = ? ORDER BY createdAt DESC"
    ).all(sessionId, focusPlaylistId) as { id: number; createdAt: string; focusPlaylistId: number; reportJson: string; model: string }[];
  }
  return db.prepare(
    "SELECT id, createdAt, focusPlaylistId, reportJson, model FROM coach_reports WHERE sessionId = ? ORDER BY createdAt DESC"
  ).all(sessionId) as { id: number; createdAt: string; focusPlaylistId: number; reportJson: string; model: string }[];
}

export function listCoachReportsByTeam(teamId: number): { id: number; createdAt: string; focusPlaylistId: number; reportJson: string; model: string; sessionId: number; sessionName: string }[] {
  return db.prepare(
    `SELECT coach_reports.id,
            coach_reports.createdAt,
            coach_reports.focusPlaylistId,
            coach_reports.reportJson,
            coach_reports.model,
            coach_reports.sessionId,
            sessions.name as sessionName
     FROM coach_reports
     JOIN sessions ON sessions.id = coach_reports.sessionId
     WHERE coach_reports.teamId = ?
     ORDER BY coach_reports.createdAt DESC`
  ).all(teamId) as { id: number; createdAt: string; focusPlaylistId: number; reportJson: string; model: string; sessionId: number; sessionName: string }[];
}

export function insertTeamCoachReport(
  teamId: number,
  coachPacketJson: string,
  reportJson: string,
  model: string,
  tokensUsed: number | null
): number {
  const createdAt = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO team_coach_reports (teamId, createdAt, coachPacketJson, reportJson, model, tokensUsed) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(teamId, createdAt, coachPacketJson, reportJson, model, tokensUsed);
  return Number(result.lastInsertRowid);
}

export function getLatestTeamCoachReport(teamId: number): { id: number; createdAt: string; reportJson: string; model: string } | undefined {
  return db.prepare(
    "SELECT id, createdAt, reportJson, model FROM team_coach_reports WHERE teamId = ? ORDER BY createdAt DESC LIMIT 1"
  ).get(teamId) as { id: number; createdAt: string; reportJson: string; model: string } | undefined;
}

export function listTeamCoachReports(teamId: number): { id: number; createdAt: string; reportJson: string; model: string }[] {
  return db.prepare(
    "SELECT id, createdAt, reportJson, model FROM team_coach_reports WHERE teamId = ? ORDER BY createdAt DESC"
  ).all(teamId) as { id: number; createdAt: string; reportJson: string; model: string }[];
}

export function insertSessionTeamStats(
  sessionId: number,
  teamId: number,
  focusPlaylistId: number,
  deltasJson: string,
  derivedTeamJson: string,
  recordsJson: string,
  coachReportId: number | null
): SessionTeamStatsRow {
  const createdAt = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO session_team_stats (sessionId, teamId, createdAt, focusPlaylistId, deltasJson, derivedTeamJson, recordsJson, coachReportId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(sessionId, teamId, createdAt, focusPlaylistId, deltasJson, derivedTeamJson, recordsJson, coachReportId);
  return {
    id: Number(result.lastInsertRowid),
    sessionId,
    teamId,
    createdAt,
    focusPlaylistId,
    deltasJson,
    derivedTeamJson,
    recordsJson,
    coachReportId
  };
}

export function listTeamStats(teamId: number): SessionTeamStatsRow[] {
  return db.prepare("SELECT * FROM session_team_stats WHERE teamId = ? ORDER BY createdAt DESC").all(teamId) as SessionTeamStatsRow[];
}

export function getSessionTeamStats(sessionId: number): SessionTeamStatsRow | undefined {
  return db.prepare("SELECT * FROM session_team_stats WHERE sessionId = ?").get(sessionId) as SessionTeamStatsRow | undefined;
}

export function getLatestAvatarUrlByGamertag(gamertag: string): string | null {
  const row = db
    .prepare(
      "SELECT snapshots.derivedJson FROM snapshots JOIN players ON players.id = snapshots.playerId WHERE LOWER(players.gamertag) = LOWER(?) ORDER BY snapshots.capturedAt DESC LIMIT 1"
    )
    .get(gamertag) as { derivedJson: string } | undefined;
  if (!row?.derivedJson) return null;
  try {
    const parsed = JSON.parse(row.derivedJson) as { avatarUrl?: string | null };
    return typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null;
  } catch {
    return null;
  }
}

export function createScoreboardDevice(
  name: string | null,
  deviceKeyHash: string
): ScoreboardDeviceRow {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO scoreboard_devices (name, deviceKeyHash, createdAt, isEnabled) VALUES (?, ?, ?, 1)")
    .run(name, deviceKeyHash, createdAt);
  return {
    id: Number(result.lastInsertRowid),
    name,
    deviceKeyHash,
    createdAt,
    lastSeenAt: null,
    isEnabled: 1
  };
}

export function getScoreboardDevice(deviceId: number): ScoreboardDeviceRow | undefined {
  return db.prepare("SELECT * FROM scoreboard_devices WHERE id = ?").get(deviceId) as ScoreboardDeviceRow | undefined;
}

export function getScoreboardDeviceByHash(deviceKeyHash: string): ScoreboardDeviceRow | undefined {
  return db
    .prepare("SELECT * FROM scoreboard_devices WHERE deviceKeyHash = ?")
    .get(deviceKeyHash) as ScoreboardDeviceRow | undefined;
}

export function listScoreboardDevices(): ScoreboardDeviceRow[] {
  return db.prepare("SELECT * FROM scoreboard_devices ORDER BY createdAt DESC").all() as ScoreboardDeviceRow[];
}

export function updateScoreboardDeviceSeen(deviceId: number, seenAt: string): void {
  db.prepare("UPDATE scoreboard_devices SET lastSeenAt = ? WHERE id = ?").run(seenAt, deviceId);
}

export function setScoreboardDeviceEnabled(deviceId: number, isEnabled: boolean): void {
  db.prepare("UPDATE scoreboard_devices SET isEnabled = ? WHERE id = ?").run(isEnabled ? 1 : 0, deviceId);
}

export function createScoreboardIngest(input: {
  deviceId: number;
  receivedAt: string;
  status: ScoreboardIngestRow["status"];
  errorMessage: string | null;
  sessionId: number | null;
  teamId: number | null;
  focusPlaylistId: number | null;
  dedupeKey: string | null;
  matchId: number | null;
}): ScoreboardIngestRow {
  const result = db
    .prepare(
      "INSERT INTO scoreboard_ingests (deviceId, receivedAt, status, errorMessage, sessionId, teamId, focusPlaylistId, dedupeKey, matchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      input.deviceId,
      input.receivedAt,
      input.status,
      input.errorMessage,
      input.sessionId,
      input.teamId,
      input.focusPlaylistId,
      input.dedupeKey,
      input.matchId
    );
  return {
    id: Number(result.lastInsertRowid),
    ...input
  };
}

export function updateScoreboardIngest(
  ingestId: number,
  patch: Partial<Pick<ScoreboardIngestRow, "status" | "errorMessage" | "sessionId" | "teamId" | "focusPlaylistId" | "dedupeKey" | "matchId">>
): void {
  const current = getScoreboardIngest(ingestId);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare(
    "UPDATE scoreboard_ingests SET status = ?, errorMessage = ?, sessionId = ?, teamId = ?, focusPlaylistId = ?, dedupeKey = ?, matchId = ? WHERE id = ?"
  ).run(
    next.status,
    next.errorMessage,
    next.sessionId,
    next.teamId,
    next.focusPlaylistId,
    next.dedupeKey,
    next.matchId,
    ingestId
  );
}

export function getScoreboardIngest(ingestId: number): ScoreboardIngestRow | undefined {
  return db.prepare("SELECT * FROM scoreboard_ingests WHERE id = ?").get(ingestId) as ScoreboardIngestRow | undefined;
}

export function listScoreboardIngests(limit = 50): ScoreboardIngestRow[] {
  return db
    .prepare(
      `SELECT scoreboard_ingests.*,
              matches.signatureKey AS signatureKey
         FROM scoreboard_ingests
         LEFT JOIN matches ON matches.id = scoreboard_ingests.matchId
        ORDER BY scoreboard_ingests.receivedAt DESC
        LIMIT ?`
    )
    .all(limit) as ScoreboardIngestRow[];
}

export function getLatestScoreboardIngestForDevice(deviceId: number): ScoreboardIngestRow | undefined {
  return db
    .prepare("SELECT * FROM scoreboard_ingests WHERE deviceId = ? ORDER BY receivedAt DESC LIMIT 1")
    .get(deviceId) as ScoreboardIngestRow | undefined;
}

export function getScoreboardIngestByDedupe(dedupeKey: string): ScoreboardIngestRow | undefined {
  return db
    .prepare("SELECT * FROM scoreboard_ingests WHERE dedupeKey = ?")
    .get(dedupeKey) as ScoreboardIngestRow | undefined;
}

export function insertScoreboardIngestImage(ingestId: number, imagePath: string): void {
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO scoreboard_ingest_images (ingestId, imagePath, createdAt) VALUES (?, ?, ?)"
  ).run(ingestId, imagePath, createdAt);
}

export function listScoreboardIngestImages(ingestId: number): { id: number; imagePath: string; createdAt: string }[] {
  return db
    .prepare("SELECT id, imagePath, createdAt FROM scoreboard_ingest_images WHERE ingestId = ? ORDER BY id ASC")
    .all(ingestId) as { id: number; imagePath: string; createdAt: string }[];
}

export function createScoreboardUnmatched(entry: {
  ingestId: number;
  mode: string | null;
  teamSize: number | null;
  blueNames: string[];
  orangeNames: string[];
  candidates: unknown;
  rawExtractionJson: string;
  derivedMatchJson: string;
  signatureKey: string | null;
}): ScoreboardUnmatchedRow {
  const createdAt = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO scoreboard_unmatched
      (ingestId, createdAt, status, mode, teamSize, blueNamesJson, orangeNamesJson, candidatesJson, rawExtractionJson, derivedMatchJson, signatureKey, assignedSessionId)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    entry.ingestId,
    createdAt,
    entry.mode,
    entry.teamSize,
    JSON.stringify(entry.blueNames),
    JSON.stringify(entry.orangeNames),
    entry.candidates ? JSON.stringify(entry.candidates) : null,
    entry.rawExtractionJson,
    entry.derivedMatchJson,
    entry.signatureKey
  );
  return {
    id: Number(result.lastInsertRowid),
    ingestId: entry.ingestId,
    createdAt,
    status: "pending",
    mode: entry.mode,
    teamSize: entry.teamSize,
    blueNamesJson: JSON.stringify(entry.blueNames),
    orangeNamesJson: JSON.stringify(entry.orangeNames),
    candidatesJson: entry.candidates ? JSON.stringify(entry.candidates) : null,
    rawExtractionJson: entry.rawExtractionJson,
    derivedMatchJson: entry.derivedMatchJson,
    signatureKey: entry.signatureKey,
    assignedSessionId: null
  };
}

export function getScoreboardUnmatchedByIngestId(ingestId: number): ScoreboardUnmatchedRow | undefined {
  return db.prepare("SELECT * FROM scoreboard_unmatched WHERE ingestId = ?").get(ingestId) as ScoreboardUnmatchedRow | undefined;
}

export function listScoreboardUnmatched(limit = 50): ScoreboardUnmatchedRow[] {
  return db
    .prepare("SELECT * FROM scoreboard_unmatched WHERE status = 'pending' ORDER BY createdAt DESC LIMIT ?")
    .all(limit) as ScoreboardUnmatchedRow[];
}

export function updateScoreboardUnmatched(unmatchedId: number, update: { status?: "pending" | "assigned" | "ignored"; assignedSessionId?: number | null; candidates?: unknown | null }): void {
  const current = db.prepare("SELECT * FROM scoreboard_unmatched WHERE id = ?").get(unmatchedId) as ScoreboardUnmatchedRow | undefined;
  if (!current) return;
  const status = update.status ?? current.status;
  const assignedSessionId = update.assignedSessionId ?? current.assignedSessionId;
  const candidatesJson = update.candidates === undefined ? current.candidatesJson : update.candidates ? JSON.stringify(update.candidates) : null;
  db.prepare("UPDATE scoreboard_unmatched SET status = ?, assignedSessionId = ?, candidatesJson = ? WHERE id = ?")
    .run(status, assignedSessionId ?? null, candidatesJson, unmatchedId);
}

export function getScoreboardUnmatched(unmatchedId: number): ScoreboardUnmatchedRow | undefined {
  return db.prepare("SELECT * FROM scoreboard_unmatched WHERE id = ?").get(unmatchedId) as ScoreboardUnmatchedRow | undefined;
}

export function deleteScoreboardUnmatched(unmatchedId: number): void {
  db.prepare("DELETE FROM scoreboard_unmatched WHERE id = ?").run(unmatchedId);
}

export function findMatchByDedupe(dedupeKey: string): MatchRow | undefined {
  return db.prepare("SELECT * FROM matches WHERE dedupeKey = ?").get(dedupeKey) as MatchRow | undefined;
}

export function findMatchBySignature(signature: string, sessionId: number | null): MatchRow | undefined {
  if (!signature) return undefined;
  if (typeof sessionId === "number") {
    return db
      .prepare("SELECT * FROM matches WHERE sessionId = ? AND signatureKey = ?")
      .get(sessionId, signature) as MatchRow | undefined;
  }
  return db.prepare("SELECT * FROM matches WHERE signatureKey = ?").get(signature) as MatchRow | undefined;
}

export function insertMatch(input: {
  sessionId: number | null;
  teamId: number | null;
  source: string;
  createdAt: string;
  rawExtractionJson: string;
  derivedMatchJson: string;
  extractionConfidence: number | null;
  dedupeKey: string | null;
  signatureKey: string | null;
}): MatchRow {
  const result = db
    .prepare(
      "INSERT INTO matches (sessionId, teamId, source, createdAt, rawExtractionJson, derivedMatchJson, extractionConfidence, dedupeKey, signatureKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      input.sessionId,
      input.teamId,
      input.source,
      input.createdAt,
      input.rawExtractionJson,
      input.derivedMatchJson,
      input.extractionConfidence,
      input.dedupeKey,
      input.signatureKey
    );
  return {
    id: Number(result.lastInsertRowid),
    ...input
  };
}

export function insertMatchPlayer(input: {
  matchId: number;
  playerId: number | null;
  gamertag: string;
  platform: string;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  shots: number | null;
  score: number | null;
  isWinner: boolean | null;
  nameMatchConfidence: number | null;
}): void {
  db.prepare(
    "INSERT INTO match_players (matchId, playerId, gamertag, platform, goals, assists, saves, shots, score, isWinner, nameMatchConfidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    input.matchId,
    input.playerId,
    input.gamertag,
    input.platform,
    input.goals,
    input.assists,
    input.saves,
    input.shots,
    input.score,
    input.isWinner === null ? null : input.isWinner ? 1 : 0,
    input.nameMatchConfidence
  );
}

export function getMatch(matchId: number): MatchRow | undefined {
  return db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as MatchRow | undefined;
}

export function listMatchPlayers(matchId: number): MatchPlayerRow[] {
  return db
    .prepare("SELECT * FROM match_players WHERE matchId = ? ORDER BY id ASC")
    .all(matchId) as MatchPlayerRow[];
}

export function insertScoreboardAudit(entry: {
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
  success: boolean;
  error: string | null;
}): void {
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO scoreboard_audit (createdAt, deviceId, ingestId, sessionId, teamId, model, inputTokens, cachedInputTokens, outputTokens, tokensUsed, costUsd, success, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    createdAt,
    entry.deviceId,
    entry.ingestId,
    entry.sessionId,
    entry.teamId,
    entry.model,
    entry.inputTokens,
    entry.cachedInputTokens,
    entry.outputTokens,
    entry.tokensUsed,
    entry.costUsd,
    entry.success ? 1 : 0,
    entry.error
  );
}

export function listScoreboardAudit(limit: number): ScoreboardAuditRow[] {
  return db
    .prepare(
      "SELECT id, createdAt, deviceId, ingestId, sessionId, teamId, model, inputTokens, cachedInputTokens, outputTokens, tokensUsed, costUsd, success, error FROM scoreboard_audit ORDER BY createdAt DESC LIMIT ?"
    )
    .all(limit) as ScoreboardAuditRow[];
}

export function createUser(
  username: string,
  email: string,
  passwordHash: string,
  role: "admin" | "user",
  status: "pending" | "active" | "disabled"
): { id: number; username: string; email: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null } {
  const createdAt = new Date().toISOString();
  const approvedAt = status === "active" ? createdAt : null;
  const result = db
    .prepare("INSERT INTO users (username, email, passwordHash, role, status, createdAt, approvedAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(username, email, passwordHash, role, status, createdAt, approvedAt);
  return {
    id: Number(result.lastInsertRowid),
    username,
    email,
    role,
    status,
    createdAt,
    approvedAt,
    lastLoginAt: null
  };
}

export function listUsers(): { id: number; username: string; email: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null }[] {
  return db
    .prepare("SELECT id, username, email, role, status, createdAt, approvedAt, lastLoginAt FROM users ORDER BY createdAt DESC")
    .all() as { id: number; username: string; email: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null }[];
}

export function countUsers(): number {
  const row = db.prepare("SELECT COUNT(1) as count FROM users").get() as { count: number };
  return row?.count ?? 0;
}

export function getUserById(userId: number): { id: number; username: string; email: string; passwordHash: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null } | undefined {
  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(userId) as { id: number; username: string; email: string; passwordHash: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null } | undefined;
}

export function getUserByUsername(username: string): { id: number; username: string; email: string; passwordHash: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null } | undefined {
  return db
    .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)")
    .get(username) as { id: number; username: string; email: string; passwordHash: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null } | undefined;
}

export function getUserByEmail(email: string): { id: number; username: string; email: string; passwordHash: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null } | undefined {
  return db
    .prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)")
    .get(email) as { id: number; username: string; email: string; passwordHash: string; role: string; status: string; createdAt: string; approvedAt: string | null; lastLoginAt: string | null } | undefined;
}

export function updateUserStatus(userId: number, status: "pending" | "active" | "disabled"): void {
  const approvedAt = status === "active" ? new Date().toISOString() : null;
  db.prepare("UPDATE users SET status = ?, approvedAt = ? WHERE id = ?")
    .run(status, approvedAt, userId);
}

export function updateUserRole(userId: number, role: "admin" | "user"): void {
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
}

export function updateUserProfile(userId: number, username: string, email: string): void {
  db.prepare("UPDATE users SET username = ?, email = ? WHERE id = ?").run(username, email, userId);
}

export function updateUserPassword(userId: number, passwordHash: string): void {
  db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?").run(passwordHash, userId);
}

export function updateUserLastLogin(userId: number): void {
  db.prepare("UPDATE users SET lastLoginAt = ? WHERE id = ?").run(new Date().toISOString(), userId);
}

export function deleteUser(userId: number): void {
  const sessionIds = db.prepare("SELECT id FROM sessions WHERE userId = ?").all(userId) as { id: number }[];
  const deleteSnapshots = db.prepare("DELETE FROM snapshots WHERE sessionId = ?");
  const deletePlayers = db.prepare("DELETE FROM players WHERE sessionId = ?");
  const deleteTeamStats = db.prepare("DELETE FROM session_team_stats WHERE sessionId = ?");
  const deleteCoachReports = db.prepare("DELETE FROM coach_reports WHERE sessionId = ?");
  const deleteSessionSharesBySession = db.prepare("DELETE FROM session_shares WHERE sessionId = ?");
  const deleteSessions = db.prepare("DELETE FROM sessions WHERE id = ?");
  const deleteTeams = db.prepare("DELETE FROM teams WHERE userId = ?");
  const deleteSessionSharesByUser = db.prepare("DELETE FROM session_shares WHERE userId = ? OR sharedByUserId = ?");
  const deleteAuthSessions = db.prepare("DELETE FROM auth_sessions WHERE userId = ? OR impersonatedUserId = ? OR impersonatedByUserId = ?");
  const deleteUserRow = db.prepare("DELETE FROM users WHERE id = ?");

  const run = db.transaction(() => {
    sessionIds.forEach((row) => {
      deleteSnapshots.run(row.id);
      deletePlayers.run(row.id);
      deleteTeamStats.run(row.id);
      deleteCoachReports.run(row.id);
      deleteSessionSharesBySession.run(row.id);
      deleteSessions.run(row.id);
    });
    deleteTeams.run(userId);
    deleteSessionSharesByUser.run(userId, userId);
    deleteAuthSessions.run(userId, userId, userId);
    deleteUserRow.run(userId);
  });

  run();
}

export function createAuthSession(userId: number, token: string, expiresAt: string, ip: string | null, userAgent: string | null): void {
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO auth_sessions (userId, token, createdAt, expiresAt, ip, userAgent) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, token, createdAt, expiresAt, ip, userAgent);
}

export function getAuthSessionByToken(token: string): { id: number; userId: number; impersonatedUserId: number | null; impersonatedByUserId: number | null; createdAt: string; expiresAt: string } | undefined {
  return db
    .prepare("SELECT id, userId, impersonatedUserId, impersonatedByUserId, createdAt, expiresAt FROM auth_sessions WHERE token = ?")
    .get(token) as { id: number; userId: number; impersonatedUserId: number | null; impersonatedByUserId: number | null; createdAt: string; expiresAt: string } | undefined;
}

export function deleteAuthSession(token: string): void {
  db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
}

export function clearAuthSessionsForUser(userId: number): void {
  db.prepare("DELETE FROM auth_sessions WHERE userId = ? OR impersonatedUserId = ? OR impersonatedByUserId = ?")
    .run(userId, userId, userId);
}

export function setAuthSessionImpersonation(sessionId: number, impersonatedUserId: number, impersonatedByUserId: number): void {
  db.prepare("UPDATE auth_sessions SET impersonatedUserId = ?, impersonatedByUserId = ? WHERE id = ?")
    .run(impersonatedUserId, impersonatedByUserId, sessionId);
}

export function clearAuthSessionImpersonation(sessionId: number): void {
  db.prepare("UPDATE auth_sessions SET impersonatedUserId = NULL, impersonatedByUserId = NULL WHERE id = ?")
    .run(sessionId);
}

export function upsertTeamRankOverride(input: {
  teamId: number;
  gamertag: string;
  normalizedGamertag: string;
  kind: "current" | "peak";
  payloadJson: string;
  source: string | null;
}): void {
  const updatedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO team_rank_overrides (teamId, gamertag, normalizedGamertag, kind, payloadJson, updatedAt, source) VALUES (?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(teamId, normalizedGamertag, kind) DO UPDATE SET gamertag = excluded.gamertag, payloadJson = excluded.payloadJson, updatedAt = excluded.updatedAt, source = excluded.source"
  ).run(
    input.teamId,
    input.gamertag,
    input.normalizedGamertag,
    input.kind,
    input.payloadJson,
    updatedAt,
    input.source
  );
}

export function listTeamRankOverrides(teamId: number, kind: "current" | "peak"): { gamertag: string; normalizedGamertag: string; payloadJson: string; updatedAt: string; source: string | null }[] {
  return db
    .prepare(
      "SELECT gamertag, normalizedGamertag, payloadJson, updatedAt, source FROM team_rank_overrides WHERE teamId = ? AND kind = ?"
    )
    .all(teamId, kind) as { gamertag: string; normalizedGamertag: string; payloadJson: string; updatedAt: string; source: string | null }[];
}

export function deleteTeamRankOverrides(teamId: number, kind: "current" | "peak"): void {
  db.prepare("DELETE FROM team_rank_overrides WHERE teamId = ? AND kind = ?").run(teamId, kind);
}

export function addSessionShare(sessionId: number, userId: number, sharedByUserId: number | null): void {
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO session_shares (sessionId, userId, sharedByUserId, createdAt) VALUES (?, ?, ?, ?)")
    .run(sessionId, userId, sharedByUserId, createdAt);
}

export function removeSessionShare(sessionId: number, userId: number): void {
  db.prepare("DELETE FROM session_shares WHERE sessionId = ? AND userId = ?").run(sessionId, userId);
}

export function listSessionShares(sessionId: number): { id: number; sessionId: number; userId: number; sharedByUserId: number | null; createdAt: string }[] {
  return db
    .prepare("SELECT id, sessionId, userId, sharedByUserId, createdAt FROM session_shares WHERE sessionId = ? ORDER BY createdAt DESC")
    .all(sessionId) as { id: number; sessionId: number; userId: number; sharedByUserId: number | null; createdAt: string }[];
}
