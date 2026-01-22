import { useEffect, useMemo, useState } from "react";
import { getTimeseries } from "../api";
import { Player, TimeseriesPoint } from "../types";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";

interface Props {
  sessionId: number;
  players: Player[];
}

const metricOptions = [
  { value: "wins", label: "Wins" },
  { value: "losses", label: "Losses" },
  { value: "goals", label: "Goals" },
  { value: "assists", label: "Assists" },
  { value: "saves", label: "Saves" },
  { value: "shots", label: "Shots" },
  { value: "score", label: "Score" },
  { value: "winRate", label: "Win Rate" },
  { value: "goalShotRatio", label: "Goal/Shot Ratio" }
];

const palette = ["#3772ff", "#f56b2a", "#10b981", "#f59e0b"];
const additiveMetrics = new Set([
  "wins",
  "losses",
  "goals",
  "assists",
  "saves",
  "shots",
  "score"
]);

function mergeSeries(series: { key: string; points: TimeseriesPoint[] }[]) {
  const map = new Map<number, Record<string, number | null> & { t: number }>();
  series.forEach(({ key, points }) => {
    points.forEach((point) => {
      const existing = map.get(point.t) ?? { t: point.t };
      existing[key] = point.v;
      map.set(point.t, existing);
    });
  });
  return Array.from(map.values()).sort((x, y) => x.t - y.t);
}

export default function ChartsPanel({ sessionId, players }: Props) {
  const [metricA, setMetricA] = useState("wins");
  const [metricB, setMetricB] = useState("goals");
  const [metricC, setMetricC] = useState("shots");
  const [dataA, setDataA] = useState<any[]>([]);
  const [dataB, setDataB] = useState<any[]>([]);
  const [dataC, setDataC] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"cumulative" | "perGame">("cumulative");

  const lineKeys = useMemo(
    () => players.map((player, index) => ({ key: `p${player.id}`, label: player.gamertag, color: palette[index % palette.length] })),
    [players]
  );

  useEffect(() => {
    if (players.length === 0) return;
    Promise.all(players.map((player) => getTimeseries(sessionId, player.id, metricA)))
      .then((series) => {
        const merged = mergeSeries(series.map((points, index) => ({ key: lineKeys[index]?.key ?? `p${players[index].id}`, points })));
        setDataA(merged);
      });
  }, [sessionId, players, metricA, lineKeys]);

  useEffect(() => {
    if (players.length === 0) return;
    Promise.all(players.map((player) => getTimeseries(sessionId, player.id, metricB)))
      .then((series) => {
        const merged = mergeSeries(series.map((points, index) => ({ key: lineKeys[index]?.key ?? `p${players[index].id}`, points })));
        setDataB(merged);
      });
  }, [sessionId, players, metricB, lineKeys]);

  useEffect(() => {
    if (players.length === 0) return;
    Promise.all(players.map((player) => getTimeseries(sessionId, player.id, metricC)))
      .then((series) => {
        const merged = mergeSeries(series.map((points, index) => ({ key: lineKeys[index]?.key ?? `p${players[index].id}`, points })));
        setDataC(merged);
      });
  }, [sessionId, players, metricC, lineKeys]);

  const charts = useMemo(() => {
    return [
      { id: "chart-a", metric: metricA, setMetric: setMetricA, data: dataA },
      { id: "chart-b", metric: metricB, setMetric: setMetricB, data: dataB },
      { id: "chart-c", metric: metricC, setMetric: setMetricC, data: dataC }
    ];
  }, [metricA, metricB, metricC, dataA, dataB, dataC]);

  function toPerGame(
    data: Record<string, number | null>[],
    keys: string[]
  ): Record<string, number | null>[] {
    const prev: Record<string, number | null> = {};
    return data.map((row) => {
      const next: Record<string, number | null> & { t: number } = { t: (row as any).t };
      keys.forEach((key) => {
        const current = row[key];
        const prevValue = prev[key];
        if (typeof current === "number" && typeof prevValue === "number") {
          next[key] = current - prevValue;
        } else {
          next[key] = null;
        }
        if (typeof current === "number") {
          prev[key] = current;
        }
      });
      return next;
    });
  }

  function getChartData(metric: string, data: Record<string, number | null>[]) {
    const sorted = data.slice().sort((a, b) => Number(a.t) - Number(b.t));
    if (viewMode === "perGame" && additiveMetrics.has(metric)) {
      const withBaseline = toPerGame(sorted, lineKeys.map((line) => line.key));
      return withBaseline.filter((row) => typeof row.t === "number" && row.t > 0);
    }
    return sorted.filter((row) => typeof row.t === "number" && row.t > 0);
  }

  if (players.length === 0) return null;

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Session trends</h2>
        <div className="toggle-group" role="group" aria-label="Trend view">
          <button
            className={viewMode === "cumulative" ? "toggle-button active" : "toggle-button"}
            type="button"
            onClick={() => setViewMode("cumulative")}
          >
            Cumulative
          </button>
          <button
            className={viewMode === "perGame" ? "toggle-button active" : "toggle-button"}
            type="button"
            onClick={() => setViewMode("perGame")}
          >
            Per-game
          </button>
        </div>
      </div>
      <div className="charts">
        {charts.map((chart) => (
          <div className="chart" key={chart.id}>
            <div className="chart-header">
              <select value={chart.metric} onChange={(e) => chart.setMetric(e.target.value)}>
                {metricOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-body">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={getChartData(chart.metric, chart.data)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" tickFormatter={(value) => `G${value}`} />
                  <YAxis />
                  <Tooltip />
                  {lineKeys.map((line) => (
                    <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div className="legend">
                {lineKeys.map((line) => (
                  <span key={line.key} style={{ color: line.color }}>{line.label}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
