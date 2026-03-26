import type { BackgroundMessage, ExtensionConfig } from '../shared/types';

const captureButton = document.getElementById('captureButton') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const configSummaryEl = document.getElementById('configSummary') as HTMLDivElement;
const openOptionsEl = document.getElementById('openOptions') as HTMLAnchorElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function loadConfig(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'BC_CONFIG_REQUEST' })) as BackgroundMessage;
  const config = response.payload as ExtensionConfig;
  const keyState = config.projectKey ? 'set' : 'missing';
  configSummaryEl.textContent = `API: ${config.apiBaseUrl} | Project: ${config.projectId} | Key: ${keyState}`;
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
  }
});

openOptionsEl.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

void loadConfig();
