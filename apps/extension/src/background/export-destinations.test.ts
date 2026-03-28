import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildRoutingRecommendation,
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
  it('builds routing recommendations from rules and analysis context', () => {
    const routing = buildRoutingRecommendation(
      {
        enabled: true,
        labelRules: 'settings:frontend|triage\nstate:state-machine',
        ownershipRules: 'settings:frontend-oncall\nreducer:state-oncall',
      },
      session,
      {
        summary: 'Settings reducer fails on undefined state object',
        classification: 'frontend-runtime',
        suggestedFiles: ['src/settings/reducer.ts'],
      },
    );

    expect(routing.labels).toContain('bug');
    expect(routing.labels).toContain('frontend');
    expect(routing.labels).toContain('triage');
    expect(routing.labels).toContain('classification:frontend-runtime');
    expect(routing.assignees).toContain('frontend-oncall');
    expect(routing.assignees).toContain('state-oncall');
    expect(routing.reasons.some((reason) => reason.includes('label-rule:settings'))).toBe(true);
    expect(routing.reasons.some((reason) => reason.includes('owner-rule:settings'))).toBe(true);
  });

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

  it('applies routing labels and assignees when exporting to GitHub', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        html_url: 'https://github.com/example-org/example-repo/issues/88',
        number: 88,
        title: '[BugCatcher] routed issue',
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const config: ExtensionConfig = {
      ...DEFAULT_CONFIG,
      github: {
        enabled: true,
        owner: 'example-org',
        repo: 'example-repo',
        token: 'ghp_test',
        labels: 'bug',
        assignees: 'core-maintainer',
      },
      routing: {
        enabled: true,
        labelRules: 'settings:frontend|triage',
        ownershipRules: 'settings:frontend-oncall',
      },
    };

    const result = await createExportArtifact(
      'github',
      config,
      session,
      {
        summary: 'Settings pane crashes on load',
        classification: 'frontend-runtime',
      },
    );

    expect(result.routing?.labels).toContain('frontend');
    expect(result.routing?.assignees).toContain('frontend-oncall');
    expect(String(result.metadata.routingLabels || '')).toContain('frontend');
    expect(String(result.metadata.routingAssignees || '')).toContain('frontend-oncall');

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body || '{}')) as {
      labels?: string[];
      assignees?: string[];
    };
    expect(requestBody.labels).toContain('frontend');
    expect(requestBody.assignees).toContain('frontend-oncall');
    expect(requestBody.assignees).toContain('core-maintainer');
  });
});
