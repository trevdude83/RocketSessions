import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";

export default function Register() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await register({ username: username.trim(), email: email.trim(), password });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || "Failed to submit request.");
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">Request access</div>
          </div>
          <div className="banner-actions">
            <div className="banner-actions-row">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>
      <main className="page-content">
        <section className="panel">
          <h2>Account request</h2>
          <p className="note">Accounts require admin approval. Use a valid email so we can contact you.</p>
          {submitted ? (
            <div>
              <p>Your request has been submitted. You will be contacted by an admin.</p>
              <Link className="ghost-link" to="/login">Return to sign in</Link>
            </div>
          ) : (
            <form className="form" onSubmit={handleSubmit}>
              {error && <p className="error">{error}</p>}
              <label>
                Username
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <div className="actions">
                <button type="submit">Submit request</button>
                <Link className="ghost-link" to="/login">Sign in</Link>
              </div>
            </form>
          )}
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
