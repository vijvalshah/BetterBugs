import {
  type BackgroundMessage,
  type CaptureEvent,
  type EnvironmentInfo,
  type ExtensionConfig,
  type ExportDestination,
  type ShareLinkPermission,
  type SessionPayload,
  type ScreenshotPreview,
  type TabCaptureStatus,
  type VideoPreview,
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
import { dispatchRoutingNotifications, type NotificationDeliveryResult } from './routing-notifications';

type TabCaptureState = {
  buffer: RollingCaptureBuffer;
  environment?: EnvironmentInfo;
  captureStatus: TabCaptureStatus;
  screenshotPreview?: ScreenshotPreview;
  screenshotDataUrl?: string;
  videoPreview?: VideoPreview;
  videoBlob?: Blob;
  videoRecorder?: MediaRecorder;
  videoChunks?: Blob[];
  videoStartTime?: number;
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

function summarizeNotificationResults(results: NotificationDeliveryResult[]): {
  summary: string;
  failures: number;
} {
  if (results.length === 0) {
    return {
      summary: 'disabled',
      failures: 0,
    };
  }

  const failures = results.filter((result) => !result.success).length;
  const summary = results
    .map((result) => {
      const status = result.success ? 'ok' : `failed(${result.error || 'unknown'})`;
      return `${result.channel}:${status}:attempts=${result.attempts}`;
    })
    .join(' | ');

  return {
    summary,
    failures,
  };
}

function getTabState(tabId: number): TabCaptureState {
  let state = tabState.get(tabId);
  if (!state) {
    state = {
      buffer: new RollingCaptureBuffer(BUFFER_WINDOW_MS, MAX_BUFFER_EVENTS),
      captureStatus: { state: 'idle' },
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
    routing: {
      ...DEFAULT_CONFIG.routing,
      ...((raw?.routing ?? {}) as Partial<ExtensionConfig['routing']>),
    },
    notifications: {
      ...DEFAULT_CONFIG.notifications,
      ...((raw?.notifications ?? {}) as Partial<ExtensionConfig['notifications']>),
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

async function startCapture(): Promise<{ ok: boolean; message: string; status?: TabCaptureStatus }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, message: 'No active tab found.', status: { state: 'idle' } };
  }

  const state = getTabState(tab.id);
  if (state.captureStatus.state === 'recording') {
    return { ok: false, message: 'Capture already running.', status: state.captureStatus };
  }

  state.buffer = new RollingCaptureBuffer(BUFFER_WINDOW_MS, MAX_BUFFER_EVENTS);
  state.captureStatus = {
    state: 'recording',
    startTime: Date.now(),
    stopTime: undefined,
    durationMs: undefined,
    eventCount: 0,
  };

  void chrome.action.setBadgeText({ text: 'REC' });
  void chrome.action.setBadgeBackgroundColor({ color: '#d32f2f' });

  return { ok: true, message: 'Capture started.', status: state.captureStatus };
}

async function stopCapture(): Promise<{ ok: boolean; message: string; status?: TabCaptureStatus }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, message: 'No active tab found.', status: { state: 'idle' } };
  }

  const state = getTabState(tab.id);
  if (state.captureStatus.state !== 'recording') {
    return { ok: false, message: 'Capture is not running.', status: state.captureStatus };
  }

  const stopTime = Date.now();
  const startTime = state.captureStatus.startTime ?? stopTime;
  state.captureStatus = {
    state: 'review',
    startTime,
    stopTime,
    durationMs: Math.max(stopTime - startTime, 0),
    eventCount: state.buffer.size,
  };

  void chrome.action.setBadgeText({ text: 'OK' });
  void chrome.action.setBadgeBackgroundColor({ color: '#0f8b44' });

  return { ok: true, message: 'Capture stopped.', status: state.captureStatus };
}

async function getCaptureStatus(): Promise<{ ok: boolean; status: TabCaptureStatus } & { message?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, message: 'No active tab found.', status: { state: 'idle' } };
  }

  const state = getTabState(tab.id);
  if (state.captureStatus.state === 'recording' && state.captureStatus.startTime) {
    const now = Date.now();
    return {
      ok: true,
      status: {
        ...state.captureStatus,
        durationMs: Math.max(now - state.captureStatus.startTime, 0),
        eventCount: state.buffer.size,
      },
    };
  }

  return { ok: true, status: state.captureStatus };
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/sessions')) {
    return trimmed.slice(0, -'/sessions'.length);
  }
  return trimmed;
}

