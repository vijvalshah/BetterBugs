const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001/api/v1";
const PROJECT_KEY = process.env.NEXT_PUBLIC_PROJECT_KEY || "dev-key";

export interface ApiSession {
  sessionId: string;
  title?: string;
  url: string;
  timestamp: string;
  createdAt: string;
  duration?: number;
  environment: {
    browser: string;
    browserVersion?: string;
    os: string;
    osVersion?: string;
    viewport?: { width: number; height: number };
    language?: string;
  };
  stats: {
    consoleCount: number;
    networkCount: number;
    stateSnapshots: number;
  };
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  tags: string[];
  triageSummary?: {
    errorCount: number;
    failedRequestCount: number;
    p95NetworkDurationMs: number;
    stateSnapshotCount: number;
    topErrorMessage?: string;
    topFailingEndpoints?: Array<{ method: string; path: string; count: number }>;
    statusHistogram?: Record<string, number>;
  };
  media?: {
    screenshotKey?: string;
    videoKey?: string;
    domSnapshots?: string[];
    hasReplay?: boolean;
  };
  aiAnalysis?: {
    summary: string;
    rootCause: string;
    suggestedFiles: string[];
    actions: string[];
    confidence: number;
    provider: string;
    model: string;
    status: "completed" | "fallback";
    classification?: string;
    codeContextFiles?: Array<{ path: string; reason: string; score: number; lineHint?: string }>;
    crossFileTraces?: string[];
  };
  events?: Array<{
    type: string;
    timestamp?: number;
    payload?: Record<string, unknown>;
  }>;
  comments?: Array<{
    id: string;
    author: string;
    body: string;
    createdAt: string;
  }>;
}

export interface SessionListResponse {
  sessions: ApiSession[];
  total: number;
  limit: number;
  offset: number;
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Project-Key": PROJECT_KEY,
  };
}

export async function listSessions(params?: {
  limit?: number;
  offset?: number;
  tag?: string;
  url?: string;
  errorType?: string;
}): Promise<SessionListResponse> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.tag) search.set("tag", params.tag);
  if (params?.url) search.set("url", params.url);
  if (params?.errorType) search.set("errorType", params.errorType);

  const res = await fetch(`${API_BASE}/sessions?${search.toString()}`, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to list sessions: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return {
    sessions: data.sessions || [],
    total: data.total || 0,
    limit: data.limit || 20,
    offset: data.offset || 0,
  };
}

export async function getSession(id: string): Promise<ApiSession | null> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to get session: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to delete session: ${res.status} ${res.statusText}`);
  }
}

export async function updateSessionTags(
  id: string,
  add: string[],
  remove: string[],
  actor?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}/tags`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ add, remove, actor: actor || "dashboard" }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update tags: ${res.status} ${res.statusText}`);
  }
}

export async function addSessionComment(
  id: string,
  body: string,
  author?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}/comments`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ body, author: author || "dashboard" }),
  });

  if (!res.ok) {
    throw new Error(`Failed to add comment: ${res.status} ${res.statusText}`);
  }
}
