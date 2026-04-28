import {
  DEFAULT_CONFIG,
  type BackgroundMessage,
  type ExtensionConfig,
  type ExportDestination,
  type ShareLinkPermission,
  type ScreenshotPreview,
  type TabCaptureStatus,
  type VideoPreview,
} from '../shared/types';
import type { ApiSession, ApiSessionDetail } from '../shared/api-client';

const captureButton = document.getElementById('captureButton') as HTMLButtonElement;
const screenshotCaptureButton = document.getElementById('screenshotCaptureButton') as HTMLButtonElement;
const screenshotPreviewImageEl = document.getElementById('screenshotPreviewImage') as HTMLImageElement;
const screenshotPreviewMetaEl = document.getElementById('screenshotPreviewMeta') as HTMLDivElement;
const videoPreviewMetaEl = document.getElementById('videoPreviewMeta') as HTMLDivElement;
const videoPreviewPlayerEl = document.getElementById('videoPreviewPlayer') as HTMLVideoElement;
const videoStartButtonEl = document.getElementById('videoStartButton') as HTMLButtonElement;
const videoStopButtonEl = document.getElementById('videoStopButton') as HTMLButtonElement;
const videoTimerEl = document.getElementById('videoTimer') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const capturePreviewEl = document.getElementById('capturePreview') as HTMLDivElement;
const configSummaryEl = document.getElementById('configSummary') as HTMLDivElement;
const openOptionsEl = document.getElementById('openOptions') as HTMLAnchorElement;
const shortcutHintEl = document.getElementById('shortcutHint') as HTMLDivElement;
const captureStateEl = document.getElementById('captureState') as HTMLDivElement;
const captureStateLabelEl = document.getElementById('captureStateLabel') as HTMLDivElement;
const captureInfoEl = document.getElementById('captureInfo') as HTMLSpanElement;
const captureStartBtnEl = document.getElementById('captureStartBtn') as HTMLButtonElement;
const captureStopBtnEl = document.getElementById('captureStopBtn') as HTMLButtonElement;
const sessionSearchEl = document.getElementById('sessionSearch') as HTMLInputElement;
const errorFilterEl = document.getElementById('errorFilter') as HTMLSelectElement;
const sortByEl = document.getElementById('sortBy') as HTMLSelectElement;
const sortOrderEl = document.getElementById('sortOrder') as HTMLSelectElement;
const pageSizeEl = document.getElementById('pageSize') as HTMLSelectElement;
const applyFiltersEl = document.getElementById('applyFilters') as HTMLButtonElement;
const sessionListEl = document.getElementById('sessionList') as HTMLDivElement;
const prevPageEl = document.getElementById('prevPage') as HTMLButtonElement;
const nextPageEl = document.getElementById('nextPage') as HTMLButtonElement;
const pagerInfoEl = document.getElementById('pagerInfo') as HTMLDivElement;
const sessionDetailEl = document.getElementById('sessionDetail') as HTMLDivElement;

const MESSAGE_TIMEOUT_MS = 10_000;
const REPLAY_BOOKMARKS_KEY = 'bugcatcherReplayBookmarks';
const REPLAY_PREFERENCES_KEY = 'bugcatcherReplayPreferences';
const AI_ANALYSIS_HISTORY_KEY = 'bugcatcherAiAnalysisHistory';
const TIMELINE_SYNC_WINDOW_MS = 15_000;

type SessionListResponse = {
  ok?: boolean;
  message?: string;
  sessions?: ApiSession[];
  total?: number;
  limit?: number;
  offset?: number;
};

type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

type SessionSeverity = {
  level: SeverityLevel;
  score: number;
  label: string;
};

type ReplayBookmark = {
  id: string;
  label: string;
  timeMs: number;
};

type ReplayState = {
  session: ApiSessionDetail;
  currentTimeMs: number;
  maxTimeMs: number;
  zoomLevel: number;
  panPercent: number;
  playbackRate: number;
  bookmarks: ReplayBookmark[];
  isPlaying: boolean;
  suppressVideoSync: boolean;
  aiStatus: 'idle' | 'running' | 'completed' | 'fallback' | 'failed';
  aiMessage?: string;
  aiResult?: StoredAiAnalysis;
  aiHistory: StoredAiAnalysis[];
  activeAnalysisId?: string;
  compareAnalysisId?: string;
  includeCodeContext: boolean;
  modelOverride: string;
  exportStatus: Record<ExportDestination, 'idle' | 'running' | 'completed' | 'failed'>;
  exportMessage: Record<ExportDestination, string>;
  exportArtifacts: Partial<Record<ExportDestination, {
    url: string;
    id?: string;
    title?: string;
    permission?: ShareLinkPermission;
    expiresAt?: string;
    auditId?: string;
    routingLabels?: string[];
    routingAssignees?: string[];
    routingReasons?: string[];
    notificationSummary?: string;
    notificationFailures?: number;
  }>>;
  sharePermission: ShareLinkPermission;
  shareExpiryHours: number;
};

type AiCodeContextFile = {
  path: string;
  reason: string;
  score: number;
  lineHint?: string;
};

type AiAnalysisResult = {
  summary: string;
  rootCause: string;
  suggestedFiles?: string[];
  actions?: string[];
  confidence: number;
  provider: string;
  model: string;
  status: 'completed' | 'fallback';
  classification?: string;
  costUsd?: number;
  similarIssueHints?: string[];
  provenance?: string[];
  codeContextFiles?: AiCodeContextFile[];
  crossFileTraces?: string[];
};

type StoredAiAnalysis = AiAnalysisResult & {
  id: string;
  createdAt: string;
  completedActionIndexes?: number[];
};

const sessionQueryState = {
  q: '',
  sortBy: 'createdAt',
  sortOrder: 'desc' as 'asc' | 'desc',
  hasError: undefined as boolean | undefined,
  limit: 10,
  offset: 0,
};

const paginationState = {
  total: 0,
};

let replayState: ReplayState | null = null;
let currentConfig: ExtensionConfig = { ...DEFAULT_CONFIG };

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatMs(value: number): string {
  return `${(value / 1000).toFixed(2)}s`;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatCaptureDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatAnalysisTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString();
}

function getActiveAnalysis(): StoredAiAnalysis | undefined {
  if (!replayState) {
    return undefined;
  }

  if (!replayState.activeAnalysisId) {
    return replayState.aiHistory[0];
  }

  return replayState.aiHistory.find((entry) => entry.id === replayState.activeAnalysisId);
}

function getComparisonAnalysis(): StoredAiAnalysis | undefined {
  if (!replayState || !replayState.compareAnalysisId) {
    return undefined;
  }

  return replayState.aiHistory.find((entry) => entry.id === replayState.compareAnalysisId);
}

function confidenceDeltaLabel(current: number, baseline: number): string {
  const delta = Math.round((current - baseline) * 100);
  if (delta === 0) {
    return '0%';
  }
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function overlapRatio(valuesA: string[], valuesB: string[]): string {
  const left = new Set(valuesA);
  const right = new Set(valuesB);
  if (left.size === 0 && right.size === 0) {
    return 'N/A';
  }

  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) {
      overlap += 1;
    }
  }

  const union = new Set([...left, ...right]).size;
  return `${Math.round((overlap / Math.max(union, 1)) * 100)}%`;
}

function renderAiComparisonHtml(current: StoredAiAnalysis, baseline: StoredAiAnalysis): string {
  const confidenceDelta = confidenceDeltaLabel(current.confidence, baseline.confidence);
  const classificationChange = current.classification === baseline.classification
    ? 'No change'
    : `${baseline.classification || 'none'} -> ${current.classification || 'none'}`;
  const fileOverlap = overlapRatio(current.suggestedFiles || [], baseline.suggestedFiles || []);

  return `
    <div class="workspace-list-item"><strong>Comparing:</strong> ${escapeHtml(formatAnalysisTimestamp(current.createdAt))} vs ${escapeHtml(formatAnalysisTimestamp(baseline.createdAt))}</div>
    <div class="workspace-list-item"><strong>Confidence Delta:</strong> ${escapeHtml(confidenceDelta)}</div>
    <div class="workspace-list-item"><strong>Classification:</strong> ${escapeHtml(classificationChange)}</div>
    <div class="workspace-list-item"><strong>Suggested File Overlap:</strong> ${escapeHtml(fileOverlap)}</div>
    <div class="workspace-list-item"><strong>Model Pair:</strong> ${escapeHtml(baseline.model)} -> ${escapeHtml(current.model)}</div>
  `;
}

