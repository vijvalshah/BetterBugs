import { describe, expect, it, vi } from 'vitest';

import { dispatchRoutingNotifications } from './routing-notifications';
import { DEFAULT_CONFIG } from '../shared/types';
import type { ApiSessionDetail } from '../shared/api-client';
import type { ExportArtifactResult } from './export-destinations';

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

const artifact: ExportArtifactResult = {
  destination: 'github',
  artifactUrl: 'https://github.com/example-org/example-repo/issues/42',
  artifactId: '42',
  artifactTitle: 'Routed issue',
  metadata: {},
  routing: {
    labels: ['bug', 'frontend'],
    assignees: ['frontend-oncall'],
    reasons: ['label-rule:settings'],
  },
};

describe('routing-notifications', () => {
  it('returns empty results when notifications are disabled', async () => {
    const results = await dispatchRoutingNotifications(
      {
        ...DEFAULT_CONFIG.notifications,
        enabled: false,
      },
      {
        destination: 'github',
        session,
        artifact,
        routing: artifact.routing!,
      },
    );

    expect(results).toEqual([]);
  });

  it('retries transient failures and succeeds within bounded attempts', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const results = await dispatchRoutingNotifications(
      {
        ...DEFAULT_CONFIG.notifications,
        enabled: true,
        webhookUrl: 'https://hooks.example.dev/notify',
        maxRetries: 2,
        retryBackoffMs: 100,
      },
      {
        destination: 'github',
        session,
        artifact,
        routing: artifact.routing!,
      },
      {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleepFn,
      },
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe('webhook');
    expect(results[0].success).toBe(true);
    expect(results[0].attempts).toBe(2);
  });

  it('returns explicit terminal failure after max retries', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const results = await dispatchRoutingNotifications(
      {
        ...DEFAULT_CONFIG.notifications,
        enabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/services/T/B/X',
        maxRetries: 1,
        retryBackoffMs: 100,
      },
      {
        destination: 'github',
        session,
        artifact,
        routing: artifact.routing!,
      },
      {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleepFn,
      },
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe('slack');
    expect(results[0].success).toBe(false);
    expect(results[0].attempts).toBe(2);
    expect(results[0].error).toContain('HTTP 503');
  });

  it('reports explicit misconfiguration when enabled without endpoints', async () => {
    const results = await dispatchRoutingNotifications(
      {
        ...DEFAULT_CONFIG.notifications,
        enabled: true,
        slackWebhookUrl: '',
        webhookUrl: '',
      },
      {
        destination: 'github',
        session,
        artifact,
        routing: artifact.routing!,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('no endpoints');
  });
});
