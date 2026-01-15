import { Link } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";

export default function Pending() {
  return (
    <div className="app">
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">Approval required</div>
          </div>
          <div className="banner-actions">
            <div className="banner-actions-row">
              <ThemeToggle />
              <Link className="ghost-link ghost" to="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </header>
      <main className="page-content">
        <section className="panel">
          <h2>Account pending</h2>
          <p>Your request has been received. An admin will contact you once approved.</p>
          <Link className="ghost-link" to="/login">Sign in</Link>
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
