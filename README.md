# Rocket League Session Tracker

A local, unofficial Rocket League session tracker for two Xbox players. This project uses Tracker Network data via `trn-rocket-league`, stores snapshots in SQLite, and visualizes deltas and trends.

## Disclaimer
Rocket League is a trademark of Psyonix, LLC. This project is unaffiliated with and not endorsed by Psyonix, Epic Games, or Tracker Network.

## Setup

1) Install dependencies from the repo root:

```bash
npm install
```

2) (Optional) Set your TRN API key if required by your account (or use a `.env` file):

```bash
# PowerShell
$env:TRN_API_KEY="your_key_here"
```

You can also create a `.env` file at the repo root (see `.env.example`).

3) Run the dev servers:

```bash
npm run dev
```

- Server: http://localhost:3001
- Client: http://localhost:5173

## Usage

- Create a session with two Xbox gamertags.
- The server fetches a baseline snapshot and polls every 60 seconds by default.
- Click "Refresh now" to trigger an immediate server-side fetch without starting another polling loop.
- Stop a session to stop polling while keeping historical data.

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

Open a session and click "Generate Coach Report" in the AI Coach panel. You can also set the OpenAI key in the Advanced page under API settings. The server builds a compact coach packet from stored snapshots and the model returns a strict JSON report for the UI.

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
- Tracker Network responses can vary by account and region; missing stats are stored as `null`.
- If TRN rate limits or the API is unavailable, polling retries with exponential backoff and then skips that snapshot.
- This is an unofficial personal project; API changes may break parsing.
