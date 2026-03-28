import { serializeForCapture } from './console-capture-utils';

export interface StateCaptureEnvironment {
  getLocalStorageEntries(): Record<string, string>;
  getSessionStorageEntries(): Record<string, string>;
  getCookieHeader(): string;
  getWindowProperty(key: string): unknown;
}

export interface StateSnapshot {
  source: 'localStorage' | 'sessionStorage' | 'cookie' | 'redux' | string;
  data: unknown;
  changed: boolean;
}

export interface StateAdapterErrorInfo {
  adapterName: string;
  message: string;
}

export type StateAdapterCollector = (env: StateCaptureEnvironment) => unknown;
export type StateAdapterErrorListener = (error: StateAdapterErrorInfo) => void;

type RegisteredAdapter = {
  source: StateSnapshot['source'];
  collector: StateAdapterCollector;
};

const REDUX_STORE_KEYS = ['__REDUX_STORE__', '__STORE__', 'store', '__NEXT_REDUX_STORE__'];
const runtimeAdapters = new Map<string, StateAdapterCollector>();

export function registerRuntimeStateAdapter(name: string, collector: StateAdapterCollector): () => void {
  runtimeAdapters.set(name, collector);
  return () => {
    runtimeAdapters.delete(name);
  };
}

function getRuntimeAdapters(): Map<string, StateAdapterCollector> {
  return runtimeAdapters;
}

function sortRecord(input: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(input).sort()) {
    sorted[key] = input[key];
  }
  return sorted;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const output: Record<string, string> = {};
  const rawPairs = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const pair of rawPairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) continue;
    output[key] = value;
  }

  return sortRecord(output);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getReduxState(env: StateCaptureEnvironment): unknown {
  for (const key of REDUX_STORE_KEYS) {
    const candidate = env.getWindowProperty(key) as { getState?: () => unknown } | undefined;
    if (candidate && typeof candidate.getState === 'function') {
      return candidate.getState();
    }
  }

  return undefined;
}

export function createBrowserStateCaptureEnvironment(win: Window): StateCaptureEnvironment {
  const storageToRecord = (storage: Storage): Record<string, string> => {
    const output: Record<string, string> = {};
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const value = storage.getItem(key);
      if (value !== null) {
        output[key] = value;
      }
    }
    return sortRecord(output);
  };

  return {
    getLocalStorageEntries(): Record<string, string> {
      try {
        return storageToRecord(win.localStorage);
      } catch {
        return {};
      }
    },
    getSessionStorageEntries(): Record<string, string> {
      try {
        return storageToRecord(win.sessionStorage);
      } catch {
        return {};
      }
    },
    getCookieHeader(): string {
      try {
        return win.document.cookie || '';
      } catch {
        return '';
      }
    },
    getWindowProperty(key: string): unknown {
      return (win as unknown as Record<string, unknown>)[key];
    },
  };
}

export class StateCaptureCollector {
  private readonly adapters = new Map<string, RegisteredAdapter>();
  private readonly previousSignatures = new Map<string, string>();
  private readonly errorListeners = new Set<StateAdapterErrorListener>();

  constructor(private readonly env: StateCaptureEnvironment) {
    this.registerBuiltinAdapters();
  }

  registerStateAdapter(name: string, collector: StateAdapterCollector): void {
    this.adapters.set(name, {
      source: name,
      collector,
    });
  }

  registerAdapterErrorListener(listener: StateAdapterErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  collectSnapshots(): StateSnapshot[] {
    this.syncRuntimeAdapters();

    const snapshots: StateSnapshot[] = [];

    for (const [name, adapter] of this.adapters.entries()) {
      try {
        const raw = adapter.collector(this.env);
        if (raw === undefined) continue;

        const data = serializeForCapture(raw);
        const signature = safeStringify(data);
        const previous = this.previousSignatures.get(name);
        const changed = previous === undefined ? true : previous !== signature;

        this.previousSignatures.set(name, signature);

        snapshots.push({
          source: adapter.source,
          data,
          changed,
        });
      } catch (error: unknown) {
        this.notifyAdapterError({
          adapterName: name,
          message: error instanceof Error ? error.message : 'Unknown adapter failure',
        });
        // Adapter failures are isolated so other collectors continue running.
      }
    }

    return snapshots;
  }

  private notifyAdapterError(error: StateAdapterErrorInfo): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Error listener failures should not break capture pipeline.
      }
    }
  }

  private syncRuntimeAdapters(): void {
    for (const [name, collector] of getRuntimeAdapters()) {
      if (!this.adapters.has(name)) {
        this.registerStateAdapter(name, collector);
      }
    }
  }

  private registerBuiltinAdapters(): void {
    this.adapters.set('localStorage', {
      source: 'localStorage',
      collector: (env) => env.getLocalStorageEntries(),
    });

    this.adapters.set('sessionStorage', {
      source: 'sessionStorage',
      collector: (env) => env.getSessionStorageEntries(),
    });

    this.adapters.set('cookie', {
      source: 'cookie',
      collector: (env) => parseCookies(env.getCookieHeader()),
    });

    this.adapters.set('redux', {
      source: 'redux',
      collector: (env) => getReduxState(env),
    });
  }
}

export function createStateCollector(env: StateCaptureEnvironment): StateCaptureCollector;
export function createStateCollector(): StateCaptureCollector;
export function createStateCollector(env?: StateCaptureEnvironment): StateCaptureCollector {
  if (env) {
    return new StateCaptureCollector(env);
  }

  return new StateCaptureCollector(createBrowserStateCaptureEnvironment(window));
}