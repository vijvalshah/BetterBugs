import { describe, expect, it } from 'vitest';
import { parseSessionIdFromSearch, sortEventsByTimestamp, summarizeEvent, type SessionEvent } from './index';

describe('parseSessionIdFromSearch', () => {
  it('extracts sessionId from query', () => {
    expect(parseSessionIdFromSearch('?sessionId=abc123')).toBe('abc123');
  });

  it('returns empty string when missing', () => {
    expect(parseSessionIdFromSearch('?foo=bar')).toBe('');
  });
});

describe('sortEventsByTimestamp', () => {
  it('orders events ascending by timestamp', () => {
    const events: SessionEvent[] = [
      { id: '2', type: 'error', timestamp: 300, payload: {} },
      { id: '1', type: 'console', timestamp: 100, payload: {} },
      { id: '3', type: 'network', timestamp: 200, payload: {} },
    ];
    const sorted = sortEventsByTimestamp(events);
    expect(sorted.map((e) => e.id)).toEqual(['1', '3', '2']);
  });
});

describe('summarizeEvent', () => {
  it('summarizes console events', () => {
    const summary = summarizeEvent({ id: '1', type: 'console', timestamp: 0, payload: { level: 'warn', message: 'warned', stack: 'trace' } });
    expect(summary).toContain('[warn] warned');
    expect(summary).toContain('trace');
  });

  it('summarizes network events', () => {
    const summary = summarizeEvent({ id: '2', type: 'network', timestamp: 0, payload: { method: 'POST', status: 500, url: '/api' } });
    expect(summary).toContain('POST 500 /api');
  });

  it('summarizes error events', () => {
    const summary = summarizeEvent({ id: '3', type: 'error', timestamp: 0, payload: { message: 'boom' } });
    expect(summary).toContain('boom');
  });
});
