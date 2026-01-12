import { useEffect, useMemo, useState } from "react";
import { getTeam, updateTeamName } from "../api";
import { Team } from "../types";

interface Props {
  teamId: number;
  currentSessionId?: number;
}

export default function TeamHistory({ teamId, currentSessionId }: Props) {
  const [team, setTeam] = useState<Team | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getTeam(teamId)
      .then((data) => {
        setTeam(data);
        setNameDraft(data.name);
      })
      .catch((err) => setError(err.message || "Failed to load team history"));
  }, [teamId]);

  const stats = useMemo(() => team?.stats ?? [], [team?.stats]);

  async function handleSaveName() {
    if (!team) return;
    setSaving(true);
    setError(null);
    try {
      await updateTeamName(team.id, nameDraft);
      const refreshed = await getTeam(team.id);
      setTeam(refreshed);
    } catch (err: any) {
      setError(err.message || "Failed to update team name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel team-history">
      <div className="section-header">
        <div>
          <h2>Team History</h2>
          <p className="panel-help">Session totals are saved when you end a session.</p>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {team && (
        <div className="team-history-meta">
          <label>
            Team name
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Team name"
            />
          </label>
          <button onClick={handleSaveName} disabled={saving || nameDraft.trim().length === 0}>
            {saving ? "Saving..." : "Save name"}
          </button>
          <div className="note">Team id: {team.id}</div>
        </div>
      )}
      {stats.length === 0 && <p>No team history yet. End a session to save totals.</p>}
      {stats.length > 0 && (
        <div className="team-history-table">
          <div className="team-history-row header">
            <span>Session</span>
            <span>Date</span>
            <span>Wins</span>
            <span>Losses</span>
            <span>Goals</span>
            <span>Assists</span>
            <span>Saves</span>
            <span>Shots</span>
            <span>Win rate</span>
            <span>Shot accuracy</span>
          </div>
          {stats.map((row) => {
            const derived = row.derivedTeam ?? {};
            const records = row.records ?? {};
            const recordLabel = (key: string) => formatRecord(records[key]);
            return (
              <div
                className={`team-history-row${row.sessionId === currentSessionId ? " current" : ""}`}
                key={row.id}
              >
                <span>#{row.sessionId}</span>
                <span>{formatDate(row.createdAt)}</span>
                <span>{formatMetric(derived.wins, recordLabel("wins"))}</span>
                <span>{formatMetric(derived.losses, recordLabel("losses"))}</span>
                <span>{formatMetric(derived.goals, recordLabel("goals"))}</span>
                <span>{formatMetric(derived.assists, recordLabel("assists"))}</span>
                <span>{formatMetric(derived.saves, recordLabel("saves"))}</span>
                <span>{formatMetric(derived.shots, recordLabel("shots"))}</span>
                <span>{formatPercent(derived.winRate, recordLabel("winRate"))}</span>
                <span>{formatPercent(derived.shotAccuracy, recordLabel("shotAccuracy"))}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatMetric(value: number | null | undefined, record: string | null) {
  const base = typeof value === "number" ? value.toLocaleString() : "-";
  return record ? `${base} (${record})` : base;
}

function formatPercent(value: number | null | undefined, record: string | null) {
  if (typeof value !== "number") return "-";
  const pct = `${(value * 100).toFixed(1)}%`;
  return record ? `${pct} (${record})` : pct;
}

function formatRecord(value: string | undefined) {
  if (!value) return null;
  if (value.includes("high") && value.includes("low")) return "high/low";
  if (value.includes("high")) return "high";
  if (value.includes("low")) return "low";
  return null;
}
