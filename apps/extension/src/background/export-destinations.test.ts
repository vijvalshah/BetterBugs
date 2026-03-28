import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createExportArtifact,
  createGitLabIssue,
  createLinearIssue,
  createShareLinkArtifact,
  validateShareLinkConfig,
} from './export-destinations';
import type { ApiSessionDetail } from '../shared/api-client';
import type { ExtensionConfig } from '../shared/types';
import { DEFAULT_CONFIG } from '../shared/types';

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

describe('export-destinations', () => {
  it('validates share link expiry bounds', () => {
    expect(
      validateShareLinkConfig({
        enabled: true,
        baseUrl: 'https://api.example.dev',
        defaultPermission: 'viewer',
        defaultExpiryHours: 0,
        requireAuth: true,
      }),
    ).toBe('Share link expiry must be between 1 and 720 hours.');
  });

  it('creates share links with permission and expiry metadata', () => {
    const result = createShareLinkArtifact(
      {
        enabled: true,
        baseUrl: 'https://api.example.dev',
        defaultPermission: 'viewer',
        defaultExpiryHours: 24,
        requireAuth: true,
      },
      'https://fallback.example.dev/api/v1',
      session.sessionId,
      {
        permission: 'commenter',
        expiresInHours: 12,
      },
    );

    expect(result.destination).toBe('share-link');
    expect(result.permission).toBe('commenter');
    expect(result.artifactUrl).toContain('/sessions/sess-123/share');
    expect(result.artifactUrl).toContain('permission=commenter');
    expect(result.expiresAt).toBeTruthy();
  });

  it('creates a GitLab issue and returns export metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          web_url: 'https://gitlab.com/example-group/example-project/-/issues/14',
          iid: 14,
          title: '[BugCatcher] test issue',
        }),
      }) as unknown as typeof fetch,
    );

    const result = await createGitLabIssue(
      {
        enabled: true,
        baseUrl: 'https://gitlab.com',
        projectId: 'example-group/example-project',
        token: 'glpat-test',
        labels: 'bug,triage',
        assigneeIds: '12,34',
      },
      session,
      {
        summary: 'Settings crashes on open.',
      },
    );

    expect(result.destination).toBe('gitlab');
    expect(result.artifactUrl).toContain('/issues/14');
    expect(result.artifactId).toBe('14');
  });

  it('creates a Linear issue and returns identifier metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'linear-id-1',
                identifier: 'BUG-42',
                title: '[BugCatcher] issue',
                url: 'https://linear.app/example/issue/BUG-42/sample',
              },
            },
          },
        }),
      }) as unknown as typeof fetch,
    );

    const result = await createLinearIssue(
      {
        enabled: true,
        apiUrl: 'https://api.linear.app/graphql',
        teamId: 'team-1',
        token: 'lin_api_key',
        labelIds: 'label-1,label-2',
        assigneeId: 'user-1',
      },
      session,
      {
        rootCause: 'state reducer mutation',
      },
    );

    expect(result.destination).toBe('linear');
    expect(result.artifactId).toBe('BUG-42');
    expect(result.artifactUrl).toContain('BUG-42');
  });

  it('routes createExportArtifact for share-link destination', async () => {
    const config: ExtensionConfig = {
      ...DEFAULT_CONFIG,
      apiBaseUrl: 'https://api.example.dev/api/v1',
      shareLinks: {
        ...DEFAULT_CONFIG.shareLinks,
        enabled: true,
        defaultPermission: 'viewer',
        defaultExpiryHours: 6,
      },
    };

    const result = await createExportArtifact('share-link', config, session, undefined, {
      permission: 'editor',
      expiresInHours: 2,
    });

    expect(result.destination).toBe('share-link');
    expect(result.permission).toBe('editor');
    expect(result.expiresAt).toBeTruthy();
  });
});
