import type { ApiSessionDetail } from '../shared/api-client';
import type { ExportDestination, NotificationConfig } from '../shared/types';
import type { ExportArtifactResult, RoutingRecommendation } from './export-destinations';

export interface NotificationDispatchContext {
  destination: ExportDestination;
  session: ApiSessionDetail;
  artifact: ExportArtifactResult;
  routing: RoutingRecommendation;
}

export interface NotificationDeliveryResult {
  channel: 'slack' | 'webhook';
  endpoint: string;
  success: boolean;
  attempts: number;
  statusCode?: number;
  error?: string;
}

type SleepFn = (ms: number) => Promise<void>;
type FetchFn = typeof fetch;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildNotificationPayload(context: NotificationDispatchContext): {
  timestamp: string;
  destination: ExportDestination;
  sessionId: string;
  sessionUrl: string;
  artifactUrl: string;
  artifactId?: string;
  artifactTitle?: string;
  routing: RoutingRecommendation;
} {
  return {
    timestamp: new Date().toISOString(),
    destination: context.destination,
    sessionId: context.session.sessionId,
    sessionUrl: context.session.url,
    artifactUrl: context.artifact.artifactUrl,
    artifactId: context.artifact.artifactId,
    artifactTitle: context.artifact.artifactTitle,
    routing: context.routing,
  };
}

function buildSlackRequestBody(context: NotificationDispatchContext): string {
  const payload = buildNotificationPayload(context);
  const routingSummary = [
    payload.routing.labels.length > 0 ? `labels=${payload.routing.labels.join(',')}` : '',
    payload.routing.assignees.length > 0 ? `assignees=${payload.routing.assignees.join(',')}` : '',
  ]
    .filter((value) => value.length > 0)
    .join(' | ');

  return JSON.stringify({
    text: `[BugCatcher] ${payload.destination} export for session ${payload.sessionId}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*BugCatcher Export*\nDestination: ${payload.destination}\nSession: ${payload.sessionId}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${payload.artifactUrl}|Open artifact>${routingSummary ? `\nRouting: ${routingSummary}` : ''}`,
        },
      },
    ],
  });
}

function buildWebhookRequestBody(context: NotificationDispatchContext): string {
  return JSON.stringify(buildNotificationPayload(context));
}

async function postWithRetry(
  channel: 'slack' | 'webhook',
  endpoint: string,
  body: string,
  maxRetries: number,
  retryBackoffMs: number,
  fetchFn: FetchFn,
  sleepFn: SleepFn,
): Promise<NotificationDeliveryResult> {
  const totalAttempts = maxRetries + 1;
  let lastError = 'unknown error';
  let statusCode: number | undefined;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });
      statusCode = response.status;

      if (response.ok) {
        return {
          channel,
          endpoint,
          success: true,
          attempts: attempt,
          statusCode,
        };
      }

      const errorPayload = await response.text().catch(() => '');
      lastError = errorPayload
        ? `HTTP ${response.status}: ${errorPayload.slice(0, 240)}`
        : `HTTP ${response.status}`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : 'network failure';
    }

    if (attempt <= maxRetries) {
      const backoffMs = retryBackoffMs * 2 ** (attempt - 1);
      await sleepFn(backoffMs);
    }
  }

  return {
    channel,
    endpoint,
    success: false,
    attempts: totalAttempts,
    statusCode,
    error: lastError,
  };
}

export async function dispatchRoutingNotifications(
  config: NotificationConfig,
  context: NotificationDispatchContext,
  deps?: {
    fetchFn?: FetchFn;
    sleepFn?: SleepFn;
  },
): Promise<NotificationDeliveryResult[]> {
  if (!config.enabled) {
    return [];
  }

  const fetchFn = deps?.fetchFn ?? fetch;
  const sleepFn = deps?.sleepFn ?? delay;
  const maxRetries = clamp(config.maxRetries, 0, 5);
  const retryBackoffMs = clamp(config.retryBackoffMs, 100, 30000);

  const jobs: Array<Promise<NotificationDeliveryResult>> = [];
  const slackEndpoint = config.slackWebhookUrl.trim();
  const webhookEndpoint = config.webhookUrl.trim();

  if (slackEndpoint) {
    jobs.push(
      postWithRetry(
        'slack',
        slackEndpoint,
        buildSlackRequestBody(context),
        maxRetries,
        retryBackoffMs,
        fetchFn,
        sleepFn,
      ),
    );
  }

  if (webhookEndpoint) {
    jobs.push(
      postWithRetry(
        'webhook',
        webhookEndpoint,
        buildWebhookRequestBody(context),
        maxRetries,
        retryBackoffMs,
        fetchFn,
        sleepFn,
      ),
    );
  }

  if (jobs.length === 0) {
    return [
      {
        channel: 'webhook',
        endpoint: 'none-configured',
        success: false,
        attempts: 0,
        error: 'Notifications are enabled but no endpoints are configured.',
      },
    ];
  }

  return await Promise.all(jobs);
}