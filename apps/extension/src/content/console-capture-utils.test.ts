import { describe, expect, it } from 'vitest';

import {
  createSequenceCounter,
  createConsoleMessage,
  getConsoleStack,
  normalizeUnhandledRejection,
  normalizeWindowError,
  serializeConsoleArgs,
  serializeForCapture,
} from './console-capture-utils';

describe('console-capture-utils', () => {
  it('serializes circular references without throwing', () => {
    const obj: { self?: unknown; label: string } = { label: 'root' };
    obj.self = obj;

    const result = serializeForCapture(obj);
    expect(result).toEqual({
      label: 'root',
      self: '[Circular]',
    });
  });

  it('applies max depth cutoff for nested objects', () => {
    const result = serializeForCapture({ a: { b: { c: { d: 1 } } } }, 2) as {
      a: { b: unknown };
    };

    expect(result.a.b).toEqual('[MaxDepth]');
  });

  it('serializes special values predictably for console args', () => {
    function demoFn(): void {}
    const args = serializeConsoleArgs([demoFn, Symbol('demo')]);

    expect(args).toEqual(['[Function:demoFn]', 'Symbol(demo)']);
  });

  it('builds truncated console message safely', () => {
    const message = createConsoleMessage([{ x: 'y' }, 'tail'], 10);
    expect(message.length).toBeLessThanOrEqual(24); // 10 + marker length
    expect(message.endsWith('...[truncated]')).toBe(true);
  });

  it('increments sequence counter monotonically', () => {
    const next = createSequenceCounter();
    expect(next()).toBe(1);
    expect(next()).toBe(2);
    expect(next()).toBe(3);
  });

  it('returns stack only for error-level console entries', () => {
    expect(typeof getConsoleStack('error')).toBe('string');
    expect(getConsoleStack('warn')).toBeUndefined();
  });

  it('normalizes window error payload with type and severity', () => {
    const runtimeError = new TypeError('boom');
    runtimeError.stack = 'TypeError: boom\n at here';

    const normalized = normalizeWindowError({
      message: 'boom',
      error: runtimeError,
      filename: 'app.js',
      lineno: 12,
      colno: 8,
    });

    expect(normalized).toEqual({
      message: 'boom',
      stack: 'TypeError: boom\n at here',
      type: 'TypeError',
      source: 'app.js',
      line: 12,
      column: 8,
      severity: 'error',
    });
  });

  it('normalizes unhandled rejection for non-Error values', () => {
    const normalized = normalizeUnhandledRejection({ reason: 'bad' });
    expect(normalized.severity).toBe('unhandledrejection');
    expect(normalized.type).toBe('NonErrorRejection');
    expect(normalized.message).toContain('{"reason":"bad"}');
  });
});
