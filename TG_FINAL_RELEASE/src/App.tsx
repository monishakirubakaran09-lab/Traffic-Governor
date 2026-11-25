import { Component, useEffect, useMemo, useState } from "react";
import "./enter-trafficgovernor.css";
import {
  getMetrics, getPolicy, savePolicy as saveBackendPolicy, getLogs,
  checkRequest, getRole, setBackendRole, resetClientMetrics,
  type MetricsResponse, type BackendPolicy, type BackendLog,
} from "./api";
import type { ErrorInfo, ReactNode } from "react";

type Page =
  | "Dashboard"
  | "Policy Settings"
  | "Traffic Simulator"
  | "Metrics"
  | "Analysis Report"
  | "About / Help";
type IconName =
  | "grid"
  | "sliders"
  | "bolt"
  | "chart"
  | "report"
  | "help"
  | "search"
  | "bell"
  | "chevron"
  | "menu"
  | "close"
  | "check"
  | "x"
  | "clock"
  | "server"
  | "download"
  | "arrow"
  | "info"
  | "shield"
  | "copy";

const icons: Record<IconName, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="13" cy="18" r="2" />
    </>
  ),
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7z" />,
  chart: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </>
  ),
  report: (
    <>
      <path d="M6 2h9l4 4v16H6z" />
      <path d="M14 2v5h5M9 12h6M9 16h6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.3 2-2.3 3.7M12 17.5h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  x: (
    <>
      <path d="m7 7 10 10M17 7 7 17" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
    </>
  ),
};

function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

type DemoNotification = {
  id: string;
  kind: "policy" | "limit" | "simulation";
  title: string;
  description: string;
  createdAt: number;
  read: boolean;
};
const NOTIFICATION_STORAGE_KEY = "trafficgovernor_notifications";
// Keep the current page on refresh within this browser tab (demo-only navigation).
const CURRENT_SCREEN_KEY = "trafficgovernor_current_screen";
const CURRENT_PAGE_KEY = "trafficgovernor_current_page";

const nav: { label: Page; icon: IconName }[] = [
  { label: "Dashboard", icon: "grid" },
  { label: "Policy Settings", icon: "sliders" },
  { label: "Traffic Simulator", icon: "bolt" },
  { label: "Metrics", icon: "chart" },
  { label: "Analysis Report", icon: "report" },
  { label: "About / Help", icon: "help" },
];

const baseLogs = [
  {
    time: "14:32:08.421",
    client: "client_web_01",
    endpoint: "/api/v1/orders",
    status: "Allowed",
    code: 200,
    latency: 42,
  },
  {
    time: "14:32:08.194",
    client: "client_mobile_07",
    endpoint: "/api/v1/products",
    status: "Allowed",
    code: 200,
    latency: 38,
  },
  {
    time: "14:32:07.982",
    client: "client_web_01",
    endpoint: "/api/v1/orders",
    status: "Denied",
    code: 429,
    latency: 3,
  },
  {
    time: "14:32:07.761",
    client: "partner_sync_03",
    endpoint: "/api/v1/sync",
    status: "Allowed",
    code: 200,
    latency: 71,
  },
  {
    time: "14:32:07.544",
    client: "client_mobile_12",
    endpoint: "/api/v1/auth",
    status: "Allowed",
    code: 200,
    latency: 54,
  },
];

const clients = [
  { id: "client_web_01", requests: 28420, allowed: 26998, denied: 1422, latency: 47, rate: "5.0%" },
  {
    id: "client_mobile_07",
    requests: 21384,
    allowed: 20888,
    denied: 496,
    latency: 39,
    rate: "2.3%",
  },
  {
    id: "partner_sync_03",
    requests: 18205,
    allowed: 16758,
    denied: 1447,
    latency: 82,
    rate: "7.9%",
  },
  {
    id: "client_mobile_12",
    requests: 15042,
    allowed: 14744,
    denied: 298,
    latency: 51,
    rate: "2.0%",
  },
  { id: "internal_worker", requests: 11891, allowed: 11891, denied: 0, latency: 28, rate: "0.0%" },
  { id: "client_web_14", requests: 9823, allowed: 9134, denied: 689, latency: 63, rate: "7.0%" },
];

type SimulationDecision = (typeof baseLogs)[number] & {
  tokensRemaining?: number;
  retryAfterMs?: number;
};
const HISTORY_KEY = "trafficgovernor_demo_history";
function readHistory(): SimulationDecision[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SimulationDecision =>
      item && typeof item === "object" && typeof item.client === "string" &&
      typeof item.endpoint === "string" && (item.code === 200 || item.code === 429) &&
      typeof item.latency === "number" && typeof item.time === "string"
    ).slice(-5000);
  } catch { return []; }
}
function buildClientRows(history: SimulationDecision[]) {
  const byClient = new Map(clients.map(c => [c.id, { ...c }]));
  for (const decision of history) {
    const existing = byClient.get(decision.client) || { id: decision.client, requests: 0, allowed: 0, denied: 0, latency: 0, rate: "0.0%" };
    const prior = existing.requests;
    existing.requests += 1;
    existing.allowed += decision.code === 200 ? 1 : 0;
    existing.denied += decision.code === 429 ? 1 : 0;
    existing.latency = Math.round((existing.latency * prior + decision.latency) / existing.requests);
    existing.rate = `${((existing.denied / existing.requests) * 100).toFixed(1)}%`;
    byClient.set(decision.client, existing);
  }
  return [...byClient.values()];
}

type Policy = { algorithm: "token" | "sliding"; capacity: number; refill: number; window: number; scope: "client" };
const defaultPolicy: Policy = { algorithm: "token", capacity: 100, refill: 10, window: 60, scope: "client" };
const isValidPolicy = (p: Policy) =>
  Number.isInteger(p.capacity) && p.capacity >= 1 && p.capacity <= 10000 &&
  Number.isFinite(p.refill) && p.refill > 0 && p.refill <= 1000 &&
  Number.isInteger(p.window) && p.window >= 1 && p.window <= 86400;

function fromBackendPolicy(data: BackendPolicy): Policy {
  return {
    algorithm: data.algorithm === "sliding_window" ? "sliding" : "token",
    capacity: data.algorithm === "sliding_window" ? data.window_limit : data.capacity,
    refill: data.refill_rate,
    window: data.window_seconds,
    scope: "client",
  };
}

function toBackendPolicy(policy: Policy): Partial<BackendPolicy> & Pick<BackendPolicy, "algorithm"> {
  return policy.algorithm === "sliding"
    ? { algorithm: "sliding_window", window_limit: policy.capacity, window_seconds: policy.window }
    : { algorithm: "token_bucket", capacity: policy.capacity, refill_rate: policy.refill };
}

function renderLog(row: BackendLog): SimulationDecision {
  const time = new Date(row.timestamp);
  return {
    time: Number.isNaN(time.getTime()) ? row.timestamp : time.toLocaleTimeString("en-GB", { hour12: false }),
    client: row.client_id,
    endpoint: row.endpoint || "/check",
    status: row.status === 200 ? "Allowed" : "Denied",
    code: row.status,
    latency: Number.isFinite(row.latency_ms) ? row.latency_ms : 0,
    tokensRemaining: row.tokens_remaining ?? row.remaining ?? undefined,
    retryAfterMs: row.retry_after_ms ?? undefined,
  };
}

