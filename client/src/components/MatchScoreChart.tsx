import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { getSessionGameStats } from "../api";
import { GameStatRow } from "../types";

interface Props {
  sessionId: number;
}

export default function MatchScoreChart({ sessionId }: Props) {
  const [rows, setRows] = useState<GameStatRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    setError(null);
    getSessionGameStats(sessionId)
      .then((data) => {
        if (!active) return;
        setRows(data);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err.message || "Failed to load match scores");
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const data = rows
    .filter((row) => typeof row.game === "number")
    .map((row) => ({ t: row.game, score: row.score ?? null }));

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Match scores</h2>
      </div>
      <p className="panel-help">Total team score per match.</p>
      {error && <p className="error">{error}</p>}
      {!error && data.length === 0 && <p>No match scores yet.</p>}
      {data.length > 0 && (
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" tickFormatter={(value) => `G${value}`} />
              <YAxis />
              <Tooltip formatter={(value) => (typeof value === "number" ? value.toFixed(0) : "-")} />
              <Line type="monotone" dataKey="score" stroke="#38bdf8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
