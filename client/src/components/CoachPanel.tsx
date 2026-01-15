import { useEffect, useMemo, useState } from "react";
import { CoachReport, CoachReportListItem } from "../types";
import { generateCoachReport, getLatestCoachReport, listCoachReports } from "../api";

interface CoachPanelProps {
  sessionId: number;
  mode: string;
}

const modePlaylist: Record<string, number> = {
  solo: 10,
  "2v2": 11,
  "3v3": 13
};

export default function CoachPanel({ sessionId, mode }: CoachPanelProps) {
  const focusPlaylistId = modePlaylist[mode] ?? 11;
  const [report, setReport] = useState<CoachReport | null>(null);
  const [reports, setReports] = useState<CoachReportListItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | "latest">("latest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [latestResult, historyResult] = await Promise.allSettled([
          getLatestCoachReport(sessionId, focusPlaylistId),
          listCoachReports(sessionId, focusPlaylistId)
        ]);
        if (!active) return;

        if (historyResult.status === "fulfilled") {
          setReports(historyResult.value);
        }

        if (latestResult.status === "fulfilled") {
          setReport(latestResult.value.report);
          return;
        }

        setReport(null);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || "Failed to load coach report");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [sessionId, focusPlaylistId]);

  const selectedReport = useMemo(() => {
    if (selectedReportId === "latest") return report;
    const item = reports.find((entry) => entry.id === selectedReportId);
    return item?.report ?? null;
  }, [selectedReportId, report, reports]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const newReport = await generateCoachReport(sessionId, focusPlaylistId);
      setReport(newReport);
      const history = await listCoachReports(sessionId, focusPlaylistId);
      setReports(history);
      setSelectedReportId("latest");
    } catch (err: any) {
      setError(err.message || "Failed to generate coach report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel coach-panel">
      <details className="coach-toggle">
        <summary>
          <h2>AI Coach</h2>
          <span className="coach-toggle-hint">Show or hide the coach report</span>
        </summary>
        <div className="coach-body">
          <div className="section-header">
            <div className="coach-actions">
              <button onClick={handleGenerate} disabled={loading}>
                {loading ? "Generating..." : report ? "Refresh Coach Report" : "Generate Coach Report"}
              </button>
              <label className="coach-select">
                <span>View previous</span>
                <select
                  value={selectedReportId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedReportId(value === "latest" ? "latest" : Number(value));
                  }}
                  disabled={reports.length === 0}
                >
                  <option value="latest">Latest</option>
                  {reports.map((item) => (
                    <option key={item.id} value={item.id}>
                      {new Date(item.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading && (
            <div className="coach-loading">
              <svg className="coach-robot" viewBox="0 0 120 120" aria-hidden="true">
                <rect x="20" y="26" width="80" height="70" rx="16" />
                <circle className="robot-eye" cx="48" cy="58" r="6" />
                <circle className="robot-eye" cx="72" cy="58" r="6" />
                <rect x="46" y="72" width="28" height="6" rx="3" />
                <rect x="56" y="8" width="8" height="14" rx="4" />
                <circle cx="60" cy="6" r="6" />
              </svg>
              <div className="coach-thinking">
                <span>Thinking</span>
                <span className="coach-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          {!selectedReport && !loading && <p>No coach report yet. Generate one to get insights.</p>}

          {selectedReport && (
            <div className="coach-report">
              <h3>{selectedReport.headline}</h3>

              <div className="coach-grid">
                {selectedReport.strengths?.map((strength, index) => (
                  <div key={`strength-${index}`} className="coach-card">
                    <h4>{strength.title}</h4>
                    <ul>
                      {strength.evidence?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                    <div className="coach-label">Keep doing</div>
                    <ul>
                      {strength.keepDoing?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="coach-priorities">
                {selectedReport.priorities?.map((priority, index) => (
                  <details key={`priority-${index}`} className="coach-accordion" open={index === 0}>
                    <summary>{priority.title}</summary>
                    <div className="coach-accordion-body">
                      <div className="coach-evidence">
                        <h5>Evidence</h5>
                        <ul>
                          {priority.evidence?.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="coach-hypothesis">
                        <h5>Hypothesis</h5>
                        <p>{priority.hypothesis?.text}</p>
                        <span className="coach-confidence">Confidence: {priority.hypothesis?.confidence}</span>
                      </div>
                      <div className="coach-actions-list">
                        <h5>Actions</h5>
                        {priority.actions?.map((action, idx) => (
                          <div key={idx} className="coach-action-item">
                            <strong>{action.action}</strong>
                            <p>{action.why}</p>
                            <span>Target: {action.target}</span>
                          </div>
                        ))}
                      </div>
                      <div className="coach-drills">
                        <h5>Drills</h5>
                        <ul>
                          {priority.drills?.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                ))}
              </div>

              <div className="coach-goals">
                <h4>Next session goals</h4>
                <div className="coach-goals-table">
                  <div className="coach-goals-header">
                    <span>Metric</span>
                    <span>Current</span>
                    <span>Target</span>
                    <span>How to measure</span>
                  </div>
                  {selectedReport.nextSessionGoals?.map((goal, index) => (
                    <div key={index} className="coach-goals-row">
                      <span>{goal.metric}</span>
                      <span>{goal.current}</span>
                      <span>{goal.target}</span>
                      <span>{goal.howToMeasure}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="coach-questions">
                <h4>Questions for you</h4>
                <ul>
                  {selectedReport.questionsForYou?.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
