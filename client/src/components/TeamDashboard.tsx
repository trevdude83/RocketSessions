import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { generateTeamCoachReport, getLatestTeamCoachReport, getTeam, getTeamCurrentRanks, getTeamPeakRatings, listTeamAggregateCoachReports, listTeamCoachReports } from "../api";
import { Team, TeamAggregateCoachReport, TeamCoachReportListItem, TeamPlayerCurrentRank, TeamPlayerPeakRating } from "../types";
import { formatRank } from "../utils/rank";
import ThemeToggle from "./ThemeToggle";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const metricHelp = {
  sessionsCompleted: "Count of completed sessions with saved totals.",
  averageGamesPlayed: "Average matches played per session.",
  bestGoalsPerGame: "Highest session goals per game.",
  bestSavesPerGame: "Highest session saves per game.",
  bestWinRate: "Highest session win rate from wins and losses.",
  bestShotAccuracy: "Highest session shot accuracy (goals / shots).",
  latestSession: "Most recent completed session date.",
  sessionWinRate: "Win rate for the session (wins / matches).",
  sessionWins: "Total wins recorded in the session.",
  sessionLosses: "Total losses recorded in the session.",
  sessionGoals: "Total goals recorded in the session.",
  sessionAssists: "Total assists recorded in the session.",
  sessionSaves: "Total saves recorded in the session.",
  sessionShots: "Total shots recorded in the session.",
  goalsPerGame: "Session goals divided by matches played.",
  shotsPerGame: "Session shots divided by matches played.",
  savesPerGame: "Session saves divided by matches played.",
  assistsPerGame: "Session assists divided by matches played.",
  shotAccuracy: "Session goals divided by shots.",
  matchesPlayed: "Matches played in the session."
};