function renderAiResultHtml(result: StoredAiAnalysis): string {
  const actions = result.actions || [];
  const completed = new Set(result.completedActionIndexes || []);
  const suggestedFiles = (result.suggestedFiles || [])
    .map(
      (item) =>
        `<li><button class="bookmark-chip" data-action="copy-suggested-file" data-file-path="${escapeHtml(item)}">${escapeHtml(item)}</button></li>`,
    )
    .join('');
  const actionsHtml = actions
    .map(
      (item, index) =>
        `<li><label><input type="checkbox" data-action="toggle-ai-action" data-action-index="${index}" ${completed.has(index) ? 'checked' : ''} /> ${escapeHtml(item)}</label></li>`,
    )
    .join('');
  const similarIssues = (result.similarIssueHints || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const provenance = (result.provenance || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const codeContextFiles = (result.codeContextFiles || [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.path)}${item.lineHint ? `:${escapeHtml(item.lineHint)}` : ''} (${escapeHtml(item.reason)}, score=${escapeHtml(item.score.toFixed(2))})</li>`,
    )
    .join('');
  const crossFileTraces = (result.crossFileTraces || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  return `
    <div class="workspace-list-item"><strong>Run:</strong> ${escapeHtml(formatAnalysisTimestamp(result.createdAt))}</div>
    <div class="workspace-list-item"><strong>Summary:</strong> ${escapeHtml(result.summary)}</div>
    <div class="workspace-list-item"><strong>Likely Root Cause:</strong> ${escapeHtml(result.rootCause)}</div>
    <div class="workspace-list-item"><strong>Confidence:</strong> ${escapeHtml(formatConfidence(result.confidence))}</div>
    <div class="workspace-list-item"><strong>Provider:</strong> ${escapeHtml(result.provider)} / ${escapeHtml(result.model)}</div>
    ${result.classification ? `<div class="workspace-list-item"><strong>Classification:</strong> ${escapeHtml(result.classification)}</div>` : ''}
    ${typeof result.costUsd === 'number' ? `<div class="workspace-list-item"><strong>Estimated Cost:</strong> $${escapeHtml(result.costUsd.toFixed(6))}</div>` : ''}
    ${
      suggestedFiles.length > 0
        ? `<div class="workspace-list-item"><strong>Suggested Files:</strong><ul>${suggestedFiles}</ul></div>`
        : ''
    }
    ${actionsHtml.length > 0 ? `<div class="workspace-list-item"><strong>Next Actions:</strong><ul>${actionsHtml}</ul></div>` : ''}
    ${
      similarIssues.length > 0
        ? `<div class="workspace-list-item"><strong>Similar Signals:</strong><ul>${similarIssues}</ul></div>`
        : ''
    }
    ${
      codeContextFiles.length > 0
        ? `<div class="workspace-list-item"><strong>Code Context:</strong><ul>${codeContextFiles}</ul></div>`
        : ''
    }
    ${
      crossFileTraces.length > 0
        ? `<div class="workspace-list-item"><strong>Cross-file Traces:</strong><ul>${crossFileTraces}</ul></div>`
        : ''
    }
    ${
      provenance.length > 0
        ? `<div class="workspace-list-item"><strong>Provenance:</strong><ul>${provenance}</ul></div>`
        : ''
    }
  `;
}

function renderAiHistorySelectors(): void {
  if (!replayState) {
    return;
  }

  const historySelect = sessionDetailEl.querySelector('#aiHistorySelect') as HTMLSelectElement | null;
  const compareSelect = sessionDetailEl.querySelector('#aiCompareSelect') as HTMLSelectElement | null;
  const comparisonPanel = sessionDetailEl.querySelector('#aiComparisonPanel') as HTMLDivElement | null;
  if (!historySelect || !compareSelect || !comparisonPanel) {
    return;
  }

  const optionsHtml = replayState.aiHistory
    .map((entry) => {
      const label = `${formatAnalysisTimestamp(entry.createdAt)} | ${entry.provider}/${entry.model} | ${entry.status}`;
      return `<option value="${escapeHtml(entry.id)}">${escapeHtml(label)}</option>`;
    })
    .join('');

  historySelect.innerHTML = replayState.aiHistory.length > 0
    ? optionsHtml
    : '<option value="">No past analyses</option>';
  compareSelect.innerHTML =
    '<option value="">Compare against...</option>' +
    replayState.aiHistory
      .map((entry) => {
        const label = `${formatAnalysisTimestamp(entry.createdAt)} | ${entry.model}`;
        return `<option value="${escapeHtml(entry.id)}">${escapeHtml(label)}</option>`;
      })
      .join('');

  if (replayState.activeAnalysisId && replayState.aiHistory.some((entry) => entry.id === replayState.activeAnalysisId)) {
    historySelect.value = replayState.activeAnalysisId;
  }

  if (replayState.compareAnalysisId && replayState.aiHistory.some((entry) => entry.id === replayState.compareAnalysisId)) {
    compareSelect.value = replayState.compareAnalysisId;
  } else {
    compareSelect.value = '';
  }

  const current = getActiveAnalysis();
  const baseline = getComparisonAnalysis();
  if (current && baseline && current.id !== baseline.id) {
    comparisonPanel.innerHTML = renderAiComparisonHtml(current, baseline);
  } else {
    comparisonPanel.innerHTML = '';
  }
}

function renderAiStatusPanel(): void {
  if (!replayState) {
    return;
  }

  if (!replayState.aiResult && replayState.aiHistory.length > 0) {
    setActiveAnalysisById(replayState.aiHistory[0].id);
  }

  const aiModelOverrideEl = sessionDetailEl.querySelector('#aiModelOverride') as HTMLInputElement | null;
  const aiIncludeCodeContextEl = sessionDetailEl.querySelector('#aiIncludeCodeContext') as HTMLInputElement | null;
  const statusNode = sessionDetailEl.querySelector('#aiAnalysisStatus') as HTMLDivElement | null;
  const resultEl = sessionDetailEl.querySelector('#aiAnalysisResult') as HTMLDivElement | null;
  const triggerButton = sessionDetailEl.querySelector('[data-action="run-ai-analysis"]') as HTMLButtonElement | null;
  const copySummaryButton = sessionDetailEl.querySelector('[data-action="copy-ai-summary"]') as HTMLButtonElement | null;
  if (!statusNode || !resultEl) {
    return;
  }

  if (aiModelOverrideEl) {
    aiModelOverrideEl.value = replayState.modelOverride;
  }

  if (aiIncludeCodeContextEl) {
    aiIncludeCodeContextEl.checked = replayState.includeCodeContext;
  }

  if (triggerButton) {
    triggerButton.disabled = replayState.aiStatus === 'running';
  }

  if (copySummaryButton) {
    copySummaryButton.disabled = !replayState.aiResult;
  }

  const message = replayState.aiMessage || 'AI analysis idle.';
  statusNode.textContent = message;

  renderAiHistorySelectors();

  if (!replayState.aiResult) {
    resultEl.innerHTML = '<div class="workspace-list-item">Run analysis to generate AI output.</div>';
    return;
  }

  resultEl.innerHTML = renderAiResultHtml(replayState.aiResult);
}

function buildExportAnalysisHint(): {
  summary?: string;
  rootCause?: string;
  classification?: string;
  actions?: string[];
  suggestedFiles?: string[];
} {
  const active = getActiveAnalysis();
  if (!active) {
    return {};
  }

  return {
    summary: active.summary,
    rootCause: active.rootCause,
    classification: active.classification,
    actions: active.actions,
    suggestedFiles: active.suggestedFiles,
  };
}

function formatDestinationLabel(destination: ExportDestination): string {
  if (destination === 'github') {
    return 'GitHub';
  }
  if (destination === 'gitlab') {
    return 'GitLab';
  }
  if (destination === 'linear') {
    return 'Linear';
  }
  return 'Share Link';
}

function renderExportPanel(): void {
  if (!replayState) {
    return;
  }

  const statusEl = sessionDetailEl.querySelector('#destinationExportStatus') as HTMLDivElement | null;
  const resultEl = sessionDetailEl.querySelector('#destinationExportResult') as HTMLDivElement | null;
  const sharePermissionEl = sessionDetailEl.querySelector('#sharePermission') as HTMLSelectElement | null;
  const shareExpiryEl = sessionDetailEl.querySelector('#shareExpiryHours') as HTMLInputElement | null;
  const triggerButtons = Array.from(
    sessionDetailEl.querySelectorAll('[data-action="run-destination-export"]'),
  ) as HTMLButtonElement[];
  if (!statusEl || !resultEl) {
    return;
  }

  if (sharePermissionEl) {
    sharePermissionEl.value = replayState.sharePermission;
  }

  if (shareExpiryEl) {
    shareExpiryEl.value = String(replayState.shareExpiryHours);
  }

  for (const triggerButton of triggerButtons) {
    const destination = triggerButton.dataset.destination as ExportDestination | undefined;
    if (!destination) {
      continue;
    }
    triggerButton.disabled = replayState.exportStatus[destination] === 'running';
  }

  const statusLines = (['github', 'gitlab', 'linear', 'share-link'] as ExportDestination[])
    .map((destination) => `${formatDestinationLabel(destination)}: ${replayState.exportMessage[destination]}`)
    .join(' | ');
  statusEl.textContent = statusLines;

  const artifactEntries = (['github', 'gitlab', 'linear', 'share-link'] as ExportDestination[])
    .map((destination) => ({ destination, artifact: replayState.exportArtifacts[destination] }))
    .filter((entry) => Boolean(entry.artifact?.url));

  if (artifactEntries.length === 0) {
    resultEl.innerHTML = '<div class="workspace-list-item">Export a session to GitHub, GitLab, Linear, or create a share link.</div>';
    return;
  }

  resultEl.innerHTML = artifactEntries
    .map(({ destination, artifact }) => {
      const idLabel = artifact?.id ? `#${artifact.id}` : '';
      const titleLabel = artifact?.title || '';
      const expiresLabel = artifact?.expiresAt ? ` | expires ${new Date(artifact.expiresAt).toLocaleString()}` : '';
      const permissionLabel = artifact?.permission ? ` | ${artifact.permission}` : '';
      const routingLabels = (artifact?.routingLabels || []).join(', ');
      const routingAssignees = (artifact?.routingAssignees || []).join(', ');
      const routingReasons = (artifact?.routingReasons || []).join(' | ');
      const routingSummary = [
        routingLabels ? `labels=${routingLabels}` : '',
        routingAssignees ? `assignees=${routingAssignees}` : '',
      ]
        .filter((entry) => entry.length > 0)
        .join(' | ');
      const notificationSummary = artifact?.notificationSummary || 'disabled';
      const notificationFailures = typeof artifact?.notificationFailures === 'number'
        ? artifact.notificationFailures
        : 0;
      return `
        <div class="workspace-list-item"><strong>${escapeHtml(formatDestinationLabel(destination))}:</strong> ${escapeHtml(idLabel)} ${escapeHtml(titleLabel)}${escapeHtml(permissionLabel)}${escapeHtml(expiresLabel)}</div>
        <div class="workspace-list-item"><a href="${escapeHtml(artifact?.url || '')}" target="_blank" rel="noreferrer">${escapeHtml(
          artifact?.url || '',
        )}</a></div>
        <div class="workspace-list-item"><strong>Routing:</strong> ${escapeHtml(routingSummary || 'none')}</div>
        <div class="workspace-list-item"><strong>Routing Reasons:</strong> ${escapeHtml(routingReasons || 'none')}</div>
        <div class="workspace-list-item"><strong>Notifications:</strong> ${escapeHtml(notificationSummary)}</div>
        <div class="workspace-list-item"><strong>Notification Failures:</strong> ${escapeHtml(String(notificationFailures))}</div>
        <div class="workspace-list-item"><button class="bookmark-chip" data-action="copy-destination-url" data-artifact-url="${escapeHtml(
          artifact?.url || '',
        )}" data-destination="${escapeHtml(destination)}">Copy ${escapeHtml(formatDestinationLabel(destination))} URL</button></div>
      `;
    })
    .join('');
}

