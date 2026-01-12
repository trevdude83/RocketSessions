import { Player, SnapshotSummary } from "../types";
import { formatRank } from "../utils/rank";

interface Props {
  player: Player;
  baseline: SnapshotSummary | null | undefined;
  latest: SnapshotSummary | null | undefined;
  delta: Record<string, number | null> | undefined;
}

function formatValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "-";
}

function formatDelta(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const fixed = Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "-";
  return value > 0 ? `+${fixed}` : fixed;
}

function formatRankLabel(metrics: SnapshotSummary["derived"] | null | undefined): string | null {
  const tierIndex = metrics?.rankTierIndex;
  if (typeof tierIndex === "number" && Number.isFinite(tierIndex)) {
    const divisionIndex = typeof metrics?.rankDivisionIndex === "number" ? metrics.rankDivisionIndex : 0;
    return formatRank(tierIndex * 10 + divisionIndex);
  }
  const rank = metrics?.rank;
  if (typeof rank === "string" && rank.trim().length > 0) {
    if (/^\d+$/.test(rank.trim())) {
      return formatRank(Number(rank.trim()));
    }
    return rank;
  }
  const points = metrics?.rankPoints;
  if (typeof points !== "number" || !Number.isFinite(points)) return null;
  return formatRank(points);
}

export default function PlayerCard({ player, baseline, latest, delta }: Props) {
  const latestMetrics = latest?.derived;
  const rankLabel = formatRankLabel(latestMetrics ?? baseline?.derived);
  return (
    <article className="card">
      <div className="player-header">
        {latestMetrics?.avatarUrl ? (
          <img
            className="player-avatar"
            src={latestMetrics.avatarUrl}
            alt={`${player.gamertag} avatar`}
          />
        ) : (
          <div className="player-avatar placeholder" />
        )}
        <h3>{player.gamertag}</h3>
      </div>
      <div className="metrics">
        <div>
          <span>Wins</span>
          <strong>{formatValue(latestMetrics?.wins)}</strong>
          <small>{formatDelta(delta?.wins)}</small>
        </div>
        <div>
          <span>Goals</span>
          <strong>{formatValue(latestMetrics?.goals)}</strong>
          <small>{formatDelta(delta?.goals)}</small>
        </div>
        <div>
          <span>Assists</span>
          <strong>{formatValue(latestMetrics?.assists)}</strong>
          <small>{formatDelta(delta?.assists)}</small>
        </div>
        <div>
          <span>Saves</span>
          <strong>{formatValue(latestMetrics?.saves)}</strong>
          <small>{formatDelta(delta?.saves)}</small>
        </div>
        <div>
          <span>Shots</span>
          <strong>{formatValue(latestMetrics?.shots)}</strong>
          <small>{formatDelta(delta?.shots)}</small>
        </div>
        <div>
          <span>Goal/Shot</span>
          <strong>{formatValue(latestMetrics?.goalShotRatio)}</strong>
          <small>{formatDelta(delta?.goalShotRatio)}</small>
        </div>
        <div>
          <span>MMR</span>
          <strong>{formatValue(latestMetrics?.mmr)}</strong>
          <small>{formatDelta(delta?.mmr)}</small>
        </div>
      </div>
      {rankLabel && (
        <p className="rank">
          {latestMetrics?.rankIconUrl && (
            <img className="rank-icon" src={latestMetrics.rankIconUrl} alt={`${rankLabel} icon`} />
          )}
          Rank: {rankLabel}
        </p>
      )}
    </article>
  );
}