type UploadArtifactRequest = {
  contentType: string;
  sizeBytes?: number;
};

type UploadDomSnapshotRequest = {
  count: number;
  contentType: string;
  sizeBytes?: number;
};

type UploadSessionRequest = {
  projectId: string;
  artifacts: {
    screenshot?: UploadArtifactRequest;
    video?: UploadArtifactRequest;
    domSnapshots?: UploadDomSnapshotRequest;
  };
};

type UploadArtifactResponse = {
  key: string;
  uploadUrl: string;
  method: string;
  contentType: string;
  sizeBytes?: number;
};

type UploadSessionResponse = {
  uploadId: string;
  sessionId: string;
  expiresAt: string;
  artifacts: {
    screenshot?: UploadArtifactResponse;
    video?: UploadArtifactResponse;
    domSnapshots?: UploadArtifactResponse[];
  };
};

async function createUploadSession(
  config: ExtensionConfig,
  request: UploadSessionRequest,
): Promise<{ ok: boolean; message: string; data?: UploadSessionResponse }> {
  const baseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  try {
    const response = await fetch(`${baseUrl}/uploads/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': config.projectKey,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        message: payload.error || `Upload session failed (${response.status}).`,
      };
    }

    const data = (await response.json()) as UploadSessionResponse;
    return { ok: true, message: 'Upload session created.', data };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Upload session failed: ${details}` };
  }
}

async function uploadArtifact(artifact: UploadArtifactResponse, blob: Blob): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(artifact.uploadUrl, {
      method: artifact.method || 'PUT',
      headers: {
        'Content-Type': artifact.contentType,
      },
      body: blob,
    });

    if (!response.ok) {
      return { ok: false, message: `Upload failed (${response.status}).` };
    }

    return { ok: true, message: 'Upload completed.' };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Upload failed: ${details}` };
  }
}

async function finalizeUploadSession(
  config: ExtensionConfig,
  uploadId: string,
  payload: SessionPayload,
): Promise<UploadResult> {
  const normalizedPayload = normalizeSessionPayloadForUpload(payload, config);
  const uploadPayload = {
    ...normalizedPayload,
    events: normalizedPayload.events.map(({ id: _id, ...event }) => event),
  };

  const baseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  try {
    const response = await fetch(`${baseUrl}/uploads/sessions/${uploadId}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': config.projectKey,
      },
      body: JSON.stringify(uploadPayload),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        message: body.error || `Finalize failed (${response.status}).`,
        recoverable: response.status >= 500,
      };
    }

    const result = (await response.json()) as { sessionId?: string; warnings?: string[] };
    const warningMessage = result.warnings && result.warnings.length > 0
      ? ` Finalize warnings: ${result.warnings.join(' | ')}`
      : '';
    return {
      ok: true,
      message: `Session finalized successfully.${warningMessage}`,
      sessionId: result.sessionId,
    };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      message: `Finalize failed: ${details}`,
      recoverable: true,
    };
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function persistVideo(
  config: ExtensionConfig,
  blob: Blob,
  capturedAt: string,
  tab: chrome.tabs.Tab,
): Promise<{ ok: boolean; message: string; storedPath?: string }> {
  if (!config.projectKey) {
    return { ok: false, message: 'Project key is empty. Set it in Options.' };
  }

  const baseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  try {
    const encoded = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(encoded)));
    const response = await fetch(`${baseUrl}/media/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': config.projectKey,
      },
      body: JSON.stringify({
        dataUrl: `data:video/webm;base64,${base64}`,
        capturedAt,
        tabUrl: tab.url ?? 'about:blank',
        tabTitle: tab.title ?? 'Current tab',
      }),
    });

    const payload = (await response.json()) as { path?: string; error?: string; message?: string };
    if (!response.ok) {
      return { ok: false, message: payload.error ?? payload.message ?? 'Failed to store video.' };
    }

    return { ok: true, message: 'Video stored.', storedPath: payload.path };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Video storage failed: ${details}` };
  }
}

async function startVideoRecording(): Promise<{ ok: boolean; message: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, message: 'No active tab found.' };
  }

  const state = getTabState(tab.id);
  if (state.videoRecorder) {
    return { ok: false, message: 'Recording already in progress.' };
  }

  const stream = await chrome.tabCapture.capture({
    audio: false,
    video: true,
    videoConstraints: {
      mandatory: {
        maxFrameRate: 30,
      },
    },
  });

  if (!stream) {
    return { ok: false, message: 'Unable to start tab capture.' };
  }

  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  state.videoRecorder = recorder;
  state.videoChunks = chunks;
  state.videoStartTime = Date.now();
  recorder.start(500);

  return { ok: true, message: 'Recording started.' };
}

