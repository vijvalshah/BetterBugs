import type { ApiSessionDetail } from '../shared/api-client';
import type { BackgroundMessage } from '../shared/types';

export type SessionEvent = ApiSessionDetail['events'][number];

let cachedEvents: SessionEvent[] = [];
let activeFilter: string | null = null;

export function parseSessionIdFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const value = (params.get('sessionId') || '').trim();
  return value;
}

export function sortEventsByTimestamp(events: SessionEvent[]): SessionEvent[] {
  return [...events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

export function summarizeEvent(event: SessionEvent): string {
  const payload = event.payload || {};
  if (event.type === 'console') {
    const level = typeof payload.level === 'string' ? payload.level : 'log';
    const message = typeof payload.message === 'string' ? payload.message : 'console event';
    const stack = typeof payload.stack === 'string' ? `\n${payload.stack}` : '';
    return `[${level}] ${message}${stack}`;
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
    const stack = typeof payload.stack === 'string' ? `\n${payload.stack}` : '';
    return `${message}${stack}`;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return 'event payload';
  }
}

function formatPayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '';
  }
}

function hasChromeRuntime(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function';
}

async function requestSessionDetail(sessionId: string): Promise<{
  ok?: boolean;
  message?: string;
  session?: ApiSessionDetail | null;
}> {
  if (!sessionId) {
    throw new Error('Session id is required');
  }

  if (!hasChromeRuntime()) {
    throw new Error('Extension runtime unavailable');
  }

  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'BC_GET_SESSION_DETAIL_REQUEST',
        payload: { sessionId },
      } satisfies BackgroundMessage,
      (response: BackgroundMessage | undefined) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        const payload = (response?.payload ?? {}) as {
          ok?: boolean;
          message?: string;
          session?: ApiSessionDetail | null;
        };
        resolve(payload);
      },
    );
  });
}