async function runDestinationExportForCurrentSession(destination: ExportDestination): Promise<void> {
  if (!replayState) {
    return;
  }

  const sharePermission = replayState.sharePermission;
  const shareExpiryHours = replayState.shareExpiryHours;

  replayState.exportStatus[destination] = 'running';
  replayState.exportMessage[destination] = `Exporting ${formatDestinationLabel(destination)} artifact...`;
  renderExportPanel();

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>(
      {
        type: 'BC_EXPORT_DESTINATION_REQUEST',
        payload: {
          destination,
          sessionId: replayState.session.sessionId,
          analysis: buildExportAnalysisHint(),
          shareOptions:
            destination === 'share-link'
              ? {
                permission: sharePermission,
                expiresInHours: shareExpiryHours,
              }
              : undefined,
        },
      },
      30_000,
    );

    const payload = (response.payload ?? {}) as {
      ok?: boolean;
      message?: string;
      destination?: ExportDestination;
      artifactUrl?: string;
      artifactId?: string;
      artifactTitle?: string;
      permission?: ShareLinkPermission;
      expiresAt?: string;
      auditId?: string;
      routingLabels?: string[];
      routingAssignees?: string[];
      routingReasons?: string[];
      notificationSummary?: string;
      notificationFailures?: number;
    };

    if (!payload.ok || !payload.artifactUrl) {
      replayState.exportStatus[destination] = 'failed';
      replayState.exportMessage[destination] = payload.message || `${formatDestinationLabel(destination)} export failed.`;
      replayState.exportArtifacts[destination] = undefined;
      renderExportPanel();
      return;
    }

    replayState.exportStatus[destination] = 'completed';
    replayState.exportMessage[destination] = payload.message || `${formatDestinationLabel(destination)} export completed.`;
    replayState.exportArtifacts[destination] = {
      url: payload.artifactUrl,
      id: payload.artifactId,
      title: payload.artifactTitle,
      permission: payload.permission,
      expiresAt: payload.expiresAt,
      auditId: payload.auditId,
      routingLabels: payload.routingLabels,
      routingAssignees: payload.routingAssignees,
      routingReasons: payload.routingReasons,
      notificationSummary: payload.notificationSummary,
      notificationFailures: payload.notificationFailures,
    };
    renderExportPanel();
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown export error';
    replayState.exportStatus[destination] = 'failed';
    replayState.exportMessage[destination] = `${formatDestinationLabel(destination)} export failed: ${details}`;
    replayState.exportArtifacts[destination] = undefined;
    renderExportPanel();
  }
}

async function sendMessageWithTimeout<T>(
  message: BackgroundMessage,
  timeoutMs: number = MESSAGE_TIMEOUT_MS,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Request timed out. Reload extension and retry.'));
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

chrome.runtime.onMessage.addListener((message: BackgroundMessage) => {
  if (message.type !== 'BC_STATUS_UPDATE') {
    return;
  }
  const payload = message.payload as { message?: string } | undefined;
  if (!payload?.message) {
    return;
  }
  setStatus(payload.message);
});

function computeSeverity(session: ApiSession): SessionSeverity {
  const triage = session.triageSummary;
  let score = 0;
  if (session.error || (triage?.errorCount ?? 0) > 0) {
    score += 60;
    const type = (session.error.type || '').toLowerCase();
    if (type.includes('type') || type.includes('reference') || type.includes('syntax')) {
      score += 20;
    }
  }

  const consoleCount = triage?.consoleErrorCount ?? session.stats.consoleCount;
  const networkCount = triage?.requestCount ?? session.stats.networkCount;
  const stateCount = triage?.stateSnapshotCount ?? session.stats.stateSnapshots;
  const failedRequests = triage?.failedRequestCount ?? 0;

  score += Math.min(consoleCount, 50) * 0.4;
  score += Math.min(networkCount, 50) * 0.25;
  score += Math.min(stateCount, 30) * 0.2;
  score += Math.min(failedRequests, 20) * 1.5;

  if (score >= 85) {
    return { level: 'critical', score, label: 'Critical' };
  }
  if (score >= 60) {
    return { level: 'high', score, label: 'High' };
  }
  if (score >= 35) {
    return { level: 'medium', score, label: 'Medium' };
  }
  if (score > 0) {
    return { level: 'low', score, label: 'Low' };
  }
  return { level: 'none', score, label: 'None' };
}

function getSessionPreviewImage(session: ApiSession): string | undefined {
  const snapshot = session.signedMedia?.domSnapshots?.[0];
  return snapshot && snapshot.length > 0 ? snapshot : undefined;
}

function formatPager(): void {
  const from = paginationState.total === 0 ? 0 : sessionQueryState.offset + 1;
  const to = Math.min(sessionQueryState.offset + sessionQueryState.limit, paginationState.total);
  pagerInfoEl.textContent = `Showing ${from}-${to} of ${paginationState.total}`;
  prevPageEl.disabled = sessionQueryState.offset <= 0;
  nextPageEl.disabled = sessionQueryState.offset + sessionQueryState.limit >= paginationState.total;
}

async function loadConfig(): Promise<void> {
  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({ type: 'BC_CONFIG_REQUEST' }, 5000);
    const config = response.payload as ExtensionConfig;
    currentConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      ai: { ...DEFAULT_CONFIG.ai, ...(config.ai || {}) },
      github: { ...DEFAULT_CONFIG.github, ...(config.github || {}) },
      gitlab: { ...DEFAULT_CONFIG.gitlab, ...(config.gitlab || {}) },
      linear: { ...DEFAULT_CONFIG.linear, ...(config.linear || {}) },
      shareLinks: { ...DEFAULT_CONFIG.shareLinks, ...(config.shareLinks || {}) },
      routing: { ...DEFAULT_CONFIG.routing, ...(config.routing || {}) },
      notifications: { ...DEFAULT_CONFIG.notifications, ...(config.notifications || {}) },
    };
    const keyState = config.projectKey ? 'set' : 'missing';
    const aiState = currentConfig.ai.enabled
      ? `${currentConfig.ai.provider}:${currentConfig.ai.model || 'model-missing'}`
      : 'disabled';
    const ghState = currentConfig.github.enabled
      ? `${currentConfig.github.owner || 'owner-missing'}/${currentConfig.github.repo || 'repo-missing'}`
      : 'disabled';
    const glState = currentConfig.gitlab.enabled ? `${currentConfig.gitlab.projectId || 'project-missing'}` : 'disabled';
    const linearState = currentConfig.linear.enabled ? `${currentConfig.linear.teamId || 'team-missing'}` : 'disabled';
    const shareState = currentConfig.shareLinks.enabled
      ? `${currentConfig.shareLinks.defaultPermission}/${currentConfig.shareLinks.defaultExpiryHours}h`
      : 'disabled';
    const routingState = currentConfig.routing.enabled ? 'enabled' : 'disabled';
    const notificationState = currentConfig.notifications.enabled
      ? `enabled/${currentConfig.notifications.maxRetries} retries`
      : 'disabled';
    configSummaryEl.textContent = `API: ${config.apiBaseUrl} | Project: ${config.projectId} | Key: ${keyState} | AI: ${aiState} | GH: ${ghState} | GL: ${glState} | Linear: ${linearState} | Share: ${shareState} | Routing: ${routingState} | Notify: ${notificationState}`;
  } catch {
    currentConfig = { ...DEFAULT_CONFIG };
    configSummaryEl.textContent = 'Config unavailable. Reload extension and retry.';
  }
}

