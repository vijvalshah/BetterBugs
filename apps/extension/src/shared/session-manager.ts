/**
 * Session Manager for Background Service
 * Handles fetching and caching sessions from the API
 */

import type { ApiListResponse, ApiSession, ApiSessionDetail } from './api-client';
import { BugCatcherApiClient } from './api-client';

export interface CachedSession extends ApiSession {
  cachedAt: number; // timestamp
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_CACHE_KEY = 'bugcatcherSessionCache';

export class SessionManager {
  private client: BugCatcherApiClient;
  private cache: Map<string, CachedSession> = new Map();
  private lastListFetch: Map<string, number> = new Map();

  constructor(apiBaseUrl: string, projectKey: string) {
    this.client = new BugCatcherApiClient(apiBaseUrl, projectKey);
  }

  /**
   * List sessions with triage-friendly filtering and pagination.
   */
  async listSessions(options: {
    projectId: string;
    q?: string;
    tag?: string;
    hasError?: boolean;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    forceRefresh?: boolean;
  }): Promise<ApiListResponse> {
    const {
      projectId,
      q,
      tag,
      hasError,
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      forceRefresh = false,
    } = options;

    const cacheKey = `list_${projectId}_${q ?? ''}_${tag ?? ''}_${String(hasError)}_${limit}_${offset}_${sortBy}_${sortOrder}`;
    const now = Date.now();
    const lastFetch = this.lastListFetch.get(cacheKey) || 0;

    if (!forceRefresh && now-lastFetch < CACHE_TTL_MS) {
      const cached = Array.from(this.cache.values())
        .filter((session) => now-session.cachedAt < CACHE_TTL_MS)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        items: cached.slice(0, limit),
        total: cached.length,
        limit,
        offset,
        sortBy,
        sortOrder,
      };
    }

    const response = await this.client.listSessions({
      projectId,
      q,
      tag,
      hasError,
      limit,
      offset,
      sortBy,
      sortOrder,
    });

    this.lastListFetch.set(cacheKey, now);
    response.items.forEach((session) => {
      this.cache.set(session.sessionId, {
        ...session,
        cachedAt: now,
      });
    });

    return response;
  }

  /**
   * Get recent sessions (cached)
   */
  async getRecentSessions(projectId: string, forceRefresh = false): Promise<ApiSession[]> {
    const cacheKey = `recent_${projectId}`;
    const lastFetch = this.lastListFetch.get(cacheKey) || 0;
    const now = Date.now();

    if (!forceRefresh && now - lastFetch < CACHE_TTL_MS) {
      // Return from cache
      const cached = Array.from(this.cache.values())
        .filter((s) => Boolean(s?.id) && now-s.cachedAt < CACHE_TTL_MS)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return cached.length > 0 ? cached : [];
    }

    try {
      const sessions = await this.client.getRecentSessions(projectId, 10);
      this.lastListFetch.set(cacheKey, now);

      // Cache individual sessions
      sessions.forEach((session) => {
        this.cache.set(session.sessionId, {
          ...session,
          cachedAt: now,
        });
      });

      return sessions;
    } catch (error) {
      console.error('Failed to fetch recent sessions:', error);
      // Return empty array on error - don't fail completely
      return [];
    }
  }

  /**
   * Get error sessions (cached)
   */
  async getErrorSessions(projectId: string, forceRefresh = false): Promise<ApiSession[]> {
    const cacheKey = `errors_${projectId}`;
    const lastFetch = this.lastListFetch.get(cacheKey) || 0;
    const now = Date.now();

    if (!forceRefresh && now - lastFetch < CACHE_TTL_MS) {
      const cached = Array.from(this.cache.values()).filter((s) => s.error);
      return cached.length > 0 ? cached : [];
    }

    try {
      const sessions = await this.client.getErrorSessions(projectId, 5);
      this.lastListFetch.set(cacheKey, now);

      sessions.forEach((session) => {
        this.cache.set(session.sessionId, {
          ...session,
          cachedAt: now,
        });
      });

      return sessions;
    } catch (error) {
      console.error('Failed to fetch error sessions:', error);
      return [];
    }
  }

  /**
   * Get specific session details
   */
  async getSessionDetail(sessionId: string, forceRefresh = false): Promise<ApiSessionDetail | null> {
    if (!forceRefresh) {
      const cached = this.cache.get(sessionId);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        // Return cached version
        return cached as unknown as ApiSessionDetail;
      }
    }

    try {
      const session = await this.client.getSession(sessionId);
      const now = Date.now();

      // Update cache
      this.cache.set(sessionId, {
        ...session,
        cachedAt: now,
      });

      return session;
    } catch (error) {
      console.error('Failed to fetch session details:', error);
      return null;
    }
  }

  /**
   * Search sessions
   */
  async searchSessions(projectId: string, query: string): Promise<ApiSession[]> {
    try {
      return await this.client.searchSessions(projectId, query, 20);
    } catch (error) {
      console.error('Failed to search sessions:', error);
      return [];
    }
  }

  /**
   * Add tag to session
   */
  async addTag(sessionId: string, tags: string[]): Promise<boolean> {
    try {
      await this.client.addTag(sessionId, tags);
      // Invalidate cache for this session
      this.cache.delete(sessionId);
      return true;
    } catch (error) {
      console.error('Failed to add tag:', error);
      return false;
    }
  }

  /**
   * Add comment to session
   */
  async addComment(sessionId: string, body: string, author?: string): Promise<boolean> {
    try {
      await this.client.addComment(sessionId, body, author);
      // Invalidate cache for this session
      this.cache.delete(sessionId);
      return true;
    } catch (error) {
      console.error('Failed to add comment:', error);
      return false;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await this.client.deleteSession(sessionId);
      // Invalidate cache
      this.cache.delete(sessionId);
      return true;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    return await this.client.testConnection();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.lastListFetch.clear();
  }

  /**
   * Get cache size for debugging
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
