import { SummaryResponse } from "../types";

interface Props {
  stats: SummaryResponse["teamStats"] | undefined;
}

function formatValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "-";
}

export default function TeamSessionStats({ stats }: Props) {
  return (
    <section className="panel team-stats">
      <div className="section-header">
        <h2>Team Session Stats</h2>
      </div>
      <div className="metrics">
        <div>
          <span>Session wins</span>
          <strong>{formatValue(stats?.wins)}</strong>
        </div>
        <div>
          <span>Session losses</span>
          <strong>{formatValue(stats?.losses)}</strong>
        </div>
        <div>
          <span>Session win rate</span>
          <strong>{formatValue(stats?.winRate)}</strong>
        </div>
        <div>
          <span>Session game count</span>
          <strong>{formatValue(stats?.gameCount)}</strong>
        </div>
      </div>
    </section>
  );
}
