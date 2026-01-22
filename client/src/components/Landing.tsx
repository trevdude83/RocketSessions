import { Link, useLocation, useNavigate } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";
import ImpersonationBanner from "./ImpersonationBanner";
import SignOutButton from "./SignOutButton";
import { useAuth } from "../auth";
import UserBadge from "./UserBadge";
import { useEffect, useState } from "react";

export default function Landing() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);

  useEffect(() => {
    if (location.state && (location.state as { loggedOut?: boolean }).loggedOut) {
      setLogoutMessage("You have been signed out.");
      navigate(".", { replace: true, state: null });
    }
  }, [location.state, navigate]);

  return (
    <div className="app landing">
      <ImpersonationBanner />
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center"></div>
          <div className="banner-actions">
            <UserBadge />
            <div className="banner-actions-row">
              <ThemeToggle />
              {user && <SignOutButton />}
            </div>
          </div>
        </div>
      </header>
      <main className="page-content landing-main">
        {logoutMessage && <div className="alert">{logoutMessage}</div>}
        <section className="panel landing-hero">
          <div className="landing-copy">
            <h1>Keep every match accountable.</h1>
            <p className="landing-lede">
              This tracker captures scoreboard snapshots during play, turns matches into stats,
              and rolls everything into coaching-ready summaries for the next session.
            </p>
          </div>
          <div className="landing-hero-grid">
            <div className="landing-hero-card">
              <h3>Scoreboard capture</h3>
              <p>Uploads end-of-match scoreboards and extracts stats from the screen.</p>
              <div className="landing-stat">
                <span className="note">Capture source</span>
                <strong>ScoreboardCam</strong>
              </div>
            </div>
            <div className="landing-hero-card">
              <h3>Team history</h3>
              <p>Baselines lock in the first snapshot so progress is always measurable.</p>
              <div className="landing-stat">
                <span className="note">Baseline + delta</span>
                <strong>Auto saved</strong>
              </div>
            </div>
            <div className="landing-hero-card">
              <h3>AI-enabled coach insights</h3>
              <p>Session totals, win rates, and trends roll into a single report.</p>
              <div className="landing-stat">
                <span className="note">Report format</span>
                <strong>Session recap</strong>
              </div>
            </div>
          </div>
        </section>
        <section className="panel landing-grid">
          <div className="section-header">
            <h2>Get started</h2>
          </div>
          <div className="panel-grid">
            <div className="panel-block">
              <h3>1. Start a session</h3>
              <p className="note">Choose a saved team (or go solo), name your session, and start playing!</p>
            </div>
            <div className="panel-block">
              <h3>2. Capture scoreboards</h3>
              <p className="note">Scoreboard images populate wins, losses, shots, saves, and goals.</p>
            </div>
            <div className="panel-block">
              <h3>3. End + review</h3>
              <p className="note">Save team stats and open coaching notes after the session.</p>
            </div>
          </div>
          <div className="landing-cta">
            {user ? (
              <>
                <Link className="cta-button" to="/sessions">Start a session now</Link>
                <span className="note">Start a new session or resume a live one.</span>
              </>
            ) : (
              <>
                <Link className="cta-button" to="/login">Sign in</Link>
                <Link className="cta-button secondary" to="/register">Register</Link>
              </>
            )}
          </div>
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
