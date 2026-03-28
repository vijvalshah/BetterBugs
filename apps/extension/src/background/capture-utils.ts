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
      payload: rawPayload as CaptureEvent['payload'],
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
