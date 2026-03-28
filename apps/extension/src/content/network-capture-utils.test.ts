import { describe, expect, it } from 'vitest';

import {
  parseXhrResponseHeaders,
  requestBodyToText,
  sanitizeHeaderRecord,
  sanitizeHeaders,
  truncatePayloadText,
  websocketMessageToText,
} from './network-capture-utils';

describe('network-capture-utils', () => {
  it('truncates payload text with marker when exceeding max size', () => {
    const result = truncatePayloadText('abcdef', 4);
    expect(result).toEqual({ text: 'abcd...[truncated]', truncated: true });
  });

  it('leaves payload text unchanged when within max size', () => {
    const result = truncatePayloadText('abc', 4);
    expect(result).toEqual({ text: 'abc', truncated: false });
  });

  it('sanitizes sensitive headers while preserving non-sensitive ones', () => {
    const headers = new Headers({
      Authorization: 'Bearer secret',
      'X-API-Key': 'top-secret',
      'X-Request-Id': 'abc-123',
      Cookie: 'session=123',
    });

    const sanitized = sanitizeHeaders(headers);
    expect(sanitized.authorization).toBe('[redacted]');
    expect(sanitized['x-api-key']).toBe('[redacted]');
    expect(sanitized.cookie).toBe('[redacted]');
    expect(sanitized['x-request-id']).toBe('abc-123');
  });

  it('parses raw xhr response headers into key-value map', () => {
    const parsed = parseXhrResponseHeaders('content-type: application/json\r\nx-id: 42\r\n');
    expect(parsed).toEqual({
      'content-type': 'application/json',
      'x-id': '42',
    });
  });

  it('sanitizes sensitive headers in plain records', () => {
    const sanitized = sanitizeHeaderRecord({
      Authorization: 'secret',
      Cookie: 'session=1',
      'x-trace-id': 'trace-1',
    });

    expect(sanitized.Authorization).toBe('[redacted]');
    expect(sanitized.Cookie).toBe('[redacted]');
    expect(sanitized['x-trace-id']).toBe('trace-1');
  });

  it('normalizes websocket message values to safe text', () => {
    expect(websocketMessageToText('hello')).toBe('hello');
    expect(websocketMessageToText({ ok: true })).toBe('{"ok":true}');
    expect(websocketMessageToText(new ArrayBuffer(8))).toBe('[arraybuffer:8]');
  });

  it('normalizes request body values to safe text', () => {
    expect(requestBodyToText('abc')).toBe('abc');
    expect(requestBodyToText(new URLSearchParams('x=1'))).toBe('x=1');
    expect(requestBodyToText(new Uint8Array([1, 2, 3]))).toBe('[arraybuffer-view:3]');
  });
});
