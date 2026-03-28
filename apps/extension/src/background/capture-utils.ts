import type { CaptureMediaMetadata, ExtensionConfig } from '../shared/types';
import type { FrozenCaptureSnapshot } from '../shared/capture/rolling-buffer';

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

export function createUploadFailureMessage(statusCode: number): string {
  return `Upload failed (${statusCode}). Retry capture.`;
}

export function createUploadTransportFailureMessage(): string {
  return 'Upload failed. Retry capture.';
}