function Status({
  type,
  children,
}: {
  type: "ok" | "bad" | "warn" | "live";
  children: React.ReactNode;
}) {
  return (
    <span className={`status status-${type}`}>
      <span className="status-icon">{type === "bad" ? "×" : type === "warn" ? "!" : "✓"}</span>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

function TrafficChart({ volume = [] }: { volume?: Array<{ minute: string; requests: number }> }) {
  const maxValue = Math.max(1, ...volume.map(v => v.requests));
  const plot = volume.length >= 2
    ? volume.map((p, i) => `${(i / (volume.length - 1) * 720).toFixed(1)},${(137 - p.requests / maxValue * 115).toFixed(1)}`).join(" ")
    : "0,137 720,137";
  return <div className="chart-wrap">
    <svg viewBox="0 0 720 160" preserveAspectRatio="none" role="img" aria-label="Total incoming requests per minute, from the Python backend">
      {[20, 55, 90, 125].map(y => <line key={y} x1="0" x2="720" y1={y} y2={y} className="gridline"/>)}
      <polyline points={plot} className="line allowed-line" />
    </svg>
    <div className="chart-labels">
      {volume.length ? volume.map((point, i) => <span key={`${point.minute}-${i}`}>{point.minute}</span>) : <span>Waiting for server metrics</span>}
    </div>
  </div>;
}

function Dashboard({
  goTo, dynamicLogs, policy, history, liveMetrics, metricsError, policyLoaded,
}: {
  goTo: (p: Page) => void;
  dynamicLogs: SimulationDecision[];
  policy: Policy;
  history: SimulationDecision[];
  liveMetrics: MetricsResponse | null;
  metricsError: boolean;
  policyLoaded: boolean;
}) {
  const demoTotal = history.length;
  const demoAllowed = history.filter(x => x.code === 200).length;
  const demoDenied = demoTotal - demoAllowed;
  const total = liveMetrics?.total ?? 0;
const allowed = liveMetrics?.allowed ?? 0;
const denied = liveMetrics?.denied ?? 0;

const denyRate = total > 0
  ? ((denied / total) * 100).toFixed(2)
  : "0.00";

const displayCount = (value: number) =>
  liveMetrics ? value.toLocaleString() : "—";

const kpis = [
  {
    label: "Total Requests",
    value: displayCount(total),
    delta: "Live",
    note: "Requests recorded by Python",
    icon: "server" as IconName,
  },
  {
    label: "Allowed",
    value: displayCount(allowed),
    delta: "Live",
    note: "HTTP 200 decisions",
    icon: "check" as IconName,
    tone: "green",
  },
  {
    label: "Denied",
    value: displayCount(denied),
    delta: "Live",
    note: "HTTP 429 decisions",
    icon: "x" as IconName,
    tone: "red",
  },
  {
    label: "Denial Rate",
    value: liveMetrics ? `${denyRate}%` : "—",
    delta: "Live",
    note: "Denied / Total × 100",
    icon: "shield" as IconName,
    tone: "amber",
  },
  {
    label: "P95 Latency",
    value: liveMetrics?.p95_latency_ms == null
      ? "—"
      : `${liveMetrics.p95_latency_ms.toFixed(1)} ms`,
    delta: "Live",
    note: "95th percentile latency",
    icon: "clock" as IconName,
    tone: "blue",
  },
];
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live requests evaluated by the Python TrafficGovernor backend."
      >
        <div className="live-indicator">
          <span />
          {metricsError
  ? "Backend disconnected"
  : liveMetrics
    ? "Live backend metrics"
    : "Connecting to backend..."}
        </div>
        <button className="btn secondary" onClick={() => goTo("Traffic Simulator")}>
          <Icon name="bolt" size={16} />
          Simulate traffic
        </button>
      </PageHeader>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <Card key={k.label} className="kpi-card">
            <div className={`kpi-icon ${k.tone || ""}`}>
              <Icon name={k.icon} size={18} />
            </div>
            <p className="kpi-label">
              {k.label}
              <span className="tooltip" data-tip={`${k.label} across the selected period`}>
                <Icon name="info" size={13} />
              </span>
            </p>
            <strong>{k.value}</strong>
            <div className="kpi-foot">
              <span
                className={
                  k.delta.startsWith("+") && k.label === "Denied" ? "negative" : "positive"
                }
              >
                {k.delta}
              </span>{" "}
              {k.note}
            </div>
          </Card>
        ))}
      </div>
      <div className="dashboard-grid">
        <Card className="traffic-card">
          <div className="card-head">
            <div>
              <h2>Request traffic</h2>
              <p>Live request volume from Python (total requests per minute)</p>
            </div>
            <div className="legend">
              <span>
                <i className="dot blue" />
                Total requests
              </span>
              <span>
                <i className="dot red" />
                HTTP 429 tracked in KPIs
              </span>
              <select aria-label="Chart time range">
                <option>Last 6 minutes</option>
              </select>
            </div>
          </div>
          <div className="chart-stats">
            <div>
              <span>Average requests/min</span>
              <strong>{liveMetrics?.volume?.length ? (liveMetrics.volume.reduce((a,b) => a+b.requests,0)/liveMetrics.volume.length).toFixed(1) : "—"}</strong>
            </div>
            <div>
              <span>Peak requests/min</span>
              <strong>{liveMetrics?.volume?.length ? Math.max(...liveMetrics.volume.map(v => v.requests)) : "—"}</strong>
            </div>
          </div>
          <TrafficChart volume={liveMetrics?.volume} />
          {demoTotal > 0 && <div className="demo-activity-note" role="status">
            <strong>Requests sent from this page session</strong>
            <span>{demoTotal.toLocaleString()} requests · {demoAllowed.toLocaleString()} allowed · {demoDenied.toLocaleString()} denied</span>
            <div className="demo-activity-bar" aria-label={`${demoAllowed} allowed, ${demoDenied} denied`}>
              <span style={{width: `${100 * demoAllowed / demoTotal}%`}} />
            </div>
          </div>}
        </Card>
        <Card className="policy-card">
          <div className="card-head">
            <div>
              <h2>Current policy</h2>
              <p>Per-client rate limit</p>
            </div>
            {policyLoaded ? <Status type="live">Backend policy</Status> : <Status type="warn">Awaiting policy</Status>}
          </div>
          {policyLoaded && <div className="policy-visual">
            <div className="bucket">
              <span style={{ height: "68%" }} />
            </div>
            <div>
                            <span>Illustrative token level (not live)</span>
              <strong>
                {policy.algorithm === "token" ? Math.min(68, policy.capacity) : "—"} <small>/ {policy.algorithm === "token" ? policy.capacity : "—"}</small>
              </strong>
                              <p>{policy.algorithm === "token" ? `Refilling at ${policy.refill} tokens/sec` : `${policy.capacity} requests / ${policy.window}s sliding window`}</p>
            </div>
          </div>}
          <dl>
            <div>
              <dt>Algorithm</dt>
              <dd>{policyLoaded ? (policy.algorithm === "token" ? "Token Bucket" : "Sliding Window") : "—"}</dd>
            </div>
            <div>
                <dt>{policy.algorithm === "token" ? "Capacity" : "Request limit"}</dt>
                <dd>{policyLoaded ? `${policy.capacity} ${policy.algorithm === "token" ? "tokens" : "requests"}` : "—"}</dd>
            </div>
            <div>
                <dt>{policy.algorithm === "token" ? "Refill rate" : "Window duration"}</dt>
                <dd>{policyLoaded ? (policy.algorithm === "token" ? `${policy.refill} tokens/sec` : `${policy.window} seconds`) : "—"}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{policy.scope === "client" ? "Per client" : policy.scope === "ip" ? "Per IP" : "Global"}</dd>
            </div>
          </dl>
          <button className="link-btn" onClick={() => goTo("Policy Settings")}>
            Manage policy <Icon name="arrow" size={15} />
          </button>
        </Card>
      </div>
      <Card className="table-card">
        <div className="card-head">
          <div>
            <h2>Recent requests</h2>
            <p>Latest gateway decisions across all clients</p>
          </div>
          <button className="link-btn" onClick={() => goTo("Metrics")}>
            View all metrics <Icon name="arrow" size={15} />
          </button>
        </div>
        <RequestTable logs={dynamicLogs} />
      </Card>
    </>
  );
}