export default function TeamDashboard() {
  const { id } = useParams();
  const teamId = Number(id);
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [reports, setReports] = useState<TeamCoachReportListItem[]>([]);
  const [teamCoachReports, setTeamCoachReports] = useState<TeamAggregateCoachReport[]>([]);
  const [teamCoachLatest, setTeamCoachLatest] = useState<TeamAggregateCoachReport | null>(null);
  const [teamCoachLoading, setTeamCoachLoading] = useState(false);
  const [playerPeaks, setPlayerPeaks] = useState<TeamPlayerPeakRating[]>([]);
  const [playerRanks, setPlayerRanks] = useState<TeamPlayerCurrentRank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<string | null>(null);
  const [showExtraColumns, setShowExtraColumns] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    setError(null);
    getTeam(teamId)
      .then((data) => {
        setTeam(data);
      })
      .catch((err) => setError(err.message || "Failed to load team"));
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    listTeamCoachReports(teamId)
      .then(setReports)
      .catch(() => null);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    getLatestTeamCoachReport(teamId)
      .then(setTeamCoachLatest)
      .catch(() => null);
    listTeamAggregateCoachReports(teamId)
      .then(setTeamCoachReports)
      .catch(() => null);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    getTeamPeakRatings(teamId)
      .then(setPlayerPeaks)
      .catch(() => null);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    getTeamCurrentRanks(teamId)
      .then(setPlayerRanks)
      .catch(() => null);
  }, [teamId]);

  const stats = useMemo(() => team?.stats ?? [], [team?.stats]);
  const summary = useMemo(() => {
    if (!stats.length) return null;
    const derived = stats.map((row) => row.derivedTeam ?? {});
    const totals = derived.reduce(
      (acc, entry) => {
        if (typeof entry.goalsPerGame === "number") acc.bestGoalsPerGame = Math.max(acc.bestGoalsPerGame ?? 0, entry.goalsPerGame);
        if (typeof entry.shotAccuracy === "number") acc.bestShotAccuracy = Math.max(acc.bestShotAccuracy ?? 0, entry.shotAccuracy);
        if (typeof entry.winRate === "number") acc.bestWinRate = Math.max(acc.bestWinRate ?? 0, entry.winRate);
        if (typeof entry.savesPerGame === "number") acc.bestSavesPerGame = Math.max(acc.bestSavesPerGame ?? 0, entry.savesPerGame);
        if (typeof entry.matchesPlayed === "number") {
          acc.matchesPlayedTotal += entry.matchesPlayed;
          acc.matchesPlayedCount += 1;
        }
        return acc;
      },
      {
        bestGoalsPerGame: null as number | null,
        bestShotAccuracy: null as number | null,
        bestWinRate: null as number | null,
        bestSavesPerGame: null as number | null,
        matchesPlayedTotal: 0,
        matchesPlayedCount: 0
      }
    );
    const averageGamesPlayed = totals.matchesPlayedCount > 0
      ? totals.matchesPlayedTotal / totals.matchesPlayedCount
      : null;
    return {
      sessions: stats.length,
      latestSession: stats[0]?.createdAt ?? null,
      averageGamesPlayed,
      ...totals
    };
  }, [stats]);

    const insights = useMemo(() => {
    if (!stats.length) return null;
    const derivedList = stats.map((row) => row.derivedTeam ?? {});
    const latest = derivedList[0];
    const extract = (key: string) =>
      derivedList
        .map((entry) => entry[key])
        .filter((value): value is number => typeof value === "number");
    const metric = (key: string, currentOverride?: number | null) => {
      const values = extract(key);
      const best = values.length ? Math.max(...values) : null;
      const worst = values.length ? Math.min(...values) : null;
      const current = typeof currentOverride === "number"
        ? currentOverride
        : typeof latest?.[key] === "number"
        ? (latest[key] as number)
        : null;
      return { current, best, worst };
    };
    const rollingAverage = (key: string, window: number) => {
      const values = derivedList
        .slice(0, window)
        .map((entry) => entry[key])
        .filter((value): value is number => typeof value === "number");
      if (values.length === 0) return null;
      const total = values.reduce((sum, value) => sum + value, 0);
      return total / values.length;
    };
    return {
      winRate: metric("winRate"),
      wins: metric("wins"),
      losses: metric("losses"),
      goalsPerGame: metric("goalsPerGame", rollingAverage("goalsPerGame", 5)),
      shotAccuracy: metric("shotAccuracy"),
      savesPerGame: metric("savesPerGame"),
      assistsPerGame: metric("assistsPerGame"),
      shotsPerGame: metric("shotsPerGame")
    };
  }, [stats]);