async function stopVideoRecording(): Promise<{
  ok: boolean;
  message: string;
  preview?: VideoPreview;
}> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, message: 'No active tab found.' };
  }

  const state = getTabState(tab.id);
  if (!state.videoRecorder || !state.videoChunks || !state.videoStartTime) {
    return { ok: false, message: 'No recording in progress.' };
  }

  const recorder = state.videoRecorder;
  recorder.stop();

  const blob = new Blob(state.videoChunks, { type: 'video/webm' });
  const objectUrl = URL.createObjectURL(blob);
  const capturedAt = new Date().toISOString();
  const durationMs = Math.max(Date.now() - state.videoStartTime, 0);

  state.videoRecorder = undefined;
  state.videoChunks = undefined;
  state.videoStartTime = undefined;

  const preview: VideoPreview = {
    objectUrl,
    capturedAt,
    durationMs,
  };
  state.videoPreview = preview;

  const config = await getConfig();
  const persistResult = await persistVideo(config, blob, capturedAt, tab);
  if (persistResult.ok && persistResult.storedPath) {
    state.videoPreview = {
      ...preview,
      storedPath: persistResult.storedPath,
    };
  }

  if (!persistResult.ok) {
    return {
      ok: true,
      message: `Recording stopped. ${persistResult.message}`,
      preview: state.videoPreview,
    };
  }

  return { ok: true, message: 'Recording stopped and stored.', preview: state.videoPreview };
}

async function persistScreenshot(
  config: ExtensionConfig,
  preview: ScreenshotPreview,
  tab: chrome.tabs.Tab,
): Promise<{ ok: boolean; message: string; storedPath?: string }> {
  if (!config.projectKey) {
    return { ok: false, message: 'Project key is empty. Set it in Options.' };
  }

  const baseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  try {
    const response = await fetch(`${baseUrl}/media/screenshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': config.projectKey,
      },
      body: JSON.stringify({
        dataUrl: preview.dataUrl,
        capturedAt: preview.capturedAt,
        tabUrl: tab.url ?? 'about:blank',
        tabTitle: tab.title ?? 'Current tab',
      }),
    });

    const payload = (await response.json()) as { path?: string; error?: string; message?: string };
    if (!response.ok) {
      return { ok: false, message: payload.error ?? payload.message ?? 'Failed to store screenshot.' };
    }

    return { ok: true, message: 'Screenshot stored.', storedPath: payload.path };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Storage upload failed: ${details}` };
  }
}

