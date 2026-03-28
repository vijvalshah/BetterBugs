import type { BackgroundMessage, ExtensionConfig } from '../shared/types';

const captureButton = document.getElementById('captureButton') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const capturePreviewEl = document.getElementById('capturePreview') as HTMLDivElement;
const configSummaryEl = document.getElementById('configSummary') as HTMLDivElement;
const openOptionsEl = document.getElementById('openOptions') as HTMLAnchorElement;
const shortcutHintEl = document.getElementById('shortcutHint') as HTMLDivElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage) => {
  if (message.type !== 'BC_STATUS_UPDATE') return;
  const payload = message.payload as { status?: string; message?: string } | undefined;
  if (!payload?.message) return;
  setStatus(payload.message);
});

async function loadConfig(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'BC_CONFIG_REQUEST' })) as BackgroundMessage;
  const config = response.payload as ExtensionConfig;
  const keyState = config.projectKey ? 'set' : 'missing';
  configSummaryEl.textContent = `API: ${config.apiBaseUrl} | Project: ${config.projectId} | Key: ${keyState}`;
}

async function loadCapturePreview(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: 'BC_CAPTURE_PREVIEW_REQUEST',
  })) as BackgroundMessage;

  const preview = response.payload as
    | { projectId: string; queueSize: number; url: string; title: string }
    | undefined;

  if (!preview) {
    capturePreviewEl.textContent = 'Preview unavailable right now.';
    return;
  }

  capturePreviewEl.textContent = `Preview -> Project: ${preview.projectId} | Queue: ${preview.queueSize} | Tab: ${preview.title}`;
}

async function loadShortcutHint(): Promise<void> {
  const commands = await chrome.commands.getAll();
  const captureCommand = commands.find((command) => command.name === 'trigger_capture');
  if (!captureCommand?.shortcut) {
    shortcutHintEl.textContent = 'Shortcut: not assigned (set one in extension keyboard shortcuts).';
    return;
  }

  shortcutHintEl.textContent = `Shortcut: ${captureCommand.shortcut}`;
}

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true;
  setStatus('Capturing and uploading...');

  try {
    const response = (await chrome.runtime.sendMessage({ type: 'BC_CAPTURE_NOW' })) as BackgroundMessage;
    const payload = response.payload as { ok: boolean; message: string; sessionId?: string };
    if (payload.ok) {
      setStatus(payload.sessionId ? `${payload.message} (id: ${payload.sessionId})` : payload.message);
    } else {
      setStatus(payload.message || 'Capture failed.');
    }
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Capture failed.');
  } finally {
    captureButton.disabled = false;
    void loadCapturePreview();
  }
});

openOptionsEl.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

void loadConfig();
void loadCapturePreview();
void loadShortcutHint();