async function loadCapturePreview(): Promise<void> {
  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>(
      {
        type: 'BC_CAPTURE_PREVIEW_REQUEST',
      },
      5000,
    );

    const preview = response.payload as
      | { projectId: string; queueSize: number; url: string; title: string }
      | undefined;

    if (!preview) {
      capturePreviewEl.textContent = 'Preview unavailable right now.';
      return;
    }

    capturePreviewEl.textContent = `Preview -> Project: ${preview.projectId} | Queue: ${preview.queueSize} | Tab: ${preview.title}`;
  } catch {
    capturePreviewEl.textContent = 'Preview unavailable right now.';
  }
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

function renderCaptureState(status: TabCaptureStatus): void {
  captureStateEl.style.display = 'block';
  captureStartBtnEl.textContent = 'Start Capture';

  if (status.state === 'idle') {
    captureStateLabelEl.textContent = 'Idle';
    captureStateLabelEl.style.color = '#777';
    captureInfoEl.textContent = 'Ready to capture';
    captureStartBtnEl.style.display = 'block';
    captureStopBtnEl.style.display = 'none';
    return;
  }

  if (status.state === 'recording') {
    const duration = formatCaptureDuration(status.durationMs ?? 0);
    captureStateLabelEl.textContent = 'Recording...';
    captureStateLabelEl.style.color = '#d32f2f';
    captureInfoEl.textContent = `Elapsed ${duration}`;
    captureStartBtnEl.style.display = 'none';
    captureStopBtnEl.style.display = 'block';
    return;
  }

  const duration = formatCaptureDuration(status.durationMs ?? 0);
  const eventCount = status.eventCount ?? 0;
  captureStateLabelEl.textContent = 'Review';
  captureStateLabelEl.style.color = '#388e3c';
  captureInfoEl.textContent = `${duration} · ${eventCount} events`;
  captureStartBtnEl.textContent = 'Start New Capture';
  captureStartBtnEl.style.display = 'block';
  captureStopBtnEl.style.display = 'none';
}

function renderScreenshotPreview(preview?: ScreenshotPreview): void {
  if (!preview) {
    screenshotPreviewMetaEl.textContent = 'No screenshot captured yet.';
    screenshotPreviewImageEl.style.display = 'none';
    screenshotPreviewImageEl.src = '';
    return;
  }

  screenshotPreviewMetaEl.textContent = `Captured at ${new Date(preview.capturedAt).toLocaleString()}`;
  screenshotPreviewImageEl.src = preview.dataUrl;
  screenshotPreviewImageEl.style.display = 'block';
}

function renderVideoPreview(preview?: VideoPreview): void {
  if (!preview) {
    videoPreviewMetaEl.textContent = 'No recording captured yet.';
    videoPreviewPlayerEl.style.display = 'none';
    videoPreviewPlayerEl.src = '';
    return;
  }

  videoPreviewMetaEl.textContent = `Recorded at ${new Date(preview.capturedAt).toLocaleString()}`;
  videoPreviewPlayerEl.src = preview.objectUrl;
  videoPreviewPlayerEl.style.display = 'block';
}

async function loadVideoPreview(): Promise<void> {
  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_VIDEO_PREVIEW_REQUEST',
    }, 5000);
    const payload = response.payload as { ok?: boolean; preview?: VideoPreview } | undefined;
    if (!payload?.preview) {
      return;
    }
    renderVideoPreview(payload.preview);
  } catch {
    // Ignore preview failures to keep popup responsive.
  }
}

function formatRecordingTimer(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function loadScreenshotPreview(): Promise<void> {
  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_SCREENSHOT_PREVIEW_REQUEST',
    }, 5000);
    const payload = response.payload as { ok?: boolean; preview?: ScreenshotPreview } | undefined;
    if (!payload?.preview) {
      return;
    }
    renderScreenshotPreview(payload.preview);
  } catch {
    // Ignore preview failures to keep popup responsive.
  }
}

async function loadCaptureState(): Promise<void> {
  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_STATE_REQUEST',
    }, 5000);
    const payload = response.payload as { ok?: boolean; status?: TabCaptureStatus; message?: string } | undefined;
    if (!payload?.status) {
      return;
    }
    renderCaptureState(payload.status);
    if (payload.ok === false && payload.message) {
      setStatus(payload.message);
    }
  } catch {
    // Ignore capture state failures to keep popup responsive.
  }
}

function renderSessionList(sessions: ApiSession[]): void {
  if (sessions.length === 0) {
    sessionListEl.innerHTML = '<div class="session-item">No sessions match these filters.</div>';
    return;
  }

  sessionListEl.innerHTML = sessions
    .map((session) => {
      const severity = computeSeverity(session);
      const title = escapeHtml(session.title || 'Untitled Session');
      const url = escapeHtml(session.url || 'unknown-url');
      const createdAt = escapeHtml(new Date(session.createdAt).toLocaleString());
      const summary = escapeHtml(session.triageSummary?.topErrorMessage || session.error?.message || 'No captured error');
      const previewImage = getSessionPreviewImage(session);
      const failedRequests = session.triageSummary?.failedRequestCount ?? 0;
      const p95 = session.triageSummary?.p95NetworkDurationMs;
      const triageMeta = failedRequests > 0
        ? `failures ${failedRequests}${typeof p95 === 'number' ? ` | p95 ${p95}ms` : ''}`
        : 'failures 0';

      return `
        <div class="session-item severity-${severity.level}" data-session-id="${escapeHtml(session.sessionId)}">
          <div class="session-main">
            <div class="preview">
              ${
                previewImage
                  ? `<img src="${escapeHtml(previewImage)}" alt="session preview" loading="lazy" />`
                  : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:10px;color:#455a64;">${severity.label}</div>`
              }
            </div>
            <div style="min-width:0;flex:1;">
              <div class="session-title">
                <span class="severity-badge severity-${severity.level}">${severity.label}</span>
                ${title}
              </div>
              <div class="session-meta">${url}</div>
              <div class="session-meta">${summary}</div>
              <div class="session-meta">${createdAt}</div>
              <div class="session-meta">console ${session.stats.consoleCount} | network ${session.stats.networkCount} | state ${session.stats.stateSnapshots}</div>
              <div class="session-meta">${triageMeta}</div>
            </div>
          </div>
          <div class="session-actions">
            <button data-action="view" data-session-id="${escapeHtml(session.sessionId)}">View Details</button>
            <button data-action="delete" data-session-id="${escapeHtml(session.sessionId)}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadSessionList(forceRefresh = false): Promise<void> {
  sessionListEl.innerHTML = '<div class="session-item">Loading sessions...</div>';

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_GET_SESSIONS_REQUEST',
      payload: {
        q: sessionQueryState.q || undefined,
        hasError: sessionQueryState.hasError,
        sortBy: sessionQueryState.sortBy,
        sortOrder: sessionQueryState.sortOrder,
        limit: sessionQueryState.limit,
        offset: sessionQueryState.offset,
        forceRefresh,
      },
    });

    const payload = (response.payload ?? {}) as SessionListResponse;
    if (!payload.ok || !payload.sessions) {
      sessionListEl.innerHTML = `<div class="session-item">Failed to load sessions: ${escapeHtml(payload.message ?? 'Unknown error')}</div>`;
      paginationState.total = 0;
      formatPager();
      return;
    }

    paginationState.total = payload.total ?? payload.sessions.length;
    renderSessionList(payload.sessions);
    formatPager();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sessionListEl.innerHTML = `<div class="session-item">Failed to load sessions: ${escapeHtml(message)}</div>`;
    paginationState.total = 0;
    formatPager();
  }
}

