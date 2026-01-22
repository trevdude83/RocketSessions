import { useEffect, useMemo, useState } from "react";
import { createSession, listTeams } from "../api";
import { SessionDetail, Team } from "../types";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

interface Props {
  onCreated: (detail: SessionDetail) => void;
}

const modeOptions = [
  { value: "solo", label: "Solo (1v1)", count: 1 },
  { value: "2v2", label: "Doubles (2v2)", count: 2 },
  { value: "3v3", label: "Standard (3v3)", count: 3 },
  { value: "4v4", label: "Chaos (4v4)", count: 4 }
];

export default function SessionForm({ onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [mode, setMode] = useState("2v2");
  const [players, setPlayers] = useState<string[]>(["", ""]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [saveTeam, setSaveTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [includeCoachOnEnd, setIncludeCoachOnEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    listTeams()
      .then((data) => {
        const normalized = data.map((team) => ({
          ...team,
          players: Array.isArray(team.players)
            ? team.players
            : safeParsePlayers(team.playersJson)
        }));
        setTeams(normalized);
      })
      .catch(() => null);
  }, []);

  function safeParsePlayers(value?: string) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const selectedTeam = useMemo(() => {
    if (!selectedTeamId) return null;
    return teams.find((team) => String(team.id) === selectedTeamId) ?? null;
  }, [teams, selectedTeamId]);

  const playerCount = useMemo(() => {
    return modeOptions.find((option) => option.value === mode)?.count ?? 2;
  }, [mode]);

  useEffect(() => {
    if (!selectedTeam) return;
    setMode(selectedTeam.mode);
    if (Array.isArray(selectedTeam.players)) {
      setPlayers(selectedTeam.players.map((player) => player.gamertag));
    }
    setSaveTeam(false);
    setTeamName("");
  }, [selectedTeam]);

  const playerInputs = useMemo(() => {
    const next = players.slice(0, playerCount);
    while (next.length < playerCount) next.push("");
    return next;
  }, [players, playerCount]);

  function updatePlayer(index: number, value: string) {
    const next = [...playerInputs];
    next[index] = value;
    setPlayers(next);
  }

  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      const activePlayers = selectedTeam?.players?.map((player) => player.gamertag) ?? playerInputs;
      const detail = await createSession({
        name,
        mode,
        players: selectedTeam ? undefined : activePlayers.map((gamertag) => ({ platform: "xbl", gamertag })),
        teamId: selectedTeam ? Number(selectedTeamId) : undefined,
        teamName: !selectedTeam && saveTeam ? teamName : undefined,
        saveTeam: !selectedTeam && saveTeam ? true : undefined,
        includeCoachOnEnd
      });
      onCreated(detail);
      navigate(`/sessions/${detail.session.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  const activePlayers = selectedTeam?.players?.map((player) => player.gamertag) ?? playerInputs;
  const isValid =
    name.trim().length > 0 &&
    activePlayers.every((player) => player.trim().length > 0) &&
    (!saveTeam || teamName.trim().length > 0);
  const isAdmin = user?.role === "admin";

  return (
    <section className="panel">
      <details className="collapsible">
        <summary>
          <div className="summary-title">
            <h2 className="panel-title">
              <span className="title-icon" aria-hidden="true">+</span>
              Create Session
            </h2>
            <span className="note">Start a new session or reuse a saved team.</span>
          </div>
          <span className="chevron" aria-hidden="true"></span>
        </summary>
        <div className="form">
        <label>
          Saved team (optional)
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
          >
            <option value="">-- No saved team --</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.mode})
              </option>
            ))}
          </select>
        </label>
        <p className="note">If this roster matches a saved team, the session will be linked automatically.</p>
        <label>
          Session name <span className="required" aria-hidden="true">* mandatory</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekend grind"
            required
            aria-required="true"
          />
        </label>
        <label>
          Game mode <span className="required" aria-hidden="true">* mandatory</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            required
            aria-required="true"
            disabled={Boolean(selectedTeam)}
          >
            {modeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {!selectedTeam && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={saveTeam}
              onChange={(e) => setSaveTeam(e.target.checked)}
            />
            Save this team for reuse
          </label>
        )}
        {!selectedTeam && saveTeam && (
          <label>
            Team name <span className="required" aria-hidden="true">* mandatory</span>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Weekend squad"
              required
              aria-required="true"
            />
          </label>
        )}
        {isAdmin && (
          <details className="advanced">
            <summary>Advanced settings (admin only)</summary>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeCoachOnEnd}
                onChange={(e) => setIncludeCoachOnEnd(e.target.checked)}
              />
              Generate AI Coach report when the session ends
            </label>
            <p className="note">The coach report runs once when you click End session.</p>
          </details>
        )}
        {activePlayers.map((value, index) => (
          <label key={index}>
            Player {index + 1} (Xbox gamertag) <span className="required" aria-hidden="true">* mandatory</span>
            <input
              value={value}
              onChange={(e) => updatePlayer(index, e.target.value)}
              required
              aria-required="true"
              disabled={Boolean(selectedTeam)}
            />
          </label>
        ))}
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button onClick={handleCreate} disabled={loading || !isValid}>
              {loading ? "Creating..." : "Start session"}
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
