import { DEFAULT_CONFIG, type BackgroundMessage, type ExtensionConfig } from '../shared/types';

const form = document.getElementById('configForm') as HTMLFormElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

const apiBaseUrlInput = document.getElementById('apiBaseUrl') as HTMLInputElement;
const projectIdInput = document.getElementById('projectId') as HTMLInputElement;
const projectKeyInput = document.getElementById('projectKey') as HTMLInputElement;
const captureNetworkInput = document.getElementById('captureNetwork') as HTMLInputElement;
const captureConsoleInput = document.getElementById('captureConsole') as HTMLInputElement;
const captureErrorsInput = document.getElementById('captureErrors') as HTMLInputElement;
const aiEnabledInput = document.getElementById('aiEnabled') as HTMLInputElement;
const aiProviderInput = document.getElementById('aiProvider') as HTMLSelectElement;
const aiModelInput = document.getElementById('aiModel') as HTMLInputElement;
const aiBaseUrlInput = document.getElementById('aiBaseUrl') as HTMLInputElement;
const aiApiKeyInput = document.getElementById('aiApiKey') as HTMLInputElement;
const aiTemperatureInput = document.getElementById('aiTemperature') as HTMLInputElement;
const aiMaxTokensInput = document.getElementById('aiMaxTokens') as HTMLInputElement;
const aiCodeContextEnabledInput = document.getElementById('aiCodeContextEnabled') as HTMLInputElement;
const aiEmbeddingsEnabledInput = document.getElementById('aiEmbeddingsEnabled') as HTMLInputElement;
const aiRepositoryRefInput = document.getElementById('aiRepositoryRef') as HTMLInputElement;
const aiMaxCodeContextFilesInput = document.getElementById('aiMaxCodeContextFiles') as HTMLInputElement;
let lastLoadedConfig: ExtensionConfig = { ...DEFAULT_CONFIG };
const CONFIG_KEY = 'bugcatcherConfig';
const MESSAGE_TIMEOUT_MS = 5_000;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function sendMessageWithTimeout<T>(
  message: BackgroundMessage,
  timeoutMs: number = MESSAGE_TIMEOUT_MS,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Background request timed out.'));
    }, timeoutMs);

    chrome.runtime
      .sendMessage(message)
      .then((response) => {
        window.clearTimeout(timeoutId);
        resolve(response as T);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function fillForm(config: ExtensionConfig): void {
  lastLoadedConfig = { ...config, ai: { ...config.ai } };
  apiBaseUrlInput.value = config.apiBaseUrl;
  projectIdInput.value = config.projectId;
  projectKeyInput.value = config.projectKey;
  captureNetworkInput.checked = config.captureNetwork;
  captureConsoleInput.checked = config.captureConsole;
  captureErrorsInput.checked = config.captureErrors;
  aiEnabledInput.checked = config.ai.enabled;
  aiProviderInput.value = config.ai.provider;
  aiModelInput.value = config.ai.model;
  aiBaseUrlInput.value = config.ai.baseUrl;
  aiApiKeyInput.value = config.ai.apiKey;
  aiTemperatureInput.value = String(config.ai.temperature);
  aiMaxTokensInput.value = String(config.ai.maxTokens);
  aiCodeContextEnabledInput.checked = config.ai.codeContextEnabled;
  aiEmbeddingsEnabledInput.checked = config.ai.embeddingsEnabled;
  aiRepositoryRefInput.value = config.ai.repositoryRef;
  aiMaxCodeContextFilesInput.value = String(config.ai.maxCodeContextFiles);
}

function validateAiConfig(config: ExtensionConfig): string | null {
  if (!config.ai.enabled) {
    return null;
  }

  if (config.ai.provider === 'none') {
    return 'Select an AI provider before enabling AI analysis.';
  }

  if (!config.ai.model.trim()) {
    return 'AI model is required when AI analysis is enabled.';
  }

  if ((config.ai.provider === 'openai' || config.ai.provider === 'custom') && !config.ai.apiKey.trim()) {
    return 'AI API key is required for OpenAI and Custom provider modes.';
  }

  if ((config.ai.provider === 'ollama' || config.ai.provider === 'custom') && !config.ai.baseUrl.trim()) {
    return 'AI base URL is required for Ollama and Custom provider modes.';
  }

  if (config.ai.temperature < 0 || config.ai.temperature > 1) {
    return 'AI temperature must be between 0 and 1.';
  }

  if (config.ai.maxTokens < 64 || config.ai.maxTokens > 4096) {
    return 'AI max tokens must be between 64 and 4096.';
  }

  if (config.ai.maxCodeContextFiles < 1 || config.ai.maxCodeContextFiles > 12) {
    return 'AI max code context files must be between 1 and 12.';
  }

  if (config.ai.codeContextEnabled) {
    if (!config.ai.repositoryRef.trim()) {
      return 'Repository reference is required when code-context analysis is enabled.';
    }

    if (!config.ai.embeddingsEnabled) {
      return 'Embeddings must be enabled when code-context analysis is enabled.';
    }
  }

  return null;
}

async function loadConfig(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(CONFIG_KEY);
    const payload = result[CONFIG_KEY] as ExtensionConfig | undefined;
    fillForm({
      ...DEFAULT_CONFIG,
      ...(payload ?? {}),
      ai: {
        ...DEFAULT_CONFIG.ai,
        ...((payload?.ai ?? {}) as Partial<ExtensionConfig['ai']>),
      },
    });
    setStatus('');
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to load config.');
    fillForm({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai } });
  }
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
    ai: {
      enabled: aiEnabledInput.checked,
      provider: aiProviderInput.value as ExtensionConfig['ai']['provider'],
      model: aiModelInput.value.trim(),
      baseUrl: aiBaseUrlInput.value.trim(),
      apiKey: aiApiKeyInput.value.trim(),
      temperature: Number.parseFloat(aiTemperatureInput.value || String(DEFAULT_CONFIG.ai.temperature)),
      maxTokens: Number.parseInt(aiMaxTokensInput.value || String(DEFAULT_CONFIG.ai.maxTokens), 10),
      codeContextEnabled: aiCodeContextEnabledInput.checked,
      embeddingsEnabled: aiEmbeddingsEnabledInput.checked,
      repositoryRef: aiRepositoryRefInput.value.trim(),
      maxCodeContextFiles: Number.parseInt(
        aiMaxCodeContextFilesInput.value || String(DEFAULT_CONFIG.ai.maxCodeContextFiles),
        10,
      ),
    },
  };

  const validationError = validateAiConfig(nextConfig);
  if (validationError) {
    setStatus(validationError);
    return;
  }

  try {
    setStatus('Saving...');
    await chrome.storage.sync.set({ [CONFIG_KEY]: nextConfig });

    // Best effort notification so background can refresh any in-memory state.
    await sendMessageWithTimeout<BackgroundMessage>({ type: 'BC_CONFIG_SAVE', payload: nextConfig }).catch(
      () => undefined,
    );

    setStatus('Saved.');
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to save config.');
  }
});

void loadConfig();