function applySessionFilters(): void {
  sessionQueryState.q = sessionSearchEl.value.trim();
  sessionQueryState.sortBy = sortByEl.value;
  sessionQueryState.sortOrder = sortOrderEl.value === 'asc' ? 'asc' : 'desc';
  sessionQueryState.limit = Number.parseInt(pageSizeEl.value, 10) || 10;
  sessionQueryState.offset = 0;

  if (errorFilterEl.value === 'errors') {
    sessionQueryState.hasError = true;
  } else if (errorFilterEl.value === 'clean') {
    sessionQueryState.hasError = false;
  } else {
    sessionQueryState.hasError = undefined;
  }

  void loadSessionList();
}

function summarizeEvent(event: ApiSessionDetail['events'][number]): string {
  const payload = event.payload || {};
  if (event.type === 'console') {
    const level = typeof payload.level === 'string' ? payload.level : 'log';
    const message = typeof payload.message === 'string' ? payload.message : 'console event';
    return `[${level}] ${message}`;
  }
  if (event.type === 'network') {
    const method = typeof payload.method === 'string' ? payload.method : 'GET';
    const status = typeof payload.status === 'number' ? payload.status : 0;
    const url = typeof payload.url === 'string' ? payload.url : 'request';
    return `${method} ${status} ${url}`;
  }
  if (event.type === 'state') {
    const source = typeof payload.source === 'string' ? payload.source : 'state';
    return `${source} snapshot`;
  }
  if (event.type === 'error') {
    const message = typeof payload.message === 'string' ? payload.message : 'runtime error';
    return message;
  }

  return JSON.stringify(payload).slice(0, 120);
}

function getTimelineWindow(state: ReplayState): { start: number; end: number } {
  const max = Math.max(state.maxTimeMs, 1);
  const windowSize = Math.max(max / state.zoomLevel, 1000);
  const maxStart = Math.max(0, max - windowSize);
  const start = Math.round((state.panPercent / 100) * maxStart);
  const end = Math.max(start + 1000, Math.min(max, start + windowSize));
  return { start, end };
}

function getDomSnapshotForTime(state: ReplayState): string | undefined {
  const snapshots = state.session.signedMedia?.domSnapshots;
  if (!snapshots || snapshots.length === 0) {
    return undefined;
  }

  const ratio = state.maxTimeMs <= 0 ? 0 : state.currentTimeMs / state.maxTimeMs;
  const index = clamp(Math.floor(ratio * snapshots.length), 0, snapshots.length - 1);
  return snapshots[index];
}

function renderEventsIntoPanel(panelId: string, state: ReplayState, type: string): void {
  const panel = sessionDetailEl.querySelector(`#${panelId}`) as HTMLDivElement | null;
  if (!panel) {
    return;
  }

  const lowerBound = Math.max(0, state.currentTimeMs - TIMELINE_SYNC_WINDOW_MS);
  const upperBound = state.currentTimeMs;

  const items = state.session.events
    .filter((event) => event.type === type && event.timestamp >= lowerBound && event.timestamp <= upperBound)
    .slice(-30)
    .map((event) => {
      const summary = escapeHtml(summarizeEvent(event));
      return `<div class="workspace-list-item">${escapeHtml(formatMs(event.timestamp))} - ${summary}</div>`;
    })
    .join('');

  panel.innerHTML = items || '<div class="workspace-list-item">No events in current synchronized window.</div>';
}

function updateReplayWorkspace(): void {
  if (!replayState) {
    return;
  }

  const state = replayState;
  const windowRange = getTimelineWindow(state);
  const scrubber = sessionDetailEl.querySelector('#timelineScrubber') as HTMLInputElement | null;
  const readout = sessionDetailEl.querySelector('#timelineReadout') as HTMLDivElement | null;
  const zoom = sessionDetailEl.querySelector('#replayZoom') as HTMLInputElement | null;
  const pan = sessionDetailEl.querySelector('#replayPan') as HTMLInputElement | null;
  const rate = sessionDetailEl.querySelector('#replayRate') as HTMLSelectElement | null;
  const bookmarks = sessionDetailEl.querySelector('#bookmarkList') as HTMLDivElement | null;
  const domPreview = sessionDetailEl.querySelector('#domPreview') as HTMLImageElement | null;
  const domFallback = sessionDetailEl.querySelector('#domPreviewFallback') as HTMLDivElement | null;
  const video = sessionDetailEl.querySelector('#replayVideo') as HTMLVideoElement | null;

  state.currentTimeMs = clamp(state.currentTimeMs, windowRange.start, windowRange.end);

  if (scrubber) {
    scrubber.min = String(Math.floor(windowRange.start));
    scrubber.max = String(Math.ceil(windowRange.end));
    scrubber.value = String(Math.floor(state.currentTimeMs));
  }

  if (readout) {
    readout.textContent = `Time ${formatMs(state.currentTimeMs)} | Window ${formatMs(windowRange.start)} - ${formatMs(windowRange.end)}`;
  }

  if (zoom) {
    zoom.value = String(state.zoomLevel);
  }
  if (pan) {
    pan.value = String(state.panPercent);
  }
  if (rate) {
    rate.value = String(state.playbackRate);
  }

  if (bookmarks) {
    bookmarks.innerHTML = state.bookmarks
      .map(
        (bookmark) =>
          `<button class="bookmark-chip" data-action="jump-bookmark" data-bookmark-id="${escapeHtml(bookmark.id)}">${escapeHtml(bookmark.label)} @ ${escapeHtml(formatMs(bookmark.timeMs))}</button>`,
      )
      .join('');
    if (state.bookmarks.length === 0) {
      bookmarks.innerHTML = '<div class="workspace-list-item">No bookmarks yet.</div>';
    }
  }

  const snapshot = getDomSnapshotForTime(state);
  if (snapshot && domPreview && domFallback) {
    domPreview.src = snapshot;
    domPreview.style.display = 'block';
    domFallback.style.display = 'none';
  } else if (domPreview && domFallback) {
    domPreview.removeAttribute('src');
    domPreview.style.display = 'none';
    domFallback.style.display = 'block';
  }

  if (video) {
    video.playbackRate = state.playbackRate;
    if (!state.suppressVideoSync) {
      const targetSeconds = state.currentTimeMs / 1000;
      if (Math.abs(video.currentTime - targetSeconds) > 0.35) {
        state.suppressVideoSync = true;
        video.currentTime = targetSeconds;
        window.setTimeout(() => {
          if (replayState) {
            replayState.suppressVideoSync = false;
          }
        }, 0);
      }
    }
  }

  renderEventsIntoPanel('logsPanel', state, 'console');
  renderEventsIntoPanel('networkPanel', state, 'network');
  renderEventsIntoPanel('statePanel', state, 'state');
  renderAiStatusPanel();
  renderExportPanel();
}

async function loadReplayPreferences(sessionId: string): Promise<void> {
  if (!replayState) {
    return;
  }

  const data = await chrome.storage.local.get([REPLAY_BOOKMARKS_KEY, REPLAY_PREFERENCES_KEY]);
  const bookmarkMap = (data[REPLAY_BOOKMARKS_KEY] || {}) as Record<string, ReplayBookmark[]>;
  const preferenceMap = (data[REPLAY_PREFERENCES_KEY] || {}) as Record<string, { zoomLevel?: number; panPercent?: number }>;

  replayState.bookmarks = Array.isArray(bookmarkMap[sessionId])
    ? bookmarkMap[sessionId].slice().sort((a, b) => a.timeMs - b.timeMs)
    : [];

  const preferences = preferenceMap[sessionId];
  if (preferences) {
    replayState.zoomLevel = clamp(preferences.zoomLevel ?? replayState.zoomLevel, 1, 8);
    replayState.panPercent = clamp(preferences.panPercent ?? replayState.panPercent, 0, 100);
  }
}

