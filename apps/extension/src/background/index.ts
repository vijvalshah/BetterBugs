import {
  type BackgroundMessage,
  type CaptureEvent,
  type EnvironmentInfo,
  type ExtensionConfig,
  type SessionPayload,
  DEFAULT_CONFIG,
} from '../shared/types';

type TabCaptureState = {
  events: CaptureEvent[];
  environment?: EnvironmentInfo;
};

const CONFIG_KEY = 'bugcatcherConfig';
const MAX_EVENTS_PER_TAB = 1000;
const tabState = new Map<number, TabCaptureState>();

function getTabState(tabId: number): TabCaptureState {
  let state = tabState.get(tabId);
  if (!state) {
    state = { events: [] };
    tabState.set(tabId, state);
  }
  return state;
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

async function captureNow(): Promise<{ ok: boolean; message: string; sessionId?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, message: 'No active tab found.' };
  }

  const tabId = tab.id;
  const state = getTabState(tabId);
  const config = await getConfig();

  if (!config.projectKey) {
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
    events: state.events,
    media: {
      hasReplay: false,
    },
  };

  const response = await fetch(`${config.apiBaseUrl}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Project-Key': config.projectKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      message: `Upload failed (${response.status}): ${text || response.statusText}`,
    };
  }

  const result = (await response.json()) as { sessionId?: string };
  tabState.set(tabId, { events: [], environment: state.environment });
  return {
    ok: true,
    message: 'Session uploaded successfully.',
    sessionId: result.sessionId,
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(CONFIG_KEY);
  if (!existing[CONFIG_KEY]) {
    await setConfig(DEFAULT_CONFIG);
  }
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'BC_EVENT' && tabId !== undefined && message.payload) {
    const state = getTabState(tabId);
    state.events.push(message.payload as CaptureEvent);
    if (state.events.length > MAX_EVENTS_PER_TAB) {
      state.events.splice(0, state.events.length - MAX_EVENTS_PER_TAB);
    }
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
