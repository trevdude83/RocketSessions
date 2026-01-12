import "dotenv/config";
﻿import express from "express";
import sessionsRouter from "./routes/sessions.js";
import { db, getSetting } from "./db.js";
import fs from "fs";
import path from "path";
import { startPolling } from "./sessionManager.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json({ limit: "1mb" }));
app.use("/api", sessionsRouter);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

app.listen(port, () => {
  const savedKey = getSetting("TRN_API_KEY");
  let key = savedKey || process.env.TRN_API_KEY;
  const savedOpenAi = getSetting("OPENAI_API_KEY");
  const savedModel = getSetting("OPENAI_MODEL");
  if (!key || !savedOpenAi || !savedModel) {
    const settingsPath = path.join(path.dirname(db.name), "app-settings.json");
    if (fs.existsSync(settingsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as { TRN_API_KEY?: string; OPENAI_API_KEY?: string; OPENAI_MODEL?: string };
        key = key || parsed.TRN_API_KEY;
        if (!process.env.OPENAI_API_KEY && parsed.OPENAI_API_KEY) {
          process.env.OPENAI_API_KEY = parsed.OPENAI_API_KEY;
        }
        if (!process.env.OPENAI_MODEL && parsed.OPENAI_MODEL) {
          process.env.OPENAI_MODEL = parsed.OPENAI_MODEL;
        }
      } catch {}
    }
  }
  if (key && !process.env.TRN_API_KEY) {
    process.env.TRN_API_KEY = key;
  }
  if (savedOpenAi && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = savedOpenAi;
  }
  if (savedModel && !process.env.OPENAI_MODEL) {
    process.env.OPENAI_MODEL = savedModel;
  }
  const activeSessions = db
    .prepare("SELECT id, pollingIntervalSeconds FROM sessions WHERE isActive = 1")
    .all() as { id: number; pollingIntervalSeconds: number }[];

  activeSessions.forEach((session) => {
    startPolling(session.id, session.pollingIntervalSeconds);
  });

  console.log(`Server listening on http://localhost:${port}`);
});
