import type { SessionPayload } from '../shared/types';

export const MAX_QUEUED_SESSIONS = 50;

export interface QueuedSession {
  id: string;
  queuedAt: string;
  payload: SessionPayload;
}

export function createQueueItem(payload: SessionPayload): QueuedSession {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    queuedAt: new Date().toISOString(),
    payload,
  };
}

export function enqueueSession(queue: QueuedSession[], item: QueuedSession): QueuedSession[] {
  const next = [...queue, item];
  if (next.length <= MAX_QUEUED_SESSIONS) {
    return next;
  }

  return next.slice(next.length - MAX_QUEUED_SESSIONS);
}

export function dequeueNextSession(queue: QueuedSession[]): {
  item: QueuedSession | undefined;
  rest: QueuedSession[];
} {
  if (queue.length === 0) {
    return {
      item: undefined,
      rest: [],
    };
  }

  const [item, ...rest] = queue;
  return {
    item,
    rest,
  };
}