function formatDate(value?: string): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatTimestamp(ms: number): string {
  if (Number.isNaN(ms)) return '0ms';
  return `${Math.round(ms)}ms`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderStatus(text: string, kind: 'info' | 'error' | 'success'): void {
  if (typeof document === 'undefined') return;
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function renderFilters(events: SessionEvent[], filter: string | null): void {
  if (typeof document === 'undefined') return;
  const filtersEl = document.getElementById('eventFilters');
  const countsEl = document.getElementById('counts');
  if (!filtersEl || !countsEl) return;

  const counts: Record<string, number> = {};
  events.forEach((event) => {
    counts[event.type] = (counts[event.type] || 0) + 1;
  });

  const buttons = ['all', ...Object.keys(counts)].map((type) => {
    const count = type === 'all' ? events.length : counts[type] ?? 0;
    const isActive = (filter ?? 'all') === type;
    return `<button data-filter="${type}" style="padding:6px 10px;border:1px solid #d0d7de;border-radius:14px;background:${isActive ? '#0f6cbd' : '#fff'};color:${isActive ? '#fff' : '#0f1419'};cursor:pointer;font-size:12px;">${type} (${count})</button>`;
  });

  filtersEl.innerHTML = buttons.join('');
  countsEl.textContent = `Total events: ${events.length}`;
}

function renderMeta(session: ApiSessionDetail): void {
  if (typeof document === 'undefined') return;
  const metaEl = document.getElementById('sessionMeta');
  const cardEl = document.getElementById('sessionCard');
  if (!metaEl || !cardEl) return;

  metaEl.innerHTML = `
    <div><strong>ID</strong><br />${escapeHtml(session.sessionId)}</div>
    <div><strong>URL</strong><br />${escapeHtml(session.url || 'unknown')}</div>
    <div><strong>Created</strong><br />${escapeHtml(formatDate(session.createdAt))}</div>
    <div><strong>Events</strong><br />console ${session.stats.consoleCount} | network ${session.stats.networkCount} | state ${session.stats.stateSnapshots}</div>
  `;

  cardEl.style.display = 'block';
}

function renderEvents(events: SessionEvent[]): void {
  if (typeof document === 'undefined') return;
  const listEl = document.getElementById('eventsList');
  if (!listEl) return;

  if (!events.length) {
    listEl.innerHTML = '<div class="empty">No events captured for this session.</div>';
    return;
  }

  const rows = events
    .map((event) => {
      const summary = escapeHtml(summarizeEvent(event));
      const badgeClass = escapeHtml(event.type);
      const payloadText = formatPayload(event.payload || {});
      const payloadHtml = payloadText
        ? `<details class="payload"><summary>Show details</summary><pre>${escapeHtml(payloadText)}</pre></details>`
        : '';
      return `
        <div class="event-row event-type-${escapeHtml(event.type)}">
          <div>
            <div class="badge ${badgeClass}">${escapeHtml(event.type)}</div>
            <div class="timestamp">${escapeHtml(formatTimestamp(event.timestamp))}</div>
          </div>
          <div class="event-body">${summary}${payloadHtml}</div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = rows;
  try {
    listEl.dataset.allEvents = JSON.stringify(cachedEvents);
  } catch {
    // ignore dataset serialization issues
  }
}

function renderDomSnapshots(signedMedia?: ApiSessionDetail['signedMedia']): void {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('domSnapshotContainer');
  if (!container) return;
  const snapshots = signedMedia?.domSnapshots || [];
  if (!snapshots.length) {
    container.innerHTML = '<div class="empty">No DOM snapshots.</div>';
    return;
  }

  const items = snapshots
    .map((src, index) => `<div class="thumb" data-index="${index}"><img src="${escapeHtml(src)}" alt="DOM snapshot ${index + 1}" loading="lazy" /></div>`)
    .join('');
  container.innerHTML = items;

  container.onclick = (event) => {
    const target = event.target as HTMLElement;
    const wrapper = target.closest('.thumb') as HTMLDivElement | null;
    if (!wrapper) return;
    const idx = Number.parseInt(wrapper.dataset.index || '0', 10);
    const video = document.getElementById('videoPlayer') as HTMLVideoElement | null;
    const all = container.querySelectorAll('.thumb');
    all.forEach((el) => el.classList.remove('active'));
    wrapper.classList.add('active');
    if (!Number.isNaN(idx) && video?.duration) {
      const ratio = Math.min(1, Math.max(0, idx / Math.max(snapshots.length - 1, 1)));
      video.currentTime = ratio * video.duration;
    }
  };
}

function renderMedia(session: ApiSessionDetail): void {
  if (typeof document === 'undefined') return;
  const videoEl = document.getElementById('videoPlayer') as HTMLVideoElement | null;
  const timeline = document.getElementById('timeline') as HTMLInputElement | null;
  const readout = document.getElementById('timelineReadout');
  if (!videoEl || !timeline || !readout) return;

  const videoSrc = session.signedMedia?.video;
  if (videoSrc) {
    videoEl.src = videoSrc;
  } else {
    videoEl.removeAttribute('src');
    videoEl.load();
  }

  const maxTs = session.events.reduce((max, e) => Math.max(max, e.timestamp || 0), 0);
  const timelineMax = Math.max(maxTs, 1000);
  timeline.max = String(timelineMax);
  timeline.value = '0';
  readout.textContent = '0ms';

  timeline.oninput = () => {
    const value = Number.parseInt(timeline.value, 10) || 0;
    readout.textContent = `${value}ms`;
    if (videoEl.duration && videoEl.duration > 0) {
      const ratio = value / timelineMax;
      videoEl.currentTime = ratio * videoEl.duration;
    }
  };

  videoEl.onseeked = () => {
    if (!videoEl.duration || timelineMax <= 0) return;
    const ratio = videoEl.currentTime / videoEl.duration;
    const ms = Math.round(ratio * timelineMax);
    timeline.value = String(ms);
    readout.textContent = `${ms}ms`;
  };

  renderDomSnapshots(session.signedMedia);
}

async function loadSession(sessionId: string): Promise<void> {
  const inputEl = typeof document !== 'undefined' ? (document.getElementById('sessionIdInput') as HTMLInputElement | null) : null;
  if (inputEl) {
    inputEl.value = sessionId;
  }

  if (!sessionId) {
    renderStatus('Please enter a session id.', 'error');
    return;
  }

  renderStatus('Loading session details...', 'info');

  try {
    const payload = await requestSessionDetail(sessionId);
    if (!payload?.ok || !payload.session) {
      const message = payload?.message || 'Session not found or unavailable.';
      renderStatus(message, 'error');
      const cardEl = typeof document !== 'undefined' ? document.getElementById('sessionCard') : null;
      if (cardEl) {
        cardEl.style.display = 'none';
      }
      const listEl = typeof document !== 'undefined' ? document.getElementById('eventsList') : null;
      if (listEl) listEl.innerHTML = '<div class="empty">No data available.</div>';
      return;
    }

    const session = payload.session;
    const orderedEvents = sortEventsByTimestamp(Array.isArray(session.events) ? session.events : []);
    cachedEvents = orderedEvents;
    activeFilter = null;
    renderMeta(session);
    renderFilters(cachedEvents, activeFilter);
    renderMedia({ ...session, events: orderedEvents });
    renderEvents(cachedEvents);
    renderStatus('Session loaded successfully.', 'success');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load session.';
    renderStatus(message, 'error');
    const cardEl = typeof document !== 'undefined' ? document.getElementById('sessionCard') : null;
    if (cardEl) {
      cardEl.style.display = 'none';
    }
  }
}

function bootstrap(): void {
  if (typeof document === 'undefined') return;
  const form = document.getElementById('sessionForm');
  const inputEl = document.getElementById('sessionIdInput') as HTMLInputElement | null;
  const loadButton = document.getElementById('loadButton') as HTMLButtonElement | null;
  const filtersEl = document.getElementById('eventFilters');

  if (!form || !inputEl || !loadButton) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const sessionId = inputEl.value.trim();
    loadButton.disabled = true;
    void loadSession(sessionId).finally(() => {
      loadButton.disabled = false;
    });
  });

  const seed = parseSessionIdFromSearch(typeof window !== 'undefined' ? window.location.search : '');
  if (seed) {
    inputEl.value = seed;
    loadButton.disabled = true;
    void loadSession(seed).finally(() => {
      loadButton.disabled = false;
    });
  }

  if (filtersEl) {
    filtersEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (!target || !target.dataset.filter) return;
      const filter = target.dataset.filter;
      activeFilter = filter === 'all' ? null : filter;
      const filtered = activeFilter ? cachedEvents.filter((e) => e.type === activeFilter) : cachedEvents;
      renderFilters(cachedEvents, activeFilter);
      renderEvents(filtered);
    });
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', bootstrap);
}
