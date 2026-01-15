import { db } from "../db.js";
import { extractMetrics } from "../trn/extractMetrics.js";

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const sessionIdArg = process.argv[2] ? Number(process.argv[2]) : null;
const sessionFilter = Number.isFinite(sessionIdArg as number) ? Number(sessionIdArg) : null;

const selectSql = sessionFilter
  ? `SELECT snapshots.id, snapshots.sessionId, snapshots.rawJson, sessions.mode
     FROM snapshots
     JOIN sessions ON sessions.id = snapshots.sessionId
     WHERE snapshots.sessionId = ?`
  : `SELECT snapshots.id, snapshots.sessionId, snapshots.rawJson, sessions.mode
     FROM snapshots
     JOIN sessions ON sessions.id = snapshots.sessionId`;

const rows = sessionFilter
  ? (db.prepare(selectSql).all(sessionFilter) as { id: number; sessionId: number; rawJson: string; mode: string }[])
  : (db.prepare(selectSql).all() as { id: number; sessionId: number; rawJson: string; mode: string }[]);

const update = db.prepare("UPDATE snapshots SET derivedJson = ? WHERE id = ?");

let updated = 0;
let skipped = 0;

const run = db.transaction(() => {
  for (const row of rows) {
    const raw = parseJson(row.rawJson);
    if (!raw) {
      skipped += 1;
      continue;
    }
    const derived = extractMetrics(raw, row.mode);
    update.run(JSON.stringify(derived), row.id);
    updated += 1;
  }
});

run();

const scope = sessionFilter ? `session ${sessionFilter}` : "all sessions";
console.log(`Backfill complete for ${scope}. Updated ${updated} snapshots, skipped ${skipped}.`);
