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
const ghExportEnabledInput = document.getElementById('ghExportEnabled') as HTMLInputElement;
const ghOwnerInput = document.getElementById('ghOwner') as HTMLInputElement;
const ghRepoInput = document.getElementById('ghRepo') as HTMLInputElement;
const ghTokenInput = document.getElementById('ghToken') as HTMLInputElement;
const ghLabelsInput = document.getElementById('ghLabels') as HTMLInputElement;
const ghAssigneesInput = document.getElementById('ghAssignees') as HTMLInputElement;
const glExportEnabledInput = document.getElementById('glExportEnabled') as HTMLInputElement;
const glBaseUrlInput = document.getElementById('glBaseUrl') as HTMLInputElement;
const glProjectIdInput = document.getElementById('glProjectId') as HTMLInputElement;
const glTokenInput = document.getElementById('glToken') as HTMLInputElement;
const glLabelsInput = document.getElementById('glLabels') as HTMLInputElement;
const glAssigneeIdsInput = document.getElementById('glAssigneeIds') as HTMLInputElement;
const linearExportEnabledInput = document.getElementById('linearExportEnabled') as HTMLInputElement;
const linearApiUrlInput = document.getElementById('linearApiUrl') as HTMLInputElement;
const linearTeamIdInput = document.getElementById('linearTeamId') as HTMLInputElement;
const linearTokenInput = document.getElementById('linearToken') as HTMLInputElement;
const linearLabelIdsInput = document.getElementById('linearLabelIds') as HTMLInputElement;
const linearAssigneeIdInput = document.getElementById('linearAssigneeId') as HTMLInputElement;
const shareLinksEnabledInput = document.getElementById('shareLinksEnabled') as HTMLInputElement;
const shareLinksBaseUrlInput = document.getElementById('shareLinksBaseUrl') as HTMLInputElement;
const shareLinksDefaultPermissionInput = document.getElementById('shareLinksDefaultPermission') as HTMLSelectElement;
const shareLinksDefaultExpiryHoursInput = document.getElementById('shareLinksDefaultExpiryHours') as HTMLInputElement;
const shareLinksRequireAuthInput = document.getElementById('shareLinksRequireAuth') as HTMLInputElement;
const routingEnabledInput = document.getElementById('routingEnabled') as HTMLInputElement;
const routingLabelRulesInput = document.getElementById('routingLabelRules') as HTMLTextAreaElement;
const routingOwnershipRulesInput = document.getElementById('routingOwnershipRules') as HTMLTextAreaElement;
const notificationEnabledInput = document.getElementById('notificationEnabled') as HTMLInputElement;
const notificationSlackWebhookUrlInput = document.getElementById('notificationSlackWebhookUrl') as HTMLInputElement;
const notificationWebhookUrlInput = document.getElementById('notificationWebhookUrl') as HTMLInputElement;
const notificationMaxRetriesInput = document.getElementById('notificationMaxRetries') as HTMLInputElement;
const notificationRetryBackoffMsInput = document.getElementById('notificationRetryBackoffMs') as HTMLInputElement;
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
  lastLoadedConfig = {
    ...config,
    ai: { ...config.ai },
    github: { ...config.github },
    gitlab: { ...config.gitlab },
    linear: { ...config.linear },
    shareLinks: { ...config.shareLinks },
    routing: { ...config.routing },
    notifications: { ...config.notifications },
  };
  apiBaseUrlInput.value = config.apiBaseUrl;
  projectIdInput.value = config.projectId;
  projectKeyInput.value = config.projectKey;
  captureNetworkInput.checked = config.captureNetwork ?? DEFAULT_CONFIG.captureNetwork;
  captureConsoleInput.checked = config.captureConsole ?? DEFAULT_CONFIG.captureConsole;
  captureErrorsInput.checked = config.captureErrors ?? DEFAULT_CONFIG.captureErrors;
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
  ghExportEnabledInput.checked = config.github.enabled;
  ghOwnerInput.value = config.github.owner;
  ghRepoInput.value = config.github.repo;
  ghTokenInput.value = config.github.token;
  ghLabelsInput.value = config.github.labels;
  ghAssigneesInput.value = config.github.assignees;
  glExportEnabledInput.checked = config.gitlab.enabled;
  glBaseUrlInput.value = config.gitlab.baseUrl;
  glProjectIdInput.value = config.gitlab.projectId;
  glTokenInput.value = config.gitlab.token;
  glLabelsInput.value = config.gitlab.labels;
  glAssigneeIdsInput.value = config.gitlab.assigneeIds;
  linearExportEnabledInput.checked = config.linear.enabled;
  linearApiUrlInput.value = config.linear.apiUrl;
  linearTeamIdInput.value = config.linear.teamId;
  linearTokenInput.value = config.linear.token;
  linearLabelIdsInput.value = config.linear.labelIds;
  linearAssigneeIdInput.value = config.linear.assigneeId;
  shareLinksEnabledInput.checked = config.shareLinks.enabled;
  shareLinksBaseUrlInput.value = config.shareLinks.baseUrl;
  shareLinksDefaultPermissionInput.value = config.shareLinks.defaultPermission;
  shareLinksDefaultExpiryHoursInput.value = String(config.shareLinks.defaultExpiryHours);
  shareLinksRequireAuthInput.checked = config.shareLinks.requireAuth;
  routingEnabledInput.checked = config.routing.enabled;
  routingLabelRulesInput.value = config.routing.labelRules;
  routingOwnershipRulesInput.value = config.routing.ownershipRules;
  notificationEnabledInput.checked = config.notifications.enabled;
  notificationSlackWebhookUrlInput.value = config.notifications.slackWebhookUrl;
  notificationWebhookUrlInput.value = config.notifications.webhookUrl;
  notificationMaxRetriesInput.value = String(config.notifications.maxRetries);
  notificationRetryBackoffMsInput.value = String(config.notifications.retryBackoffMs);
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

