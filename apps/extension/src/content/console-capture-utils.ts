const DEFAULT_MAX_DEPTH = 4;
const TRUNCATION_MARKER = '...[truncated]';

export function createSequenceCounter(start: number = 0): () => number {
  let value = start;
  return () => {
    value += 1;
    return value;
  };
}

export function getConsoleStack(level: 'log' | 'info' | 'warn' | 'error' | 'debug'): string | undefined {
  if (level !== 'error') return undefined;
  return new Error().stack;
}

function serializeValue(
  value: unknown,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return value;
  }

  if (valueType === 'bigint') {
    return `${String(value)}n`;
  }

  if (valueType === 'symbol') {
    return String(value);
  }

  if (valueType === 'function') {
    const fn = value as { name?: string };
    return `[Function:${fn.name || 'anonymous'}]`;
  }

  if (depth >= maxDepth) {
    return '[MaxDepth]';
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof URL) return value.toString();
  if (value instanceof URLSearchParams) return value.toString();
  if (value instanceof ArrayBuffer) return `[ArrayBuffer:${value.byteLength}]`;
  if (ArrayBuffer.isView(value)) return `[${value.constructor.name}:${value.byteLength}]`;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return `[Blob:${value.size}]`;

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name || 'Error',
      message: value.message,
      stack: value.stack,
    };

    for (const [key, entry] of Object.entries(value as unknown as Record<string, unknown>)) {
      out[key] = serializeValue(entry, depth + 1, maxDepth, seen);
    }

    return out;
  }

  if (valueType !== 'object') {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return '[Circular]';
  }

  seen.add(objectValue);

  if (Array.isArray(objectValue)) {
    const out = objectValue.map((entry) => serializeValue(entry, depth + 1, maxDepth, seen));
    seen.delete(objectValue);
    return out;
  }

  if (objectValue instanceof Map) {
    const out = {
      __type: 'Map',
      entries: Array.from(objectValue.entries()).map(([key, entry]) => [
        serializeValue(key, depth + 1, maxDepth, seen),
        serializeValue(entry, depth + 1, maxDepth, seen),
      ]),
    };
    seen.delete(objectValue);
    return out;
  }

  if (objectValue instanceof Set) {
    const out = {
      __type: 'Set',
      values: Array.from(objectValue.values()).map((entry) =>
        serializeValue(entry, depth + 1, maxDepth, seen),
      ),
    };
    seen.delete(objectValue);
    return out;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(objectValue as Record<string, unknown>)) {
    output[key] = serializeValue(entry, depth + 1, maxDepth, seen);
  }

  seen.delete(objectValue);
  return output;
}

function stringifyForMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }
}

function extractMessage(value: unknown): string {
  if (value === undefined) return 'Unhandled promise rejection';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || value.name || 'Error';
  return stringifyForMessage(serializeForCapture(value));
}

export function serializeForCapture(value: unknown, maxDepth: number = DEFAULT_MAX_DEPTH): unknown {
  return serializeValue(value, 0, maxDepth, new WeakSet<object>());
}

export function serializeConsoleArgs(
  args: unknown[],
  maxDepth: number = DEFAULT_MAX_DEPTH,
): unknown[] {
  return args.map((arg) => serializeForCapture(arg, maxDepth));
}

export function createConsoleMessage(args: unknown[], maxLength: number): string {
  const serializedArgs = serializeConsoleArgs(args);
  const message = serializedArgs.map((arg) => stringifyForMessage(arg)).join(' ');

  if (message.length <= maxLength) {
    return message;
  }

  return `${message.slice(0, maxLength)}${TRUNCATION_MARKER}`;
}

export function normalizeWindowError(input: {
  message: string;
  error?: unknown;
  filename?: string;
  lineno?: number;
  colno?: number;
}): {
  message: string;
  stack?: string;
  type: string;
  source?: string;
  line?: number;
  column?: number;
  severity: 'error';
} {
  const runtimeError = input.error instanceof Error ? input.error : undefined;

  return {
    message: input.message || extractMessage(input.error),
    stack: runtimeError?.stack,
    type: runtimeError?.name || 'RuntimeError',
    source: input.filename,
    line: input.lineno,
    column: input.colno,
    severity: 'error',
  };
}

export function normalizeUnhandledRejection(reason: unknown): {
  message: string;
  stack?: string;
  type: string;
  severity: 'unhandledrejection';
} {
  if (reason instanceof Error) {
    return {
      message: reason.message || reason.name || 'Unhandled promise rejection',
      stack: reason.stack,
      type: reason.name || 'Error',
      severity: 'unhandledrejection',
    };
  }

  return {
    message: extractMessage(reason),
    type: 'NonErrorRejection',
    severity: 'unhandledrejection',
  };
}
