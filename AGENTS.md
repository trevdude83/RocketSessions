# AGENTS.md

## Project
RocketSessions (Node/Express + SQLite) with ScoreboardCam ingest + OCR pipeline.

## Run (local dev)
- Server: from repo root, use your usual start script (npm run dev / start-dev.bat).
- Client: Vite dev server (npm run dev in client).

## ScoreboardCam (separate repo)
See C:\Projects\rocketsessions-scoreboardcam\AGENTS.md for Pi app details.

## Key reminders
- Scoreboard ingest uses device keys (X-Device-Key).
- Scoreboard OCR via OpenAI Vision (server-side only).
- /api/v1/scoreboard endpoints for ingest & status.
- Data retention can purge /data/scoreboards and ingest records.