function validateGitHubConfig(config: ExtensionConfig): string | null {
  if (!config.github.enabled) {
    return null;
  }

  if (!config.github.owner.trim()) {
    return 'GitHub owner is required when GitHub export is enabled.';
  }

  if (!config.github.repo.trim()) {
    return 'GitHub repository name is required when GitHub export is enabled.';
  }

  if (!config.github.token.trim()) {
    return 'GitHub token is required when GitHub export is enabled.';
  }

  return null;
}

function validateGitLabConfig(config: ExtensionConfig): string | null {
  if (!config.gitlab.enabled) {
    return null;
  }

  if (!config.gitlab.baseUrl.trim()) {
    return 'GitLab base URL is required when GitLab export is enabled.';
  }

  if (!config.gitlab.projectId.trim()) {
    return 'GitLab project ID/path is required when GitLab export is enabled.';
  }

  if (!config.gitlab.token.trim()) {
    return 'GitLab token is required when GitLab export is enabled.';
  }

  return null;
}

function validateLinearConfig(config: ExtensionConfig): string | null {
  if (!config.linear.enabled) {
    return null;
  }

  if (!config.linear.apiUrl.trim()) {
    return 'Linear API URL is required when Linear export is enabled.';
  }

  if (!config.linear.teamId.trim()) {
    return 'Linear team ID is required when Linear export is enabled.';
  }

  if (!config.linear.token.trim()) {
    return 'Linear token is required when Linear export is enabled.';
  }

  return null;
}

function validateShareLinksConfig(config: ExtensionConfig): string | null {
  if (!config.shareLinks.enabled) {
    return null;
  }

  if (config.shareLinks.defaultExpiryHours < 1 || config.shareLinks.defaultExpiryHours > 720) {
    return 'Share link default expiry must be between 1 and 720 hours.';
  }

  if (!['viewer', 'commenter', 'editor'].includes(config.shareLinks.defaultPermission)) {
    return 'Share link default permission must be viewer, commenter, or editor.';
  }

  return null;
}

function validateRoutingConfig(config: ExtensionConfig): string | null {
  if (!config.routing.enabled) {
    return null;
  }

  const ruleLines = `${config.routing.labelRules}\n${config.routing.ownershipRules}`
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of ruleLines) {
    if (!line.includes(':') && !line.includes('=>')) {
      return 'Routing rules must use "pattern:value" or "pattern=>value" format.';
    }
  }

  return null;
}

