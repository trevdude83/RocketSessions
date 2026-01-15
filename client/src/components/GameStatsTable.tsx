import { useEffect, useState } from "react";
import { getSessionGameStats } from "../api";
import { GameStatRow } from "../types";

interface GameStatsTableProps {
  sessionId: number;
  gameCount?: number | null;
}

export default function GameStatsTable({ sessionId, gameCount }: GameStatsTableProps) {
  const [rows, setRows] = useState<GameStatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getSessionGameStats(sessionId)
      .then((data) => {
        if (!active) return;
        setRows(data);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err.message || "Failed to load game stats");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId, gameCount]);

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Game stats</h2>
      </div>
      <p className="panel-help">Per-game totals for the current session.</p>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading game stats...</p>}
      {!loading && rows.length === 0 && <p>No game data yet.</p>}
      {rows.length > 0 && (
        <div className="game-stats-table">
          <div className="game-stats-row header">
            <span>Game</span>
            <span>Result</span>
            <span>Goals</span>
            <span>Shots</span>
            <span>Assists</span>
            <span>Saves</span>
          </div>
          {rows.map((row) => (
            <div key={row.game} className="game-stats-row">
              <span>G{row.game}</span>
              <span>{row.result}</span>
              <span>{formatValue(row.goals)}</span>
              <span>{formatValue(row.shots)}</span>
              <span>{formatValue(row.assists)}</span>
              <span>{formatValue(row.saves)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatValue(value: number | null) {
  if (typeof value !== "number") return "-";
  return value.toString();
}
