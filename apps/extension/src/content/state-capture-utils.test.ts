import { describe, expect, it } from 'vitest';

import {
  createStateCollector,
  registerRuntimeStateAdapter,
  type StateCaptureEnvironment,
} from './state-capture-utils';

function createMockEnv(overrides?: Partial<StateCaptureEnvironment>): StateCaptureEnvironment {
  return {
    getLocalStorageEntries: () => ({ token: 'abc' }),
    getSessionStorageEntries: () => ({ sid: 's1' }),
    getCookieHeader: () => 'a=1; b=2',
    getWindowProperty: () => undefined,
    ...overrides,
  };
}

describe('state-capture-utils', () => {
  it('collects built-in storage and cookie snapshots', () => {
    const collector = createStateCollector(createMockEnv());
    const snapshots = collector.collectSnapshots();

    const sources = snapshots.map((snapshot) => snapshot.source);
    expect(sources).toContain('localStorage');
    expect(sources).toContain('sessionStorage');
    expect(sources).toContain('cookie');

    const localStorageSnapshot = snapshots.find((snapshot) => snapshot.source === 'localStorage');
    expect(localStorageSnapshot?.data).toEqual({ token: 'abc' });
    expect(localStorageSnapshot?.changed).toBe(true);
  });

  it('tracks changed flags based on snapshot diffs', () => {
    let storageValue = 'abc';
    const collector = createStateCollector(
      createMockEnv({
        getLocalStorageEntries: () => ({ token: storageValue }),
      }),
    );

    const first = collector.collectSnapshots().find((snapshot) => snapshot.source === 'localStorage');
    const second = collector.collectSnapshots().find((snapshot) => snapshot.source === 'localStorage');

    storageValue = 'xyz';
    const third = collector.collectSnapshots().find((snapshot) => snapshot.source === 'localStorage');

    expect(first?.changed).toBe(true);
    expect(second?.changed).toBe(false);
    expect(third?.changed).toBe(true);
  });

  it('collects redux state when supported store is present', () => {
    const collector = createStateCollector(
      createMockEnv({
        getWindowProperty: (key) => {
          if (key !== '__REDUX_STORE__') return undefined;
          return {
            getState: () => ({ users: [{ id: 1 }] }),
          };
        },
      }),
    );

    const reduxSnapshot = collector.collectSnapshots().find((snapshot) => snapshot.source === 'redux');
    expect(reduxSnapshot?.data).toEqual({ users: [{ id: 1 }] });
  });

  it('fails gracefully when framework adapter is unsupported', () => {
    const collector = createStateCollector(createMockEnv());
    const reduxSnapshot = collector.collectSnapshots().find((snapshot) => snapshot.source === 'redux');
    expect(reduxSnapshot).toBeUndefined();
  });

  it('supports custom adapter registration and isolates adapter failures', () => {
    const collector = createStateCollector(createMockEnv());

    collector.registerStateAdapter('customWorking', () => ({ ready: true }));
    collector.registerStateAdapter('customBroken', () => {
      throw new Error('adapter crash');
    });

    const snapshots = collector.collectSnapshots();
    expect(snapshots.find((snapshot) => snapshot.source === 'customWorking')?.data).toEqual({ ready: true });
    expect(snapshots.find((snapshot) => snapshot.source === 'customBroken')).toBeUndefined();
  });

  it('exposes runtime adapter registration for pluggable adapters', () => {
    const unregister = registerRuntimeStateAdapter('runtimeCustom', () => ({ region: 'us-east-1' }));

    const collector = createStateCollector(createMockEnv());
    const snapshots = collector.collectSnapshots();

    expect(snapshots.find((snapshot) => snapshot.source === 'runtimeCustom')?.data).toEqual({
      region: 'us-east-1',
    });

    unregister();
  });

  it('notifies listeners when adapter failures occur', () => {
    const collector = createStateCollector(createMockEnv());
    collector.registerStateAdapter('failingAdapter', () => {
      throw new Error('boom');
    });

    const received: Array<{ adapterName: string; message: string }> = [];
    collector.registerAdapterErrorListener((error) => {
      received.push(error);
    });

    collector.collectSnapshots();

    expect(received).toEqual([
      {
        adapterName: 'failingAdapter',
        message: 'boom',
      },
    ]);
  });
});