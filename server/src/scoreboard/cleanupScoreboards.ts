import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { db, getSetting } from "../db.js";

type IngestRow = { id: number; receivedAt: string };

export async function cleanupScoreboards(): Promise<void> {
  const retentionRaw = getSetting("SCOREBOARD_RETENTION_DAYS");
  const retentionDays = retentionRaw ? Number(retentionRaw) : null;
  if (!Number.isFinite(retentionDays) || retentionDays === null) {
    console.log("Scoreboard retention is not configured. Set SCOREBOARD_RETENTION_DAYS to enable cleanup.");
    return;
  }
  if (retentionDays < 0) {
    console.log("Scoreboard retention must be a positive number.");
    return;
  }

  const cutoff = Date.now() - Math.floor(retentionDays) * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoff).toISOString();
  const ingests = db
    .prepare("SELECT id, receivedAt FROM scoreboard_ingests WHERE receivedAt < ?")
    .all(cutoffIso) as IngestRow[];

  if (ingests.length === 0) {
    console.log("No scoreboard ingests to clean.");
    return;
  }

  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dataDir = path.join(baseDir, "data", "scoreboards");

  const deleteImagesStmt = db.prepare("DELETE FROM scoreboard_ingest_images WHERE ingestId = ?");
  const deleteIngestStmt = db.prepare("DELETE FROM scoreboard_ingests WHERE id = ?");

  for (const ingest of ingests) {
    const ingestDir = path.join(dataDir, String(ingest.id));
    try {
      await fs.rm(ingestDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to remove images for ingest ${ingest.id}:`, (error as Error).message);
    }
    deleteImagesStmt.run(ingest.id);
    deleteIngestStmt.run(ingest.id);
  }

  console.log(`Cleaned ${ingests.length} scoreboard ingests older than ${cutoffIso}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cleanupScoreboards().catch((error) => {
    console.error("Scoreboard cleanup failed:", error);
    process.exit(1);
  });
}
