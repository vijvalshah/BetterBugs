import type { BackgroundMessage, ExtensionConfig } from '../shared/types';
import type { ApiSession, ApiSessionDetail } from '../shared/api-client';

const captureButton = document.getElementById('captureButton') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const capturePreviewEl = document.getElementById('capturePreview') as HTMLDivElement;
const configSummaryEl = document.getElementById('configSummary') as HTMLDivElement;
const openOptionsEl = document.getElementById('openOptions') as HTMLAnchorElement;
const shortcutHintEl = document.getElementById('shortcutHint') as HTMLDivElement;
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
  let score = 0;
  if (session.error) {
    score += 60;
    const type = (session.error.type || '').toLowerCase();
    if (type.includes('type') || type.includes('reference') || type.includes('syntax')) {
      score += 20;
    }
  }

  score += Math.min(session.stats.consoleCount, 50) * 0.4;
  score += Math.min(session.stats.networkCount, 50) * 0.25;
  score += Math.min(session.stats.stateSnapshots, 30) * 0.2;

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
    const keyState = config.projectKey ? 'set' : 'missing';
    configSummaryEl.textContent = `API: ${config.apiBaseUrl} | Project: ${config.projectId} | Key: ${keyState}`;
  } catch {
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
      const summary = escapeHtml(session.error?.message || 'No captured error');
      const previewImage = getSessionPreviewImage(session);

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
            </div>
          </div>
          <div class="session-actions">
            <button data-action="view" data-session-id="${escapeHtml(session.sessionId)}">Replay</button>
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
    const computedMaxTimestamp = session.events.reduce((max, event) => Math.max(max, event.timestamp), 0);
    const fallbackDuration = typeof (session as { duration?: number }).duration === 'number'
      ? (session as { duration?: number }).duration || 0
      : 0;

    replayState = {
      session,
      currentTimeMs: 0,
      maxTimeMs: Math.max(computedMaxTimestamp, fallbackDuration, 1000),
      zoomLevel: 1,
      panPercent: 0,
      playbackRate: 1,
      bookmarks: [],
      isPlaying: false,
      suppressVideoSync: false,
    };

    renderReplayWorkspaceShell(session);
    await loadReplayPreferences(session.sessionId);
    attachReplayVideoListeners();
    updateReplayWorkspace();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sessionDetailEl.textContent = `Failed to open replay workspace: ${message}`;
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
    void openReplayWorkspace(sessionId);
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
  }
});

void loadConfig();
void loadCapturePreview();
void loadShortcutHint();
void loadSessionList();
