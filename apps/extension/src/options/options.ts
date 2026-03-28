import { DEFAULT_CONFIG, type BackgroundMessage, type ExtensionConfig } from '../shared/types';

const form = document.getElementById('configForm') as HTMLFormElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

const apiBaseUrlInput = document.getElementById('apiBaseUrl') as HTMLInputElement;
const projectIdInput = document.getElementById('projectId') as HTMLInputElement;
const projectKeyInput = document.getElementById('projectKey') as HTMLInputElement;
const captureNetworkInput = document.getElementById('captureNetwork') as HTMLInputElement;
const captureConsoleInput = document.getElementById('captureConsole') as HTMLInputElement;
const captureErrorsInput = document.getElementById('captureErrors') as HTMLInputElement;
let lastLoadedConfig: ExtensionConfig = { ...DEFAULT_CONFIG };

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function fillForm(config: ExtensionConfig): void {
  lastLoadedConfig = { ...config };
  apiBaseUrlInput.value = config.apiBaseUrl;
  projectIdInput.value = config.projectId;
  projectKeyInput.value = config.projectKey;
  captureNetworkInput.checked = config.captureNetwork;
  captureConsoleInput.checked = config.captureConsole;
  captureErrorsInput.checked = config.captureErrors;
}

async function loadConfig(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'BC_CONFIG_REQUEST' })) as BackgroundMessage;
  const payload = response.payload as ExtensionConfig | undefined;
  fillForm({ ...DEFAULT_CONFIG, ...(payload ?? {}) });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nextConfig: ExtensionConfig = {
    apiBaseUrl: apiBaseUrlInput.value.trim(),
    projectId: projectIdInput.value.trim(),
    projectKey: projectKeyInput.value.trim(),
    captureNetwork: captureNetworkInput.checked,
    captureConsole: captureConsoleInput.checked,
    captureErrors: captureErrorsInput.checked,
    captureState: DEFAULT_CONFIG.captureState,
    sanitizationRules: lastLoadedConfig.sanitizationRules,
    captureResolution: DEFAULT_CONFIG.captureResolution,
    captureFrameRate: DEFAULT_CONFIG.captureFrameRate,
  };

  try {
    await chrome.runtime.sendMessage({ type: 'BC_CONFIG_SAVE', payload: nextConfig });
    setStatus('Saved.');
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to save config.');
  }
});

void loadConfig();
