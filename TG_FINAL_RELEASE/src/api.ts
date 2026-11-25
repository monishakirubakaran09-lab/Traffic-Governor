/** TrafficGovernor API client. The Vite proxy maps /backend/* to localhost:5001/*. */
const API_BASE = "/backend";

export type BackendPolicy = {
  algorithm: "token_bucket" | "sliding_window";
  capacity: number;
  refill_rate: number;
  window_limit: number;
  window_seconds: number;
};

export type BackendRole = "infrastructure_engineer" | "network_ops";

export type BackendLog = {
  id?: number;
  timestamp: string;
  client_id: string;
  endpoint: string;
  decision: "ALLOWED" | "DENIED";
  status: number;
  algorithm?: string;
  latency_ms: number;
  remaining?: number | null;
  tokens_remaining?: number | null;
  retry_after_ms?: number | null;
};

export type ClientMetrics = {
  total: number;
  allowed: number;
  denied: number;
  deny_rate?: number;
  last_reset_at?: string;
};

export type MetricsResponse = {
  total: number;
  allowed: number;
  denied: number;
  deny_rate: number;
  active_algorithm?: string;
  avg_latency_ms?: number | null;
  p95_latency_ms: number | null;
  latency_sample_count?: number;
  volume?: Array<{ minute: string; requests: number }>;
  clients?: Record<string, ClientMetrics>;
  logs?: BackendLog[];
  log_total?: number;
};

export type LogsResponse = {
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  logs: BackendLog[];
};

export type CheckResponse = {
  client_id: string;
  allowed: boolean;
  decision: "ALLOWED" | "DENIED";
  status: number;
  algorithm: string;
  remaining: number | null;
  tokens_remaining: number | null;
  retry_after_ms: number | null;
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body.slice(0, 160);
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error || parsed.message || detail;
    } catch { /* A plain text error response is also valid. */ }
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await response.json()) as T;
}

export const getMetrics = () => apiJson<MetricsResponse>("/metrics");
export const getPolicy = () => apiJson<BackendPolicy>("/policy");
export const getLogs = (offset = 0, limit = 100) =>
  apiJson<LogsResponse>(`/logs?offset=${offset}&limit=${limit}`);
export const getRole = async () => {
  const data = await apiJson<{ role: BackendRole }>("/role");
  return data.role;
};

export const savePolicy = (data: Partial<BackendPolicy> & Pick<BackendPolicy, "algorithm">) =>
  apiJson<BackendPolicy>("/policy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const setBackendRole = async (role: BackendRole) => {
  const result = await apiJson<{ role: BackendRole }>("/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return result.role;
};

export const resetClientMetrics = (client_id: string) =>
  apiJson<{ message: string }>("/metrics/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id }),
  });

/** A 429 is a normal limiter decision, not a network error. */
export async function checkRequest(clientId: string): Promise<CheckResponse> {
  const response = await fetch(`${API_BASE}/check?client_id=${encodeURIComponent(clientId)}`, {
    cache: "no-store",
  });
  if (response.status !== 200 && response.status !== 429) {
    throw new Error(`Request check failed: HTTP ${response.status}`);
  }
  const data = (await response.json()) as CheckResponse;
  if (typeof data.allowed !== "boolean" || ![200, 429].includes(data.status)) {
    throw new Error("Unexpected /check API response");
  }
  return data;
}


export async function testBackendConnection() {
  const response = await fetch("http://127.0.0.1:5001/metrics");

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  return response.json();
}