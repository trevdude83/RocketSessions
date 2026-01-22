import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { backfillSessionSnapshots, endSession, getSessionDetail, getSummary, shareSession, startSession, stopSession } from "../api";
import { SessionDetail, SummaryResponse } from "../types";
import PlayerCard from "./PlayerCard";
import ChartsPanel from "./ChartsPanel";
import MatchScoreChart from "./MatchScoreChart";
import TeamSessionStats from "./TeamSessionStats";
import GameStatsTable from "./GameStatsTable";
import CoachPanel from "./CoachPanel";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";
import ImpersonationBanner from "./ImpersonationBanner";
import SignOutButton from "./SignOutButton";
import { useAuth } from "../auth";
import UserBadge from "./UserBadge";

export default function SessionDashboard() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [shareIdentity, setShareIdentity] = useState("");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const { user } = useAuth();

  async function loadSessionData({ withLoading = false } = {}) {
    if (!sessionId) return;
    if (withLoading) setLoading(true);
    setError(null);
    const [detailResult, summaryResult] = await Promise.allSettled([
      getSessionDetail(sessionId),
      getSummary(sessionId)
    ]);

    if (detailResult.status === "fulfilled") {
      setDetail(detailResult.value);
    } else {
      setDetail(null);
    }

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
    }

    if (detailResult.status === "rejected" || summaryResult.status === "rejected") {
      const detailMessage = detailResult.status === "rejected" ? detailResult.reason?.message : null;
      const summaryMessage = summaryResult.status === "rejected" ? summaryResult.reason?.message : null;
      setError(detailMessage || summaryMessage || "Failed to load session data");
    }

    if (withLoading) setLoading(false);
  }

  useEffect(() => {
    if (!sessionId) return;
    void loadSessionData({ withLoading: true });
  }, [sessionId]);

  const players = detail?.players ?? [];

  const deltas = useMemo(() => summary?.deltas ?? {}, [summary]);

  useEffect(() => {
    if (!sessionId) return;
    if (!detail) return;
    if (detail.session.isEnded || !detail.session.isActive) return;
    const intervalMs = 10000;
    const interval = setInterval(() => {
      void loadSessionData();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [sessionId, detail]);

  async function handleRecompute() {
    if (!sessionId) return;
    setRecomputing(true);
    setError(null);
    try {
      await backfillSessionSnapshots(sessionId);
      const [detailData, summaryData] = await Promise.all([
        getSessionDetail(sessionId),
        getSummary(sessionId)
      ]);
      setDetail(detailData);
      setSummary(summaryData);
    } catch (err: any) {
      setError(err.message || "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  }

  async function handleStop() {
    if (!sessionId) return;
    if (detail?.session.isEnded) return;
    await stopSession(sessionId);
    const detailData = await getSessionDetail(sessionId);
    setDetail(detailData);
  }

  async function handleStart() {
    if (!sessionId) return;
    if (detail?.session.isEnded) return;
    await startSession(sessionId);
    const detailData = await getSessionDetail(sessionId);
    setDetail(detailData);
  }

  async function handleEnd() {
    if (!sessionId) return;
    if (detail?.session.isEnded) return;
    if (!window.confirm("End this session? This cannot be restarted.")) return;
    setEnding(true);
    setError(null);
    try {
      await endSession(sessionId);
      const [detailData, summaryData] = await Promise.all([
        getSessionDetail(sessionId),
        getSummary(sessionId)
      ]);
      setDetail(detailData);
      setSummary(summaryData);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Failed to end session");
    } finally {
      setEnding(false);
    }
  }

  async function handleShare() {
    if (!sessionId || shareIdentity.trim().length === 0) return;
    setShareMessage(null);
    try {
      await shareSession(sessionId, shareIdentity.trim());
      setShareIdentity("");
      setShareMessage("Session shared.");
    } catch (err: any) {
      setShareMessage(err?.message || "Failed to share session.");
    }
  }

  const canShare = Boolean(
    user && (user.role === "admin" || (detail?.session.userId != null && detail.session.userId === user.id))
  );

  if (loading) {
    return <div className="app">Loading session...</div>;
  }

  if (!detail) {
    return (
      <div className="app">
        <p className="error">{error || "Session not found"}</p>
        <button onClick={() => navigate("/")}>Back</button>
      </div>
    );
  }

  return (
    <div className="app">
      <ImpersonationBanner />
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">
              Session - {detail.session.name} ({detail.session.mode})
            </div>
            <span
              className={
                detail.session.isEnded
                  ? "badge ended"
                  : detail.session.manualMode
                  ? "badge manual"
                  : detail.session.isActive
                  ? "badge active"
                  : "badge stopped"
              }
            >
              {detail.session.isEnded ? "Ended" : detail.session.manualMode ? "Manual" : detail.session.isActive ? "Active" : "Stopped"}
            </span>
          </div>
          <div className="banner-actions">
            <UserBadge />
            <div className="banner-actions-row">
              <details className="menu">
                <summary aria-label="Session menu">
                  <span className="burger">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </summary>
                <div className="menu-panel">
                  <ThemeToggle />
                  <button
                    className="secondary"
                    onClick={detail.session.isActive ? handleStop : handleStart}
                    disabled={detail.session.isEnded}
                  >
                    {detail.session.isActive ? "Pause session" : "Continue session"}
                  </button>
                  <button className="secondary" onClick={handleEnd} disabled={ending || detail.session.isEnded}>
                    {ending ? "Ending..." : "End session"}
                  </button>
                  {user?.role === "admin" && (
                    <button className="ghost" onClick={() => navigate(`/sessions/${sessionId}/advanced`)}>
                      Advanced
                    </button>
                  )}
                  <SignOutButton />
                </div>
              </details>
              <button className="ghost" onClick={() => navigate("/sessions")}>Back</button>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="alert error">{error}</div>}

        <div className="stack">
          <section className="cards stack-section">
            {players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                baseline={detail.baselineByPlayerId[player.id]}
                latest={detail.latestByPlayerId[player.id]}
                delta={deltas[player.id]}
              />
            ))}
          </section>

          <TeamSessionStats stats={summary?.teamStats} />
          <GameStatsTable sessionId={sessionId} gameCount={summary?.teamStats?.gameCount} />
          <ChartsPanel sessionId={sessionId} players={players} />

          <MatchScoreChart sessionId={sessionId} />

          <CoachPanel sessionId={sessionId} mode={detail.session.mode} />
          {canShare && (
            <section className="panel">
              <div className="section-header">
                <h2>Share session</h2>
              </div>
              <p className="panel-help">Invite another user by username or email.</p>
              <div className="form">
                <label>
                  Username or email
                  <input
                    type="text"
                    value={shareIdentity}
                    onChange={(e) => setShareIdentity(e.target.value)}
                    placeholder="user@example.com"
                  />
                </label>
                <div className="actions">
                  <button onClick={handleShare} disabled={shareIdentity.trim().length === 0}>
                    Share session
                  </button>
                  {shareMessage && <span>{shareMessage}</span>}
                </div>
              </div>
            </section>
          )}
        </div>
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

