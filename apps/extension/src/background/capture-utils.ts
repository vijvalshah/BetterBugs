import type {
  CaptureEvent,
  CaptureMediaMetadata,
  EnvironmentInfo,
  ExtensionConfig,
  SessionPayload,
} from '../shared/types';
import type { FrozenCaptureSnapshot } from '../shared/capture/rolling-buffer';

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const DEFAULT_LANGUAGE = 'en-US';
const FALLBACK_UPLOAD_URL = 'https://localhost/';
const ALLOWED_EVENT_TYPES = new Set(['console', 'network', 'state', 'error']);
const MAX_TEXT_LENGTH = 600;
const MAX_BODY_LENGTH = 2000;
const MAX_HEADERS = 20;
const MAX_STATE_JSON_LENGTH = 4000;
const MAX_CONSOLE_ARGS = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeIsoTimestamp(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function normalizeSessionUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return FALLBACK_UPLOAD_URL;
  }

  try {
    return new URL(value).toString();
  } catch {
    return FALLBACK_UPLOAD_URL;
  }
}

function normalizeEventTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.trunc(numericValue);
    }

    const parsedDate = Date.parse(value);
    if (!Number.isNaN(parsedDate) && parsedDate > 0) {
      return parsedDate;
    }
  }

  return fallback;
}

function asTrimmedString(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).slice(0, maxLength);
  }
  return value.trim().slice(0, maxLength);
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function sanitizeHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value).slice(0, MAX_HEADERS);
  const normalized: Record<string, string> = {};

  for (const [key, headerValue] of entries) {
    const lowered = key.toLowerCase();
    if (lowered.includes('authorization') || lowered.includes('cookie') || lowered.includes('token')) {
      normalized[key] = '[redacted]';
      continue;
    }
    normalized[key] = asTrimmedString(headerValue, 200);
  }

  return normalized;
}

function normalizeConsoleArgs(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_CONSOLE_ARGS).map((arg) => {
    if (typeof arg === 'string') {
      return asTrimmedString(arg, 300);
    }
    if (typeof arg === 'number' || typeof arg === 'boolean' || arg === null) {
      return arg;
    }
    if (Array.isArray(arg)) {
      return `[array:${arg.length}]`;
    }
    if (isRecord(arg)) {
      const keys = Object.keys(arg).slice(0, 6);
      return `[object:${keys.join(',')}]`;
    }
    return String(arg).slice(0, 120);
  });
}

function normalizeStateData(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return asTrimmedString(value, MAX_STATE_JSON_LENGTH);
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return null;
    }
    if (serialized.length <= MAX_STATE_JSON_LENGTH) {
      return JSON.parse(serialized) as unknown;
    }

    return {
      _summary: 'state-truncated',
      preview: serialized.slice(0, MAX_STATE_JSON_LENGTH),
      originalSize: serialized.length,
    };
  } catch {
    return '[unserializable-state]';
  }
}

function normalizeConsolePayload(payload: unknown): CaptureEvent['payload'] {
  const source = isRecord(payload) ? payload : {};
  const level = asTrimmedString(source.level, 20).toLowerCase();

  return {
    level: (level === 'log' || level === 'info' || level === 'warn' || level === 'error' || level === 'debug'
      ? level
      : 'log') as 'log' | 'info' | 'warn' | 'error' | 'debug',
    message: asTrimmedString(source.message, MAX_TEXT_LENGTH),
    args: normalizeConsoleArgs(source.args),
    stack: asTrimmedString(source.stack, 2000) || undefined,
    sequence: Math.trunc(asFiniteNumber(source.sequence, 0)) || undefined,
  };
}

function normalizeNetworkPayload(payload: unknown): CaptureEvent['payload'] {
  const source = isRecord(payload) ? payload : {};
  const request = isRecord(source.request) ? source.request : {};
  const response = isRecord(source.response) ? source.response : {};
  const timing = isRecord(source.timing) ? source.timing : {};

  return {
    method: asTrimmedString(source.method, 20).toUpperCase() || 'GET',
    url: normalizeSessionUrl(source.url),
    status: Math.trunc(asFiniteNumber(source.status, 0)),
    graphql: isRecord(source.graphql)
      ? {
          operationType: asTrimmedString(source.graphql.operationType, 20) as
            | 'query'
            | 'mutation'
            | 'subscription'
            | 'unknown',
          operationName: asTrimmedString(source.graphql.operationName, 120) || undefined,
        }
      : undefined,
    request: {
      headers: sanitizeHeaders(request.headers),
      body: asTrimmedString(request.body, MAX_BODY_LENGTH) || undefined,
      truncated: Boolean(request.truncated),
    },
    response: {
      headers: sanitizeHeaders(response.headers),
      body: asTrimmedString(response.body, MAX_BODY_LENGTH) || undefined,
      size: Math.max(0, Math.trunc(asFiniteNumber(response.size, 0))),
      truncated: Boolean(response.truncated),
    },
    timing: {
      start: Math.trunc(asFiniteNumber(timing.start, Date.now())),
      end: Math.trunc(asFiniteNumber(timing.end, Date.now())),
      duration: Math.max(0, Math.trunc(asFiniteNumber(timing.duration, 0))),
    },
  };
}

