import {
  type BackgroundMessage,
  type CaptureEvent,
  type EnvironmentInfo,
  type ExtensionConfig,
  type ExportDestination,
  type ShareLinkPermission,
  type SessionPayload,
  DEFAULT_CONFIG,
} from '../shared/types';
import { RollingCaptureBuffer } from '../shared/capture/rolling-buffer';
import {
  createCaptureMediaMetadata,
  normalizeSessionPayloadForUpload,
  normalizeEnvironmentInfo,
  createUploadFailureMessage,
  createUploadTransportFailureMessage,
} from './capture-utils';
import {
  createQueueItem,
  dequeueNextSession,
  enqueueSession,
  type QueuedSession,
} from './queue-utils';
import { SessionManager } from '../shared/session-manager';
import { runAiAnalysis, validateAiProviderConfig } from './ai-analysis';
import { createExportArtifact } from './export-destinations';

type TabCaptureState = {
  buffer: RollingCaptureBuffer;
  environment?: EnvironmentInfo;
};

const CONFIG_KEY = 'bugcatcherConfig';
const QUEUE_KEY = 'bugcatcherQueuedSessions';
const QUEUE_SYNC_ALARM = 'bugcatcherQueueSync';
const EXPORT_AUDIT_KEY = 'bugcatcherExportAuditRecords';
const MAX_EXPORT_AUDIT_RECORDS = 200;
const BUFFER_WINDOW_MS = 120_000;
const MAX_BUFFER_EVENTS = 2_400;
const UPLOAD_TIMEOUT_MS = 10_000;
const tabState = new Map<number, TabCaptureState>();
let badgeResetTimer: ReturnType<typeof setTimeout> | undefined;
let sessionManager: SessionManager | null = null;

type ExportAuditRecord = {
  id: string;
  createdAt: string;
  sessionId: string;
  destination: ExportDestination;
  artifactUrl: string;
  artifactId?: string;
  artifactTitle?: string;
  permission?: ShareLinkPermission;
  expiresAt?: string;
  metadata: Record<string, string | number | boolean>;
};

async function initializeSessionManager(): Promise<SessionManager | null> {
  if (sessionManager) {
    return sessionManager;
  }

  const config = await getConfig();
  if (!config.projectKey) {
    return null;
  }

  sessionManager = new SessionManager(config.apiBaseUrl, config.projectKey);
  return sessionManager;
}

function resetSessionManager(): void {
  sessionManager = null;
}

async function appendExportAuditRecord(record: ExportAuditRecord): Promise<void> {
  const data = await chrome.storage.local.get(EXPORT_AUDIT_KEY);
  const current = Array.isArray(data[EXPORT_AUDIT_KEY])
    ? (data[EXPORT_AUDIT_KEY] as ExportAuditRecord[])
    : [];

  const next = [...current, record].slice(-MAX_EXPORT_AUDIT_RECORDS);
  await chrome.storage.local.set({ [EXPORT_AUDIT_KEY]: next });
}

function destinationLabel(destination: ExportDestination): string {
  if (destination === 'github') {
    return 'GitHub';
  }

  if (destination === 'gitlab') {
    return 'GitLab';
  }

  if (destination === 'linear') {
    return 'Linear';
  }

  return 'Share link';
}

function getTabState(tabId: number): TabCaptureState {
  let state = tabState.get(tabId);
  if (!state) {
    state = {
      buffer: new RollingCaptureBuffer(BUFFER_WINDOW_MS, MAX_BUFFER_EVENTS),
    };
    tabState.set(tabId, state);
  }
  return state;
}

