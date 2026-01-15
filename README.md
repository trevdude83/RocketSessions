# RocketSessions

A community-built Rocket League session manager focused on helping players review performance over time. This project is a personal, non-commercial tool created to improve the player experience with clear, session-based stats, trends, and coaching insights.

## Community-first intent

This project is built for the Rocket League community and has **no commercial ambitions**. It is an unofficial, fan-made tool intended to help players learn and improve. If you are reviewing access to official Rocket League APIs, please consider this as a community support project that prioritizes transparency and player benefit over monetization.

## Disclaimer

Rocket League is a trademark of Psyonix, LLC. This project is unaffiliated with and not endorsed by Psyonix or Epic Games.

## What it does

- Track Rocket League sessions with two Xbox gamertags.
- Store snapshots locally in SQLite for reliable session history.
- Show deltas and trend charts per session.
- Support manual snapshot uploads when automated polling is unavailable.
- Generate AI Coach reports grounded in the stored metrics.

## Quick start

1) Install dependencies from the repo root:

```bash
npm install
```

2) Configure the player stats API:

You can set the API key and base URL in System Admin > API settings, or via a `.env` file at the repo root (see `.env.example`).

3) Run the dev servers:

```bash
npm run dev
```

- Server: http://localhost:3001
- Client: http://localhost:5173

## Usage overview

- Create a session with two Xbox gamertags.
- The server captures a baseline snapshot and polls on the configured interval.
- Click "Refresh now" to trigger an immediate server-side fetch without starting another polling loop.
- Stop or end a session to retain the stored history.

## AI Coach (optional)

Enable AI Coach by setting OpenAI credentials:

```bash
# PowerShell
$env:OPENAI_API_KEY="your_openai_key"
$env:OPENAI_MODEL="gpt-4o-mini"
```

Then run:

```bash
npm run dev
```

Open a session and click "Generate Coach Report" in the AI Coach panel. The server builds a compact coach packet from stored snapshots and the model returns a strict JSON report for the UI.

## Demo

Create a demo session quickly:

```bash
# POST http://localhost:3001/api/demo
```

## Production note

This repo assumes the client and server run separately in development. For production, build both and serve the client with a static host or wire Express to serve `client/dist`.

## Known limitations

- AI Coach guidance is based on statistical aggregates (no replay or positional context).
- If playlistAverage data is missing, coaching advice is less specific.
- Player stats API responses can vary by account and region; missing stats are stored as `null`.
- If the stats API rate limits or is unavailable, polling retries with exponential backoff and then skips that snapshot.
- This is an unofficial personal project; API changes may break parsing.

## License

MIT
