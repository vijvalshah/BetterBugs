import {
  type BackgroundMessage,
  type CaptureEvent,
  type EnvironmentInfo,
  type ExtensionConfig,
  type SessionPayload,
  DEFAULT_CONFIG,
} from '../shared/types';
import { RollingCaptureBuffer } from '../shared/capture/rolling-buffer';
import {
  createCaptureMediaMetadata,
  createUploadFailureMessage,
  createUploadTransportFailureMessage,
} from './capture-utils';
import {
  createQueueItem,
  dequeueNextSession,
  enqueueSession,
  type QueuedSession,
} from './queue-utils';

type TabCaptureState = {
  buffer: RollingCaptureBuffer;
  environment?: EnvironmentInfo;
};

const CONFIG_KEY = 'bugcatcherConfig';
const QUEUE_KEY = 'bugcatcherQueuedSessions';
const QUEUE_SYNC_ALARM = 'bugcatcherQueueSync';
const BUFFER_WINDOW_MS = 120_000;
const MAX_BUFFER_EVENTS = 2_400;
const tabState = new Map<number, TabCaptureState>();
let badgeResetTimer: ReturnType<typeof setTimeout> | undefined;

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

  void chrome.runtime.sendMessage({
    type: 'BC_STATUS_UPDATE',
    payload: {
      status,
      message,
      at: new Date().toISOString(),
    },
  });
}

function normalizeConfig(raw: Partial<ExtensionConfig> | undefined): ExtensionConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(raw ?? {}),
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
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': config.projectKey,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      message: createUploadTransportFailureMessage(),
      recoverable: true,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      message: createUploadFailureMessage(response.status),
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
    environment:
      state.environment ?? {
        browser: 'Unknown',
        browserVersion: 'Unknown',
        os: 'Unknown',
        osVersion: 'Unknown',
        language: 'en-US',
        viewport: { width: 0, height: 0 },
      },
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

  if (message.type === 'BC_CONFIG_SAVE' && message.payload) {
    const nextConfig = normalizeConfig(message.payload as Partial<ExtensionConfig>);
    setConfig(nextConfig)
      .then(() => sendResponse({ type: 'BC_CONFIG_RESPONSE', payload: nextConfig }))
      .catch((error: unknown) => {
        const details = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ type: 'BC_CONFIG_RESPONSE', payload: { ...nextConfig, error: details } });
      });
    return true;
  }
});