function sendStatusUpdate(status: 'uploading' | 'success' | 'error', message: string): void {
  if (badgeResetTimer) {
    clearTimeout(badgeResetTimer);
    badgeResetTimer = undefined;
  }

  if (status === 'uploading') {
    void chrome.action.setBadgeText({ text: 'REC' });
    void chrome.action.setBadgeBackgroundColor({ color: '#0f6cbd' });
  }

  if (status === 'success') {
    void chrome.action.setBadgeText({ text: 'OK' });
    void chrome.action.setBadgeBackgroundColor({ color: '#0f8b44' });
    badgeResetTimer = setTimeout(() => {
      void chrome.action.setBadgeText({ text: '' });
    }, 5000);
  }

  if (status === 'error') {
    void chrome.action.setBadgeText({ text: 'ERR' });
    void chrome.action.setBadgeBackgroundColor({ color: '#a4262c' });
    badgeResetTimer = setTimeout(() => {
      void chrome.action.setBadgeText({ text: '' });
    }, 7000);
  }

  void chrome.runtime
    .sendMessage({
      type: 'BC_STATUS_UPDATE',
      payload: {
        status,
        message,
        at: new Date().toISOString(),
      },
    })
    .catch(() => undefined);
}

function normalizeConfig(raw: Partial<ExtensionConfig> | undefined): ExtensionConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(raw ?? {}),
    ai: {
      ...DEFAULT_CONFIG.ai,
      ...((raw?.ai ?? {}) as Partial<ExtensionConfig['ai']>),
    },
    github: {
      ...DEFAULT_CONFIG.github,
      ...((raw?.github ?? {}) as Partial<ExtensionConfig['github']>),
    },
    gitlab: {
      ...DEFAULT_CONFIG.gitlab,
      ...((raw?.gitlab ?? {}) as Partial<ExtensionConfig['gitlab']>),
    },
    linear: {
      ...DEFAULT_CONFIG.linear,
      ...((raw?.linear ?? {}) as Partial<ExtensionConfig['linear']>),
    },
    shareLinks: {
      ...DEFAULT_CONFIG.shareLinks,
      ...((raw?.shareLinks ?? {}) as Partial<ExtensionConfig['shareLinks']>),
    },
  };
}

async function getConfig(): Promise<ExtensionConfig> {
  const result = await chrome.storage.sync.get(CONFIG_KEY);
  return normalizeConfig(result[CONFIG_KEY] as Partial<ExtensionConfig> | undefined);
}

async function setConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.sync.set({ [CONFIG_KEY]: config });
}

async function getQueuedSessions(): Promise<QueuedSession[]> {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  const queue = result[QUEUE_KEY];
  if (!Array.isArray(queue)) {
    return [];
  }
  return queue as QueuedSession[];
}

async function setQueuedSessions(queue: QueuedSession[]): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

async function queueSession(payload: SessionPayload): Promise<number> {
  const current = await getQueuedSessions();
  const next = enqueueSession(current, createQueueItem(payload));
  await setQueuedSessions(next);
  return next.length;
}

type UploadResult = {
  ok: boolean;
  message: string;
  sessionId?: string;
  recoverable?: boolean;
};

async function uploadSessionPayload(payload: SessionPayload, config: ExtensionConfig): Promise<UploadResult> {
  const normalizedPayload = normalizeSessionPayloadForUpload(payload, config);
  const uploadPayload = {
    ...normalizedPayload,
    // API events are stored with server-generated Mongo _id values.
    // Strip client-side event ids to avoid ObjectID unmarshal errors.
    events: normalizedPayload.events.map(({ id: _id, ...event }) => event),
  };
  const normalizedBaseUrl = config.apiBaseUrl.replace(/\/+$/, '').replace(/\/sessions$/, '');
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), UPLOAD_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${normalizedBaseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': config.projectKey,
      },
      body: JSON.stringify(uploadPayload),
      signal: abortController.signal,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        message: 'Upload timed out. Check API URL/server and retry capture.',
        recoverable: true,
      };
    }

    return {
      ok: false,
      message: createUploadTransportFailureMessage(),
      recoverable: true,
    };
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    let message = createUploadFailureMessage(response.status);
    try {
      const body = (await response.json()) as {
        error?: string;
        details?: Array<{ field?: string; issue?: string }>;
      };

      if (body.details?.length) {
        const firstIssue = body.details[0];
        if (firstIssue?.field && firstIssue.issue) {
          message = `Upload failed (${response.status}): ${firstIssue.field} ${firstIssue.issue}`;
        }
      } else if (body.error) {
        message = `Upload failed (${response.status}): ${body.error}`;
      }
    } catch {
      // Keep generic failure text if error body is not JSON.
    }

    return {
      ok: false,
      message,
      recoverable: response.status >= 500,
    };
  }

  const result = (await response.json()) as { sessionId?: string };
  return {
    ok: true,
    message: 'Session uploaded successfully.',
    sessionId: result.sessionId,
  };
}

