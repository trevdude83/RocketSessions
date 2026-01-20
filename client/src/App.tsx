import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import SessionForm from "./components/SessionForm";
import SessionDashboard from "./components/SessionDashboard";
import AdvancedSession from "./components/AdvancedSession";
import SystemAdmin from "./components/SystemAdmin";
import Landing from "./components/Landing";
import Login from "./components/Login";
import Register from "./components/Register";
import Pending from "./components/Pending";
import UserAdmin from "./components/UserAdmin";
import ScoreboardAdmin from "./components/ScoreboardAdmin";
import { deleteSession, listSessions, listTeams } from "./api";
import { Session, Team } from "./types";
import TeamHistory from "./components/TeamHistory";
import TeamDashboard from "./components/TeamDashboard";
import BuildInfo from "./components/BuildInfo";
import { AuthProvider, useAuth } from "./auth";
import ImpersonationBanner from "./components/ImpersonationBanner";
import AuthMenuItems from "./components/AuthMenuItems";
import UserBadge from "./components/UserBadge";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <MenuAutoClose />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending" element={<Pending />} />
          <Route element={<RequireAuth />}>
            <Route path="/sessions" element={<SessionManager />} />
            <Route path="/sessions/:id" element={<SessionDashboard />} />
            <Route path="/sessions/:id/advanced" element={<AdvancedSession />} />
            <Route path="/teams/:id" element={<TeamDashboard />} />
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<SystemAdmin />} />
              <Route path="/admin/users" element={<UserAdmin />} />
              <Route path="/admin/scoreboard" element={<ScoreboardAdmin />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function MenuAutoClose() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("details.menu")) return;
      document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((detail) => {
        detail.open = false;
      });
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);
  return null;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="app">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.status === "pending") {
    return <Navigate to="/pending" replace />;
  }
  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function SessionManager() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [showEndedSessions, setShowEndedSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeLabel: Record<string, string> = {
    solo: "Solo",
    "2v2": "2v2",
    "3v3": "3v3",
    "4v4": "4v4"
  };

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((err) => setError(err.message));
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

  function loadTeams() {
    listTeams()
      .then((data) => {
        const normalized = data.map((team) => ({
          ...team,
          players: Array.isArray(team.players)
            ? team.players
            : safeParsePlayers(team.playersJson)
        }));
        setTeams(normalized);
        if (data.length > 0 && selectedTeamId === null) {
          setSelectedTeamId(data[0].id);
        }
      })
      .catch(() => null);
  }

  useEffect(() => {
    loadTeams();
  }, []);

  const visibleSessions = showEndedSessions
    ? sessions
    : sessions.filter((session) => !session.isEnded);

  return (
    <div className="app">
      <ImpersonationBanner />
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">Session Manager</div>
          </div>
          <div className="banner-actions">
            <UserBadge />
            <div className="banner-actions-row">
              <details className="menu">
                <summary aria-label="System menu">
                  <span className="burger">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </summary>
                <div className="menu-panel">
                  <AuthMenuItems showAdminLink />
                </div>
              </details>
            </div>
          </div>
        </div>
      </header>
      <main className="page-content grid">
        <SessionForm onCreated={(detail) => {
          setSessions((prev) => [
            { ...detail.session, teamName: detail.team?.name ?? null },
            ...prev
          ]);
        }} />
        <section className="panel">
          <div className="section-header">
            <div className="title-row">
              <h2>Active Sessions</h2>
              <span className="live-badge">
                <span className="live-dot" aria-hidden="true"></span>
                Live
              </span>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showEndedSessions}
                onChange={(e) => setShowEndedSessions(e.target.checked)}
              />
              Show ended sessions
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          {visibleSessions.length === 0 && <p>No active sessions yet.</p>}
          {visibleSessions.length > 0 && (
            <div className="session-table">
              <div className="session-row header">
                <span>Session</span>
                <span>Team</span>
                <span>Mode</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {visibleSessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <span>
                    <Link to={`/sessions/${session.id}`}>{session.name}</Link>
                  </span>
                  <span>{session.teamName || "Ad-hoc"}</span>
                  <span>{modeLabel[session.mode] ?? session.mode}</span>
                  <span
                    className={
                      session.isEnded
                        ? "badge ended"
                        : session.manualMode
                        ? "badge manual"
                        : session.isActive
                        ? "badge active"
                        : "badge stopped"
                    }
                  >
                    {session.isEnded ? "Ended" : session.manualMode ? "Manual" : session.isActive ? "Active" : "Stopped"}
                  </span>
                  <span>
                    <button
                      className="ghost"
                      onClick={async () => {
                        if (!window.confirm(`Delete session \"${session.name}\"?`)) return;
                        await deleteSession(session.id);
                        setSessions((prev) => prev.filter((item) => item.id !== session.id));
                        loadTeams();
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <details className="collapsible" open>
            <summary>
              <div className="summary-title">
                <h2>Team history</h2>
                <span className="note">Saved teams and multi-session summaries.</span>
              </div>
              <span className="chevron" aria-hidden="true"></span>
            </summary>
            {teams.length === 0 && <p>No saved teams yet.</p>}
            {teams.length > 0 && (
              <div className="team-table">
                <div className="team-row header">
                  <span>Team</span>
                  <span>Mode</span>
                  <span>Players</span>
                  <span>Sessions</span>
                  <span>Actions</span>
                </div>
                {teams.map((team) => (
                  <div className="team-row" key={team.id}>
                    <span className="team-name">{team.name}</span>
                    <span className="note">{team.mode}</span>
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
                    <span>{team.sessionsCount ?? 0}</span>
                    <Link className="ghost-link compact" to={`/teams/${team.id}`}>Dashboard</Link>
                  </div>
                ))}
              </div>
            )}
          </details>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-banner">
          <div className="footer-meta">
            <nav className="footer-links">
              <a href="https://github.com/trevdude83/RocketSessions" aria-label="Find out more">Find out more</a>
              <a href="#" aria-label="Contact">Contact</a>
            </nav>
            <BuildInfo />
          </div>
        </div>
      </footer>
    </div>
  );
}
