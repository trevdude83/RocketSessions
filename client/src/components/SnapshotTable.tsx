import { useState } from "react";
import { Player, SnapshotSummary } from "../types";

interface Props {
  players: Player[];
  snapshots: SnapshotSummary[];
}

function formatValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "-";
}

export default function SnapshotTable({ players, snapshots }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const playerMap = new Map(players.map((p) => [p.id, p.gamertag]));
  const count = snapshots.length;

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Recent snapshots</h2>
        <button className="ghost" onClick={() => setIsOpen((prev) => !prev)}>
          {isOpen ? "Hide" : "Show"} ({count})
        </button>
      </div>
      {isOpen && (
        <div className="table">
          <div className="row header">
            <span>Timestamp</span>
            <span>Player</span>
            <span>Wins</span>
            <span>Goals</span>
            <span>Shots</span>
            <span>Win Rate</span>
          </div>
          {snapshots.map((snapshot) => (
            <div className="row" key={snapshot.id}>
              <span>{new Date(snapshot.capturedAt).toLocaleString()}</span>
              <span>{playerMap.get(snapshot.playerId) ?? "Unknown"}</span>
              <span>{formatValue(snapshot.derived?.wins)}</span>
              <span>{formatValue(snapshot.derived?.goals)}</span>
              <span>{formatValue(snapshot.derived?.shots)}</span>
              <span>{formatValue(snapshot.derived?.winRate)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}