import type { CaptureEvent } from '../types';

export interface FrozenCaptureSnapshot {
  frozenAt: number;
  retentionWindowMs: number;
  events: CaptureEvent[];
}

export class RollingCaptureBuffer {
  private readonly events: CaptureEvent[] = [];

  constructor(
    private readonly retentionWindowMs: number,
    private readonly maxEvents: number,
    private readonly nowProvider: () => number = () => Date.now(),
  ) {}

  addEvent(event: CaptureEvent): void {
    this.events.push(event);
    this.evict(event.timestamp);
  }

  freeze(at: number = this.nowProvider()): FrozenCaptureSnapshot {
    this.evict(at);
    return {
      frozenAt: at,
      retentionWindowMs: this.retentionWindowMs,
      events: [...this.events],
    };
  }

  get size(): number {
    return this.events.length;
  }

  private evict(referenceTime: number): void {
    const cutoff = referenceTime - this.retentionWindowMs;
    while (this.events.length > 0 && this.events[0].timestamp < cutoff) {
      this.events.shift();
    }
    while (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }
}
