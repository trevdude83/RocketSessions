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
import { formatRank, formatRankShort } from "../utils/rank";

interface Props {
  sessionId: number;
  players: Player[];
}

const palette = ["#3772ff", "#f56b2a", "#10b981", "#f59e0b"];
const MAX_TIER_INDEX = 22;
const DIVISIONS_PER_TIER = 4;
const MAX_RANK_POINTS = MAX_TIER_INDEX * DIVISIONS_PER_TIER + (DIVISIONS_PER_TIER - 1);

function toScaledRank(points: number | null): number | null {
  if (points === null || !Number.isFinite(points)) return null;
  const tierIndex = Math.floor(points / 10);
  const divisionRaw = points % 10;
  const divisionIndex = Math.min(DIVISIONS_PER_TIER - 1, Math.max(0, divisionRaw));
  return tierIndex * DIVISIONS_PER_TIER + divisionIndex;
}

function formatRankFromScaled(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unknown";
  const tierIndex = Math.floor(value / DIVISIONS_PER_TIER);
  const divisionIndex = value % DIVISIONS_PER_TIER;
  return formatRank(tierIndex * 10 + divisionIndex);
}

function formatRankShortFromScaled(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unknown";
  const tierIndex = Math.floor(value / DIVISIONS_PER_TIER);
  return formatRankShort(tierIndex * 10);
}

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

export default function RankChart({ sessionId, players }: Props) {
  const [data, setData] = useState<any[]>([]);
  const lineKeys = useMemo(
    () => players.map((player, index) => ({ key: `p${player.id}`, label: player.gamertag, color: palette[index % palette.length] })),
    [players]
  );

  const rankTicks = useMemo(() => {
    const values = data
      .flatMap((point) => lineKeys.map((line) => point[line.key]))
      .filter((value) => typeof value === "number") as number[];
    if (values.length === 0) return [];
    const max = Math.max(...values);
    const min = Math.min(...values);
    const buffer = 2;
    const minTick = Math.max(0, Math.floor(min) - buffer);
    const maxTick = Math.min(MAX_RANK_POINTS, Math.ceil(max) + buffer);
    const ticks: number[] = [];
    for (let tick = minTick; tick <= maxTick; tick += 1) {
      ticks.push(tick);
    }
    return ticks;
  }, [data, lineKeys]);


  useEffect(() => {
    if (players.length === 0) return;
    Promise.all(players.map((player) => getTimeseries(sessionId, player.id, "rankPoints")))
      .then((series) => {
        const merged = mergeSeries(
          series.map((points, index) => ({
            key: lineKeys[index]?.key ?? `p${players[index].id}`,
            points: points.map((point) => ({ ...point, v: toScaledRank(point.v) }))
          }))
        );
        setData(merged);
      });
  }, [sessionId, players, lineKeys]);

  const hasData = useMemo(
    () => data.some((point) => lineKeys.some((line) => typeof point[line.key] === "number")),
    [data, lineKeys]
  );

  if (players.length === 0) return null;

  return (
    <section className="panel full">
      <h2>Rank progression</h2>
      {!hasData && <p>No rank data yet. Rank will appear after a new snapshot.</p>}
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(value) => `G${value}`} />
            <YAxis
              tickFormatter={(value) => (Number(value) % DIVISIONS_PER_TIER === 0 ? formatRankShortFromScaled(Number(value)) : "")}
              ticks={rankTicks.length > 0 ? rankTicks : undefined}
              interval={0}
              domain={
                rankTicks.length > 0
                  ? [rankTicks[0], rankTicks[rankTicks.length - 1]]
                  : [0, MAX_RANK_POINTS]
              }
              width={110}
              tick={{ fontSize: 12, fontWeight: 600 }}
            />
            <Tooltip formatter={(value) => formatRankFromScaled(typeof value === "number" ? value : null)} />
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
    </section>
  );
}