function RequestTable({ logs }: { logs: SimulationDecision[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Client ID</th>
            <th>Endpoint</th>
            <th>Decision</th>
            <th>Code</th>
            <th>Latency</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((r, i) => (
            <tr key={`${r.time}-${i}`}>
              <td className="mono muted">{r.time}</td>
              <td className="mono">{r.client}</td>
              <td className="mono muted">{r.endpoint}</td>
              <td>
                <Status type={r.status === "Allowed" ? "ok" : "bad"}>{r.status}</Status>
              </td>
              <td>
                <span className={`code code-${r.code}`}>{r.code}</span>
              </td>
              <td>{r.latency} ms</td>
            </tr>
          ))}
          {logs.length === 0 && <tr><td colSpan={6}>No live requests yet. Run the Traffic Simulator.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function PolicySettings({ notify, policy, onSave }: { notify: (s: string) => void; policy: Policy; onSave: (p: Policy) => Promise<void> }) {
  const [form, setForm] = useState<Policy>(policy);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(policy); }, [policy]);
  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <PageHeader
        title="Policy Settings"
        description="Configure how TrafficGovernor protects your services."
      >
        <Status type="live">Policy active</Status>
      </PageHeader>
      <div className="settings-layout">
        <Card className="form-card">
          <div className="card-head border">
            <div>
              <h2>Rate limiting policy</h2>
              <p>Choose an algorithm and define its operating limits.</p>
            </div>
          </div>
          <div className="form-section">
            <div className="section-label">
              <span>01</span>
              <div>
                <h3>Algorithm</h3>
                <p>Select how incoming requests are evaluated.</p>
              </div>
            </div>
            <div className="algorithm-grid">
              <button
                className={`algorithm ${form.algorithm === "token" ? "selected" : ""}`}
                onClick={() => set("algorithm", "token")}
              >
                <div className="radio" />
                <Icon name="bolt" size={20} />
                <div>
                  <strong>Token Bucket</strong>
                  <p>Allows controlled bursts while enforcing an average rate.</p>
                </div>
                <span className="recommended">Recommended</span>
              </button>
              <button
                className={`algorithm ${form.algorithm === "sliding" ? "selected" : ""}`}
                onClick={() => set("algorithm", "sliding")}
              >
                <div className="radio" />
                <Icon name="chart" size={20} />
                <div>
                  <strong>Sliding Window</strong>
                  <p>Precise rolling-window limits with smoother enforcement.</p>
                </div>
              </button>
            </div>
          </div>
          <div className="form-section">
            <div className="section-label">
              <span>02</span>
              <div>
                <h3>Limits</h3>
                <p>Set the threshold and replenishment behavior.</p>
              </div>
            </div>
            <div className="fields-grid">
              <Field label={form.algorithm === "token" ? "Bucket capacity" : "Requests per window"} hint="Maximum allowed requests per client">
                <div className="input-suffix">
                  <input
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={(e) => set("capacity", +e.target.value)}
                  />
                  <span>{form.algorithm === "token" ? "tokens" : "requests"}</span>
                </div>
              </Field>
              {form.algorithm === "token" && <Field label="Refill rate" hint="Tokens restored every second">
                <div className="input-suffix">
                  <input
                    type="number"
                    min="1"
                    value={form.refill}
                    onChange={(e) => set("refill", +e.target.value)}
                  />
                  <span>tokens/sec</span>
                </div>
              </Field>}
              {form.algorithm === "sliding" && <Field label="Window size" hint="Evaluation period for rate calculations">
                <div className="input-suffix">
                  <input
                    type="number"
                    min="1"
                    value={form.window}
                    onChange={(e) => set("window", +e.target.value)}
                  />
                  <span>seconds</span>
                </div>
              </Field>}
                  <Field label="Policy scope" hint="How counters are isolated">
                    <div className="policy-scope-info">
                      <div>
                        <strong>Per Client ID</strong>
                        <p>Each client has an independent rate limit.</p>
                      </div>
                      <span className="policy-scope-badge">Active</span>
                    </div>
                  </Field>
            </div>
          </div>
          <div className="form-footer">
            <button
              className="btn secondary"
              onClick={() => {
                setForm(defaultPolicy);
                notify("Default values restored. Save to apply them.");
              }}
            >
              Reset defaults
            </button>
            <button
              className="btn primary"
              disabled={saving}
              onClick={async () => {
                if (!isValidPolicy(form)) { notify("Enter valid positive limits before saving"); return; }
                setSaving(true);
                try { await onSave(form); }
                catch (err) { notify(`Save failed: ${err instanceof Error ? err.message : "Server unavailable"}`); }
                finally { setSaving(false); }
              }}
            >
              <Icon name="check" size={16} />
              {saving ? "Saving..." : "Save to Python backend"}
            </button>
          </div>
        </Card>
        <div className="side-stack">
          <Card>
            <h2>Policy preview</h2>
            <p className="sub">Estimated behavior with current settings</p>
            <div className="preview-metric">
              <span>Steady throughput</span>
              <strong>{form.algorithm === "token" ? `${form.refill} req/s` : `${form.capacity} requests / ${form.window}s`}</strong>
            </div>
            <div className="preview-metric">
              <span>Maximum burst</span>
              <strong>{form.capacity} requests</strong>
            </div>
            <div className="preview-metric">
              <span>Recovery time</span>
              <strong>{form.algorithm === "token" ? (form.refill > 0 ? Math.round(form.capacity / form.refill) : "—") : form.window} seconds</strong>
            </div>
            <div className="callout">
              <Icon name="info" size={17} />
              <p>
                {form.algorithm === "token" ? <>A client can burst up to <b>{form.capacity} requests</b> and refill at <b>{form.refill} tokens/sec</b>.</> : <>A client may make <b>{form.capacity} requests</b> per rolling <b>{form.window}-second</b> window.</>}
              </p>
            </div>
          </Card>
          <Card className="safe-card">
            <div className="safe-icon">
              <Icon name="shield" size={20} />
            </div>
            <div>
              <h3>Safe deployment</h3>
              <p>
                Saved settings are sent to the local Python API. No production gateway is connected.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Simulator({
  onLogs,
  notify,
  policy,
  onEvent,
  onSimulation,
}: {
  onLogs: (logs: typeof baseLogs) => void;
  notify: (s: string) => void;
  policy: Policy;
  onEvent: (kind: DemoNotification["kind"], title: string, description: string) => void;
  onSimulation: (items: SimulationDecision[]) => void;
}) {
  const [client, setClient] = useState("client_web_01"),
    [endpoint, setEndpoint] = useState("/api/v1/orders");
  const [count, setCount] = useState(20),
    [rate, setRate] = useState(25),
    [running, setRunning] = useState(false);
  const [results, setResults] = useState<SimulationDecision[]>([]);
  const run = async () => {
    const cleanClient = client.trim();
    if (!cleanClient || cleanClient.length > 80 || !Number.isInteger(count) || count < 1 || count > 500 || !Number.isFinite(rate) || rate <= 0) {
      notify("Enter a valid client ID (1–80 chars), 1–500 requests and a positive send rate");
      return;
    }
    setRunning(true);
    setResults([]);
    const next: SimulationDecision[] = [];
    try {
      for (let i = 0; i < count; i++) {
        const began = performance.now();
        const response = await checkRequest(cleanClient);
        const latency = Math.round((performance.now() - began) * 100) / 100;
        const item: SimulationDecision = {
          time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
          client: cleanClient,
          // The Python limiter checks /check; the chosen endpoint is a descriptive label only.
          endpoint: "/check",
          status: response.allowed ? "Allowed" : "Denied",
          code: response.status,
          latency,
          tokensRemaining: response.tokens_remaining ?? response.remaining ?? undefined,
          retryAfterMs: response.retry_after_ms ?? undefined,
        };
        next.push(item);
        setResults([...next]);
        if (i < count - 1) {
          const remainingMs = Math.max(0, 1000 / rate - (performance.now() - began));
          if (remainingMs > 0) await new Promise<void>(resolve => setTimeout(resolve, remainingMs));
        }
      }
      onSimulation(next);
      onLogs([...next].reverse().slice(0, 20));
      const allowedCount = next.filter(x => x.code === 200).length;
      const deniedCount = next.length - allowedCount;
      onEvent("simulation", "API burst complete", `${count} real /check requests for ${cleanClient}: ${allowedCount} allowed, ${deniedCount} denied.`);
      if (deniedCount > 0) onEvent("limit", "Rate limit reached", `${deniedCount} of ${count} requests were denied with HTTP 429.`);
      notify(`Python API: ${allowedCount} allowed, ${deniedCount} denied`);
    } catch (err) {
      notify(`Simulation interrupted after ${next.length} requests: ${err instanceof Error ? err.message : "Backend unavailable"}`);
      if (next.length) { onSimulation(next); onLogs([...next].reverse().slice(0, 20)); }
    } finally { setRunning(false); }
  };
  const allowed = results.filter((r) => r.code === 200).length,
    denied = results.length - allowed;
  return (
    <>
      <PageHeader
        title="Traffic Simulator"
        description="Send real HTTP requests to the local Python rate limiter and inspect each decision."
      >
        <div className="sandbox">
          <span />
          Local Python API
        </div>
      </PageHeader>
      <div className="sim-layout">
        <Card className="sim-config">
          <div className="card-head border">
            <div>
              <h2>Request configuration</h2>
              <p>Define the traffic pattern to simulate.</p>
            </div>
          </div>
          <div className="sim-fields">
            <Field label="Client ID" hint="Rate limits are tracked by this identifier">
              <input value={client} onChange={(e) => setClient(e.target.value)} />
            </Field>
            <Field label="Target endpoint (display only; Python checks /check)">
              <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
                <option>/api/v1/orders</option>
                <option>/api/v1/products</option>
                <option>/api/v1/auth</option>
                <option>/api/v1/sync</option>
              </select>
            </Field>
            <div className="fields-grid">
              <Field label="Request count">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={count}
                  onChange={(e) => setCount(+e.target.value)}
                />
              </Field>
              <Field label="Request rate">
                <div className="input-suffix">
                  <input type="number" min="1" value={rate} onChange={(e) => setRate(+e.target.value)} />
                  <span>req/sec</span>
                </div>
              </Field>
            </div>
            <div className="burst-summary">
              <div>
                <Icon name="bolt" size={18} />
                <span>Estimated duration</span>
              </div>
              <strong>{rate > 0 ? (count / rate).toFixed(1) : "—"} seconds</strong>
            </div>
            <button className="btn primary full" onClick={run} disabled={running}>
              {running ? (
                <>
                  <span className="spinner" />
                  Sending burst…
                </>
              ) : (
                <>
                  <Icon name="bolt" size={17} />
                  Send burst
                </>
              )}
            </button>
          </div>
        </Card>
        <Card className="sim-console">
          <div className="card-head border">
            <div>
              <h2>Live response stream</h2>
              <p>Real HTTP 200/429 responses appear as the Python backend processes the burst.</p>
            </div>
            {results.length > 0 ? (
              <Status type="live">Complete</Status>
            ) : (
              <span className="waiting">Waiting</span>
            )}
          </div>
          {results.length === 0 ? (
            <div className="empty-console">
              <div>
                <Icon name="bolt" size={24} />
              </div>
              <h3>Ready to simulate</h3>
              <p>Configure a traffic pattern and send a burst to see live Python decisions.</p>
            </div>
          ) : (
            <>
              <div className="result-strip">
                <div className="allowed-result">
                  <Icon name="check" />
                  <span>
                    Allowed<strong>{allowed}</strong>
                  </span>
                </div>
                <div className="denied-result">
                  <Icon name="x" />
                  <span>
                    Denied<strong>{denied}</strong>
                  </span>
                </div>
                <div>
                  <span>
                    Success rate<strong>{Math.round((allowed / results.length) * 100)}%</strong>
                  </span>
                </div>
              </div>
              <div className="console-list">
                {results.map((r, i) => (
                  <div className="console-row" key={i}>
                    <span className="mono muted">{r.time}</span>
                    <Status type={r.code === 200 ? "ok" : "bad"}>{r.status.toUpperCase()}</Status>
                    <span className="mono">
                      {r.code} {r.code === 200 ? "OK" : "TOO MANY REQUESTS"}
                    </span>
                    <span>
                      {r.code === 429
                        ? `Retry after ${r.retryAfterMs ?? 0} ms`
                        : `${r.tokensRemaining ?? 0} remaining`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
      <Card className="tips-card">
        <Icon name="info" />
        <div>
          <h3>How simulation works</h3>
          <p>
            Requests are sent to the local Python /check API and DO update the backend's
            in-memory rate-limit counters. No production services are contacted.
          </p>
        </div>
        <code>Live local /check calls · HTTP 200 / 429</code>
      </Card>
    </>
  );
}

function Metrics({ notify, metrics, onResetClient }: {
  notify: (s: string) => void;
  metrics: MetricsResponse | null;
  onResetClient: (id: string) => Promise<void>;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All clients");
  const [sort, setSort] = useState("requests");
  const clientsList = useMemo(() => Object.entries(metrics?.clients ?? {}).map(([id, data]) => ({
    id, requests: data.total, allowed: data.allowed, denied: data.denied,
    rate: data.total ? ((data.denied / data.total) * 100).toFixed(1) + "%" : "0.0%",
  })), [metrics]);
  const rows = useMemo(() => clientsList
    .filter(c => c.id.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "All clients" || (filter === "Denied traffic" ? c.denied > 0 : c.denied === 0)))
    .sort((a,b) => sort === "denied" ? b.denied-a.denied : b.requests-a.requests),
    [clientsList,query,filter,sort]);
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const visibleRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const exportCsv = () => {
    const csv = ["Client ID,Requests,Allowed,Denied,Deny Rate", ...rows.map(r =>
      `${JSON.stringify(r.id)},${r.requests},${r.allowed},${r.denied},${r.rate}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    const a = document.createElement("a"); a.href=url; a.download="traffic-metrics-live.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("CSV export generated from Python client metrics");
  };
  return <>
    <PageHeader title="Metrics" description="Real per-client request counters from the Python backend.">
      <button className="btn secondary" onClick={exportCsv} disabled={!metrics}>
        <Icon name="download" size={16}/> Export CSV
      </button>
    </PageHeader>
    <p className="demo-data-disclosure">Live Python counters. Resetting one client's displayed metrics does not reset global history or token state. Per-client latency is not provided by this API.</p>
    <div className="metric-summary">
      <Card><span>Total clients</span><strong>{metrics ? clientsList.length : "—"}</strong><small>Clients recorded since backend startup</small></Card>
      <Card><span>Recorded requests</span><strong>{metrics ? metrics.total.toLocaleString() : "—"}</strong><small>Global HTTP 200 + 429 decisions</small></Card>
      <Card><span>Avg. latency</span><strong>{metrics?.avg_latency_ms == null ? "—" : `${metrics.avg_latency_ms.toFixed(2)} ms`}</strong><small>Recent Python processing samples</small></Card>
      <Card><span>Rate limited clients</span><strong>{metrics ? clientsList.filter(c=>c.denied>0).length : "—"}</strong><small>With at least one denial</small></Card>
    </div>
    <Card className="table-card">
      <div className="toolbar">
        <div className="search-box"><Icon name="search" size={16}/><input aria-label="Search clients" placeholder="Search client ID…" value={query} onChange={e=>{setQuery(e.target.value);setPageIndex(0);}}/></div>
        <select value={filter} onChange={e=>{setFilter(e.target.value);setPageIndex(0);}}><option>All clients</option><option>Denied traffic</option><option>Healthy only</option></select>
        <select value={sort} onChange={e=>{setSort(e.target.value);setPageIndex(0);}}><option value="requests">Sort: Requests</option><option value="denied">Sort: Denied</option></select>
        <span className="row-count">{rows.length} clients</span>
      </div>
      <div className="table-scroll"><table>
        <thead><tr><th>Client ID</th><th>Total requests</th><th>Allowed</th><th>Denied</th><th>Denial rate</th><th>Avg. latency</th><th>Health</th><th>Reset</th></tr></thead>
        <tbody>{visibleRows.map(r => <tr key={r.id}>
          <td className="client-cell"><span className="client-icon"><Icon name="server" size={15}/></span><span className="mono">{r.id}</span></td>
          <td><b>{r.requests.toLocaleString()}</b></td><td>{r.allowed.toLocaleString()}</td><td>{r.denied.toLocaleString()}</td>
          <td><div className="rate-cell"><div><span style={{width:`${Math.min(100,parseFloat(r.rate))}%`}}/></div>{r.rate}</div></td>
          <td>—</td><td><Status type={parseFloat(r.rate)>5?"warn":"ok"}>{parseFloat(r.rate)>5?"Review":"Healthy"}</Status></td>
          <td><button className="btn secondary" onClick={() => void onResetClient(r.id)}>Reset</button></td>
        </tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <div className="no-results">{metrics ? "No client metrics match your filters." : "Connecting to metrics API..."} <button className="btn secondary" onClick={()=>{setQuery("");setFilter("All clients");setSort("requests");setPageIndex(0);}}>Reset filters</button></div>}
      <div className="pagination"><span>{rows.length ? `Showing ${currentPage*pageSize+1}–${Math.min(rows.length,(currentPage+1)*pageSize)} of ${rows.length}`:"Showing 0 clients"}</span><div>
        <button disabled={currentPage===0} onClick={()=>setPageIndex(currentPage-1)}>Previous</button>
        {Array.from({length:pageCount},(_,i)=><button key={i} className={currentPage===i?"active":""} onClick={()=>setPageIndex(i)} aria-label={`Page ${i+1}`}>{i+1}</button>)}
        <button disabled={currentPage>=pageCount-1} onClick={()=>setPageIndex(currentPage+1)}>Next</button>
      </div></div>
    </Card>
  </>;
}

// Live request charts use the same backend data as Dashboard and Metrics.
// The charts below are deliberately separate from the offline 200/503 trace reports.
function LiveTrafficAnalysis({ metrics, logs, offline }: {
  metrics: MetricsResponse | null;
  logs: BackendLog[];
  offline: boolean;
}) {
  const total = metrics?.total ?? 0;
  const allowed = metrics?.allowed ?? 0;
  const denied = metrics?.denied ?? 0;
  const allowedPct = total ? (allowed / total) * 100 : 0;
  const deniedPct = total ? (denied / total) * 100 : 0;
  // /logs is newest-first; graphs read left-to-right in chronological order.
  const recent = [...logs]
    .filter(item => item.status === 200 || item.status === 429)
    .slice(0, 40)
    .reverse();
  const latency = recent.filter(item => Number.isFinite(item.latency_ms) && item.latency_ms >= 0);
  const maxLatency = Math.max(1, ...latency.map(item => item.latency_ms));
  // A fixed SVG coordinate system prevents labels and plots from stretching.
  const plotLeft = 55;
  const plotRight = 760;
  const plotTop = 28;
  const plotBottom = 188;
  const latencyPoints = latency.map((item, index) => {
    const x = latency.length === 1
      ? (plotLeft + plotRight) / 2
      : plotLeft + (index / (latency.length - 1)) * (plotRight - plotLeft);
    const y = plotBottom - (item.latency_ms / maxLatency) * (plotBottom - plotTop);
    return { x, y, item };
  });

  return (
    <section className="live-analysis" aria-label="Live Traffic Analysis">
      <div className="live-analysis-heading">
        <div>
          <h2>Live Traffic Analysis</h2>
          <p>HTTP 200/429 decisions from the running Python rate limiter, refreshed about every 5 seconds.</p>
        </div>
        <span className={`live-analysis-connection ${offline ? "offline" : ""}`} role="status">
          <span aria-hidden="true" />{offline ? "Backend disconnected" : "Connected · live data"}
        </span>
      </div>
      <div className="live-analysis-stats">
        <div><span>Total requests</span><strong>{metrics ? total.toLocaleString() : "—"}</strong></div>
        <div><span>Allowed · HTTP 200</span><strong>{metrics ? allowed.toLocaleString() : "—"}</strong><small>{allowedPct.toFixed(1)}% of requests</small></div>
        <div><span>Denied · HTTP 429</span><strong>{metrics ? denied.toLocaleString() : "—"}</strong><small>{deniedPct.toFixed(1)}% of requests</small></div>
      </div>
      <div className="live-analysis-panels">
        <div className="live-analysis-panel">
          <h3>Live response distribution</h3>
          <p>All rate-limit decisions recorded since this backend started.</p>
          {metrics && total > 0 ? (
            <>
              <div className="live-analysis-stack" role="img" aria-label={`${allowed} allowed HTTP 200 requests and ${denied} denied HTTP 429 requests`}>
                <div className="allowed" style={{ width: `${allowedPct}%` }} />
                <div className="denied" style={{ width: `${deniedPct}%` }} />
              </div>
              <div className="live-analysis-legend"><span><i className="allowed" />HTTP 200 · {allowedPct.toFixed(1)}%</span><span><i className="denied" />HTTP 429 · {deniedPct.toFixed(1)}%</span></div>
            </>
          ) : <div className="live-analysis-empty">{offline ? "Start the Python backend to load metrics." : "Send requests in Traffic Simulator to populate this chart."}</div>}
        </div>
        <div className="live-analysis-panel">
          <h3>Recent request decisions</h3>
          <p>Latest {recent.length} recorded requests · oldest to newest, left to right.</p>
          {recent.length ? (
            <div className="live-analysis-requests" role="img" aria-label={`${recent.filter(r => r.status === 200).length} allowed and ${recent.filter(r => r.status === 429).length} denied requests in the latest ${recent.length} entries`}>
              {recent.map((entry, index) => <span key={`${entry.id ?? entry.timestamp}-${index}`} className={entry.status === 200 ? "allowed" : "denied"} title={`${entry.client_id}: HTTP ${entry.status} · ${entry.latency_ms} ms`} />)}
            </div>
          ) : <div className="live-analysis-empty">No recorded requests to display.</div>}
          <div className="live-analysis-legend"><span><i className="allowed" />Allowed</span><span><i className="denied" />Denied</span></div>
        </div>
      </div>
      <div className="live-analysis-panel live-analysis-latency">
        <h3>Recent request latency</h3>
        <p>Actual backend processing times for the latest {latency.length} requests (up to 40), in milliseconds.</p>
        {latencyPoints.length ? (
          <svg viewBox="0 0 800 235" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Latency chart across ${latency.length} recent requests. Highest recorded latency ${maxLatency.toFixed(2)} milliseconds.`}>
            <line x1="55" y1="188" x2="760" y2="188" className="axis" />
            <line x1="55" y1="28" x2="55" y2="188" className="axis" />
            <line x1="55" y1="28" x2="760" y2="28" className="latency-grid" />
            <line x1="55" y1="108" x2="760" y2="108" className="latency-grid" />
            <text x="48" y="32" textAnchor="end" className="axis-label">{maxLatency.toFixed(1)}</text>
            <text x="48" y="112" textAnchor="end" className="axis-label">{(maxLatency / 2).toFixed(1)}</text>
            <text x="48" y="191" textAnchor="end" className="axis-label">0</text>
            <text x="55" y="16" className="axis-label">Latency (ms)</text>
            {latencyPoints.length > 1 && <polyline className="latency-line" points={latencyPoints.map(point => `${point.x},${point.y}`).join(" ")} />}
            {latencyPoints.map((point, index) => <circle key={index} className={point.item.status === 429 ? "denied-point" : "allowed-point"} cx={point.x} cy={point.y} r="4" />)}
            <text x="760" y="218" textAnchor="end" className="axis-label">Requests (oldest → newest)</text>
          </svg>
        ) : <div className="live-analysis-empty">Latency appears once requests have been processed.</div>}
        <p className="live-analysis-footnote">Live traffic is HTTP 200/429. The CSV-based HTTP 200/503 incident analysis below is separate and does not update automatically.</p>
      </div>
    </section>
  );
}

function AnalysisReport({ metrics, logs, metricsError }: {
  metrics: MetricsResponse | null;
  logs: BackendLog[];
  metricsError: boolean;
}) {
  // These are static files generated by backend/analysis.py, not live API results.
  // Vite serves files from public/ at the site root.
  const statusImage = "/reports/status_distribution.png";
  const latencyImage = "/reports/latency_comparison.png";
  const [statusImageFailed, setStatusImageFailed] = useState(false);
  const [latencyImageFailed, setLatencyImageFailed] = useState(false);

  return (
    <>
      <PageHeader
        title="Analysis Report"
        description="Offline CSV request-trace analysis, generated using Python, pandas and matplotlib."
      >
        <a className="btn secondary" href={statusImage} target="_blank" rel="noopener noreferrer">
          <Icon name="arrow" size={16} /> Open status chart
        </a>
      </PageHeader>

      <LiveTrafficAnalysis metrics={metrics} logs={logs} offline={metricsError || !metrics} />

      <p className="demo-data-disclosure" role="status">
        CSV-BASED ANALYSIS — These images were generated from local sample traces.
        They are static report files, not live /metrics readings or proof of a real outage.
      </p>

      <Card className="report-chart">
        <div className="card-head">
          <div>
            <h2>HTTP status code distribution</h2>
            <p>HTTP 200 (OK) versus HTTP 503 (Service Unavailable) in the trace CSV.</p>
          </div>
          <Status type="ok">Python report</Status>
        </div>
        {statusImageFailed ? (
          <div className="no-results" role="alert">
            Status distribution chart is missing. Copy reports/status_distribution.png
            into TG_FINAL_RELEASE/public/reports/ and refresh this page.
          </div>
        ) : (
          <a href={statusImage} target="_blank" rel="noopener noreferrer" aria-label="Open HTTP status distribution chart at full size">
            <img
              src={statusImage}
              alt="Matplotlib chart showing the distribution of HTTP 200 and HTTP 503 responses in the sample trace CSV."
              onError={() => setStatusImageFailed(true)}
              style={{ display: "block", width: "100%", height: "auto", maxHeight: 520, objectFit: "contain", margin: "12px auto", borderRadius: 12, background: "#fff" }}
            />
          </a>
        )}
        <p className="demo-data-disclosure">
          Read the exact request counts and percentages from the chart. HTTP 503
          reports service unavailability; it is different from HTTP 429 returned by
          the live rate limiter.
        </p>
      </Card>

      <Card className="report-chart">
        <div className="card-head">
          <div>
            <h2>Latency before and after the recorded event</h2>
            <p>Comparison of request latencies for the trace segments available in the CSV.</p>
          </div>
          <Status type="ok">Python report</Status>
        </div>
        {latencyImageFailed ? (
          <div className="no-results" role="alert">
            Latency comparison chart is missing. Copy reports/latency_comparison.png
            into TG_FINAL_RELEASE/public/reports/ and refresh this page.
          </div>
        ) : (
          <a href={latencyImage} target="_blank" rel="noopener noreferrer" aria-label="Open latency comparison chart at full size">
            <img
              src={latencyImage}
              alt="Matplotlib visualization comparing recorded request latency before and after the event in the sample CSV."
              onError={() => setLatencyImageFailed(true)}
              style={{ display: "block", width: "100%", height: "auto", maxHeight: 520, objectFit: "contain", margin: "12px auto", borderRadius: 12, background: "#fff" }}
            />
          </a>
        )}
        <p className="demo-data-disclosure">
          Interpret timing and before/after values only as supported by the actual
          CSV and the chart axes. This demo does not implement a live circuit breaker.
        </p>
      </Card>

      <div className="insight-grid">
        <Card>
          <div className="insight-head">
            <span className="insight-icon blue"><Icon name="report" /></span>
            <h3>Data source</h3>
          </div>
          <p>Local request-trace CSV, analyzed by <b>backend/analysis.py</b> with pandas.</p>
        </Card>
        <Card>
          <div className="insight-head">
            <span className="insight-icon good"><Icon name="chart" /></span>
            <h3>Chart generation</h3>
          </div>
          <p>Matplotlib saves the two PNG charts in <b>reports/</b>. The React page displays copies in <b>public/reports/</b>.</p>
        </Card>
        <Card>
          <div className="insight-head">
            <span className="insight-icon warn"><Icon name="info" /></span>
            <h3>Live vs offline</h3>
          </div>
          <p>The Simulator and Metrics use live <b>200/429</b> decisions. This offline trace report analyzes <b>200/503</b> responses.</p>
        </Card>
      </div>
    </>
  );
}

function About() {
  return (
    <>
      <PageHeader
        title="About & Help"
        description="Learn how TrafficGovernor protects services and explore the demo."
      />
      <div className="about-hero">
        <div>
          <span className="eyebrow">INTELLIGENT TRAFFIC CONTROL</span>
          <h2>Keep services fast, stable, and available.</h2>
          <p>
            TrafficGovernor enforces fair usage at the edge, absorbs request bursts, and prevents
            overloaded dependencies from cascading through your systems.
          </p>
        </div>
        <div className="hero-shield">
          <Icon name="shield" size={46} />
          <span className="orbit o1" />
          <span className="orbit o2" />
          <span className="orbit o3" />
        </div>
      </div>
      <div className="about-grid">
        <Card>
          <span className="feature-number">01</span>
          <div className="feature-icon">
            <Icon name="sliders" />
          </div>
          <h3>Define a policy</h3>
          <p>
            Choose Token Bucket for burst-friendly control or Sliding Window for precise rolling
            limits.
          </p>
        </Card>
        <Card>
          <span className="feature-number">02</span>
          <div className="feature-icon">
            <Icon name="bolt" />
          </div>
          <h3>Evaluate traffic</h3>
          <p>
            Every request is checked against a per-client counter before it reaches your service.
          </p>
        </Card>
        <Card>
          <span className="feature-number">03</span>
          <div className="feature-icon">
            <Icon name="chart" />
          </div>
          <h3>Observe outcomes</h3>
          <p>
            Explore request decisions, client health, latency, and circuit-breaker behavior in real
            time.
          </p>
        </Card>
      </div>
      <div className="learn-grid">
        <Card>
          <h2>How rate limiting works</h2>
          <div className="explain-row">
            <span className="explain-icon token">T</span>
            <div>
              <h3>Token Bucket</h3>
              <p>
                A bucket holds tokens that replenish at a fixed rate. Each request consumes one
                token; requests without a token receive HTTP 429. Unused tokens allow short bursts.
              </p>
            </div>
          </div>
          <div className="explain-row">
            <span className="explain-icon window">W</span>
            <div>
              <h3>Sliding Window</h3>
              <p>
                Requests are counted over a continuously moving time window, providing accurate
                limits without boundary spikes.
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <h2>Demo guide</h2>
          <ol className="guide">
            <li>
              <span>1</span>
              <p>
                <b>Configure</b> a policy and choose your operating limits.
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                <b>Simulate</b> a burst above the refill rate to trigger denials.
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                <b>Inspect</b> metrics to compare client behavior and latency.
              </p>
            </li>
            <li>
              <span>4</span>
              <p>
                <b>Analyze</b> how circuit breaking protects the system.
              </p>
            </li>
          </ol>
        </Card>
      </div>
      <Card className="help-bar">
        <div>
          <Icon name="help" />
          <span>
            <b>Need help?</b> This is a local interactive prototype. Backend counters persist until the Python server restarts.
          </span>
        </div>
        <a href="mailto:help@trafficgovernor.dev">
          Contact support <Icon name="arrow" size={15} />
        </a>
      </Card>
    </>
  );
}



// Marketing screens are kept separate from the control-plane screens.
function SiteBrand({ dark = false }: { dark?: boolean }) {
  return <span className={`site-brand ${dark ? "site-brand-light" : ""}`}><span className="site-brand-icon">TG</span><span>Traffic<span>Governor</span></span></span>;
}

function TrafficAnimation() {
  return (
    <div className="traffic-visual" aria-label="Illustration of simulated API requests being accepted or rate limited">
      <div className="traffic-visual-glow" />
      <svg className="traffic-tracks" viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="traffic-art-title">
        <title id="traffic-art-title">Animated traffic paths: blue requests reach a limiter; green are allowed and red are denied</title>
        <defs>
          <linearGradient id="trackBlue" x1="0" x2="1"><stop stopColor="#22b8ff"/><stop offset="1" stopColor="#60a5fa"/></linearGradient>
          <linearGradient id="trackGreen" x1="0" x2="1"><stop stopColor="#22d3ee"/><stop offset="1" stopColor="#22c55e"/></linearGradient>
          <filter id="lineGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
        </defs>
        <g fill="none" strokeWidth="3" strokeLinecap="round">
          <path className="track-halo" d="M0 120 C140 120 170 172 297 172" stroke="#0ea5e9"/>
          <path className="track-halo" d="M0 190 C140 190 175 194 297 194" stroke="#0ea5e9"/>
          <path className="track-halo" d="M0 260 C140 260 175 215 297 215" stroke="#0ea5e9"/>
          <path d="M0 120 C140 120 170 172 297 172" stroke="url(#trackBlue)" strokeDasharray="8 12"/>
          <path d="M0 190 C140 190 175 194 297 194" stroke="url(#trackBlue)" strokeDasharray="8 12"/>
          <path d="M0 260 C140 260 175 215 297 215" stroke="url(#trackBlue)" strokeDasharray="8 12"/>
          <path className="track-halo" d="M407 183 C500 183 548 110 720 110" stroke="#22c55e"/>
          <path className="track-halo" d="M407 205 C500 205 548 275 720 275" stroke="#fb7185"/>
          <path d="M407 183 C500 183 548 110 720 110" stroke="url(#trackGreen)" strokeDasharray="8 12"/>
          <path d="M407 205 C500 205 548 275 720 275" stroke="#fb7185" strokeDasharray="8 12"/>
        </g>
        <g className="traffic-packet blue-packet"><rect x="-8" y="-5" width="16" height="10" rx="3" fill="#64d8ff"/></g>
        <g className="traffic-packet green-packet"><rect x="-8" y="-5" width="16" height="10" rx="3" fill="#5af2b7"/></g>
        <g className="traffic-packet red-packet"><rect x="-8" y="-5" width="16" height="10" rx="3" fill="#ff7793"/></g>
      </svg>
      <div className="flow-label flow-label-client"><small>01 / INCOMING</small><strong>API requests</strong><span>Simulated traffic</span></div>
      <div className="limiter-node"><span className="limiter-icon"><Icon name="shield" size={30}/></span><strong>Rate limiter</strong><small>Token Bucket / Window</small></div>
      <div className="flow-label flow-label-allow"><span className="traffic-dot is-green"/> <strong>ALLOWED</strong><small>HTTP 200</small></div>
      <div className="flow-label flow-label-deny"><span className="traffic-dot is-red"/> <strong>DENIED</strong><small>HTTP 429</small></div>
      <div className="traffic-visual-caption">ANIMATED DEMONSTRATION · NOT LIVE TRAFFIC</div>
    </div>
  );
}

type ShowcaseTab = "Dashboard" | "Policy Settings" | "Traffic Simulator" | "Metrics";

const showcaseCopy: Record<ShowcaseTab, { eyebrow: string; heading: string; description: string }> = {
  Dashboard: { eyebrow: "CONTROL PLANE", heading: "See every request at a glance.", description: "Five clear indicators, a traffic trend and your active rate-limit policy — all presented in the same interface as your dashboard." },
  "Policy Settings": { eyebrow: "01 / CONFIGURE", heading: "Tune limits without the guesswork.", description: "Review the Token Bucket settings, adjust capacity and refill rate, and understand how each setting affects a request burst." },
  "Traffic Simulator": { eyebrow: "02 / TEST", heading: "See what happens during a burst.", description: "Send synthetic requests and inspect ALLOWED 200 and DENIED 429 outcomes before considering changes to real infrastructure." },
  Metrics: { eyebrow: "03 / UNDERSTAND", heading: "Turn decisions into useful metrics.", description: "Compare allowed and denied traffic and inspect per-client activity with the same clean visual language as the application." },
};

function ProductPreview({ tab }: { tab: ShowcaseTab }) {
  const menu: ShowcaseTab[] = ["Dashboard", "Policy Settings", "Traffic Simulator", "Metrics"];
  return <div className="product-preview" aria-label={`${tab} interface illustration with sample data`}>
    <div className="tg-preview-sidebar">
      <div className="tg-preview-logo"><span>TG</span>TrafficGovernor</div>
      {menu.map(item => <div key={item} className={`tg-preview-menu ${item === tab ? "is-selected" : ""}`}>{item}</div>)}
      <div className="tg-preview-env">● Demo environment</div>
    </div>
    <div className="tg-preview-screen" key={tab}>
      <div className="tg-preview-top"><strong>{tab}</strong><span>● Demo · sample data</span></div>
      {tab === "Dashboard" && <>
        <div className="tg-preview-kpis">
          {[["Requests", "128,492"], ["Allowed", "121,847"], ["Denied", "6,645"], ["Deny rate", "5.17%"], ["P95 latency", "84 ms"]].map(([label, value]) => <div className="tg-preview-kpi" key={label}><small>{label}</small><strong>{value}</strong></div>)}
        </div>
        <div className="tg-preview-columns">
          <div className="tg-preview-panel tg-preview-chart"><div className="tg-preview-panel-head"><strong>Request traffic</strong><span>Last 24 hours</span></div>
            <div className="tg-preview-chart-key"><span>● Allowed</span><span>● Denied</span></div>
            <svg viewBox="0 0 470 155" preserveAspectRatio="none" role="img" aria-label="Illustrative request chart: blue allowed traffic and red denied traffic"><defs><linearGradient id="tgPreviewArea" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2563eb" stopOpacity=".20"/><stop offset="1" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
              {[35,75,115].map(y=><line key={y} x1="0" x2="470" y1={y} y2={y} stroke="#e7edf5"/>)}
              <path d="M0 124 L35 113 L70 118 L105 92 L140 98 L175 74 L210 81 L245 59 L280 67 L315 42 L350 55 L385 30 L420 39 L470 20 L470 155 L0 155Z" fill="url(#tgPreviewArea)"/>
              <path d="M0 124 L35 113 L70 118 L105 92 L140 98 L175 74 L210 81 L245 59 L280 67 L315 42 L350 55 L385 30 L420 39 L470 20" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round"/>
              <path d="M0 144 L35 141 L70 146 L105 135 L140 140 L175 130 L210 137 L245 125 L280 133 L315 122 L350 130 L385 119 L420 126 L470 116" stroke="#ef4444" strokeWidth="2" fill="none"/>
            </svg><div className="tg-preview-axis"><span>12 AM</span><span>8 AM</span><span>4 PM</span><span>Now</span></div>
          </div>
          <div className="tg-preview-panel tg-preview-policy"><strong>Current policy</strong><span className="tg-preview-active">Active</span><div className="tg-preview-tokens"><span>▰</span><div><b>68 / 100</b><small>Tokens available</small></div></div><div className="tg-preview-fact">Algorithm <b>Token Bucket</b></div><div className="tg-preview-fact">Capacity <b>100 tokens</b></div><div className="tg-preview-fact">Refill <b>10 / sec</b></div></div>
        </div>
      </>}
      {tab === "Policy Settings" && <div className="tg-preview-panel tg-preview-detail"><strong>Rate-limit configuration</strong><div className="tg-preview-field-label">Algorithm</div><div className="tg-preview-input">Token Bucket</div><div className="tg-preview-pair"><div><div className="tg-preview-field-label">Capacity</div><div className="tg-preview-input">100 tokens</div></div><div><div className="tg-preview-field-label">Refill rate</div><div className="tg-preview-input">10 tokens/sec</div></div></div><div className="tg-preview-action">Save policy</div><small>Illustrative controls — use Policy Settings in the dashboard.</small></div>}
      {tab === "Traffic Simulator" && <div className="tg-preview-panel tg-preview-detail"><strong>Simulate a request burst</strong><div className="tg-preview-pair"><div><div className="tg-preview-field-label">Client</div><div className="tg-preview-input">client_web_01</div></div><div><div className="tg-preview-field-label">Requests</div><div className="tg-preview-input">120</div></div></div><div className="tg-preview-action">Send burst</div><div className="tg-preview-decision"><span>✓ 100 allowed · HTTP 200</span><span>× 20 denied · HTTP 429</span></div><small>Instant-burst example, with 100 available tokens.</small></div>}
      {tab === "Metrics" && <div className="tg-preview-panel tg-preview-detail"><strong>Per-client request metrics</strong><div className="tg-preview-table"><div className="tg-preview-table-head"><span>Client</span><span>Total</span><span>Allowed</span><span>Denied</span></div>{[["client_web_01", "6,000", "5,800", "200"], ["client_mobile_07", "4,000", "3,800", "200"], ["partner_api_03", "2,480", "2,336", "144"]].map(row=><div className="tg-preview-table-row" key={row[0]}>{row.map(cell=><span key={cell}>{cell}</span>)}</div>)}</div><small>Sample records for layout preview only.</small></div>}
      <p className="tg-preview-caption">Product preview · synthetic sample data</p>
    </div>
  </div>;
}

function MiniBurstDemo() {
  const [requestCount, setRequestCount] = useState(120);
  const [capacity, setCapacity] = useState(100);
  const [ran, setRan] = useState(false);
  const [runId, setRunId] = useState(0);
  const allowed = Math.min(requestCount, capacity);
  const denied = requestCount - allowed;
  const simulate = () => { setRan(true); setRunId(n => n + 1); };
  const applyPreset = (requests: number, tokens: number) => {
    setRequestCount(requests);
    setCapacity(tokens);
    setRan(false);
  };
  const allowedPercent = Math.round((allowed / requestCount) * 100);
  const deniedPercent = 100 - allowedPercent;
  return <div className="burst-demo-card">
    <div className="burst-demo-header"><div><span className="marketing-kicker">TRY A SAMPLE BURST</span><h3>What happens when requests exceed a limit?</h3><p>One client · one token per request · no refill during this instant burst.</p></div><span className="burst-demo-status">LOCAL DEMO</span></div>
    <div className="burst-demo-fields"><label>Incoming requests <strong>{requestCount}</strong><input aria-label="Incoming request count" type="range" min="10" max="200" step="10" value={requestCount} onChange={e => { setRequestCount(Number(e.target.value)); setRan(false); }}/></label><label>Bucket capacity <strong>{capacity}</strong><input aria-label="Bucket capacity" type="range" min="10" max="150" step="10" value={capacity} onChange={e => { setCapacity(Number(e.target.value)); setRan(false); }}/></label></div>
    <div className="burst-scenario-row" role="group" aria-label="Sample traffic scenarios">
      <span>Try a scenario</span>
      <button type="button" onClick={() => applyPreset(50, 100)}>Normal traffic</button>
      <button type="button" onClick={() => applyPreset(120, 100)}>Burst traffic</button>
      <button type="button" onClick={() => applyPreset(200, 50)}>Heavy overload</button>
    </div>
    <button type="button" className="marketing-primary burst-run" onClick={simulate}>Simulate burst <Icon name="arrow" size={17}/></button>
    <div className="tg-bucket-flow" aria-label="Token bucket traffic animation">
      <div className="tg-flow-source"><span>Incoming</span><strong>{requestCount}</strong><small>API requests</small></div>
      <div className="tg-flow-wire tg-wire-in">{ran && <span key={`i-${runId}`} className="tg-flow-packet"/>}</div>
      <div className={`tg-flow-bucket ${ran ? "is-running" : ""}`}><span>RATE LIMITER</span><div className="tg-bucket-vessel"><div className="tg-bucket-fill" style={{height: `${ran ? Math.max(5,(capacity-allowed)/capacity*100) : 85}%`}}/></div><strong>{ran ? capacity - allowed : capacity} / {capacity}</strong><small>tokens remaining</small></div>
      <div className="tg-flow-outputs"><div className="tg-output-line tg-output-allowed">{ran && <span key={`a-${runId}`} className="tg-flow-packet"/>}</div><div className="tg-output-badge tg-badge-allowed">✓ ALLOWED <strong>{ran ? allowed : "—"}</strong><small>HTTP 200</small></div><div className="tg-output-line tg-output-denied">{ran && denied > 0 && <span key={`d-${runId}`} className="tg-flow-packet"/>}</div><div className="tg-output-badge tg-badge-denied">× DENIED <strong>{ran ? denied : "—"}</strong><small>HTTP 429</small></div></div>
    </div>
    <div className="burst-demo-results" aria-live="polite">
      <div className="burst-flow-labels">
        <span>Incoming <strong>{requestCount}</strong></span>
        <span>Allowed <strong>{ran ? allowed : "—"}</strong></span>
        <span>Denied <strong>{ran ? denied : "—"}</strong></span>
      </div>
      <div className="burst-result-track" role="img" aria-label={ran ? `${allowedPercent} percent allowed and ${deniedPercent} percent denied` : "No simulation results yet"}>
        {ran && <><span className="burst-allowed" style={{width:`${allowedPercent}%`}}/><span className="burst-denied" style={{width:`${deniedPercent}%`}}/></>}
      </div>
      {ran ? <div className="burst-insight">
        <strong>{denied > 0 ? "Rate limit enforced" : "All requests accepted"}</strong>
        <p>{denied > 0
          ? `${allowed} of ${requestCount} requests used available tokens. The remaining ${denied} requests were denied with HTTP 429 because the bucket was empty.`
          : `All ${requestCount} requests fit within the ${capacity}-token capacity, so none were rate-limited.`}</p>
        <div className="burst-insight-foot"><span>{allowedPercent}% allowed</span><span>{deniedPercent}% denied</span><button type="button" onClick={() => applyPreset(120, 100)}>Reset demo</button></div>
      </div> : <p>Choose a scenario or adjust the sliders, then select Simulate burst to see the outcome.</p>}
    </div>
  </div>;
}

function Landing({ onEnter }: { onEnter: () => void }) {
  const [showcaseTab,setShowcaseTab]=useState<ShowcaseTab>("Dashboard");
  const activeCopy=showcaseCopy[showcaseTab];
  return <div className="marketing-page">
    <div className="marketing-dark">
      <header className="marketing-nav"><SiteBrand dark/><nav aria-label="Landing navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about-product">About</a></nav><div className="marketing-nav-actions"><span className="tg-landing-status"><span className="hero-pulse" /> LOCAL DEMO</span></div></header>
      <section className="marketing-hero"><div className="hero-copy"><div className="hero-eyebrow"><span className="hero-pulse"/> API TRAFFIC MANAGEMENT · LOCAL DEMO</div><h1>Keep your APIs reliable under <em>any traffic.</em></h1><p>Configure rate limits, simulate request bursts, and understand API traffic behavior — all from one clear control plane.</p><div className="hero-buttons"><button type="button" className="marketing-primary tg-enter-button" onClick={onEnter}><span>Enter TrafficGovernor</span><Icon name="arrow" size={20}/></button></div><div className="hero-metrics"><div><strong>128,492</strong><span>Sample requests</span></div><div><strong>94.83%</strong><span>Sample allowed</span></div><div><strong>84 ms</strong><span>Sample P95 latency</span></div></div></div><TrafficAnimation/></section>
      <div className="hero-bottom-line"/>
    </div>
    <section className="product-showcase" id="features"><div className="marketing-section-head"><span className="marketing-kicker">EXPLORE THE CONTROL PLANE</span><h2>One workspace. Clearer traffic decisions.</h2><p>Explore the tools you'll find inside your TrafficGovernor dashboard.</p></div><div className="showcase-tabs" role="tablist" aria-label="Product features">{(["Dashboard","Policy Settings","Traffic Simulator","Metrics"] as ShowcaseTab[]).map(tab=><button key={tab} role="tab" aria-selected={showcaseTab===tab} className={showcaseTab===tab?"active":""} onClick={()=>setShowcaseTab(tab)}>{tab}</button>)}</div><div className="showcase-layout"><div className="showcase-description"><span className="marketing-kicker">{activeCopy.eyebrow}</span><h3>{activeCopy.heading}</h3><p>{activeCopy.description}</p><p className="tg-preview-hint">Preview only · Enter TrafficGovernor above to use the live dashboard.</p></div><ProductPreview tab={showcaseTab}/></div></section>
    <section className="journey-section" id="how-it-works"><div className="marketing-section-head"><span className="marketing-kicker">HOW IT WORKS</span><h2>From a traffic spike to a clear decision.</h2><p>Configure, test and analyze — without digging through raw server logs.</p></div><div className="journey-flow"><div className="journey-node"><span className="journey-number">01</span><span className="journey-icon"><Icon name="sliders" size={25}/></span><h3>Configure</h3><p>Choose a rate-limit policy and its capacity.</p></div><span className="journey-connector" aria-hidden="true"><span/></span><div className="journey-node"><span className="journey-number">02</span><span className="journey-icon"><Icon name="bolt" size={25}/></span><h3>Simulate</h3><p>Send synthetic requests through the limiter.</p></div><span className="journey-connector" aria-hidden="true"><span/></span><div className="journey-node"><span className="journey-number">03</span><span className="journey-icon"><Icon name="chart" size={25}/></span><h3>Analyze</h3><p>Understand HTTP 200 / 429 decisions and metrics.</p></div><div className="journey-outcome" aria-label="Example traffic outcome"><span className="journey-outcome-label"><span className="journey-live-dot"/> SAMPLE RESULT · INSTANT BURST</span><div className="journey-outcome-metrics"><span><strong>120</strong> Requests sent</span><span><strong>100</strong> <em className="journey-ok">Allowed · 200</em></span><span><strong>20</strong> <em className="journey-no">Denied · 429</em></span></div><span className="journey-outcome-note">One client · 100-token bucket · no refill during the burst</span></div></div></section>
    <section className="burst-section"><div className="burst-intro"><span className="marketing-kicker">INTERACTIVE TRAFFIC DEMO</span><h2>Make the limit visible.</h2><p>See how a Token Bucket capacity changes the result of a simulated instant burst. This experiment runs entirely in your browser.</p><div className="burst-intro-note"><Icon name="shield" size={20}/> Educational simulation — no production requests are sent.</div></div><MiniBurstDemo/></section>
    <section className="marketing-cta premium-cta final-cta" id="about-product" aria-labelledby="final-cta-heading">
      <div className="cta-light-tracks" aria-hidden="true"/>
      <div className="final-cta-main">
        <div className="final-cta-copy">
          <span className="final-cta-eyebrow"><span className="final-cta-status-dot"/> TRAFFIC INTELLIGENCE · LOCAL DEMO</span>
          <h2 id="final-cta-heading">Every request tells a story.<br/><em>Make every decision clear.</em></h2>
          <p>Explore rate-limit policies, simulate request bursts and understand the results in the TrafficGovernor control plane.</p>
          <span className="final-cta-disclaimer">Educational prototype · Synthetic requests only · Not a production API gateway</span>
        </div>
        <div className="final-cta-visual" aria-label="Illustration: simulated requests enter a rate limiter and split into allowed and denied paths">
          <div className="final-cta-visual-title"><span className="final-cta-status-dot"/> REQUEST DECISION FLOW <span>SIMULATED</span></div>
          <svg viewBox="0 0 460 225" className="final-cta-svg" role="img" aria-label="Incoming requests pass through a rate limiter, with allowed HTTP 200 and denied HTTP 429 results">
            <defs>
              <linearGradient id="finalCtaBlue" x1="0" x2="1"><stop offset="0" stopColor="#1748a8"/><stop offset="1" stopColor="#39c5ff"/></linearGradient>
            </defs>
            <path className="final-cta-track" d="M14 113 C92 113 118 113 171 113" stroke="#45baff"/>
            <path className="final-cta-track final-cta-green" d="M284 113 C336 113 350 61 443 61" stroke="#34d399"/>
            <path className="final-cta-track final-cta-red" d="M284 113 C336 113 350 168 443 168" stroke="#fb7185"/>
            <circle className="final-cta-packet final-cta-packet-blue" r="5" fill="#77deff"><animateMotion dur="2.6s" repeatCount="indefinite" path="M14 113 C92 113 118 113 171 113"/></circle>
            <circle className="final-cta-packet" r="5" fill="#4adeb0"><animateMotion dur="3.1s" repeatCount="indefinite" path="M284 113 C336 113 350 61 443 61"/></circle>
            <circle className="final-cta-packet" r="5" fill="#fb7185"><animateMotion dur="3.7s" repeatCount="indefinite" path="M284 113 C336 113 350 168 443 168"/></circle>
            <rect x="171" y="61" width="113" height="104" rx="16" fill="#102d52" stroke="#55aaff" strokeWidth="1.5"/>
            <path d="M228 79l13 6v12c0 10-8 17-13 19-7-3-13-9-13-19V85z" stroke="#79cdff" strokeWidth="2" fill="none"/>
            <text x="227" y="134" textAnchor="middle" fill="white" fontSize="12" fontWeight="700">RATE LIMITER</text>
            <text x="227" y="150" textAnchor="middle" fill="#9fb9dc" fontSize="10">TOKEN BUCKET</text>
            <text x="16" y="94" fill="#99c8ed" fontSize="11">REQUESTS</text>
            <text x="381" y="40" fill="#78e4b7" fontSize="12" fontWeight="700">200 ALLOWED</text>
            <text x="383" y="193" fill="#ffa0b0" fontSize="12" fontWeight="700">429 DENIED</text>
          </svg>
          <div className="final-cta-visual-bottom"><span>BLUE · INCOMING</span><span>GREEN · ALLOWED</span><span>RED · DENIED</span></div>
        </div>
      </div>
    </section>
    <footer className="marketing-footer final-footer">
      <div className="final-footer-brand"><SiteBrand/><p>Traffic intelligence. Clear decisions.<br/>A local learning environment for API rate limiting.</p></div>
      <nav className="final-footer-links" aria-label="Footer navigation"><span>EXPLORE</span><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about-product">About</a></nav>
      <div className="final-footer-access"><span>CONTROL PLANE</span><small>No login required · Local demo</small></div>
      <div className="final-footer-bottom"><span>© 2026 TrafficGovernor</span><span>Educational prototype · Simulated traffic, not real infrastructure protection</span></div>
    </footer>
  </div>;
}

// A page-level boundary prevents one faulty widget from blanking the entire console.
class ConsoleErrorBoundary extends Component<{ children: ReactNode; page: Page }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, _info: ErrorInfo) { console.error("TrafficGovernor page error:", error); }
  componentDidUpdate(previous: { page: Page }) {
    if (previous.page !== this.props.page && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <section className="console-error-fallback" role="alert"><h2>This page couldn't load</h2><p>Your local demo data is safe. Try reloading or selecting another page in the sidebar.</p><button className="btn primary" onClick={() => window.location.reload()}>Reload page</button></section>;
    return this.props.children;
  }
}

export default function App() {
  const [screen, setScreen] = useState<"landing" | "console">(() => {
    try {
      const saved = sessionStorage.getItem(CURRENT_SCREEN_KEY);
      return saved === "console" ? "console" : "landing";
    } catch {
      return "landing";
    }
  });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("trafficgovernor_theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const [role, setRole] = useState<"engineer" | "ops">("ops"); // fail closed until /role succeeds
  const [roleReady, setRoleReady] = useState(false);
  const [liveMetrics, setLiveMetrics] = useState<MetricsResponse | null>(null);
  const [metricsError, setMetricsError] = useState(false);
  const [analysisLogs, setAnalysisLogs] = useState<BackendLog[]>([]);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  useEffect(() => {
    try { localStorage.setItem("trafficgovernor_theme", theme); }
    catch { /* Theme remains usable for the current session. */ }
  }, [theme]);
  // In-memory records of requests actually sent during this page session.
  const [history, setHistory] = useState<SimulationDecision[]>([]);
  const recordSimulation = (items: SimulationDecision[]) => {
    setHistory(previous => [...previous, ...items].slice(-5000));
    window.setTimeout(() => { void refreshServerMetrics(); }, 0);
  };
  const [page, setPage] = useState<Page>(() => {
      try {
        const saved = sessionStorage.getItem(CURRENT_PAGE_KEY);
        return nav.some((item) => item.label === saved) ? (saved as Page) : "Dashboard";
      } catch {
        return "Dashboard";
      }
    }),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [logs, setLogs] = useState<SimulationDecision[]>([]),
    [searchOpen, setSearchOpen] = useState(false),
    [globalQuery, setGlobalQuery] = useState(""),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [notifications, setNotifications] = useState<DemoNotification[]>(() => {
      try {
        const value = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        return value.filter((n) => n && typeof n.id === "string" && typeof n.title === "string" && typeof n.description === "string" && typeof n.createdAt === "number" && typeof n.read === "boolean" && ["policy", "limit", "simulation"].includes(n.kind)).slice(0, 40);
      } catch { return []; }
    }),
    [policy, setPolicy] = useState<Policy>(defaultPolicy);

  // React state normally resets after a browser refresh; session storage remembers navigation.
  // It contains only a screen/page name, never passwords, API secrets, or access permissions.
  useEffect(() => {
    try {
      sessionStorage.setItem(CURRENT_SCREEN_KEY, screen);
      sessionStorage.setItem(CURRENT_PAGE_KEY, page);
    } catch {
      // The application still works if storage is disabled.
    }
  }, [screen, page]);

  async function refreshServerMetrics() {
    try {
      const data = await getMetrics();
      setLiveMetrics(data);
      setMetricsError(false);
      try {
        const rows = await getLogs(0, 200);
        setAnalysisLogs(rows.logs);
        setLogs(rows.logs.slice(0, 100).map(renderLog));
      } catch {
        // Older supported versions of TrafficGovernor return recent logs in /metrics.
        const fallbackLogs = [...(data.logs ?? [])].reverse();
        setAnalysisLogs(fallbackLogs);
        setLogs(fallbackLogs.map(renderLog));
      }
    } catch (err) {
      console.error("Python metrics unavailable:", err);
      setLiveMetrics(null);
      setMetricsError(true);
      setLogs([]);
      setAnalysisLogs([]);
    }
  }

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const current = await getPolicy();
        if (mounted) { setPolicy(fromBackendPolicy(current)); setPolicyLoaded(true); }
      } catch (err) { console.error("Policy could not be loaded:", err); }
      try {
        const backendRole = await getRole();
        if (mounted) { setRole(backendRole === "network_ops" ? "ops" : "engineer"); setRoleReady(true); }
      } catch (err) { console.error("Role verification failed (read-only fallback):", err); }
    };
    void init();
    void refreshServerMetrics();
    const id = window.setInterval(() => void refreshServerMetrics(), 5000);
    return () => { mounted = false; window.clearInterval(id); };
  }, []);

  const changeRole = async (next: "engineer" | "ops") => {
    const prior = role;
    setRoleReady(false);
    try {
      const confirmed = await setBackendRole(next === "ops" ? "network_ops" : "infrastructure_engineer");
      setRole(confirmed === "network_ops" ? "ops" : "engineer");
      setRoleReady(true);
    } catch (err) {
      setRole(prior);
      setRoleReady(true);
      notify(`Role change rejected: ${err instanceof Error ? err.message : "API unavailable"}`);
    }
  };

  const resetOneClient = async (clientId: string) => {
    if (!window.confirm(`Reset displayed counters for ${clientId}? Historical global metrics will be preserved.`)) return;
    try { await resetClientMetrics(clientId); await refreshServerMetrics(); notify(`Counters reset for ${clientId}; global history preserved`); }
    catch (err) { notify(`Reset failed: ${err instanceof Error ? err.message : "API unavailable"}`); }
  };
  useEffect(() => {
    if (roleReady && role === "ops" && page === "Policy Settings") setPage("Dashboard");
  }, [roleReady, role, page]);
  useEffect(() => {
    try { localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications)); }
    catch { /* The demo works in-memory when browser storage is unavailable. */ }
  }, [notifications]);
  const addEvent = (kind: DemoNotification["kind"], title: string, description: string) => {
    setNotifications((previous) => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind, title, description, createdAt: Date.now(), read: false,
    }, ...previous].slice(0, 40));
  };
  const unreadCount = notifications.filter((n) => !n.read).length;
  const savePolicy = async (next: Policy) => {
    if (!roleReady || role !== "engineer") throw new Error("Network Ops cannot modify policies");
    const stored = await saveBackendPolicy(toBackendPolicy(next));
    setPolicy(fromBackendPolicy(stored));
    setPolicyLoaded(true);
    addEvent("policy", "Backend policy updated", `${stored.algorithm} saved to Python. Rate-limit histories were reset.`);
    notify("Python backend policy saved successfully");
    await refreshServerMetrics();
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
      if (e.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const searchResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return nav.filter(n => role === "engineer" || n.label !== "Policy Settings").map((n) => ({ label: n.label, destination: n.label, detail: "Page" }));
    return [
      ...nav.filter((n) => n.label.toLowerCase().includes(q) && (role === "engineer" || n.label !== "Policy Settings")).map((n) => ({ label: n.label, destination: n.label, detail: "Page" })),
      ...clients.filter((c) => c.id.toLowerCase().includes(q)).map((c) => ({ label: c.id, destination: "Metrics" as Page, detail: "Sample client · open Metrics" })),
      ...["/api/v1/orders", "/api/v1/products", "/api/v1/auth", "/api/v1/sync"].filter((e) => e.toLowerCase().includes(q)).map((e) => ({ label: e, destination: "Traffic Simulator" as Page, detail: "Demo endpoint" })),
    ];
  }, [globalQuery, role]);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 3200);
  };
  const go = (p: Page) => {
    if (role === "ops" && p === "Policy Settings") {
      notify("Network Ops is read-only in this demo. Switch to Engineer to edit policies.");
      return;
    }
    setPage(p);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (screen === "landing") return <Landing onEnter={() => { setPage("Dashboard"); setScreen("console"); }} />;
  return (
    <div className={`app-shell ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <aside className={mobile ? "open" : ""}>
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>TrafficGovernor</strong>
            <small>CONTROL PLANE</small>
          </div>
        </div>
        <button className="mobile-close" onClick={() => setMobile(false)} aria-label="Close menu">
          <Icon name="close" />
        </button>
        <nav>
          {nav.filter(n => role === "engineer" || n.label !== "Policy Settings").map((n, i) => (
            <button
              key={n.label}
              className={page === n.label ? "active" : ""}
              onClick={() => go(n.label)}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {page === n.label && <Icon name="chevron" size={14} />}{" "}
              {i === 2 && <small>LAB</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status">
            <span />
            <div>
              <strong>Demo environment</strong>
              <small>{metricsError ? "Backend disconnected" : liveMetrics ? "Python API connected" : "Connecting to backend"}</small>
            </div>
          </div>
          <div className="version">
            TG Control Plane <span>v2.4.1</span>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="backdrop"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
      <main>
        <header>
          <button
            className="menu-button"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>TrafficGovernor</span>
            <Icon name="chevron" size={13} />
            <b>{page}</b>
          </div>
          <div className="top-actions">
            <label className="role-picker" title="Demo-only view switch; server permissions still required">
              <span className="role-picker-caption">View</span>
              <select aria-label="Demo role" value={role} disabled={!roleReady} onChange={e => void changeRole(e.target.value as "engineer" | "ops")}>
                <option value="engineer">Engineer</option>
                <option value="ops">Network Ops</option>
              </select>
            </label>
            <button type="button" className="icon-button theme-toggle" onClick={() => setTheme(t => t === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? "☾" : "☀"}</button>
            <button className="search-trigger" onClick={() => { setGlobalQuery(""); setSearchOpen(true); }}>
              <Icon name="search" size={16} />
              <span>Search</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="notification-anchor">
              <button
                type="button"
                className="icon-button"
                title="Open notifications"
                aria-label={`Notifications, ${unreadCount} unread`}
                aria-expanded={notificationsOpen}
                aria-controls="tg-notification-panel"
                data-count={unreadCount > 0 ? (unreadCount > 9 ? "9+" : String(unreadCount)) : undefined}
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Icon name="bell" size={18} />
              </button>
              {notificationsOpen && (
                <>
                  <button className="notification-dismiss" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} />
                  <section className="notification-panel" id="tg-notification-panel" aria-label="Notification center">
                    <div className="notification-panel-heading">
                      <div><strong>Notifications</strong><small>{unreadCount} unread · Local demo</small></div>
                      <button onClick={() => setNotifications((items) => items.map((n) => ({ ...n, read: true })))} disabled={!unreadCount}>Mark all read</button>
                    </div>
                    <div className="notification-items">
                      {notifications.length === 0 ? (
                        <div className="notification-empty"><Icon name="bell" size={25} /><strong>All caught up</strong><p>Save a policy or run a simulation to generate notifications.</p></div>
                      ) : notifications.map((n) => (
                        <div className={`notification-item ${n.read ? "" : "unread"}`} key={n.id}>
                          <div className={`notification-kind ${n.kind}`}><Icon name={n.kind === "policy" ? "sliders" : n.kind === "limit" ? "shield" : "bolt"} size={17} /></div>
                          <div className="notification-body">
                            <strong>{n.title}</strong>
                            <p>{n.description}</p>
                            <small>{new Date(n.createdAt).toLocaleString()}</small>
                          </div>
                          {!n.read && <button className="notification-read" aria-label={`Mark ${n.title} as read`} title="Mark as read" onClick={() => setNotifications((items) => items.map((item) => item.id === n.id ? { ...item, read: true } : item))}><Icon name="check" size={14} /></button>}
                        </div>
                      ))}
                    </div>
                    {notifications.length > 0 && <div className="notification-footer"><button onClick={() => setNotifications([])}>Clear all notifications</button></div>}
                  </section>
                </>
              )}
            </div>
            <div className="environment">
              <span />
              Demo
              <Icon name="chevron" size={12} />
            </div>
            <button className="avatar" title="Return to landing page" aria-label="Return to landing page" onClick={() => setScreen("landing")}>
              AM
            </button>
          </div>
        </header>
        <div className="content">
          <div className="console-view-note" role="status">{!roleReady ? "Permissions unavailable: editing disabled" : role === "ops" ? "Network Ops view · Python rejects policy edits (HTTP 403)" : "Infrastructure Engineer view"} · {theme === "dark" ? "Dark mode" : "Light mode"} · {liveMetrics ? "Live Python metrics" : "Awaiting Python metrics"}</div>
          <ConsoleErrorBoundary page={page}>
          {page === "Dashboard" && <Dashboard goTo={go} dynamicLogs={logs} policy={policy} history={history} liveMetrics={liveMetrics} metricsError={metricsError} policyLoaded={policyLoaded} />}
          {page === "Policy Settings" && roleReady && role === "engineer" && <PolicySettings notify={notify} policy={policy} onSave={savePolicy} />}
          {page === "Traffic Simulator" && <Simulator onLogs={setLogs} onSimulation={recordSimulation} notify={notify} policy={policy} onEvent={addEvent} />}
          {page === "Metrics" && <Metrics notify={notify} metrics={liveMetrics} onResetClient={resetOneClient} />}
          {page === "Analysis Report" && <AnalysisReport metrics={liveMetrics} logs={analysisLogs} metricsError={metricsError} />}
          {page === "About / Help" && <About />}
          </ConsoleErrorBoundary>
        </div>
      </main>
      {searchOpen && (
        <div className="global-search-backdrop" onMouseDown={() => setSearchOpen(false)}>
          <div className="global-search-dialog" role="dialog" aria-modal="true" aria-label="Search TrafficGovernor" onMouseDown={(e) => e.stopPropagation()}>
            <div className="global-search-input"><Icon name="search" size={19} /><input autoFocus placeholder="Search pages, clients or endpoints…" value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)} aria-label="Search" /><button onClick={() => setSearchOpen(false)} aria-label="Close search"><Icon name="close" size={18}/></button></div>
            <div className="global-search-results">
              {searchResults.length ? searchResults.map((result, i) => <button key={`${result.detail}-${result.label}-${i}`} onClick={() => { go(result.destination); setSearchOpen(false); }}><span><b>{result.label}</b><small>{result.detail}</small></span><Icon name="arrow" size={16}/></button>) : <p>No matching pages, clients or endpoints.</p>}
            </div>
            <p className="global-search-hint">⌘K / Ctrl+K to open · Esc to close · Page navigation; suggested clients are examples</p>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <span>
            <Icon name="check" size={14} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