function normalizeErrorPayload(payload: unknown): CaptureEvent['payload'] {
  const source = isRecord(payload) ? payload : {};
  const severity = asTrimmedString(source.severity, 24).toLowerCase();

  return {
    message: asTrimmedString(source.message, MAX_TEXT_LENGTH),
    stack: asTrimmedString(source.stack, 2500) || undefined,
    sourceMappedStack: asTrimmedString(source.sourceMappedStack, 2500) || undefined,
    sourceMapStatus: asTrimmedString(source.sourceMapStatus, 20) as
      | 'mapped'
      | 'unmapped'
      | 'resolver-error'
      | undefined,
    type: asTrimmedString(source.type, 120) || undefined,
    severity: (severity === 'error' || severity === 'unhandledrejection' ? severity : undefined) as
      | 'error'
      | 'unhandledrejection'
      | undefined,
    sequence: Math.trunc(asFiniteNumber(source.sequence, 0)) || undefined,
    source: asTrimmedString(source.source, 300) || undefined,
    line: Math.trunc(asFiniteNumber(source.line, 0)) || undefined,
    column: Math.trunc(asFiniteNumber(source.column, 0)) || undefined,
  };
}

function normalizeStatePayload(payload: unknown): CaptureEvent['payload'] {
  const source = isRecord(payload) ? payload : {};
  const reason = asTrimmedString(source.reason, 30);

  return {
    source: asTrimmedString(source.source, 80) || 'unknown',
    data: normalizeStateData(source.data),
    changed: Boolean(source.changed),
    reason: (reason === 'init' || reason === 'interval' || reason === 'flush' || reason === 'adapter-error'
      ? reason
      : undefined) as 'init' | 'interval' | 'flush' | 'adapter-error' | undefined,
    adapterName: asTrimmedString(source.adapterName, 80) || undefined,
    errorMessage: asTrimmedString(source.errorMessage, MAX_TEXT_LENGTH) || undefined,
  };
}

function normalizeEventPayloadByType(type: CaptureEvent['type'], payload: unknown): CaptureEvent['payload'] {
  if (type === 'console') {
    return normalizeConsolePayload(payload);
  }
  if (type === 'network') {
    return normalizeNetworkPayload(payload);
  }
  if (type === 'error') {
    return normalizeErrorPayload(payload);
  }
  return normalizeStatePayload(payload);
}

function normalizeEvents(value: unknown): CaptureEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const now = Date.now();
  const normalized: CaptureEvent[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const rawEvent = value[index];
    if (!isRecord(rawEvent)) {
      continue;
    }

    const rawType = rawEvent.type;
    if (typeof rawType !== 'string' || !ALLOWED_EVENT_TYPES.has(rawType)) {
      continue;
    }

    const rawPayload = rawEvent.payload;
    if (rawPayload === undefined || rawPayload === null) {
      continue;
    }

    const rawId = rawEvent.id;
    const id = typeof rawId === 'string' && rawId.trim().length > 0 ? rawId : `event-${now}-${index}`;
    const timestamp = normalizeEventTimestamp(rawEvent.timestamp, now + index);

    normalized.push({
      id,
      type: rawType as CaptureEvent['type'],
      timestamp,
      payload: normalizeEventPayloadByType(rawType as CaptureEvent['type'], rawPayload),
    });
  }

  return normalized;
}

export function normalizeEnvironmentInfo(environment?: EnvironmentInfo): EnvironmentInfo {
  const width = environment?.viewport?.width ?? 0;
  const height = environment?.viewport?.height ?? 0;

  return {
    browser: environment?.browser?.trim() || 'Unknown',
    browserVersion: environment?.browserVersion?.trim() || 'Unknown',
    os: environment?.os?.trim() || 'Unknown',
    osVersion: environment?.osVersion?.trim() || 'Unknown',
    language: environment?.language?.trim() || DEFAULT_LANGUAGE,
    viewport: {
      width: width > 0 ? width : DEFAULT_VIEWPORT_WIDTH,
      height: height > 0 ? height : DEFAULT_VIEWPORT_HEIGHT,
    },
  };
}

export function createCaptureMediaMetadata(
  config: ExtensionConfig,
  snapshot: FrozenCaptureSnapshot,
): CaptureMediaMetadata {
  return {
    resolution: config.captureResolution,
    frameRate: config.captureFrameRate,
    bufferWindowMs: snapshot.retentionWindowMs,
    frozenAt: new Date(snapshot.frozenAt).toISOString(),
    eventCount: snapshot.events.length,
  };
}

export function normalizeSessionPayloadForUpload(
  payload: SessionPayload,
  config: ExtensionConfig,
): SessionPayload {
  const rawPayload = isRecord(payload) ? payload : {};
  const rawMedia = isRecord(rawPayload.media) ? rawPayload.media : {};
  const rawProjectId = rawPayload.projectId;

  const projectId =
    typeof rawProjectId === 'string' && rawProjectId.trim().length > 0
      ? rawProjectId.trim()
      : config.projectId;

  return {
    projectId: projectId || 'dev-project',
    url: normalizeSessionUrl(rawPayload.url),
    title: typeof rawPayload.title === 'string' ? rawPayload.title : undefined,
    timestamp: normalizeIsoTimestamp(rawPayload.timestamp),
    environment: normalizeEnvironmentInfo(rawPayload.environment as EnvironmentInfo | undefined),
    events: normalizeEvents(rawPayload.events),
    media: {
      hasReplay: Boolean(rawMedia.hasReplay),
      screenshotKey: typeof rawMedia.screenshotKey === 'string' ? rawMedia.screenshotKey : undefined,
      videoKey: typeof rawMedia.videoKey === 'string' ? rawMedia.videoKey : undefined,
      domSnapshots: Array.isArray(rawMedia.domSnapshots)
        ? rawMedia.domSnapshots.filter((key) => typeof key === 'string')
        : undefined,
      metadata: rawMedia.metadata as SessionPayload['media']['metadata'],
    },
  };
}

export function createUploadFailureMessage(statusCode: number): string {
  return `Upload failed (${statusCode}). Retry capture.`;
}

export function createUploadTransportFailureMessage(): string {
  return 'Upload failed. Retry capture.';
}
