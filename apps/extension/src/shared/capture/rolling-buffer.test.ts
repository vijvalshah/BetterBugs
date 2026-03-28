import { describe, expect, it } from 'vitest';

import { RollingCaptureBuffer } from './rolling-buffer';
import type { CaptureEvent } from '../types';

function eventAt(ts: number): CaptureEvent {
  return {
    id: String(ts),
    type: 'console',
    timestamp: ts,
    payload: {
      level: 'log',
      message: `event-${ts}`,
    },
  };
}

describe('RollingCaptureBuffer', () => {
  it('keeps only events inside retention window when frozen', () => {
    const buffer = new RollingCaptureBuffer(120_000, 100, () => 130_000);

    buffer.addEvent(eventAt(0));
    buffer.addEvent(eventAt(60_000));
    buffer.addEvent(eventAt(130_000));

    const snapshot = buffer.freeze(130_000);
    expect(snapshot.events.map((event) => event.timestamp)).toEqual([60_000, 130_000]);
  });

  it('enforces bounded storage with deterministic eviction order', () => {
    const buffer = new RollingCaptureBuffer(120_000, 3, () => 0);

    buffer.addEvent(eventAt(1));
    buffer.addEvent(eventAt(2));
    buffer.addEvent(eventAt(3));
    buffer.addEvent(eventAt(4));

    const snapshot = buffer.freeze(4);
    expect(snapshot.events.map((event) => event.timestamp)).toEqual([2, 3, 4]);
    expect(buffer.size).toBe(3);
  });
});
