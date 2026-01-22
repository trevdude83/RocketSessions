import { Player, SnapshotSummary } from "../types";

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

function deltaClass(value: number | null | undefined) {
  if (typeof value !== "number") return "";
  if (value < 0) return "delta-negative";
  if (value > 0) return "delta-positive";
  return "";
}

export default function PlayerCard({ player, baseline, latest, delta }: Props) {
  const latestMetrics = latest?.derived;
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
          <small className={deltaClass(delta?.wins)}>{formatDelta(delta?.wins)}</small>
        </div>
        <div>
          <span>Goals</span>
          <strong>{formatValue(latestMetrics?.goals)}</strong>
          <small className={deltaClass(delta?.goals)}>{formatDelta(delta?.goals)}</small>
        </div>
        <div>
          <span>Assists</span>
          <strong>{formatValue(latestMetrics?.assists)}</strong>
          <small className={deltaClass(delta?.assists)}>{formatDelta(delta?.assists)}</small>
        </div>
        <div>
          <span>Saves</span>
          <strong>{formatValue(latestMetrics?.saves)}</strong>
          <small className={deltaClass(delta?.saves)}>{formatDelta(delta?.saves)}</small>
        </div>
        <div>
          <span>Shots</span>
          <strong>{formatValue(latestMetrics?.shots)}</strong>
          <small className={deltaClass(delta?.shots)}>{formatDelta(delta?.shots)}</small>
        </div>
        <div>
          <span>Goal/Shot</span>
          <strong>{formatValue(latestMetrics?.goalShotRatio)}</strong>
          <small className={deltaClass(delta?.goalShotRatio)}>{formatDelta(delta?.goalShotRatio)}</small>
        </div>
        <div>
          <span>Score</span>
          <strong>{formatValue(latestMetrics?.score)}</strong>
          <small className={deltaClass(delta?.score)}>{formatDelta(delta?.score)}</small>
        </div>
      </div>
    </article>
  );
}