const chartData = useMemo(() => {
    if (!chartMetric || !stats.length) return [];
    return stats
      .slice()
      .reverse()
      .map((row) => {
        const derived = row.derivedTeam ?? {};
        const rawValue = (derived as Record<string, number | null>)[chartMetric];
        return {
          sessionId: row.sessionId,
          label: new Date(row.createdAt).toLocaleDateString(),
          value: typeof rawValue === "number" ? rawValue : null
        };
      });
  }, [chartMetric, stats]);

  const metricLabels: Record<string, string> = {
    winRate: "Session win rate",
    wins: "Session wins",
    losses: "Session losses",
    goalsPerGame: "Goals per game",
    shotAccuracy: "Shot accuracy",
    savesPerGame: "Saves per game",
    assistsPerGame: "Assists per game",
    shotsPerGame: "Shots per game"
  };

  const percentMetrics = new Set(["winRate", "shotAccuracy"]);

  const playstyle = useMemo(() => {
    if (!team?.players?.length || !stats.length) return [];
    const latest = stats[0];
    const deltas = (latest.deltas ?? {}) as Record<string, Record<string, number | null>>;
    const playerMap = latest.players ?? {};
    const gamertagToId = new Map(
      Object.entries(playerMap).map(([id, tag]) => [String(tag), Number(id)])
    );
    const palette = ["#f59e0b", "#60a5fa", "#34d399"];
    return team.players.map((player) => {
      const playerId = gamertagToId.get(player.gamertag ?? "");
      const delta = playerId ? deltas?.[playerId] ?? {} : {};
      const goals = toNumber(delta.goals);
      const saves = toNumber(delta.saves);
      const assists = toNumber(delta.assists);
      const total = goals + saves + assists;
      const data =
        total > 0
          ? [
              { name: "Goals", value: goals, color: palette[0] },
              { name: "Saves", value: saves, color: palette[1] },
              { name: "Assists", value: assists, color: palette[2] }
            ]
          : [];
      return {
        gamertag: player.gamertag,
        avatar: team.avatars?.[player.gamertag] ?? null,
        data,
        total
      };
    });
  }, [team, stats]);

  async function handleGenerateTeamCoach() {
    if (!teamId) return;
    setTeamCoachLoading(true);
    setError(null);
    try {
      await generateTeamCoachReport(teamId);
      const [latest, history] = await Promise.all([
        getLatestTeamCoachReport(teamId),
        listTeamAggregateCoachReports(teamId)
      ]);
      setTeamCoachLatest(latest);
      setTeamCoachReports(history);
    } catch (err: any) {
      setError(err.message || "Failed to generate team coach report");
    } finally {
      setTeamCoachLoading(false);
    }
  }

  if (!team) {
    return (
      <div className="app">
        <header className="header">
          <div className="banner">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
            <div className="banner-center">
              <div className="banner-title">Team dashboard</div>
            </div>
            <div className="banner-actions">
              <details className="menu">
                <summary aria-label="Team menu">
                  <span className="burger">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </summary>
                <div className="menu-panel">
                  <ThemeToggle />
                </div>
              </details>
              <button className="ghost" onClick={() => navigate("/")}>Back</button>
            </div>
          </div>
        </header>
        <main className="page-content">
          {error && <div className="alert error">{error}</div>}
          <p>Loading team...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="banner">
          <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          <div className="banner-center">
            <div className="banner-title">Team dashboard</div>
          </div>
          <div className="banner-actions">
            <details className="menu">
              <summary aria-label="Team menu">
                <span className="burger">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </summary>
              <div className="menu-panel">
                <ThemeToggle />
              </div>
            </details>
            <button className="ghost" onClick={() => navigate("/")}>Back</button>
          </div>
        </div>
      </header>
      <main className="page-content">
        {error && <div className="alert error">{error}</div>}
        <section className="panel">
          <div className="team-header">
            <div className="team-title-row">
              <h2 className="team-title">
                {team.name} <span className="team-mode">({team.mode})</span>
              </h2>
              <div className="team-avatars">
                {team.players?.slice(0, 4).map((player) => {
                  const avatar = team.avatars?.[player.gamertag] || null;
                  return avatar ? (
                    <img
                      className="team-avatar"
                      key={player.gamertag}
                      src={avatar}
                      alt={player.gamertag}
                    />
                  ) : (
                    <div className="team-avatar placeholder" key={player.gamertag}>
                      {player.gamertag?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
        {summary && (
          <section className="panel">
            <h3>Team overview</h3>
            <div className="metrics">
              <div>
                <span className="metric-label">Sessions completed<InfoTip text={metricHelp.sessionsCompleted} /></span>
                <strong>{summary.sessions}</strong>
              </div>
              <div>
                <span className="metric-label">Average games played<InfoTip text={metricHelp.averageGamesPlayed} /></span>
                <strong>{typeof summary.averageGamesPlayed === "number" ? Math.round(summary.averageGamesPlayed) : "-"}</strong>
              </div>
              <div>
                <span className="metric-label">Best goals per game<InfoTip text={metricHelp.bestGoalsPerGame} /></span>
                <strong>{typeof summary.bestGoalsPerGame === "number" ? summary.bestGoalsPerGame.toFixed(2) : "-"}</strong>
              </div>
              <div>
                <span className="metric-label">Best saves per game<InfoTip text={metricHelp.bestSavesPerGame} /></span>
                <strong>{typeof summary.bestSavesPerGame === "number" ? summary.bestSavesPerGame.toFixed(2) : "-"}</strong>
              </div>
              <div>
                <span className="metric-label">Best win rate<InfoTip text={metricHelp.bestWinRate} /></span>
                <strong>{typeof summary.bestWinRate === "number" ? `${(summary.bestWinRate * 100).toFixed(1)}%` : "-"}</strong>
              </div>
              <div>
                <span className="metric-label">Best shot accuracy<InfoTip text={metricHelp.bestShotAccuracy} /></span>
                <strong>{typeof summary.bestShotAccuracy === "number" ? `${(summary.bestShotAccuracy * 100).toFixed(1)}%` : "-"}</strong>
              </div>
              <div>
                <span className="metric-label">Latest session<InfoTip text={metricHelp.latestSession} /></span>
                <strong>{summary.latestSession ? new Date(summary.latestSession).toLocaleDateString() : "-"}</strong>
              </div>
            </div>
          </section>
        )}
        {insights && (
        <section className="panel">
          <h3>Performance insights</h3>
            <div className="metrics">
              <div>
                <button className="metric-button" onClick={() => setChartMetric("winRate")}>
                  <span className="metric-label">Session win rate<InfoTip text={metricHelp.sessionWinRate} /></span>
                </button>
                <strong>{formatPercent(insights.winRate.current, null)}</strong>
                <small>Best {formatPercent(insights.winRate.best, null)} / Low {formatPercent(insights.winRate.worst, null)}</small>
              </div>
              <div>
                <button className="metric-button" onClick={() => setChartMetric("wins")}>
                  <span className="metric-label">Session wins<InfoTip text={metricHelp.sessionWins} /></span>
                </button>
                <strong>{formatMetric(insights.wins.current, null)}</strong>
                <small>Best {formatMetric(insights.wins.best, null)} / Low {formatMetric(insights.wins.worst, null)}</small>
              </div>
              <div>
                <button className="metric-button" onClick={() => setChartMetric("losses")}>
                  <span className="metric-label">Session losses<InfoTip text={metricHelp.sessionLosses} /></span>
                </button>
                <strong>{formatMetric(insights.losses.current, null)}</strong>
                <small>Best {formatMetric(insights.losses.best, null)} / Low {formatMetric(insights.losses.worst, null)}</small>
              </div>
              <div>
                <button className="metric-button" onClick={() => setChartMetric("goalsPerGame")}>
                  <span className="metric-label">Goals per game<InfoTip text={metricHelp.goalsPerGame} /></span>
                </button>
                <strong>{formatMetric(insights.goalsPerGame.current, null)}</strong>
                <small>Best {formatMetric(insights.goalsPerGame.best, null)} / Low {formatMetric(insights.goalsPerGame.worst, null)}</small>
              </div>
              <div>
                <button className="metric-button" onClick={() => setChartMetric("shotAccuracy")}>
                  <span className="metric-label">Shot accuracy<InfoTip text={metricHelp.shotAccuracy} /></span>
                </button>
                <strong>{formatPercent(insights.shotAccuracy.current, null)}</strong>
                <small>Best {formatPercent(insights.shotAccuracy.best, null)} / Low {formatPercent(insights.shotAccuracy.worst, null)}</small>
              </div>
              <div>
                <button className="metric-button" onClick={() => setChartMetric("savesPerGame")}>
                  <span className="metric-label">Saves per game<InfoTip text={metricHelp.savesPerGame} /></span>
                </button>
                <strong>{formatMetric(insights.savesPerGame.current, null)}</strong>
                <small>Best {formatMetric(insights.savesPerGame.best, null)} / Low {formatMetric(insights.savesPerGame.worst, null)}</small>
              </div>
              <div>
                <button className="metric-button" onClick={() => setChartMetric("assistsPerGame")}>
                  <span className="metric-label">Assists per game<InfoTip text={metricHelp.assistsPerGame} /></span>
                </button>
                <strong>{formatMetric(insights.assistsPerGame.current, null)}</strong>
                <small>Best {formatMetric(insights.assistsPerGame.best, null)} / Low {formatMetric(insights.assistsPerGame.worst, null)}</small>
              </div>
              <div>
                <button className="metric-button" onClick={() => setChartMetric("shotsPerGame")}>
                  <span className="metric-label">Shots per game<InfoTip text={metricHelp.shotsPerGame} /></span>
                </button>
                <strong>{formatMetric(insights.shotsPerGame.current, null)}</strong>
                <small>Best {formatMetric(insights.shotsPerGame.best, null)} / Low {formatMetric(insights.shotsPerGame.worst, null)}</small>
              </div>
            </div>
          </section>
        )}
        <section className="panel">
          <h3>Player peak rank</h3>
          <div className="peak-grid">
            {team.players?.map((player) => {
              const entry = playerPeaks.find((item) => item.gamertag === player.gamertag);
              const peak = entry?.peakRating;
              const seasonLabel = peak?.season ? `Season ${peak.season}` : "Season -";
              return (
                <div className="peak-card" key={player.gamertag}>
                  <div className="peak-card-header">
                    {peak?.iconUrl ? (
                      <img className="peak-icon" src={peak.iconUrl} alt={`${peak.rankName ?? "Rank"} icon`} />
                    ) : (
                      <div className="peak-icon placeholder" />
                    )}
                    <div>
                      <div className="peak-title">{player.gamertag}</div>
                      <div className="note">{peak?.playlistName ?? "No peak rating yet"}</div>
                    </div>
                  </div>
                  <div className="peak-value">{peak?.value ?? "-"}</div>
                  <div className="note">{seasonLabel}</div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <h3>Player current rank</h3>
          <div className="peak-grid">
            {team.players?.map((player) => {
              const entry = playerRanks.find((item) => item.gamertag === player.gamertag);
              const tierIndex = entry?.rankTierIndex;
              const divisionIndex = entry?.rankDivisionIndex ?? 0;
              let rankLabel = "Unranked";
              if (typeof tierIndex === "number" && Number.isFinite(tierIndex)) {
                rankLabel = formatRank(tierIndex * 10 + divisionIndex);
              } else {
                const rawLabel = entry?.rankLabel ?? null;
                if (typeof rawLabel === "string") {
                  const tokens = rawLabel.trim().split(/\s+/).map((token) => Number(token));
                  if (tokens.length === 2 && tokens.every((token) => Number.isFinite(token))) {
                    rankLabel = formatRank(tokens[0] * 10 + tokens[1]);
                  } else if (/^\d+$/.test(rawLabel.trim())) {
                    rankLabel = formatRank(Number(rawLabel.trim()));
                  } else {
                    rankLabel = rawLabel;
                  }
                }
              }
              return (
                <div className="peak-card" key={player.gamertag}>
                  <div className="peak-card-header">
                    {entry?.iconUrl ? (
                      <img className="peak-icon" src={entry.iconUrl} alt={`${rankLabel} icon`} />
                    ) : (
                      <div className="peak-icon placeholder" />
                    )}
                    <div>
                      <div className="peak-title">{player.gamertag}</div>
                      <div className="note">{entry?.playlistName ?? "Current rank"}</div>
                    </div>
                  </div>
                  <div className="peak-value">{entry?.rating ?? "-"}</div>
                  <div className="note">{rankLabel}</div>
                </div>
              );
            })}
          </div>
        </section>
        {playstyle.length > 0 && (
          <section className="panel">
            <h3>Overall play style</h3>
            <div className="playstyle-grid">
              {playstyle.map((player) => (
                <div className="playstyle-card" key={player.gamertag}>
                  <div className="playstyle-header">
                    {player.avatar ? (
                      <img className="playstyle-avatar" src={player.avatar} alt={player.gamertag} />
                    ) : (
                      <div className="playstyle-avatar placeholder">
                        {player.gamertag?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div>
                      <strong>{player.gamertag}</strong>
                      <div className="note">Goals / Saves / Assists</div>
                    </div>
                  </div>
                  {player.data.length === 0 ? (
                    <p className="note">No playstyle data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={player.data}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={78}
                          labelLine
                          label={({ name, percent }) =>
                            typeof percent === "number"
                              ? `${name}: ${(percent * 100).toFixed(1)}%`
                              : name
                          }
                        >
                          {player.data.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            typeof value === "number" ? value.toLocaleString() : value
                          }
                        />
                        <Legend verticalAlign="bottom" height={24} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="panel">
          <details className="collapsible">
            <summary>
              <div className="summary-title">
                <h3>Session history</h3>
                <span className="note">Completed sessions only.</span>
              </div>
              <span className="chevron" aria-hidden="true"></span>
            </summary>
            <div className="section-header">
              <div />
              <button className="ghost" onClick={() => setShowExtraColumns((prev) => !prev)}>
                {showExtraColumns ? "Hide extra columns" : "Show extra columns"}
              </button>
            </div>
            {stats.length === 0 && <p>No completed sessions yet.</p>}
            {stats.length > 0 && (
              <div className={showExtraColumns ? "team-history-table extra" : "team-history-table"}>
                <div className="team-history-row header">
                  <span>Session</span>
                  <span>Date</span>
                  <span className="metric-label">Wins<InfoTip text={metricHelp.sessionWins} /></span>
                  <span className="metric-label">Losses<InfoTip text={metricHelp.sessionLosses} /></span>
                  <span className="metric-label">Goals<InfoTip text={metricHelp.sessionGoals} /></span>
                  <span className="metric-label">Assists<InfoTip text={metricHelp.sessionAssists} /></span>
                  <span className="metric-label">Saves<InfoTip text={metricHelp.sessionSaves} /></span>
                  <span className="metric-label">Shots<InfoTip text={metricHelp.sessionShots} /></span>
                  <span className="metric-label">Win rate<InfoTip text={metricHelp.sessionWinRate} /></span>
                  <span className="metric-label">Shot accuracy<InfoTip text={metricHelp.shotAccuracy} /></span>
                  {showExtraColumns && (
                    <>
                      <span className="metric-label">Goals / game<InfoTip text={metricHelp.goalsPerGame} /></span>
                      <span className="metric-label">Shots / game<InfoTip text={metricHelp.shotsPerGame} /></span>
                      <span className="metric-label">Saves / game<InfoTip text={metricHelp.savesPerGame} /></span>
                      <span className="metric-label">Assists / game<InfoTip text={metricHelp.assistsPerGame} /></span>
                      <span className="metric-label">Matches<InfoTip text={metricHelp.matchesPlayed} /></span>
                    </>
                  )}
                </div>
                {stats.map((row) => {
                  const derived = row.derivedTeam ?? {};
                  const records = row.records ?? {};
                  const recordLabel = (key: string) => formatRecord(records[key]);
                  return (
                    <div className="team-history-row" key={row.id}>
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
                      {showExtraColumns && (
                        <>
                          <span>{formatMetric(derived.goalsPerGame, recordLabel("goalsPerGame"))}</span>
                          <span>{formatMetric(derived.shotsPerGame, recordLabel("shotsPerGame"))}</span>
                          <span>{formatMetric(derived.savesPerGame, recordLabel("savesPerGame"))}</span>
                          <span>{formatMetric(derived.assistsPerGame, recordLabel("assistsPerGame"))}</span>
                          <span>{formatMetric(derived.matchesPlayed, null)}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </details>
        </section>
        <section className="panel">
          <details className="collapsible">
            <summary>
              <div className="summary-title">
                <h3>Team coach report</h3>
                <span className="note">Aggregates all completed sessions for trends and goals.</span>
              </div>
              <span className="chevron" aria-hidden="true"></span>
            </summary>
            <div className="section-header">
              <div />
              <button onClick={handleGenerateTeamCoach} disabled={teamCoachLoading}>
                {teamCoachLoading ? "Generating..." : "Generate team coach report"}
              </button>
            </div>
            {!teamCoachLatest && <p>No team coach report yet.</p>}
            {teamCoachLatest?.report && (
              <div className="coach-report">
                <h4>{teamCoachLatest.report.headline}</h4>
                <div className="coach-grid">
                  {teamCoachLatest.report.strengths.map((item, index) => (
                    <div className="coach-card" key={index}>
                      <h5>{item.title}</h5>
                      <div className="coach-label">Evidence</div>
                      <ul>
                        {item.evidence.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                      <div className="coach-label">Keep doing</div>
                      <ul>
                        {item.keepDoing.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="coach-priorities">
                  {teamCoachLatest.report.priorities.map((item, index) => (
                    <details key={index} className="coach-accordion">
                      <summary>{item.title}</summary>
                      <div className="coach-accordion-body">
                        <div className="coach-label">Evidence</div>
                        <ul>
                          {item.evidence.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                        <div className="coach-confidence">
                          Hypothesis ({item.hypothesis.confidence}): {item.hypothesis.text}
                        </div>
                        <div className="coach-grid">
                          {item.actions.map((action, i) => (
                            <div className="coach-action-item" key={i}>
                              <strong>{action.action}</strong>
                              <span>{action.why}</span>
                              <span>Target: {action.target}</span>
                            </div>
                          ))}
                        </div>
                        <div className="coach-label">Drills</div>
                        <ul>
                          {item.drills.map((drill, i) => (
                            <li key={i}>{drill}</li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
                <div className="coach-card">
                  <h5>Next session goals</h5>
                  <div className="coach-goals-table">
                    <div className="coach-goals-header">
                      <span>Metric</span>
                      <span>Current</span>
                      <span>Target</span>
                      <span>Measure</span>
                    </div>
                    {teamCoachLatest.report.nextSessionGoals.map((goal, i) => (
                      <div className="coach-goals-row" key={i}>
                        <span>{goal.metric}</span>
                        <span>{goal.current}</span>
                        <span>{goal.target}</span>
                        <span>{goal.howToMeasure}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="coach-card">
                  <h5>Questions for you</h5>
                  <ul>
                    {teamCoachLatest.report.questionsForYou.map((question, i) => (
                      <li key={i}>{question}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {teamCoachReports.length > 0 && (
              <details className="coach-accordion">
                <summary>Previous team coach reports</summary>
                <div className="coach-accordion-body">
                  {teamCoachReports.map((item) => (
                    <div key={item.id} className="coach-action-item">
                      <strong>{new Date(item.createdAt).toLocaleString()}</strong>
                      <span>Model: {item.model}</span>
                      <span>{item.report?.headline ?? "Coach report"}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </details>
        </section>
        <section className="panel">
          <details className="collapsible">
            <summary>
              <div className="summary-title">
                <h3>Session coach reports</h3>
                <span className="note">Session-by-session coaching history.</span>
              </div>
              <span className="chevron" aria-hidden="true"></span>
            </summary>
            {reports.length === 0 && <p>No AI coach reports yet.</p>}
            {reports.length > 0 && (
              <div className="coach-history">
                {reports.map((report) => (
                  <details key={report.id} className="coach-accordion">
                    <summary>
                      {new Date(report.createdAt).toLocaleString()} - {report.sessionName}
                    </summary>
                    <div className="coach-accordion-body">
                      <div className="note">Model: {report.model}</div>
                      <h4>{report.report?.headline ?? "Coach report"}</h4>
                      {report.report?.strengths && report.report.strengths.length > 0 && (
                        <div className="coach-card">
                          <h5>Strengths</h5>
                          {report.report.strengths.map((item, index) => (
                            <div key={index} className="coach-action-item">
                              <strong>{item.title}</strong>
                              {item.evidence?.length > 0 && (
                                <>
                                  <div className="coach-label">Evidence</div>
                                  <ul>
                                    {item.evidence.map((line, i) => (
                                      <li key={i}>{line}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                              {item.keepDoing?.length > 0 && (
                                <>
                                  <div className="coach-label">Keep doing</div>
                                  <ul>
                                    {item.keepDoing.map((line, i) => (
                                      <li key={i}>{line}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {report.report?.priorities && report.report.priorities.length > 0 && (
                        <div className="coach-card">
                          <h5>Priorities</h5>
                          <div className="coach-priorities">
                            {report.report.priorities.map((item, index) => (
                              <details key={index} className="coach-accordion">
                                <summary>{item.title}</summary>
                                <div className="coach-accordion-body">
                                  {item.evidence?.length > 0 && (
                                    <>
                                      <div className="coach-label">Evidence</div>
                                      <ul>
                                        {item.evidence.map((line, i) => (
                                          <li key={i}>{line}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                  {item.hypothesis && (
                                    <div className="coach-confidence">
                                      Hypothesis ({item.hypothesis.confidence}): {item.hypothesis.text}
                                    </div>
                                  )}
                                  {item.actions?.length > 0 && (
                                    <div className="coach-grid">
                                      {item.actions.map((action, i) => (
                                        <div className="coach-action-item" key={i}>
                                          <strong>{action.action}</strong>
                                          <span>{action.why}</span>
                                          <span>Target: {action.target}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {item.drills?.length > 0 && (
                                    <>
                                      <div className="coach-label">Drills</div>
                                      <ul>
                                        {item.drills.map((drill, i) => (
                                          <li key={i}>{drill}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      )}
                      {report.report?.nextSessionGoals && report.report.nextSessionGoals.length > 0 && (
                        <div className="coach-card">
                          <h5>Next session goals</h5>
                          <div className="coach-goals-table">
                            <div className="coach-goals-header">
                              <span>Metric</span>
                              <span>Current</span>
                              <span>Target</span>
                              <span>Measure</span>
                            </div>
                            {report.report.nextSessionGoals.map((goal, i) => (
                              <div className="coach-goals-row" key={i}>
                                <span>{goal.metric}</span>
                                <span>{goal.current}</span>
                                <span>{goal.target}</span>
                                <span>{goal.howToMeasure}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {report.report?.questionsForYou && report.report.questionsForYou.length > 0 && (
                        <div className="coach-card">
                          <h5>Questions for you</h5>
                          <ul>
                            {report.report.questionsForYou.map((question, i) => (
                              <li key={i}>{question}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </details>
        </section>
      </main>
      {chartMetric && (
        <div className="modal-backdrop" onClick={() => setChartMetric(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{metricLabels[chartMetric] || "Metric trend"}</h3>
                <p className="note">Per completed session (oldest to newest).</p>
              </div>
              <button className="ghost" onClick={() => setChartMetric(null)}>Close</button>
            </div>
            <div className="modal-body">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis
                    tickFormatter={(value) => {
                      if (percentMetrics.has(chartMetric)) {
                        return `${Math.round(Number(value) * 100)}%`;
                      }
                      return value as number;
                    }}
                  />
                  <Tooltip
                    formatter={(value) => {
                      if (percentMetrics.has(chartMetric)) {
                        return [`${Number(value) * 100}%`, metricLabels[chartMetric]];
                      }
                      return [value as number, metricLabels[chartMetric]];
                    }}
                    labelFormatter={(label, payload) => {
                      const entry = payload?.[0]?.payload as { sessionId?: number } | undefined;
                      return entry?.sessionId ? `Session #${entry.sessionId} (${label})` : label;
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#3772ff" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      <footer className="footer">
        <div className="footer-banner">
          <nav className="footer-links">
            <a href="#" aria-label="Find out more">Find out more</a>
            <a href="#" aria-label="About this website">About this website</a>
            <a href="#" aria-label="Accessibility statement">Accessibility statement</a>
            <a href="#" aria-label="Contact">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
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

function toNumber(value: number | null | undefined) {
  return typeof value === "number" ? value : 0;
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-icon" title={text} aria-label={text}>
      i
    </span>
  );
}
