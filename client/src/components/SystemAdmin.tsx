import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getApiKeyStatus,
  getCoachPacket,
  getCoachPrompt,
  getTeamCoachPrompt,
  getTeamCoachPacket,
  setTeamCoachPrompt,
  getDbMetrics,
  getPollingLogs,
  getDefaultCoachPrompt,
  getDefaultTeamCoachPrompt,
  getOpenAiStatus,
  getTrnStatus,
  listSessions,
  listTeams,
  setApiKey,
  setCoachPrompt,
  setOpenAiKey
} from "../api";
import { DbMetricPoint, PollingLogEntry, Session } from "../types";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";
import ImpersonationBanner from "./ImpersonationBanner";
import SignOutButton from "./SignOutButton";
import UserBadge from "./UserBadge";

export default function SystemAdmin() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [teams, setTeams] = useState<{ id: number; name: string; mode: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [dbMetrics, setDbMetrics] = useState<DbMetricPoint[]>([]);
  const [pollingLogs, setPollingLogs] = useState<PollingLogEntry[]>([]);
  const [pollingLoading, setPollingLoading] = useState(false);
  const [pollingAutoRefresh, setPollingAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKeyValue] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<boolean | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [apiMessage, setApiMessage] = useState<string | null>(null);

  const [openAiKey, setOpenAiKeyValue] = useState("");
  const [openAiModel, setOpenAiModel] = useState("gpt-4o-mini");
  const [openAiStatus, setOpenAiStatus] = useState<boolean | null>(null);
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [openAiMessage, setOpenAiMessage] = useState<string | null>(null);

  const [coachPrompt, setCoachPromptValue] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [coachPromptMessage, setCoachPromptMessage] = useState<string | null>(null);
  const [defaultCoachPrompt, setDefaultCoachPrompt] = useState<string | null>(null);
  const [teamCoachPrompt, setTeamCoachPromptValue] = useState("");
  const [savingTeamPrompt, setSavingTeamPrompt] = useState(false);
  const [teamCoachPromptMessage, setTeamCoachPromptMessage] = useState<string | null>(null);
  const [defaultTeamCoachPrompt, setDefaultTeamCoachPrompt] = useState<string | null>(null);
  const [coachPacket, setCoachPacket] = useState<unknown | null>(null);
  const [coachPacketPrompt, setCoachPacketPrompt] = useState<string | null>(null);
  const [loadingPacket, setLoadingPacket] = useState(false);
  const [teamCoachPacket, setTeamCoachPacket] = useState<unknown | null>(null);
  const [teamCoachPacketPrompt, setTeamCoachPacketPrompt] = useState<string | null>(null);
  const [loadingTeamPacket, setLoadingTeamPacket] = useState(false);

  const [trnGamertag, setTrnGamertag] = useState("");
  const [trnStatus, setTrnStatus] = useState<null | {
    ok: boolean;
    status: number;
    error: string | null;
    retryAfterMs: number | null;
    rateLimit?: { limit: number | null; remaining: number | null; resetAt: number | null };
    headers?: Record<string, string>;
  }>(null);
  const [checkingTrn, setCheckingTrn] = useState(false);
  const [forceTrnCheck, setForceTrnCheck] = useState(false);

  useEffect(() => {
    listSessions()
      .then((data) => {
        setSessions(data);
        if (data.length > 0) {
          setSelectedSessionId(data[0].id);
        }
      })
      .catch(() => null);
    listTeams()
      .then((data) => {
        const slim = data.map((team: any) => ({ id: team.id, name: team.name, mode: team.mode }));
        setTeams(slim);
        if (data.length > 0) {
          setSelectedTeamId(data[0].id);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    getDbMetrics(null, 200)
      .then(setDbMetrics)
      .catch((err) => setError(err.message));
  }, [selectedSessionId]);

  async function loadPollingLogs() {
    setPollingLoading(true);
    try {
      const logs = await getPollingLogs(200);
      setPollingLogs(logs);
    } catch {
      return;
    } finally {
      setPollingLoading(false);
    }
  }

  useEffect(() => {
    void loadPollingLogs();
  }, []);

  useEffect(() => {
    if (!pollingAutoRefresh) return;
    const interval = setInterval(() => {
      void loadPollingLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [pollingAutoRefresh]);

  useEffect(() => {
    getApiKeyStatus()
      .then((result) => setApiKeyStatus(result.configured))
      .catch(() => setApiKeyStatus(false));
    getOpenAiStatus()
      .then((result) => {
        setOpenAiStatus(result.configured);
        if (result.model) setOpenAiModel(result.model);
      })
      .catch(() => setOpenAiStatus(false));
    getCoachPrompt()
      .then((result) => {
        if (result.prompt) setCoachPromptValue(result.prompt);
      })
      .catch(() => undefined);
    getTeamCoachPrompt()
      .then((result) => {
        if (result.prompt) setTeamCoachPromptValue(result.prompt);
      })
      .catch(() => undefined);
    getDefaultCoachPrompt()
      .then((result) => setDefaultCoachPrompt(result.prompt))
      .catch(() => undefined);
    getDefaultTeamCoachPrompt()
      .then((result) => setDefaultTeamCoachPrompt(result.prompt))
      .catch(() => undefined);
  }, []);

  const latestDbSize = dbMetrics.length > 0 ? dbMetrics[dbMetrics.length - 1].sizeBytes : null;

  const canSaveKey = apiKey.trim().length > 0;

  async function handleSaveKey() {
    setSavingKey(true);
    setError(null);
    setApiMessage(null);
    try {
      await setApiKey(apiKey);
      const status = await getApiKeyStatus();
      setApiKeyStatus(status.configured);
      setApiKeyValue("");
      setApiMessage("API key saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save API key");
      setApiMessage("Failed to save API key.");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveOpenAi() {
    setSavingOpenAi(true);
    setError(null);
    setOpenAiMessage(null);
    try {
      await setOpenAiKey(openAiKey, openAiModel);
      const status = await getOpenAiStatus();
      setOpenAiStatus(status.configured);
      if (status.model) setOpenAiModel(status.model);
      setOpenAiKeyValue("");
      setOpenAiMessage("OpenAI key saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save OpenAI key");
      setOpenAiMessage("Failed to save OpenAI key.");
    } finally {
      setSavingOpenAi(false);
    }
  }

  function handleResetPrompt() {
    if (defaultCoachPrompt) {
      setCoachPromptValue(defaultCoachPrompt);
      setCoachPromptMessage("Loaded default prompt.");
    }
  }

  async function handleSavePrompt() {
    setSavingPrompt(true);
    setCoachPromptMessage(null);
    setError(null);
    try {
      await setCoachPrompt(coachPrompt);
      setCoachPromptMessage("Coach prompt saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save coach prompt");
      setCoachPromptMessage("Failed to save coach prompt.");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleSaveTeamPrompt() {
    setSavingTeamPrompt(true);
    setTeamCoachPromptMessage(null);
    setError(null);
    try {
      await setTeamCoachPrompt(teamCoachPrompt);
      setTeamCoachPromptMessage("Team coach prompt saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save team coach prompt");
      setTeamCoachPromptMessage("Failed to save team coach prompt.");
    } finally {
      setSavingTeamPrompt(false);
    }
  }

  function handleResetTeamPrompt() {
    if (defaultTeamCoachPrompt) {
      setTeamCoachPromptValue(defaultTeamCoachPrompt);
      setTeamCoachPromptMessage("Loaded default team prompt.");
    }
  }


  async function handleLoadTeamPacket() {
    if (!selectedTeamId) return;
    setLoadingTeamPacket(true);
    setTeamCoachPacket(null);
    setTeamCoachPacketPrompt(null);
    setError(null);
    try {
      const result = await getTeamCoachPacket(selectedTeamId);
      setTeamCoachPacket(result.packet);
      setTeamCoachPacketPrompt(result.prompt);
    } catch (err: any) {
      setError(err.message || "Failed to load team coach packet");
    } finally {
      setLoadingTeamPacket(false);
    }
  }

  async function handleLoadPacket() {
    if (!selectedSessionId) return;
    setLoadingPacket(true);
    setCoachPacket(null);
    setCoachPacketPrompt(null);
    setError(null);
    try {
      const session = sessions.find((item) => item.id === selectedSessionId);
      const mode = session?.mode || "2v2";
      const focusId = mode === "solo" ? 10 : mode === "3v3" ? 13 : 11;
      const result = await getCoachPacket(selectedSessionId, focusId);
      setCoachPacket(result.packet);
      setCoachPacketPrompt(result.prompt);
    } catch (err: any) {
      setError(err.message || "Failed to load coach packet");
    } finally {
      setLoadingPacket(false);
    }
  }

  async function handleCheckTrn() {
    if (!trnGamertag) return;
    setCheckingTrn(true);
    setTrnStatus(null);
    setError(null);
    try {
      const result = await getTrnStatus(trnGamertag, "xbl", forceTrnCheck);
      setTrnStatus(result);
    } catch (err: any) {
      setError(err.message || "Failed to check TRN status");
    } finally {
      setCheckingTrn(false);
    }
  }

  const sessionOptions = useMemo(() => {
    return sessions.map((session) => ({
      id: session.id,
      label: `${session.name} (${session.mode})`
    }));
  }, [sessions]);

  return (
    <div className="app">
      <ImpersonationBanner />
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">System admin</div>
          </div>
          <div className="banner-actions">
            <UserBadge />
            <div className="banner-actions-row">
              <details className="menu">
                <summary aria-label="System admin menu">
                  <span className="burger">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </summary>
                <div className="menu-panel">
                  <ThemeToggle />
                  <Link className="menu-link" to="/admin/users">User admin</Link>
                  <SignOutButton />
                </div>
              </details>
              <button className="ghost" onClick={() => navigate("/")}>Back</button>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content">
        {error && <p className="error">{error}</p>}

        <section className="panel">
          <div className="section-header">
            <h2>API settings</h2>
          </div>
          <p className="panel-help">Manage the Tracker Network and OpenAI keys used by the server.</p>
          <div className="panel-grid ai-grid">
            <div className="panel-block">
              <h3>Tracker Network</h3>
              <p className="panel-help">Required to fetch Rocket League stats.</p>
              <div className="form">
                <label>
                  Tracker Network API key
                  <input
                    type="password"
                    value={apiKey}
                    placeholder={apiKeyStatus ? "Configured" : "Enter API key"}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button onClick={handleSaveKey} disabled={savingKey || !canSaveKey}>
                    {savingKey ? "Saving..." : "Save API key"}
                  </button>
                  <span>{apiKeyStatus ? "Key configured" : "Key missing"}</span>
                  {apiMessage && <span>{apiMessage}</span>}
                </div>
              </div>
            </div>
            <div className="panel-block">
              <h3>OpenAI</h3>
              <p className="panel-help">Used to generate AI Coach reports.</p>
              <div className="form">
                <label>
                  OpenAI API key
                  <input
                    type="password"
                    value={openAiKey}
                    placeholder={openAiStatus ? "Configured" : "Enter OpenAI API key"}
                    onChange={(e) => setOpenAiKeyValue(e.target.value)}
                  />
                </label>
                <label>
                  OpenAI model
                  <input
                    type="text"
                    value={openAiModel}
                    placeholder="gpt-4o-mini"
                    onChange={(e) => setOpenAiModel(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button onClick={handleSaveOpenAi} disabled={savingOpenAi || openAiKey.trim().length === 0}>
                    {savingOpenAi ? "Saving..." : "Save OpenAI key"}
                  </button>
                  <span>{openAiStatus ? "Key configured" : "Key missing"}</span>
                  {openAiMessage && <span>{openAiMessage}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>TRN status check</h2>
          </div>
          <p className="panel-help">Test whether Tracker Network is accepting requests for a gamertag.</p>
          <div className="form">
            <label>
              Gamertag
              <input
                type="text"
                value={trnGamertag}
                placeholder="Enter gamertag"
                onChange={(e) => setTrnGamertag(e.target.value)}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={forceTrnCheck}
                onChange={(e) => setForceTrnCheck(e.target.checked)}
              />
              Force check (bypass cooldown)
            </label>
            <div className="actions">
              <button onClick={handleCheckTrn} disabled={checkingTrn || !trnGamertag}>
                {checkingTrn ? "Checking..." : "Check TRN status"}
              </button>
              {trnStatus && (
                <span className={trnStatus.ok ? "status-pill ok" : "status-pill error"}>
                  {trnStatus.ok ? `OK (${trnStatus.status})` : `Blocked (${trnStatus.status || "error"})`}
                </span>
              )}
              {trnStatus?.retryAfterMs && (
                <span>Retry after {Math.ceil(trnStatus.retryAfterMs / 1000)}s</span>
              )}
            </div>
            {trnStatus?.error && <p className="note">{trnStatus.error}</p>}
            {trnStatus?.rateLimit && (
              <p className="note">
                Rate limit: {trnStatus.rateLimit.remaining ?? "-"} / {trnStatus.rateLimit.limit ?? "-"} remaining
                {trnStatus.rateLimit.resetAt
                  ? `, resets at ${new Date(trnStatus.rateLimit.resetAt).toLocaleTimeString()}`
                  : ""}
              </p>
            )}
            {trnStatus && (
              <details className="advanced">
                <summary>View response headers</summary>
                {trnStatus.headers && Object.keys(trnStatus.headers).length > 0 ? (
                  <pre className="code-block">{JSON.stringify(trnStatus.headers, null, 2)}</pre>
                ) : (
                  <p className="note">No headers captured (cooldown or request failed before headers).</p>
                )}
              </details>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>AI Coach debugging</h2>
          </div>
          <p className="panel-help">Tune the system prompt and preview the compact packet sent to OpenAI.</p>
          <div className="panel-grid ai-grid">
            <div className="ai-grid-row">
              <div className="panel-block">
              <h3>Session coach prompt</h3>
              <div className="form">
                <label>
                  Session coach prompt template
                  <textarea
                    value={coachPrompt}
                    rows={6}
                    placeholder="Add additional coaching instructions..."
                    onChange={(e) => setCoachPromptValue(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button onClick={handleSavePrompt} disabled={savingPrompt}>
                    {savingPrompt ? "Saving..." : "Save session coach prompt"}
                  </button>
                  <button className="ghost" onClick={handleResetPrompt} disabled={!defaultCoachPrompt}>
                    Reset to default
                  </button>
                  {coachPromptMessage && <span>{coachPromptMessage}</span>}
                </div>
              </div>
              {defaultCoachPrompt && (
                <details className="advanced">
                  <summary>View default session prompt</summary>
                  <pre className="code-block">{defaultCoachPrompt}</pre>
                </details>
              )}
              </div>
              <div className="panel-block">
              <h3>Team coach prompt</h3>
              <div className="form">
                <label>
                  Team coach prompt template
                  <textarea
                    value={teamCoachPrompt}
                    rows={6}
                    placeholder="Add team-level coaching instructions..."
                    onChange={(e) => setTeamCoachPromptValue(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button onClick={handleSaveTeamPrompt} disabled={savingTeamPrompt}>
                    {savingTeamPrompt ? "Saving..." : "Save team coach prompt"}
                  </button>
                  <button className="ghost" onClick={handleResetTeamPrompt} disabled={!defaultTeamCoachPrompt}>
                    Reset to default
                  </button>
                  {teamCoachPromptMessage && <span>{teamCoachPromptMessage}</span>}
                </div>
              </div>
              {defaultTeamCoachPrompt && (
                <details className="advanced">
                  <summary>View default team prompt</summary>
                  <pre className="code-block">{defaultTeamCoachPrompt}</pre>
                </details>
              )}
              </div>
            </div>
            <div className="ai-grid-row">
              <div className="panel-block">
              <h3>Coach packet preview</h3>
              <div className="form">
                <label>
                  Session
                  <select
                    value={selectedSessionId ?? ""}
                    onChange={(e) => setSelectedSessionId(Number(e.target.value))}
                  >
                    {sessionOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button onClick={handleLoadPacket} disabled={loadingPacket || !selectedSessionId}>
                    {loadingPacket ? "Loading..." : "Preview coach packet"}
                  </button>
                </div>
                {coachPacketPrompt && (
                  <p className="note">Using custom prompt template.</p>
                )}
                {coachPacket && (
                  <pre className="code-block">{JSON.stringify(coachPacket, null, 2)}</pre>
                )}
              </div>
              </div>
              <div className="panel-block">
              <h3>Team coach packet preview</h3>
              <div className="form">
                <label>
                  Team
                  <select
                    value={selectedTeamId ?? ""}
                    onChange={(e) => setSelectedTeamId(Number(e.target.value))}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.mode})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button onClick={handleLoadTeamPacket} disabled={loadingTeamPacket || !selectedTeamId}>
                    {loadingTeamPacket ? "Loading..." : "Preview team coach packet"}
                  </button>
                </div>
                {teamCoachPacketPrompt && (
                  <p className="note">Using custom team prompt template.</p>
                )}
                {teamCoachPacket && (
                  <pre className="code-block">{JSON.stringify(teamCoachPacket, null, 2)}</pre>
                )}
              </div>
            </div>
          </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Database size over time</h2>
            <span>{latestDbSize !== null ? formatBytes(latestDbSize) : "-"}</span>
          </div>
          
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dbMetrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" hide />
                <YAxis tickFormatter={(value) => formatBytes(Number(value))} />
                <Tooltip formatter={(value) => formatBytes(typeof value === "number" ? value : Number(value))} />
                <Line type="monotone" dataKey="sizeBytes" stroke="#3772ff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Polling logs</h2>
            <div className="actions">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={pollingAutoRefresh}
                  onChange={(e) => setPollingAutoRefresh(e.target.checked)}
                />
                Auto refresh
              </label>
              <button className="ghost" onClick={loadPollingLogs} disabled={pollingLoading}>
                {pollingLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          <p className="panel-help">Latest 200 polling events across all sessions.</p>
          {pollingLogs.length === 0 && <p>No logs yet.</p>}
          {pollingLogs.length > 0 && (
            <div className="team-history-table extra">
              <div className="team-history-row header">
                <span>Time</span>
                <span>Session</span>
                <span>Player</span>
                <span>Last match ID</span>
                <span>Last match at</span>
                <span>TRN latest ID</span>
                <span>TRN latest at</span>
                <span>New matches</span>
                <span>Total matches</span>
                <span>Error</span>
              </div>
              {pollingLogs.map((log) => (
                <div className="team-history-row" key={log.id}>
                  <span>{formatDateTime(log.createdAt)}</span>
                  <span>#{log.sessionId}</span>
                  <span>{log.gamertag || "-"}</span>
                  <span>{log.lastMatchId || "-"}</span>
                  <span>{formatDateTime(log.lastMatchAt)}</span>
                  <span>{log.latestMatchId || "-"}</span>
                  <span>{formatDateTime(log.latestMatchAt)}</span>
                  <span>{log.newMatches}</span>
                  <span>{log.totalMatches}</span>
                  <span>{log.error || "-"}</span>
                </div>
              ))}
            </div>
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}
