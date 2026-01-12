import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRawSnapshots, getSessionDetail, backfillSessionSnapshots, backfillSnapshot } from "../api";
import { Player, SessionDetail } from "../types";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";

interface RawSnapshot {
  id: number;
  playerId: number;
  capturedAt: string;
  matchIndex: number | null;
  raw: unknown;
  derived: unknown;
}

export default function AdvancedSession() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [snapshots, setSnapshots] = useState<RawSnapshot[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | "all">("all");
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [backfillingAll, setBackfillingAll] = useState(false);
  const [backfillingId, setBackfillingId] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    getSessionDetail(sessionId)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    getRawSnapshots(sessionId, limit)
      .then(setSnapshots)
      .catch((err) => setError(err.message));
  }, [sessionId, limit]);

  const players = detail?.players ?? [];

  const filtered = useMemo(() => {
    if (selectedPlayerId === "all") return snapshots;
    return snapshots.filter((snapshot) => snapshot.playerId === selectedPlayerId);
  }, [snapshots, selectedPlayerId]);

  async function handleBackfillAll() {
    if (!sessionId) return;
    setBackfillingAll(true);
    setError(null);
    setBackfillMessage(null);
    try {
      const result = await backfillSessionSnapshots(sessionId);
      const updated = await getRawSnapshots(sessionId, limit);
      setSnapshots(updated);
      setBackfillMessage(`Recomputed ${result.updated} snapshots (skipped ${result.skipped}).`);
    } catch (err: any) {
      setError(err.message || "Failed to backfill snapshots");
      setBackfillMessage("Failed to backfill snapshots.");
    } finally {
      setBackfillingAll(false);
    }
  }

  async function handleBackfillOne(snapshotId: number) {
    if (!sessionId) return;
    setBackfillingId(snapshotId);
    setError(null);
    setBackfillMessage(null);
    try {
      await backfillSnapshot(snapshotId);
      const updated = await getRawSnapshots(sessionId, limit);
      setSnapshots(updated);
      setBackfillMessage("Snapshot recomputed.");
    } catch (err: any) {
      setError(err.message || "Failed to backfill snapshot");
      setBackfillMessage("Failed to backfill snapshot.");
    } finally {
      setBackfillingId(null);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">Advanced Settings</div>
          </div>
          <div className="banner-actions">
            <details className="menu">
              <summary aria-label="Advanced menu">
                <span className="burger">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </summary>
              <div className="menu-panel">
                <ThemeToggle />
              </div>
            </details>
            <button className="ghost" onClick={() => navigate(`/sessions/${sessionId}`)}>Back</button>
          </div>
        </div>
      </header>

      <main className="page-content">
        {error && <p className="error">{error}</p>}

        <section className="panel">
          <div className="section-header">
            <h2>Session data tools</h2>
          </div>
          <p className="panel-help">Refresh derived values and control how many snapshots are displayed.</p>
          <div className="panel-grid">
            <div className="panel-block">
              <h3>Recompute derived data</h3>
              <div className="form">
                <div className="actions">
                  <button onClick={handleBackfillAll} disabled={backfillingAll || !sessionId}>
                    {backfillingAll ? "Recomputing..." : "Recompute derived data (session)"}
                  </button>
                  {backfillMessage && <span>{backfillMessage}</span>}
                </div>
              </div>
            </div>
            <div className="panel-block">
              <h3>Snapshot filters</h3>
              <div className="form">
                <label>
                  Player filter
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedPlayerId(value === "all" ? "all" : Number(value));
                    }}
                  >
                    <option value="all">All players</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.gamertag}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Snapshot limit
                  <input
                    type="number"
                    value={limit}
                    min={10}
                    max={200}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Snapshot history</h2>
          </div>
          <p className="panel-help">Raw and derived snapshot payloads. Expand only when needed.</p>
          <details className="advanced">
            <summary>Show snapshots</summary>
            <div className="raw-list">
              {filtered.map((snapshot) => (
                <details key={snapshot.id} className="raw-item">
                  <summary>
                    <span>Game {snapshot.matchIndex ?? "-"}</span>
                    <span>{new Date(snapshot.capturedAt).toLocaleString()}</span>
                    <span>{playerName(players, snapshot.playerId)}</span>
                    <button
                      className="ghost"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleBackfillOne(snapshot.id);
                      }}
                      disabled={backfillingId === snapshot.id}
                    >
                      {backfillingId === snapshot.id ? "Recomputing..." : "Recompute"}
                    </button>
                  </summary>
                  <div className="raw-columns">
                    <div>
                      <h3>Derived</h3>
                      <pre>{JSON.stringify(snapshot.derived, null, 2)}</pre>
                    </div>
                    <div>
                      <h3>Raw</h3>
                      <pre>{JSON.stringify(snapshot.raw, null, 2)}</pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </details>
        </section>

      </main>
      <footer className="footer">
        <div className="footer-banner">
          <div className="footer-meta">
            <nav className="footer-links">
              <a href="https://github.com/trevdude83/RocketSessions" aria-label="Find out more">Find out more</a>
              <a href="#" aria-label="Contact">Contact</a>
            </nav>
            <BuildInfo />
          </div>
        </div>
      </footer>
    </div>
  );
}

function playerName(players: Player[], playerId: number) {
  return players.find((player) => player.id === playerId)?.gamertag ?? "Unknown";
}