async function persistReplayPreferences(): Promise<void> {
  if (!replayState) {
    return;
  }

  const sessionId = replayState.session.sessionId;
  const data = await chrome.storage.local.get([REPLAY_BOOKMARKS_KEY, REPLAY_PREFERENCES_KEY]);
  const bookmarkMap = (data[REPLAY_BOOKMARKS_KEY] || {}) as Record<string, ReplayBookmark[]>;
  const preferenceMap = (data[REPLAY_PREFERENCES_KEY] || {}) as Record<string, { zoomLevel?: number; panPercent?: number }>;

  bookmarkMap[sessionId] = replayState.bookmarks;
  preferenceMap[sessionId] = {
    zoomLevel: replayState.zoomLevel,
    panPercent: replayState.panPercent,
  };

  await chrome.storage.local.set({
    [REPLAY_BOOKMARKS_KEY]: bookmarkMap,
    [REPLAY_PREFERENCES_KEY]: preferenceMap,
  });
}

async function loadAiHistory(sessionId: string): Promise<StoredAiAnalysis[]> {
  const data = await chrome.storage.local.get([AI_ANALYSIS_HISTORY_KEY]);
  const historyMap = (data[AI_ANALYSIS_HISTORY_KEY] || {}) as Record<string, StoredAiAnalysis[]>;
  const raw = Array.isArray(historyMap[sessionId]) ? historyMap[sessionId] : [];

  return raw
    .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.createdAt === 'string')
    .map((entry) => ({
      ...entry,
      completedActionIndexes: Array.isArray(entry.completedActionIndexes) ? entry.completedActionIndexes : [],
    }))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

async function persistAiHistory(sessionId: string): Promise<void> {
  if (!replayState) {
    return;
  }

  const data = await chrome.storage.local.get([AI_ANALYSIS_HISTORY_KEY]);
  const historyMap = (data[AI_ANALYSIS_HISTORY_KEY] || {}) as Record<string, StoredAiAnalysis[]>;
  historyMap[sessionId] = replayState.aiHistory.slice(0, 20);

  await chrome.storage.local.set({
    [AI_ANALYSIS_HISTORY_KEY]: historyMap,
  });
}

function setActiveAnalysisById(analysisId: string): void {
  if (!replayState) {
    return;
  }

  const match = replayState.aiHistory.find((entry) => entry.id === analysisId);
  if (!match) {
    return;
  }

  replayState.activeAnalysisId = analysisId;
  replayState.aiResult = match;
}

async function copyTextToClipboard(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch {
    setStatus('Clipboard write failed. Copy manually.');
  }
}

function setReplayTime(nextTimeMs: number, source: 'timeline' | 'video' | 'bookmark' | 'step'): void {
  if (!replayState) {
    return;
  }

  replayState.currentTimeMs = clamp(nextTimeMs, 0, replayState.maxTimeMs);
  if (source !== 'video') {
    replayState.suppressVideoSync = false;
  }

  updateReplayWorkspace();
}

function attachReplayVideoListeners(): void {
  const video = sessionDetailEl.querySelector('#replayVideo') as HTMLVideoElement | null;
  if (!video || video.dataset.bound === 'true') {
    return;
  }

  video.dataset.bound = 'true';
  video.addEventListener('timeupdate', () => {
    if (!replayState || replayState.suppressVideoSync) {
      return;
    }
    setReplayTime(video.currentTime * 1000, 'video');
  });

  video.addEventListener('play', () => {
    if (replayState) {
      replayState.isPlaying = true;
    }
  });

  video.addEventListener('pause', () => {
    if (replayState) {
      replayState.isPlaying = false;
    }
  });
}

