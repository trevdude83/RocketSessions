import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PlayerInput, PlayerRow, SessionRow, SnapshotRow, TeamRow, SessionTeamStatsRow } from "./types.js";

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
    lastMatchAt TEXT
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
`);

try {
  db.exec("ALTER TABLE sessions ADD COLUMN matchIndex INTEGER NOT NULL DEFAULT 0");
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
  db.exec("ALTER TABLE snapshots ADD COLUMN matchIndex INTEGER");
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

export function createSession(
  userId: number | null,
  name: string,
  mode: string,
  pollingIntervalSeconds: number,
  teamId: number | null,
  includeCoachOnEnd: boolean
): SessionRow {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO sessions (userId, name, mode, createdAt, pollingIntervalSeconds, isActive, matchIndex, teamId, includeCoachOnEnd, isEnded) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, 0)"
  );
  const result = stmt.run(userId, name, mode, createdAt, pollingIntervalSeconds, teamId, includeCoachOnEnd ? 1 : 0);
  return {
    id: Number(result.lastInsertRowid),
    userId,
    name,
    mode,
    createdAt,
    pollingIntervalSeconds,
    isActive: 1,
    matchIndex: 0,
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
  const deleteSessionShares = db.prepare("DELETE FROM session_shares WHERE sessionId = ?");

  const run = db.transaction(() => {
    deleteSnapshots.run(sessionId);
    deletePlayers.run(sessionId);
    deleteTeamStats.run(sessionId);
    deleteCoachReports.run(sessionId);
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
