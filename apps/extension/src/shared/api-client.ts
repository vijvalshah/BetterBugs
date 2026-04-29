/**
 * API Client for BetterBugs Backend
 * Handles all communication with the Go API
 */

export interface ApiSession {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  timestamp: string;
  error?: {
    type: string;
    message: string;
    signature: string;
  };
  stats: {
    consoleCount: number;
    networkCount: number;
    stateSnapshots: number;
  };
  triageSummary?: ApiTriageSummary;
  tags: string[];
  commentCount: number;
  media: {
    hasReplay: boolean;
    screenshotKey?: string;
    videoKey?: string;
    domSnapshots?: string[];
  };
  signedMedia?: {
    screenshot?: string;
    video?: string;
    domSnapshots?: string[];
  };
  createdAt: string;
}

export interface ApiTriageSummary {
  hasUsefulSignal: boolean;
  errorCount?: number;
  firstErrorAtMs?: number;
  lastErrorAtMs?: number;
  topErrorMessage?: string;
  consoleErrorCount?: number;
  consoleWarnCount?: number;
  requestCount?: number;
  failedRequestCount?: number;
  statusHistogram?: Record<string, number>;
  p95NetworkDurationMs?: number;
  topFailingEndpoints?: Array<{
    method: string;
    path: string;
    count: number;
  }>;
  stateSnapshotCount?: number;
  changedSnapshotCount?: number;
}

export interface ApiSessionDetail extends ApiSession {
  environment: {
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    viewport: { width: number; height: number };
    language: string;
  };
  app?: {
    version?: string;
    commitSha?: string;
    branch?: string;
  };
  events: Array<{
    id: string;
    type: string;
    timestamp: number;
    payload: Record<string, unknown>;
  }>;
}

export interface ApiListResponse {
  items: ApiSession[];
  total: number;
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: string;
}

export interface ApiCreateSessionResponse {
  sessionId: string;
  id: string;
  eventRefs: number;
}

export interface ApiError {
  code: string;
  error: string;
  details?: Array<{
    field: string;
    issue: string;
  }>;
}

export class BugCatcherApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    this.apiKey = apiKey;
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}?limit=1&offset=0`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List sessions with filters
   */
  async listSessions(options?: {
    projectId?: string;
    url?: string;
    error?: string;
    tag?: string;
    hasError?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiListResponse> {
    const params = new URLSearchParams();

    if (options?.projectId) params.append('projectId', options.projectId);
    if (options?.url) params.append('url', options.url);
    if (options?.error) params.append('error', options.error);
    if (options?.tag) params.append('tag', options.tag);
    if (options?.hasError !== undefined) params.append('hasError', String(options.hasError));
    if (options?.q) params.append('q', options.q);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset !== undefined) params.append('offset', String(options.offset));
    if (options?.sortBy) params.append('sortBy', options.sortBy);
    if (options?.sortOrder) params.append('sortOrder', options.sortOrder);

    const queryString = params.toString();
    const url = `${this.baseUrl}?${queryString}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }

    return (await response.json()) as ApiListResponse;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<ApiSessionDetail> {
    const response = await fetch(`${this.baseUrl}/${sessionId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Session not found');
      }
      throw new Error(`Failed to fetch session: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      session: Omit<ApiSessionDetail, 'events' | 'signedMedia'>;
      events?: ApiSessionDetail['events'];
      signedMedia?: ApiSession['signedMedia'];
    };

    return {
      ...data.session,
      events: Array.isArray(data.events) ? data.events : [],
      signedMedia: data.signedMedia,
    };
  }

  /**
   * Create a new session
   */
  async createSession(payload: Record<string, unknown>): Promise<ApiCreateSessionResponse> {
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = (await response.json()) as ApiError;
      throw new Error(`Failed to create session: ${error.error || response.statusText}`);
    }

    return (await response.json()) as ApiCreateSessionResponse;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/${sessionId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }

    return (await response.json()) as { message: string };
  }

  /**
   * Add tag to session
   */
  async addTag(sessionId: string, tags: string[]): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/${sessionId}/tags`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ tags }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update tags: ${response.statusText}`);
    }

    return (await response.json()) as { message: string };
  }

  /**
   * Add comment to session
   */
  async addComment(
    sessionId: string,
    body: string,
    author?: string,
  ): Promise<{ id: string; createdAt: string }> {
    const response = await fetch(`${this.baseUrl}/${sessionId}/comments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ body, author }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add comment: ${response.statusText}`);
    }

    return (await response.json()) as { id: string; createdAt: string };
  }

  /**
   * Get recent sessions with error
   */
  async getErrorSessions(projectId: string, limit = 10): Promise<ApiSession[]> {
    const response = await this.listSessions({
      projectId,
      hasError: true,
      limit,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    return response.items;
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(projectId: string, limit = 20): Promise<ApiSession[]> {
    const response = await this.listSessions({
      projectId,
      limit,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    return response.items;
  }

  /**
   * Search sessions
   */
  async searchSessions(projectId: string, query: string, limit = 20): Promise<ApiSession[]> {
    const response = await this.listSessions({
      projectId,
      q: query,
      limit,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    return response.items;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Project-Key': this.apiKey,
    };
  }
}

/**
 * Create API client from extension config
 */
export function createApiClient(apiBaseUrl: string, projectKey: string): BugCatcherApiClient {
  return new BugCatcherApiClient(apiBaseUrl, projectKey);
}
