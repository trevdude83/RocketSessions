import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate("/sessions");
    }
  }, [user, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await login(identity.trim(), password);
      navigate("/sessions");
    } catch (err: any) {
      if (err?.code === "pending") {
        navigate("/pending");
        return;
      }
      setError(err?.message || "Failed to sign in.");
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
            <div className="banner-title">Sign in</div>
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
          <h2>Welcome back</h2>
          <p className="note">Use your username or email to sign in.</p>
          {error && <p className="error">{error}</p>}
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Username or email
              <input
                type="text"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
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
              <button type="submit">Sign in</button>
              <Link className="ghost-link" to="/register">Request an account</Link>
            </div>
          </form>
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