function openSessionDetailsTab(sessionId: string): void {
  try {
    const pageUrl = chrome.runtime.getURL(`src/session-details/index.html?sessionId=${encodeURIComponent(sessionId)}`);
    void chrome.tabs.create({ url: pageUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to open session details tab.';
    setStatus(message);
  }
}

function renderReplayWorkspaceShell(session: ApiSessionDetail): void {
  const severity = computeSeverity(session);
  const title = escapeHtml(session.title || 'Untitled Session');
  const url = escapeHtml(session.url);
  const videoUrl = session.signedMedia?.video;

  sessionDetailEl.style.display = 'block';
  sessionDetailEl.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <div>
          <span class="severity-badge severity-${severity.level}">${severity.label}</span>
          <strong>${title}</strong>
        </div>
        <button data-action="close-detail">Close</button>
      </div>
      <div class="session-meta" style="margin-top:4px;">${url}</div>
      <div class="timeline-readout" id="timelineReadout"></div>
      <div class="row">
        <input id="timelineScrubber" type="range" min="0" max="1" step="1" value="0" />
      </div>
      <div class="row">
        <button data-action="replay-play-pause">Play/Pause</button>
        <button data-action="replay-step-back">-1s</button>
        <button data-action="replay-step-forward">+1s</button>
      </div>
      <div class="row">
        <select id="replayRate">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <input id="replayZoom" type="range" min="1" max="8" step="1" value="1" title="Zoom" />
      </div>
      <div class="row">
        <input id="replayPan" type="range" min="0" max="100" step="1" value="0" title="Pan" />
      </div>
      <div class="row">
        <input id="bookmarkLabel" type="text" placeholder="Bookmark label" />
        <button data-action="add-bookmark">Add Bookmark</button>
      </div>
      <div class="bookmark-list" id="bookmarkList"></div>
      <div class="detail-grid" style="margin-top:8px;">
        <div class="workspace-panel">
          <h4>Video Replay</h4>
          ${
            videoUrl
              ? `<video id="replayVideo" controls preload="metadata" src="${escapeHtml(videoUrl)}"></video>`
              : '<div class="workspace-list-item">Replay video unavailable for this session.</div>'
          }
        </div>
        <div class="workspace-panel">
          <h4>DOM Replay</h4>
          <img id="domPreview" class="dom-preview" alt="DOM preview" style="display:none;" />
          <div id="domPreviewFallback" class="workspace-list-item">DOM snapshot unavailable for this point in timeline.</div>
        </div>
        <div class="workspace-panel">
          <h4>Logs (synchronized)</h4>
          <div id="logsPanel" class="workspace-list"></div>
        </div>
        <div class="workspace-panel">
          <h4>Network (synchronized)</h4>
          <div id="networkPanel" class="workspace-list"></div>
        </div>
        <div class="workspace-panel" style="grid-column: 1 / span 2;">
          <h4>State (synchronized)</h4>
          <div id="statePanel" class="workspace-list"></div>
        </div>
        <div class="workspace-panel" style="grid-column: 1 / span 2;">
          <h4>AI Analysis</h4>
          <div class="row">
            <input id="aiModelOverride" type="text" placeholder="Model override (optional)" value="${escapeHtml(
              currentConfig.ai.model || '',
            )}" />
          </div>
          <div class="row" style="align-items:center;">
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;">
              <input id="aiIncludeCodeContext" type="checkbox" ${
                currentConfig.ai.codeContextEnabled && currentConfig.ai.embeddingsEnabled && currentConfig.ai.repositoryRef
                  ? 'checked'
                  : ''
              } />
              Include code context
            </label>
          </div>
          <div class="row">
            <button data-action="run-ai-analysis">Run AI Analysis</button>
            <button data-action="copy-ai-summary">Copy Summary</button>
          </div>
          <div class="row">
            <select id="aiHistorySelect">
              <option value="">No past analyses</option>
            </select>
            <select id="aiCompareSelect">
              <option value="">Compare against...</option>
            </select>
          </div>
          <div id="aiAnalysisStatus" class="workspace-list-item" style="margin-top:6px;">AI analysis idle.</div>
          <div id="aiComparisonPanel" class="workspace-list" style="margin-top:6px;"></div>
          <div id="aiAnalysisResult" class="workspace-list" style="margin-top:6px;"></div>
        </div>
        <div class="workspace-panel" style="grid-column: 1 / span 2;">
          <h4>Issue Export</h4>
          <div class="row">
            <button data-action="run-destination-export" data-destination="github">Export GitHub</button>
            <button data-action="run-destination-export" data-destination="gitlab">Export GitLab</button>
            <button data-action="run-destination-export" data-destination="linear">Export Linear</button>
          </div>
          <div class="row" style="align-items:center;">
            <select id="sharePermission">
              <option value="viewer">Viewer</option>
              <option value="commenter">Commenter</option>
              <option value="editor">Editor</option>
            </select>
            <input id="shareExpiryHours" type="number" min="1" max="720" step="1" placeholder="Expiry (hours)" />
            <button data-action="run-destination-export" data-destination="share-link">Create Share Link</button>
          </div>
          <div id="destinationExportStatus" class="workspace-list-item" style="margin-top:6px;">All exports idle.</div>
          <div id="destinationExportResult" class="workspace-list" style="margin-top:6px;"></div>
        </div>
      </div>
    </div>
  `;
}

async function openReplayWorkspace(sessionId: string): Promise<void> {
  sessionDetailEl.style.display = 'block';
  sessionDetailEl.textContent = 'Loading synchronized replay workspace...';

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_GET_SESSION_DETAIL_REQUEST',
      payload: { sessionId },
    });

    const payload = (response.payload ?? {}) as { ok?: boolean; message?: string; session?: ApiSessionDetail | null };
    if (!payload.ok || !payload.session) {
      sessionDetailEl.textContent = payload.message ?? 'Session details not available.';
      return;
    }

    const session = payload.session;
    const replayEvents = Array.isArray(session.events) ? session.events : [];
    const computedMaxTimestamp = replayEvents.reduce((max, event) => Math.max(max, event.timestamp), 0);
    const fallbackDuration = typeof (session as { duration?: number }).duration === 'number'
      ? (session as { duration?: number }).duration || 0
      : 0;

    replayState = {
      session: {
        ...session,
        events: replayEvents,
      },
      currentTimeMs: 0,
      maxTimeMs: Math.max(computedMaxTimestamp, fallbackDuration, 1000),
      zoomLevel: 1,
      panPercent: 0,
      playbackRate: 1,
      bookmarks: [],
      isPlaying: false,
      suppressVideoSync: false,
      aiStatus: 'idle',
      aiMessage: 'Ready to run AI analysis.',
      aiHistory: [],
      activeAnalysisId: undefined,
      compareAnalysisId: undefined,
      includeCodeContext:
        currentConfig.ai.codeContextEnabled &&
        currentConfig.ai.embeddingsEnabled &&
        Boolean(currentConfig.ai.repositoryRef),
      modelOverride: currentConfig.ai.model || '',
      exportStatus: {
        github: 'idle',
        gitlab: 'idle',
        linear: 'idle',
        'share-link': 'idle',
      },
      exportMessage: {
        github: 'idle',
        gitlab: 'idle',
        linear: 'idle',
        'share-link': 'idle',
      },
      exportArtifacts: {},
      sharePermission: currentConfig.shareLinks.defaultPermission,
      shareExpiryHours: currentConfig.shareLinks.defaultExpiryHours,
    };

    renderReplayWorkspaceShell(session);
    await loadReplayPreferences(session.sessionId);
    const aiHistory = await loadAiHistory(session.sessionId);
    if (replayState) {
      replayState.aiHistory = aiHistory;
      if (aiHistory.length > 0) {
        replayState.activeAnalysisId = aiHistory[0].id;
        replayState.aiResult = aiHistory[0];
        replayState.aiStatus = aiHistory[0].status;
        replayState.aiMessage = `Loaded ${aiHistory.length} previous AI analysis run(s).`;
      }
    }
    attachReplayVideoListeners();
    updateReplayWorkspace();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sessionDetailEl.textContent = `Failed to open replay workspace: ${message}`;
  }
}

async function runAiAnalysisForCurrentSession(): Promise<void> {
  if (!replayState) {
    return;
  }

  const aiModelOverrideEl = sessionDetailEl.querySelector('#aiModelOverride') as HTMLInputElement | null;
  const aiIncludeCodeContextEl = sessionDetailEl.querySelector('#aiIncludeCodeContext') as HTMLInputElement | null;

  replayState.modelOverride = aiModelOverrideEl?.value.trim() || '';
  replayState.includeCodeContext = Boolean(aiIncludeCodeContextEl?.checked);

  replayState.aiStatus = 'running';
  replayState.aiMessage = 'Running AI analysis...';
  renderAiStatusPanel();

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>(
      {
        type: 'BC_AI_ANALYZE_SESSION_REQUEST',
        payload: {
          sessionId: replayState.session.sessionId,
          modelOverride: replayState.modelOverride,
          includeCodeContext: replayState.includeCodeContext,
        },
      },
      30_000,
    );

    const payload = (response.payload ?? {}) as {
      ok?: boolean;
      status?: 'completed' | 'fallback' | 'failed';
      message?: string;
      analysis?: AiAnalysisResult;
    };

    if (!payload.ok || !payload.analysis) {
      replayState.aiStatus = 'failed';
      replayState.aiMessage = payload.message || 'AI analysis failed.';
      replayState.aiResult = undefined;
      renderAiStatusPanel();
      return;
    }

    replayState.aiStatus = payload.status === 'fallback' ? 'fallback' : 'completed';
    replayState.aiMessage = payload.message || 'AI analysis completed.';
    const storedRun: StoredAiAnalysis = {
      ...payload.analysis,
      id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      completedActionIndexes: [],
    };

    replayState.aiHistory = [storedRun, ...replayState.aiHistory].slice(0, 20);
    replayState.activeAnalysisId = storedRun.id;
    replayState.aiResult = storedRun;
    replayState.compareAnalysisId = undefined;
    await persistAiHistory(replayState.session.sessionId);
    renderAiStatusPanel();
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown analysis error';
    replayState.aiStatus = 'failed';
    replayState.aiMessage = `AI analysis failed: ${details}`;
    replayState.aiResult = undefined;
    renderAiStatusPanel();
  }
}

async function deleteSession(sessionId: string): Promise<void> {
  if (!window.confirm('Delete this session?')) {
    return;
  }

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_DELETE_SESSION_REQUEST',
      payload: { sessionId },
    });
    const payload = (response.payload ?? {}) as { ok?: boolean; message?: string };

    if (!payload.ok) {
      setStatus(payload.message ?? 'Failed to delete session');
      return;
    }

    setStatus('Session deleted');
    if (replayState?.session.sessionId === sessionId) {
      replayState = null;
      sessionDetailEl.style.display = 'none';
      sessionDetailEl.innerHTML = '';
    }
    await loadSessionList(true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setStatus(`Delete failed: ${message}`);
  }
}

captureStartBtnEl.addEventListener('click', async () => {
  captureStartBtnEl.disabled = true;
  setStatus('Starting capture...');

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_START_REQUEST',
    });
    const payload = response.payload as { ok?: boolean; message?: string; status?: TabCaptureStatus } | undefined;
    if (!payload?.ok) {
      setStatus(payload?.message ?? 'Failed to start capture.');
      return;
    }
    setStatus(payload.message ?? 'Capture started.');
    if (payload.status) {
      renderCaptureState(payload.status);
    }
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to start capture.');
  } finally {
    captureStartBtnEl.disabled = false;
  }
});

captureStopBtnEl.addEventListener('click', async () => {
  captureStopBtnEl.disabled = true;
  setStatus('Stopping capture...');

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_STOP_REQUEST',
    });
    const payload = response.payload as { ok?: boolean; message?: string; status?: TabCaptureStatus } | undefined;
    if (!payload?.ok) {
      setStatus(payload?.message ?? 'Failed to stop capture.');
      return;
    }
    setStatus(payload.message ?? 'Capture stopped.');
    if (payload.status) {
      renderCaptureState(payload.status);
    }
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to stop capture.');
  } finally {
    captureStopBtnEl.disabled = false;
  }
});

screenshotCaptureButton.addEventListener('click', async () => {
  screenshotCaptureButton.disabled = true;
  setStatus('Capturing screenshot...');

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_SCREENSHOT_REQUEST',
    }, 20_000);
    const payload = response.payload as { ok?: boolean; message?: string; preview?: ScreenshotPreview } | undefined;
    if (!payload?.ok) {
      setStatus(payload?.message ?? 'Failed to capture screenshot.');
      return;
    }

    if (payload.preview) {
      renderScreenshotPreview(payload.preview);
    }
    setStatus(payload.message ?? 'Screenshot captured.');
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to capture screenshot.');
  } finally {
    screenshotCaptureButton.disabled = false;
  }
});

let recordingTimerId: number | undefined;
let recordingStartTime: number | undefined;

function startRecordingTimer(): void {
  recordingStartTime = Date.now();
  videoTimerEl.textContent = 'Recording 0:00';
  recordingTimerId = window.setInterval(() => {
    if (!recordingStartTime) {
      return;
    }
    const elapsed = Date.now() - recordingStartTime;
    videoTimerEl.textContent = `Recording ${formatRecordingTimer(elapsed)}`;
  }, 1000);
}

function stopRecordingTimer(): void {
  if (recordingTimerId !== undefined) {
    window.clearInterval(recordingTimerId);
    recordingTimerId = undefined;
  }
  recordingStartTime = undefined;
  videoTimerEl.textContent = '';
}

videoStartButtonEl.addEventListener('click', async () => {
  videoStartButtonEl.disabled = true;
  setStatus('Starting recording...');

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_VIDEO_START_REQUEST',
    }, 20_000);
    const payload = response.payload as { ok?: boolean; message?: string } | undefined;
    if (!payload?.ok) {
      setStatus(payload?.message ?? 'Failed to start recording.');
      return;
    }
    setStatus(payload.message ?? 'Recording started.');
    videoStartButtonEl.style.display = 'none';
    videoStopButtonEl.style.display = 'block';
    startRecordingTimer();
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to start recording.');
  } finally {
    videoStartButtonEl.disabled = false;
  }
});

videoStopButtonEl.addEventListener('click', async () => {
  videoStopButtonEl.disabled = true;
  setStatus('Stopping recording...');

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>({
      type: 'BC_CAPTURE_VIDEO_STOP_REQUEST',
    }, 20_000);
    const payload = response.payload as { ok?: boolean; message?: string; preview?: VideoPreview } | undefined;
    if (!payload?.ok) {
      setStatus(payload?.message ?? 'Failed to stop recording.');
      return;
    }
    setStatus(payload.message ?? 'Recording stopped.');
    if (payload.preview) {
      renderVideoPreview(payload.preview);
    }
    videoStopButtonEl.style.display = 'none';
    videoStartButtonEl.style.display = 'block';
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : 'Failed to stop recording.');
  } finally {
    stopRecordingTimer();
    videoStopButtonEl.disabled = false;
  }
});

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true;
  setStatus('Capturing and uploading...');

  try {
    const response = await sendMessageWithTimeout<BackgroundMessage>(
      { type: 'BC_CAPTURE_NOW' },
      20_000,
    );
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
    void loadSessionList(true);
  }
});

openOptionsEl.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

applyFiltersEl.addEventListener('click', applySessionFilters);

sessionSearchEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') {
    return;
  }
  applySessionFilters();
});

prevPageEl.addEventListener('click', () => {
  sessionQueryState.offset = Math.max(0, sessionQueryState.offset - sessionQueryState.limit);
  void loadSessionList();
});

nextPageEl.addEventListener('click', () => {
  sessionQueryState.offset += sessionQueryState.limit;
  void loadSessionList();
});

sessionListEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  const sessionId = target.dataset.sessionId;
  if (!action || !sessionId) {
    return;
  }

  if (action === 'view') {
    openSessionDetailsTab(sessionId);
    return;
  }

  if (action === 'delete') {
    void deleteSession(sessionId);
  }
});

sessionDetailEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !replayState) {
    return;
  }

  const action = target.dataset.action;
  if (!action) {
    return;
  }

  if (action === 'close-detail') {
    replayState = null;
    sessionDetailEl.style.display = 'none';
    sessionDetailEl.innerHTML = '';
    return;
  }

  if (action === 'replay-play-pause') {
    const video = sessionDetailEl.querySelector('#replayVideo') as HTMLVideoElement | null;
    if (!video) {
      setStatus('Replay video is not available for this session.');
      return;
    }

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
    return;
  }

  if (action === 'replay-step-back') {
    setReplayTime(replayState.currentTimeMs - 1000, 'step');
    return;
  }

  if (action === 'replay-step-forward') {
    setReplayTime(replayState.currentTimeMs + 1000, 'step');
    return;
  }

  if (action === 'add-bookmark') {
    const input = sessionDetailEl.querySelector('#bookmarkLabel') as HTMLInputElement | null;
    const label = input?.value.trim() || `Point ${replayState.bookmarks.length + 1}`;
    replayState.bookmarks = [
      ...replayState.bookmarks,
      {
        id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        label,
        timeMs: Math.round(replayState.currentTimeMs),
      },
    ].sort((a, b) => a.timeMs - b.timeMs);

    if (input) {
      input.value = '';
    }

    void persistReplayPreferences();
    updateReplayWorkspace();
    return;
  }

  if (action === 'run-ai-analysis') {
    void runAiAnalysisForCurrentSession();
    return;
  }

  if (action === 'copy-ai-summary') {
    const active = getActiveAnalysis();
    if (!active) {
      setStatus('No AI analysis available to copy.');
      return;
    }

    const payload = [
      `Summary: ${active.summary}`,
      `Root Cause: ${active.rootCause}`,
      `Confidence: ${formatConfidence(active.confidence)}`,
      `Model: ${active.provider}/${active.model}`,
    ].join('\n');

    void copyTextToClipboard(payload, 'AI summary copied to clipboard.');
    return;
  }

  if (action === 'copy-suggested-file') {
    const filePath = target.dataset.filePath;
    if (!filePath) {
      return;
    }

    void copyTextToClipboard(filePath, `Copied file path: ${filePath}`);
    return;
  }

  if (action === 'run-destination-export') {
    const destination = target.dataset.destination as ExportDestination | undefined;
    if (!destination) {
      return;
    }
    void runDestinationExportForCurrentSession(destination);
    return;
  }

  if (action === 'copy-destination-url') {
    const artifactUrl = target.dataset.artifactUrl;
    if (!artifactUrl) {
      return;
    }

    const destination = target.dataset.destination as ExportDestination | undefined;
    const destinationLabel = destination ? formatDestinationLabel(destination) : 'Export artifact';
    void copyTextToClipboard(artifactUrl, `${destinationLabel} URL copied to clipboard.`);
    return;
  }

  if (action === 'jump-bookmark') {
    const bookmarkId = target.dataset.bookmarkId;
    if (!bookmarkId) {
      return;
    }

    const bookmark = replayState.bookmarks.find((candidate) => candidate.id === bookmarkId);
    if (!bookmark) {
      return;
    }

    setReplayTime(bookmark.timeMs, 'bookmark');
  }
});

sessionDetailEl.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !replayState) {
    return;
  }

  if (target.id === 'timelineScrubber' && target instanceof HTMLInputElement) {
    setReplayTime(Number.parseInt(target.value, 10) || 0, 'timeline');
    return;
  }

  if (target.id === 'replayZoom' && target instanceof HTMLInputElement) {
    replayState.zoomLevel = clamp(Number.parseInt(target.value, 10) || 1, 1, 8);
    void persistReplayPreferences();
    updateReplayWorkspace();
    return;
  }

  if (target.id === 'replayPan' && target instanceof HTMLInputElement) {
    replayState.panPercent = clamp(Number.parseInt(target.value, 10) || 0, 0, 100);
    void persistReplayPreferences();
    updateReplayWorkspace();
    return;
  }

  if (target.id === 'aiModelOverride' && target instanceof HTMLInputElement) {
    replayState.modelOverride = target.value.trim();
    return;
  }

  if (target.id === 'shareExpiryHours' && target instanceof HTMLInputElement) {
    const parsed = Number.parseInt(target.value, 10);
    replayState.shareExpiryHours = clamp(Number.isNaN(parsed) ? replayState.shareExpiryHours : parsed, 1, 720);
  }
});

sessionDetailEl.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !replayState) {
    return;
  }

  if (target.id === 'replayRate' && target instanceof HTMLSelectElement) {
    replayState.playbackRate = Number.parseFloat(target.value) || 1;
    updateReplayWorkspace();
    return;
  }

  if (target.id === 'aiHistorySelect' && target instanceof HTMLSelectElement) {
    if (target.value) {
      setActiveAnalysisById(target.value);
      const active = getActiveAnalysis();
      if (active) {
        replayState.aiStatus = active.status;
        replayState.aiMessage = `Viewing saved analysis from ${formatAnalysisTimestamp(active.createdAt)}.`;
      }
      renderAiStatusPanel();
    }
    return;
  }

  if (target.id === 'aiCompareSelect' && target instanceof HTMLSelectElement) {
    replayState.compareAnalysisId = target.value || undefined;
    renderAiStatusPanel();
    return;
  }

  if (target.id === 'aiIncludeCodeContext' && target instanceof HTMLInputElement) {
    replayState.includeCodeContext = target.checked;
    return;
  }

  if (target.id === 'sharePermission' && target instanceof HTMLSelectElement) {
    const value = target.value as ShareLinkPermission;
    replayState.sharePermission = ['viewer', 'commenter', 'editor'].includes(value)
      ? value
      : 'viewer';
    return;
  }

  if (target.dataset.action === 'toggle-ai-action' && target instanceof HTMLInputElement) {
    const active = getActiveAnalysis();
    if (!active) {
      return;
    }

    const actionIndex = Number.parseInt(target.dataset.actionIndex || '', 10);
    if (Number.isNaN(actionIndex)) {
      return;
    }

    const completed = new Set(active.completedActionIndexes || []);
    if (target.checked) {
      completed.add(actionIndex);
    } else {
      completed.delete(actionIndex);
    }

    active.completedActionIndexes = Array.from(completed.values()).sort((left, right) => left - right);
    replayState.aiHistory = replayState.aiHistory.map((entry) => (entry.id === active.id ? active : entry));
    if (replayState.aiResult?.id === active.id) {
      replayState.aiResult = active;
    }

    void persistAiHistory(replayState.session.sessionId);
    renderAiStatusPanel();
  }
});

void loadConfig();
void loadCapturePreview();
void loadCaptureState();
void loadScreenshotPreview();
void loadVideoPreview();
void loadShortcutHint();
void loadSessionList();
