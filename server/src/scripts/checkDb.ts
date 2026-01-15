import { db, getSetting } from "../db.js";

console.log({
  dbPath: db.name,
  trnKey: getSetting("TRN_API_KEY")
});