import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitHubIssue, validateGitHubExportConfig } from './github-export';
import type { GitHubExportConfig } from '../shared/types';
import type { ApiSessionDetail } from '../shared/api-client';

const config: GitHubExportConfig = {
  enabled: true,
  owner: 'example-org',
  repo: 'example-repo',
  token: 'ghp_test_token',
  labels: 'bug,triage',
  assignees: 'octocat',
};

const session: ApiSessionDetail = {
  id: 'db-1',
  sessionId: 'sess-123',
  url: 'https://app.example.dev/settings',
  title: 'Settings page crash',
  timestamp: '2026-03-28T00:00:00.000Z',
  error: {
    type: 'TypeError',
    message: 'Cannot read properties of undefined',
    signature: 'TypeError:cannot-read-properties',
  },
  stats: {
    consoleCount: 4,
    networkCount: 2,
    stateSnapshots: 1,
  },
  tags: [],
  commentCount: 0,
  media: { hasReplay: true },
  createdAt: '2026-03-28T00:00:02.000Z',
  environment: {
    browser: 'Chrome',
    browserVersion: '123',
    os: 'macOS',
    osVersion: '14',
    viewport: { width: 1440, height: 900 },
    language: 'en-US',
  },
  events: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('github-export', () => {
  it('validates required GitHub export settings when enabled', () => {
    expect(validateGitHubExportConfig({ ...config, owner: '' })).toBe(
      'GitHub owner is required before exporting.',
    );
  });

  it('creates a GitHub issue and returns URL metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        html_url: 'https://github.com/example-org/example-repo/issues/42',
        number: 42,
        title: '[BugCatcher] test issue',
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await createGitHubIssue(config, session, {
      summary: 'Settings crashes when opening.',
      rootCause: 'Undefined state object in settings reducer.',
      classification: 'frontend-runtime',
      actions: ['Add undefined guard'],
      suggestedFiles: ['src/settings/reducer.ts'],
    });

    expect(result.issueNumber).toBe(42);
    expect(result.issueUrl).toContain('/issues/42');

    const request = fetchMock.mock.calls[0];
    expect(request[0]).toContain('/repos/example-org/example-repo/issues');
    expect(String((request[1] as RequestInit)?.body || '')).toContain('Settings crashes when opening.');
  });

  it('throws actionable error when GitHub API rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          message: 'Bad credentials',
        }),
      }) as unknown as typeof fetch,
    );

    await expect(createGitHubIssue(config, session)).rejects.toThrow('GitHub export failed: Bad credentials');
  });
});
