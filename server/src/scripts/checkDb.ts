import { db, getSetting } from "../db.js";

console.log({
  dbPath: db.name,
  playerStatsKey: getSetting("PLAYER_STATS_API_KEY") || getSetting("TRN_API_KEY"),
  playerStatsBaseUrl: getSetting("PLAYER_STATS_API_BASE_URL")
});