async function syncQueuedSessions(): Promise<void> {
  const config = await getConfig();
  if (!config.projectKey) {
    return;
  }

  let queue = await getQueuedSessions();
  let uploaded = 0;

  while (queue.length > 0) {
    const { item, rest } = dequeueNextSession(queue);
    if (!item) {
      break;
    }

    const result = await uploadSessionPayload(item.payload, config);
    if (!result.ok) {
      if (!result.recoverable) {
        queue = rest;
        continue;
      }
      break;
    }

    uploaded += 1;
    queue = rest;
  }

  await setQueuedSessions(queue);

  if (uploaded > 0) {
    sendStatusUpdate('success', `Synced ${uploaded} queued capture${uploaded === 1 ? '' : 's'}.`);
  }
}

async function buildCapturePreview(): Promise<{
  projectId: string;
  queueSize: number;
  url: string;
  title: string;
}> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const config = await getConfig();
  const queue = await getQueuedSessions();

  return {
    projectId: config.projectId,
    queueSize: queue.length,
    url: tab?.url ?? 'about:blank',
    title: tab?.title ?? 'Current tab',
  };
}

async function captureNow(): Promise<{ ok: boolean; message: string; sessionId?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    sendStatusUpdate('error', 'No active tab found. Retry capture.');
    return { ok: false, message: 'No active tab found. Retry capture.' };
  }

  const tabId = tab.id;
  const state = getTabState(tabId);
  const config = await getConfig();

  sendStatusUpdate('uploading', 'Capturing and uploading...');

  if (!config.projectKey) {
    sendStatusUpdate('error', 'Project key is empty. Set it in Options, then retry capture.');
    return { ok: false, message: 'Project key is empty. Set it in Options.' };
  }

  let flushPayload: { url?: string; timestamp?: string; title?: string } = {};
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'BC_FLUSH_REQUEST' });
    flushPayload = (response?.payload ?? {}) as { url?: string; timestamp?: string; title?: string };
  } catch {
    // Continue with best effort if content script is not reachable.
  }

  const url = flushPayload.url ?? tab.url ?? 'about:blank';
  const timestamp = flushPayload.timestamp ?? new Date().toISOString();
  const title = flushPayload.title ?? tab.title ?? 'BugCatcher Session';
  const snapshot = state.buffer.freeze();

  const payload: SessionPayload = {
    projectId: config.projectId,
    url,
    title,
    timestamp,
    environment: normalizeEnvironmentInfo(state.environment),
    events: snapshot.events,
    media: {
      hasReplay: false,
      metadata: createCaptureMediaMetadata(config, snapshot),
    },
  };

  const result = await uploadSessionPayload(payload, config);
  if (!result.ok) {
    if (result.recoverable) {
      const queueSize = await queueSession(payload);
      const message = `Offline or unreachable API. Capture queued for sync (${queueSize} pending).`;
      sendStatusUpdate('success', message);
      return {
        ok: true,
        message,
      };
    }

    sendStatusUpdate('error', result.message);
    return {
      ok: false,
      message: result.message,
    };
  }

  sendStatusUpdate('success', result.message);
  tabState.set(tabId, {
    buffer: new RollingCaptureBuffer(BUFFER_WINDOW_MS, MAX_BUFFER_EVENTS),
    environment: state.environment,
  });

  await syncQueuedSessions();

  return {
    ok: true,
    message: result.message,
    sessionId: result.sessionId,
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(CONFIG_KEY);
  if (!existing[CONFIG_KEY]) {
    await setConfig(DEFAULT_CONFIG);
  }

  await chrome.action.setBadgeText({ text: '' });
  await chrome.alarms.create(QUEUE_SYNC_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(QUEUE_SYNC_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== QUEUE_SYNC_ALARM) return;
  void syncQueuedSessions();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'trigger_capture') return;

  void captureNow().catch((error: unknown) => {
    sendStatusUpdate(
      'error',
      error instanceof Error ? error.message : 'Capture failed after shortcut trigger.',
    );
  });
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'BC_EVENT' && tabId !== undefined && message.payload) {
    const state = getTabState(tabId);
    state.buffer.addEvent(message.payload as CaptureEvent);
    return;
  }

  if (message.type === 'BC_ENVIRONMENT' && tabId !== undefined && message.payload) {
    const state = getTabState(tabId);
    state.environment = message.payload as EnvironmentInfo;
    return;
  }

  if (message.type === 'BC_CONFIG_REQUEST') {
    getConfig()
      .then((config) => sendResponse({ type: 'BC_CONFIG_RESPONSE', payload: config }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ type: 'BC_CONFIG_RESPONSE', payload: { ...DEFAULT_CONFIG, error: details } });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_NOW') {
    captureNow()
      .then((result) => sendResponse({ type: 'BC_CAPTURE_RESULT', payload: result }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ type: 'BC_CAPTURE_RESULT', payload: { ok: false, message: details } });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_PREVIEW_REQUEST') {
    buildCapturePreview()
      .then((preview) => sendResponse({ type: 'BC_CAPTURE_PREVIEW_RESPONSE', payload: preview }))
      .catch(() =>
        sendResponse({
          type: 'BC_CAPTURE_PREVIEW_RESPONSE',
          payload: {
            projectId: 'unknown',
            queueSize: 0,
            url: 'about:blank',
            title: 'Current tab',
          },
        }),
      );
    return true;
  }

  if (message.type === 'BC_GET_SESSIONS_REQUEST') {
    (async () => {
      const manager = await initializeSessionManager();
      if (!manager) {
        sendResponse({
          type: 'BC_GET_SESSIONS_RESPONSE',
          payload: {
            ok: false,
            message: 'Project key is empty. Set it in Options.',
            sessions: [],
            total: 0,
            limit: 0,
            offset: 0,
          },
        });
        return;
      }

      try {
        const config = await getConfig();
        const payload = (message.payload ?? {}) as {
          q?: string;
          tag?: string;
          hasError?: boolean;
          type?: string;
          sortBy?: string;
          sortOrder?: 'asc' | 'desc';
          limit?: number;
          offset?: number;
          forceRefresh?: boolean;
        };

        const hasError = payload.type === 'errors' ? true : payload.hasError;
        const list = await manager.listSessions({
          projectId: config.projectId,
          q: payload.q,
          tag: payload.tag,
          hasError,
          sortBy: payload.sortBy,
          sortOrder: payload.sortOrder,
          limit: payload.limit,
          offset: payload.offset,
          forceRefresh: payload.forceRefresh,
        });

        sendResponse({
          type: 'BC_GET_SESSIONS_RESPONSE',
          payload: {
            ok: true,
            sessions: list.items,
            total: list.total,
            limit: list.limit,
            offset: list.offset,
            sortBy: list.sortBy,
            sortOrder: list.sortOrder,
            message: `Fetched ${list.items.length} session(s)`,
          },
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({
          type: 'BC_GET_SESSIONS_RESPONSE',
          payload: {
            ok: false,
            message: `Failed to fetch sessions: ${details}`,
            sessions: [],
            total: 0,
            limit: 0,
            offset: 0,
          },
        });
      }
    })();
    return true;
  }

  if (message.type === 'BC_GET_SESSION_DETAIL_REQUEST' && message.payload) {
    (async () => {
      const manager = await initializeSessionManager();
      if (!manager) {
        sendResponse({
          type: 'BC_GET_SESSION_DETAIL_RESPONSE',
          payload: {
            ok: false,
            message: 'Project key is empty. Set it in Options.',
            session: null,
          },
        });
        return;
      }

      try {
        const payload = message.payload as { sessionId?: string };
        const session = await manager.getSessionDetail(payload.sessionId ?? '');
        sendResponse({
          type: 'BC_GET_SESSION_DETAIL_RESPONSE',
          payload: {
            ok: Boolean(session),
            session,
          },
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({
          type: 'BC_GET_SESSION_DETAIL_RESPONSE',
          payload: {
            ok: false,
            message: `Failed to fetch session details: ${details}`,
            session: null,
          },
        });
      }
    })();
    return true;
  }

  if (message.type === 'BC_DELETE_SESSION_REQUEST' && message.payload) {
    (async () => {
      const manager = await initializeSessionManager();
      if (!manager) {
        sendResponse({
          type: 'BC_DELETE_SESSION_RESPONSE',
          payload: {
            ok: false,
            message: 'Project key is empty. Set it in Options.',
          },
        });
        return;
      }

      try {
        const payload = message.payload as { sessionId?: string };
        const ok = await manager.deleteSession(payload.sessionId ?? '');
        sendResponse({
          type: 'BC_DELETE_SESSION_RESPONSE',
          payload: {
            ok,
            message: ok ? 'Session deleted successfully' : 'Failed to delete session',
          },
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({
          type: 'BC_DELETE_SESSION_RESPONSE',
          payload: {
            ok: false,
            message: `Failed to delete session: ${details}`,
          },
        });
      }
    })();
    return true;
  }

  if (message.type === 'BC_TEST_API_CONNECTION_REQUEST') {
    (async () => {
      const manager = await initializeSessionManager();
      if (!manager) {
        sendResponse({
          type: 'BC_TEST_API_CONNECTION_RESPONSE',
          payload: {
            ok: false,
            connected: false,
            message: 'Project key is empty. Set it in Options.',
          },
        });
        return;
      }

      try {
        const connected = await manager.testConnection();
        sendResponse({
          type: 'BC_TEST_API_CONNECTION_RESPONSE',
          payload: {
            ok: connected,
            connected,
            message: connected ? 'Connection successful' : 'Connection failed',
          },
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({
          type: 'BC_TEST_API_CONNECTION_RESPONSE',
          payload: {
            ok: false,
            connected: false,
            message: `Connection test failed: ${details}`,
          },
        });
      }
    })();
    return true;
  }

  if (message.type === 'BC_AI_ANALYZE_SESSION_REQUEST' && message.payload) {
    (async () => {
      const manager = await initializeSessionManager();
      if (!manager) {
        sendResponse({
          type: 'BC_AI_ANALYZE_SESSION_RESPONSE',
          payload: {
            ok: false,
            status: 'failed',
            message: 'Project key is empty. Set it in Options.',
          },
        });
        return;
      }

      try {
        const config = await getConfig();

        const payload = message.payload as {
          sessionId?: string;
          modelOverride?: string;
          includeCodeContext?: boolean;
        };

        const validationError = validateAiProviderConfig({
          ...config.ai,
          model: payload.modelOverride?.trim() || config.ai.model,
        });
        if (validationError) {
          sendResponse({
            type: 'BC_AI_ANALYZE_SESSION_RESPONSE',
            payload: {
              ok: false,
              status: 'failed',
              message: validationError,
            },
          });
          return;
        }

        const sessionId = payload.sessionId || '';
        if (!sessionId) {
          sendResponse({
            type: 'BC_AI_ANALYZE_SESSION_RESPONSE',
            payload: {
              ok: false,
              status: 'failed',
              message: 'Session ID is required for AI analysis.',
            },
          });
          return;
        }

        sendStatusUpdate('uploading', 'Running AI analysis...');

        const session = await manager.getSessionDetail(sessionId, true);
        if (!session) {
          sendStatusUpdate('error', 'Session not found for AI analysis.');
          sendResponse({
            type: 'BC_AI_ANALYZE_SESSION_RESPONSE',
            payload: {
              ok: false,
              status: 'failed',
              message: 'Session not found for analysis.',
            },
          });
          return;
        }

        const analysis = await runAiAnalysis(config.ai, session, {
          modelOverride: payload.modelOverride,
          includeCodeContext: payload.includeCodeContext,
        });
        const statusMessage = analysis.status === 'completed'
          ? 'AI analysis completed.'
          : 'AI fallback analysis completed.';
        sendStatusUpdate('success', statusMessage);

        sendResponse({
          type: 'BC_AI_ANALYZE_SESSION_RESPONSE',
          payload: {
            ok: true,
            status: analysis.status,
            message: statusMessage,
            analysis,
          },
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown analysis error';
        sendStatusUpdate('error', `AI analysis failed: ${details}`);
        sendResponse({
          type: 'BC_AI_ANALYZE_SESSION_RESPONSE',
          payload: {
            ok: false,
            status: 'failed',
            message: `AI analysis failed: ${details}`,
          },
        });
      }
    })();
    return true;
  }

  if (message.type === 'BC_EXPORT_GITHUB_ISSUE_REQUEST' && message.payload) {
    (async () => {
      const manager = await initializeSessionManager();
      if (!manager) {
        sendResponse({
          type: 'BC_EXPORT_GITHUB_ISSUE_RESPONSE',
          payload: {
            ok: false,
            message: 'Project key is empty. Set it in Options.',
          },
        });
        return;
      }

      try {
        const config = await getConfig();
        const payload = message.payload as {
          sessionId?: string;
          analysis?: {
            summary?: string;
            rootCause?: string;
            classification?: string;
            actions?: string[];
            suggestedFiles?: string[];
          };
        };

        const sessionId = payload.sessionId || '';
        if (!sessionId) {
          sendResponse({
            type: 'BC_EXPORT_GITHUB_ISSUE_RESPONSE',
            payload: {
              ok: false,
              message: 'Session ID is required for GitHub export.',
            },
          });
          return;
        }

        sendStatusUpdate('uploading', 'Exporting GitHub issue...');

        const session = await manager.getSessionDetail(sessionId, true);
        if (!session) {
          sendStatusUpdate('error', 'Session not found for GitHub export.');
          sendResponse({
            type: 'BC_EXPORT_GITHUB_ISSUE_RESPONSE',
            payload: {
              ok: false,
              message: 'Session not found for GitHub export.',
            },
          });
          return;
        }

        const artifact = await createExportArtifact('github', config, session, payload.analysis);
        const auditRecord: ExportAuditRecord = {
          id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          sessionId,
          destination: 'github',
          artifactUrl: artifact.artifactUrl,
          artifactId: artifact.artifactId,
          artifactTitle: artifact.artifactTitle,
          metadata: artifact.metadata,
        };
        await appendExportAuditRecord(auditRecord);

        const issueNumber = artifact.artifactId ? Number.parseInt(artifact.artifactId, 10) : undefined;
        const issueNumberLabel = Number.isFinite(issueNumber) ? `#${issueNumber}` : '(issue)';
        sendStatusUpdate('success', `GitHub issue ${issueNumberLabel} exported.`);

        sendResponse({
          type: 'BC_EXPORT_GITHUB_ISSUE_RESPONSE',
          payload: {
            ok: true,
            issueUrl: artifact.artifactUrl,
            issueNumber: Number.isFinite(issueNumber) ? issueNumber : undefined,
            issueTitle: artifact.artifactTitle,
            auditId: auditRecord.id,
            destinationMetadata: artifact.metadata,
            message: Number.isFinite(issueNumber)
              ? `GitHub issue #${issueNumber} created successfully.`
              : 'GitHub issue created successfully.',
          },
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown export error';
        sendStatusUpdate('error', details);
        sendResponse({
          type: 'BC_EXPORT_GITHUB_ISSUE_RESPONSE',
          payload: {
            ok: false,
            message: details,
          },
        });
      }
    })();
    return true;
  }

  if (message.type === 'BC_EXPORT_DESTINATION_REQUEST' && message.payload) {
    (async () => {
      const manager = await initializeSessionManager();
      if (!manager) {
        sendResponse({
          type: 'BC_EXPORT_DESTINATION_RESPONSE',
          payload: {
            ok: false,
            message: 'Project key is empty. Set it in Options.',
          },
        });
        return;
      }

      try {
        const config = await getConfig();
        const payload = message.payload as {
          destination?: ExportDestination;
          sessionId?: string;
          analysis?: {
            summary?: string;
            rootCause?: string;
            classification?: string;
            actions?: string[];
            suggestedFiles?: string[];
          };
          shareOptions?: {
            permission?: ShareLinkPermission;
            expiresInHours?: number;
          };
        };

        const destination: ExportDestination = payload.destination || 'github';
        const sessionId = payload.sessionId || '';
        if (!sessionId) {
          sendResponse({
            type: 'BC_EXPORT_DESTINATION_RESPONSE',
            payload: {
              ok: false,
              destination,
              message: 'Session ID is required for export.',
            },
          });
          return;
        }

        sendStatusUpdate('uploading', `Exporting to ${destinationLabel(destination)}...`);

        const session = await manager.getSessionDetail(sessionId, true);
        if (!session) {
          sendStatusUpdate('error', 'Session not found for export.');
          sendResponse({
            type: 'BC_EXPORT_DESTINATION_RESPONSE',
            payload: {
              ok: false,
              destination,
              message: 'Session not found for export.',
            },
          });
          return;
        }

        const artifact = await createExportArtifact(destination, config, session, payload.analysis, payload.shareOptions);
        const auditRecord: ExportAuditRecord = {
          id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          sessionId,
          destination,
          artifactUrl: artifact.artifactUrl,
          artifactId: artifact.artifactId,
          artifactTitle: artifact.artifactTitle,
          permission: artifact.permission,
          expiresAt: artifact.expiresAt,
          metadata: artifact.metadata,
        };
        await appendExportAuditRecord(auditRecord);

        sendStatusUpdate('success', `${destinationLabel(destination)} artifact exported.`);

        sendResponse({
          type: 'BC_EXPORT_DESTINATION_RESPONSE',
          payload: {
            ok: true,
            destination,
            artifactUrl: artifact.artifactUrl,
            artifactId: artifact.artifactId,
            artifactTitle: artifact.artifactTitle,
            permission: artifact.permission,
            expiresAt: artifact.expiresAt,
            auditId: auditRecord.id,
            destinationMetadata: artifact.metadata,
            message: `${destinationLabel(destination)} export completed.`,
          },
        });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : 'Unknown export error';
        sendStatusUpdate('error', details);
        sendResponse({
          type: 'BC_EXPORT_DESTINATION_RESPONSE',
          payload: {
            ok: false,
            message: details,
          },
        });
      }
    })();
    return true;
  }

  if (message.type === 'BC_CONFIG_SAVE' && message.payload) {
    const nextConfig = normalizeConfig(message.payload as Partial<ExtensionConfig>);
    setConfig(nextConfig)
      .then(() => {
        resetSessionManager();
        sendResponse({ type: 'BC_CONFIG_RESPONSE', payload: nextConfig });
      })
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ type: 'BC_CONFIG_RESPONSE', payload: { ...nextConfig, error: details } });
      });
    return true;
  }
});