function validateNotificationsConfig(config: ExtensionConfig): string | null {
  if (!config.notifications.enabled) {
    return null;
  }

  if (!config.notifications.slackWebhookUrl.trim() && !config.notifications.webhookUrl.trim()) {
    return 'At least one notification endpoint is required when notifications are enabled.';
  }

  if (config.notifications.maxRetries < 0 || config.notifications.maxRetries > 5) {
    return 'Notification max retries must be between 0 and 5.';
  }

  if (config.notifications.retryBackoffMs < 100 || config.notifications.retryBackoffMs > 30000) {
    return 'Notification retry backoff must be between 100 and 30000 ms.';
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
      github: {
        ...DEFAULT_CONFIG.github,
        ...((payload?.github ?? {}) as Partial<ExtensionConfig['github']>),
      },
      gitlab: {
        ...DEFAULT_CONFIG.gitlab,
        ...((payload?.gitlab ?? {}) as Partial<ExtensionConfig['gitlab']>),
      },
      linear: {
        ...DEFAULT_CONFIG.linear,
        ...((payload?.linear ?? {}) as Partial<ExtensionConfig['linear']>),
      },
      shareLinks: {
        ...DEFAULT_CONFIG.shareLinks,
        ...((payload?.shareLinks ?? {}) as Partial<ExtensionConfig['shareLinks']>),
      },
      routing: {
        ...DEFAULT_CONFIG.routing,
        ...((payload?.routing ?? {}) as Partial<ExtensionConfig['routing']>),
      },
      notifications: {
        ...DEFAULT_CONFIG.notifications,
        ...((payload?.notifications ?? {}) as Partial<ExtensionConfig['notifications']>),
      },
    });
    setStatus('');
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to load config.');
    fillForm({
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai },
      github: { ...DEFAULT_CONFIG.github },
      gitlab: { ...DEFAULT_CONFIG.gitlab },
      linear: { ...DEFAULT_CONFIG.linear },
      shareLinks: { ...DEFAULT_CONFIG.shareLinks },
      routing: { ...DEFAULT_CONFIG.routing },
      notifications: { ...DEFAULT_CONFIG.notifications },
    });
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nextConfig: ExtensionConfig = {
    apiBaseUrl: apiBaseUrlInput.value.trim(),
    dashboardBaseUrl: lastLoadedConfig.dashboardBaseUrl || DEFAULT_CONFIG.dashboardBaseUrl,
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
    github: {
      enabled: ghExportEnabledInput.checked,
      owner: ghOwnerInput.value.trim(),
      repo: ghRepoInput.value.trim(),
      token: ghTokenInput.value.trim(),
      labels: ghLabelsInput.value.trim(),
      assignees: ghAssigneesInput.value.trim(),
    },
    gitlab: {
      enabled: glExportEnabledInput.checked,
      baseUrl: glBaseUrlInput.value.trim(),
      projectId: glProjectIdInput.value.trim(),
      token: glTokenInput.value.trim(),
      labels: glLabelsInput.value.trim(),
      assigneeIds: glAssigneeIdsInput.value.trim(),
    },
    linear: {
      enabled: linearExportEnabledInput.checked,
      apiUrl: linearApiUrlInput.value.trim(),
      teamId: linearTeamIdInput.value.trim(),
      token: linearTokenInput.value.trim(),
      labelIds: linearLabelIdsInput.value.trim(),
      assigneeId: linearAssigneeIdInput.value.trim(),
    },
    shareLinks: {
      enabled: shareLinksEnabledInput.checked,
      baseUrl: shareLinksBaseUrlInput.value.trim(),
      defaultPermission: shareLinksDefaultPermissionInput.value as ExtensionConfig['shareLinks']['defaultPermission'],
      defaultExpiryHours: Number.parseInt(
        shareLinksDefaultExpiryHoursInput.value || String(DEFAULT_CONFIG.shareLinks.defaultExpiryHours),
        10,
      ),
      requireAuth: shareLinksRequireAuthInput.checked,
    },
    routing: {
      enabled: routingEnabledInput.checked,
      labelRules: routingLabelRulesInput.value.trim(),
      ownershipRules: routingOwnershipRulesInput.value.trim(),
    },
    notifications: {
      enabled: notificationEnabledInput.checked,
      slackWebhookUrl: notificationSlackWebhookUrlInput.value.trim(),
      webhookUrl: notificationWebhookUrlInput.value.trim(),
      maxRetries: Number.parseInt(
        notificationMaxRetriesInput.value || String(DEFAULT_CONFIG.notifications.maxRetries),
        10,
      ),
      retryBackoffMs: Number.parseInt(
        notificationRetryBackoffMsInput.value || String(DEFAULT_CONFIG.notifications.retryBackoffMs),
        10,
      ),
    },
  };

  const validationError = validateAiConfig(nextConfig);
  if (validationError) {
    setStatus(validationError);
    return;
  }

  const gitHubValidationError = validateGitHubConfig(nextConfig);
  if (gitHubValidationError) {
    setStatus(gitHubValidationError);
    return;
  }

  const gitLabValidationError = validateGitLabConfig(nextConfig);
  if (gitLabValidationError) {
    setStatus(gitLabValidationError);
    return;
  }

  const linearValidationError = validateLinearConfig(nextConfig);
  if (linearValidationError) {
    setStatus(linearValidationError);
    return;
  }

  const shareLinksValidationError = validateShareLinksConfig(nextConfig);
  if (shareLinksValidationError) {
    setStatus(shareLinksValidationError);
    return;
  }

  const routingValidationError = validateRoutingConfig(nextConfig);
  if (routingValidationError) {
    setStatus(routingValidationError);
    return;
  }

  const notificationsValidationError = validateNotificationsConfig(nextConfig);
  if (notificationsValidationError) {
    setStatus(notificationsValidationError);
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