async function captureScreenshot(): Promise<{
  ok: boolean;
  message: string;
  preview?: ScreenshotPreview;
}> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.windowId === undefined) {
    return { ok: false, message: 'No active tab found.' };
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const preview: ScreenshotPreview = {
    dataUrl,
    capturedAt: new Date().toISOString(),
  };

  const state = getTabState(tab.id);
  state.screenshotPreview = preview;

  const config = await getConfig();
  const persistResult = await persistScreenshot(config, preview, tab);
  if (persistResult.ok && persistResult.storedPath) {
    state.screenshotPreview = {
      ...preview,
      storedPath: persistResult.storedPath,
    };
  }

  if (!persistResult.ok) {
    return {
      ok: true,
      message: `Screenshot captured. ${persistResult.message}`,
      preview: state.screenshotPreview,
    };
  }

  return {
    ok: true,
    message: 'Screenshot captured and stored.',
    preview: state.screenshotPreview,
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

  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendStatusUpdate('error', 'No active tab found.');
      return;
    }

    const state = getTabState(tab.id);
    const result = state.captureStatus.state === 'recording'
      ? await stopCapture()
      : await startCapture();

    if (!result.ok) {
      sendStatusUpdate('error', result.message);
    }
  })().catch((error: unknown) => {
    sendStatusUpdate(
      'error',
      error instanceof Error ? error.message : 'Capture toggle failed after shortcut trigger.',
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

  if (message.type === 'BC_CAPTURE_START_REQUEST') {
    startCapture()
      .then((result) => sendResponse({ type: 'BC_CAPTURE_START_RESPONSE', payload: result }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ type: 'BC_CAPTURE_START_RESPONSE', payload: { ok: false, message: details } });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_STOP_REQUEST') {
    stopCapture()
      .then((result) => sendResponse({ type: 'BC_CAPTURE_STOP_RESPONSE', payload: result }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ type: 'BC_CAPTURE_STOP_RESPONSE', payload: { ok: false, message: details } });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_STATE_REQUEST') {
    getCaptureStatus()
      .then((result) => sendResponse({ type: 'BC_CAPTURE_STATE_RESPONSE', payload: result }))
      .catch(() => {
        sendResponse({
          type: 'BC_CAPTURE_STATE_RESPONSE',
          payload: { ok: false, status: { state: 'idle' } },
        });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_SCREENSHOT_REQUEST') {
    captureScreenshot()
      .then((result) => sendResponse({ type: 'BC_CAPTURE_SCREENSHOT_RESPONSE', payload: result }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({
          type: 'BC_CAPTURE_SCREENSHOT_RESPONSE',
          payload: { ok: false, message: details },
        });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_SCREENSHOT_PREVIEW_REQUEST') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({
          type: 'BC_CAPTURE_SCREENSHOT_PREVIEW_RESPONSE',
          payload: { ok: false, preview: undefined },
        });
        return;
      }

      const state = getTabState(tab.id);
      sendResponse({
        type: 'BC_CAPTURE_SCREENSHOT_PREVIEW_RESPONSE',
        payload: { ok: true, preview: state.screenshotPreview },
      });
    })().catch(() => {
      sendResponse({
        type: 'BC_CAPTURE_SCREENSHOT_PREVIEW_RESPONSE',
        payload: { ok: false, preview: undefined },
      });
    });
    return true;
  }

  if (message.type === 'BC_CAPTURE_VIDEO_START_REQUEST') {
    startVideoRecording()
      .then((result) => sendResponse({ type: 'BC_CAPTURE_VIDEO_START_RESPONSE', payload: result }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({
          type: 'BC_CAPTURE_VIDEO_START_RESPONSE',
          payload: { ok: false, message: details },
        });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_VIDEO_STOP_REQUEST') {
    stopVideoRecording()
      .then((result) => sendResponse({ type: 'BC_CAPTURE_VIDEO_STOP_RESPONSE', payload: result }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({
          type: 'BC_CAPTURE_VIDEO_STOP_RESPONSE',
          payload: { ok: false, message: details },
        });
      });
    return true;
  }

  if (message.type === 'BC_CAPTURE_VIDEO_PREVIEW_REQUEST') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({
          type: 'BC_CAPTURE_VIDEO_PREVIEW_RESPONSE',
          payload: { ok: false, preview: undefined },
        });
        return;
      }

      const state = getTabState(tab.id);
      sendResponse({
        type: 'BC_CAPTURE_VIDEO_PREVIEW_RESPONSE',
        payload: { ok: true, preview: state.videoPreview },
      });
    })().catch(() => {
      sendResponse({
        type: 'BC_CAPTURE_VIDEO_PREVIEW_RESPONSE',
        payload: { ok: false, preview: undefined },
      });
    });
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
        const routing = artifact.routing ?? {
          labels: [],
          assignees: [],
          reasons: [],
        };
        const notificationResults = await dispatchRoutingNotifications(config.notifications, {
          destination,
          session,
          artifact,
          routing,
        });
        const notificationOutcome = summarizeNotificationResults(notificationResults);

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
          metadata: {
            ...artifact.metadata,
            routingLabels: routing.labels.join(','),
            routingAssignees: routing.assignees.join(','),
            routingReasons: routing.reasons.join(' | '),
            notificationSummary: notificationOutcome.summary,
            notificationFailures: notificationOutcome.failures,
          },
        };
        await appendExportAuditRecord(auditRecord);

        if (notificationOutcome.failures > 0) {
          sendStatusUpdate(
            'error',
            `${destinationLabel(destination)} artifact exported with notification warnings.`,
          );
        } else {
          sendStatusUpdate('success', `${destinationLabel(destination)} artifact exported.`);
        }

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
            routingLabels: routing.labels,
            routingAssignees: routing.assignees,
            routingReasons: routing.reasons,
            notificationResults,
            notificationSummary: notificationOutcome.summary,
            notificationFailures: notificationOutcome.failures,
            message:
              notificationOutcome.failures > 0
                ? `${destinationLabel(destination)} export completed with notification warnings.`
                : `${destinationLabel(destination)} export completed.`,
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
