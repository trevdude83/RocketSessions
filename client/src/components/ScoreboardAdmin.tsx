import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getScoreboardSettings,
  listScoreboardDevices,
  listScoreboardIngests,
  listScoreboardUnmatched,
  processScoreboardIngest,
  assignScoreboardUnmatched,
  listSessions,
  registerScoreboardDevice,
  setScoreboardDeviceEnabled,
  setScoreboardSettings
} from "../api";
import { ScoreboardDevice, ScoreboardIngest, ScoreboardUnmatched, Session } from "../types";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";
import ImpersonationBanner from "./ImpersonationBanner";
import SignOutButton from "./SignOutButton";
import UserBadge from "./UserBadge";

export default function ScoreboardAdmin() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<ScoreboardDevice[]>([]);
  const [ingests, setIngests] = useState<ScoreboardIngest[]>([]);
  const [unmatched, setUnmatched] = useState<ScoreboardUnmatched[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [assignSelection, setAssignSelection] = useState<Record<number, number>>({});
  const [retentionDays, setRetentionDays] = useState<string>("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registeredKey, setRegisteredKey] = useState<string | null>(null);
  const [registeredDeviceId, setRegisteredDeviceId] = useState<number | null>(null);

  async function loadScoreboard() {
    setLoading(true);
    setMessage(null);
    try {
      const [deviceData, ingestData, settings, unmatchedData, sessionData] = await Promise.all([
        listScoreboardDevices(),
        listScoreboardIngests(50),
        getScoreboardSettings(),
        listScoreboardUnmatched(50),
        listSessions()
      ]);
      setDevices(deviceData);
      setIngests(ingestData);
      setUnmatched(unmatchedData);
      setSessions(sessionData);
      setRetentionDays(settings.retentionDays !== null ? String(settings.retentionDays) : "");
    } catch (err: any) {
      setMessage(err.message || "Failed to load ScoreboardCam data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadScoreboard();
  }, []);

  async function handleProcessIngest(ingestId: number) {
    setProcessingId(ingestId);
    setMessage(null);
    try {
      const result = await processScoreboardIngest(ingestId);
      setMessage(
        result.status === "extracted"
          ? `Ingest #${ingestId} processed.`
          : `Ingest #${ingestId} status: ${result.status}`
      );
      await loadScoreboard();
    } catch (err: any) {
      setMessage(err.message || "Failed to process ingest.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleAssignUnmatched(unmatchedId: number) {
    const sessionId = assignSelection[unmatchedId];
    if (!sessionId) {
      setMessage("Choose a session to assign.");
      return;
    }
    setAssigningId(unmatchedId);
    setMessage(null);
    try {
      await assignScoreboardUnmatched(unmatchedId, sessionId);
      setMessage(`Unmatched ingest assigned to session #${sessionId}.`);
      await loadScoreboard();
    } catch (err: any) {
      setMessage(err.message || "Failed to assign unmatched ingest.");
    } finally {
      setAssigningId(null);
    }
  }

  async function handleToggleDevice(deviceId: number, enabled: boolean) {
    setMessage(null);
    try {
      await setScoreboardDeviceEnabled(deviceId, enabled);
      setDevices((prev) =>
        prev.map((device) => (device.id === deviceId ? { ...device, isEnabled: enabled ? 1 : 0 } : device))
      );
    } catch (err: any) {
      setMessage(err.message || "Failed to update device.");
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setMessage(null);
    try {
      const value = retentionDays.trim();
      const payload = value.length === 0 ? null : Number(value);
      const result = await setScoreboardSettings({ retentionDays: payload });
      setRetentionDays(result.retentionDays !== null ? String(result.retentionDays) : "");
      setMessage("Scoreboard settings saved.");
    } catch (err: any) {
      setMessage(err.message || "Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleRegisterDevice() {
    setMessage(null);
    setRegisteredKey(null);
    setRegisteredDeviceId(null);
    try {
      const result = await registerScoreboardDevice(registerName.trim() || undefined);
      setRegisteredDeviceId(result.deviceId);
      setRegisteredKey(result.deviceKey);
      setRegisterName("");
      await loadScoreboard();
    } catch (err: any) {
      setMessage(err.message || "Failed to register device.");
    }
  }

  async function handleCopyKey() {
    if (!registeredKey) return;
    try {
      await navigator.clipboard.writeText(registeredKey);
      setMessage("Device key copied to clipboard.");
    } catch {
      setMessage("Failed to copy device key.");
    }
  }

  function formatRoster(names: string[]) {
    if (!names || names.length === 0) return "-";
    return names.join(", ");
  }

  const activeSessions = sessions.filter((session) => !session.isEnded);

  return (
    <div className="app">
      <ImpersonationBanner />
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">ScoreboardCam</div>
          </div>
          <div className="banner-actions">
            <UserBadge />
            <div className="banner-actions-row">
              <details className="menu">
                <summary aria-label="ScoreboardCam menu">
                  <span className="burger">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </summary>
                <div className="menu-panel">
                  <ThemeToggle />
                  <Link className="menu-link" to="/admin">System admin</Link>
                  <Link className="menu-link" to="/admin/users">User admin</Link>
                  <SignOutButton />
                </div>
              </details>
              <button className="ghost" onClick={() => navigate("/sessions")}>Back</button>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content">
        {message && <p className="note">{message}</p>}

        <section className="panel">
          <div className="section-header">
            <h2>Scoreboard settings</h2>
            <button className="ghost" onClick={loadScoreboard} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <p className="panel-help">Retention controls automated cleanup (runs every 6 hours).</p>
          <div className="panel-block">
            <div className="form">
              <label>
                Retention days (optional)
                <input
                  type="number"
                  min="0"
                  value={retentionDays}
                  placeholder="Leave blank to disable"
                  onChange={(e) => setRetentionDays(e.target.value)}
                />
              </label>
              <div className="actions">
                <button onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? "Saving..." : "Save settings"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Register device</h2>
          </div>
          <p className="panel-help">Device keys are shown once. Copy and store them securely.</p>
          <div className="panel-block">
            <div className="form">
              <label>
                Device name (optional)
                <input
                  type="text"
                  value={registerName}
                  placeholder="LivingRoomPi"
                  onChange={(e) => setRegisterName(e.target.value)}
                />
              </label>
              <div className="actions">
                <button onClick={handleRegisterDevice}>Register device</button>
              </div>
              {registeredKey && (
                <div className="note">
                  <div>Device #{registeredDeviceId} key:</div>
                  <pre className="code-block">{registeredKey}</pre>
                  <button className="ghost" onClick={handleCopyKey}>Copy key</button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Devices</h2>
          </div>
          {devices.length === 0 && <p>No devices registered yet.</p>}
          {devices.length > 0 && (
            <div className="team-history-table extra scoreboard-devices">
              <div className="team-history-row header">
                <span>ID</span>
                <span>Device</span>
                <span>Last seen</span>
                <span>Enabled</span>
                <span>Created</span>
                <span>Actions</span>
              </div>
              {devices.map((device) => (
                <div className="team-history-row" key={device.id}>
                  <span>#{device.id}</span>
                  <span>{device.name || `Device #${device.id}`}</span>
                  <span>{formatDateTime(device.lastSeenAt)}</span>
                  <span>{device.isEnabled ? "Yes" : "No"}</span>
                  <span>{formatDateTime(device.createdAt)}</span>
                  <span>
                    <button
                      className="ghost"
                      onClick={() => handleToggleDevice(device.id, !device.isEnabled)}
                    >
                      {device.isEnabled ? "Disable" : "Enable"}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Unmatched ingests</h2>
          </div>
          <p className="panel-help">Queue of OCR captures that could not be confidently matched to an active session.</p>
          {unmatched.length === 0 && <p>No unmatched ingests.</p>}
          {unmatched.length > 0 && (
            <div className="team-history-table extra">
              <div className="team-history-row header">
                <span>Ingest</span>
                <span>Mode</span>
                <span>Blue roster</span>
                <span>Orange roster</span>
                <span>Top candidates</span>
                <span>Assign</span>
              </div>
              {unmatched.map((item) => (
                <div className="team-history-row" key={item.id}>
                  <span>#{item.ingestId}</span>
                  <span>{item.mode ?? "-"}</span>
                  <span>{formatRoster(item.blueNames)}</span>
                  <span>{formatRoster(item.orangeNames)}</span>
                  <span className="signature-cell" title={JSON.stringify(item.candidates ?? [])}>
                    {(item.candidates ?? [])
                      .slice(0, 2)
                      .map((candidate) => `#${candidate.sessionId} (${candidate.score})`)
                      .join(", ") || "-"}
                  </span>
                  <span>
                    <div className="inline-actions">
                      <select
                        value={assignSelection[item.id] ?? ""}
                        onChange={(e) =>
                          setAssignSelection((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                        }
                      >
                        <option value="">Select session</option>
                        {activeSessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            #{session.id} {session.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="ghost"
                        disabled={assigningId === item.id}
                        onClick={() => handleAssignUnmatched(item.id)}
                      >
                        {assigningId === item.id ? "Assigning..." : "Assign"}
                      </button>
                    </div>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-header">
            <h2>Ingests</h2>
          </div>
          {ingests.length === 0 && <p>No ingests yet.</p>}
          {ingests.length > 0 && (
            <div className="team-history-table extra">
              <div className="team-history-row header">
                <span>ID</span>
                <span>Status</span>
                <span>Session</span>
                <span>Team</span>
                <span>Match</span>
                <span>Signature</span>
                <span>Received</span>
                <span>Actions</span>
              </div>
              {ingests.map((ingest) => (
                <div className="team-history-row" key={ingest.id}>
                  <span>#{ingest.id}</span>
                  <span className={ingest.status === "failed" ? "status-pill error" : "status-pill ok"}>
                    {ingest.status}
                  </span>
                  <span>{ingest.sessionId ? `#${ingest.sessionId}` : "-"}</span>
                  <span>{ingest.teamId ? `#${ingest.teamId}` : "-"}</span>
                  <span>{ingest.matchId ? `#${ingest.matchId}` : "-"}</span>
                  <span className="signature-cell" title={ingest.signatureKey ?? ""}>
                    {formatSignatureKey(ingest.signatureKey)}
                  </span>
                  <span>{formatDateTime(ingest.receivedAt)}</span>
                  <span>
                    <button
                      className="ghost"
                      disabled={processingId === ingest.id}
                      onClick={() => handleProcessIngest(ingest.id)}
                    >
                      {processingId === ingest.id ? "Processing..." : "Process"}
                    </button>
                  </span>
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatSignatureKey(value: string | null | undefined) {
  if (!value) return "-";
  return value;
}
