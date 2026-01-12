import { Link } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";

export default function Landing() {
  return (
    <div className="app landing">
      <header className="header">
        <div className="banner">
          <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          <div className="banner-center">
            <div>
              <div className="banner-title">Rocket League Session Manager</div>
              <p className="banner-subtitle">Track sessions, capture snapshots, and review team growth.</p>
            </div>
          </div>
          <div className="banner-actions">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="page-content landing-main">
        <section className="panel landing-hero">
          <div className="landing-copy">
            <h1>Keep every match accountable.</h1>
            <p className="landing-lede">
              This tracker captures live snapshots during play, flags new matches as they land,
              and rolls everything into coaching-ready summaries for the next session.
            </p>
          </div>
          <div className="landing-hero-grid">
            <div className="landing-hero-card">
              <h3>Live session polling</h3>
              <p>Polls match history and captures fresh stats the moment a game ends.</p>
              <div className="landing-stat">
                <span className="note">Tracking loop</span>
                <strong>Every 2-3 min</strong>
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
              <h3>2. Let it poll</h3>
              <p className="note">Snapshots capture performance data like wins, losses, and ranked progress etc</p>
            </div>
            <div className="panel-block">
              <h3>3. End + review</h3>
              <p className="note">Save team stats and open coaching notes after the session.</p>
            </div>
          </div>
          <div className="landing-cta">
            <Link className="cta-button" to="/sessions">Start a session now</Link>
            <span className="note">Start a new session or resume a live one.</span>
          </div>
        </section>
      </main>
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
