import { describe, expect, it } from 'vitest';

import {
  MAX_QUEUED_SESSIONS,
  createQueueItem,
  dequeueNextSession,
  enqueueSession,
  type QueuedSession,
} from './queue-utils';

function mockQueuedSession(id: string): QueuedSession {
  return {
    id,
    queuedAt: '2026-03-28T00:00:00.000Z',
    payload: {
      projectId: 'project-a',
      url: 'https://example.com',
      timestamp: '2026-03-28T00:00:00.000Z',
      environment: {
        browser: 'Chrome',
        browserVersion: '120',
        os: 'macOS',
        osVersion: '14',
        language: 'en-US',
        viewport: {
          width: 1280,
          height: 720,
        },
      },
      events: [],
      media: {
        hasReplay: false,
      },
    },
  };
}

describe('queue-utils', () => {
  it('creates queue item with generated id and timestamp', () => {
    const item = createQueueItem(mockQueuedSession('x').payload);

    expect(item.id).toBeTypeOf('string');
    expect(item.id.length).toBeGreaterThan(5);
    expect(item.queuedAt).toBeTypeOf('string');
    expect(item.payload.projectId).toBe('project-a');
  });

  it('enqueues in append order and bounds queue size', () => {
    let queue: QueuedSession[] = [];
    for (let index = 0; index < MAX_QUEUED_SESSIONS+2; index += 1) {
      queue = enqueueSession(queue, mockQueuedSession(String(index)));
    }

    expect(queue.length).toBe(MAX_QUEUED_SESSIONS);
    expect(queue[0].id).toBe('2');
    expect(queue[queue.length - 1].id).toBe(String(MAX_QUEUED_SESSIONS + 1));
  });

  it('dequeues in FIFO order', () => {
    const initial = [mockQueuedSession('a'), mockQueuedSession('b')];
    const first = dequeueNextSession(initial);
    expect(first.item?.id).toBe('a');
    expect(first.rest.map((item) => item.id)).toEqual(['b']);
  });
});
