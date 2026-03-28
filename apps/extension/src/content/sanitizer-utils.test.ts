import { afterEach, describe, expect, it } from 'vitest';

import {
  REDACTED_VALUE,
  registerProjectSanitizerPatterns,
  registerSanitizerRule,
  resetSanitizerRulesForTests,
  sanitizeCapturedData,
  sanitizePayloadText,
  sanitizePayloadTextWithResult,
  sanitizeUrl,
  sanitizeUrlWithResult,
} from './sanitizer-utils';

afterEach(() => {
  resetSanitizerRulesForTests();
});

describe('sanitizer-utils', () => {
  it('redacts default sensitive keys in nested objects', () => {
    const sanitized = sanitizeCapturedData({
      token: 'abc',
      nested: {
        password: 'hunter2',
        safe: 'ok',
      },
      items: [{ refreshToken: 'def' }],
    });

    expect(sanitized).toEqual({
      token: REDACTED_VALUE,
      nested: {
        password: REDACTED_VALUE,
        safe: 'ok',
      },
      items: [{ refreshToken: REDACTED_VALUE }],
    });
  });

  it('redacts sensitive fields in JSON payload text', () => {
    const payload = JSON.stringify({
      email: 'user@example.com',
      credentials: {
        apiKey: 'live_123',
        password: 'pw',
      },
    });

    const sanitized = sanitizePayloadText(payload);
    expect(sanitized).toBe(
      JSON.stringify({
        email: 'user@example.com',
        credentials: {
          apiKey: REDACTED_VALUE,
          password: REDACTED_VALUE,
        },
      }),
    );
  });

  it('redacts sensitive query or form-style key-value payload text', () => {
    const sanitized = sanitizePayloadText('email=a@b.com&token=abc123&state=ok');
    expect(sanitized).toBe(`email=a@b.com&token=${REDACTED_VALUE}&state=ok`);
  });

  it('supports project-defined key patterns', () => {
    registerProjectSanitizerPatterns(['privateField']);

    const sanitized = sanitizeCapturedData({
      privateField: 'should-hide',
      visible: 'ok',
    });

    expect(sanitized).toEqual({
      privateField: REDACTED_VALUE,
      visible: 'ok',
    });
  });

  it('supports runtime sanitizer pattern and function rules', () => {
    registerSanitizerRule('customerSecret');
    registerSanitizerRule({
      target: 'value',
      pattern: /acct_[A-Za-z0-9]+/g,
    });
    registerSanitizerRule(({ key, value }) => {
      if (key === 'email' && typeof value === 'string') {
        return value.replace(/^[^@]+/, REDACTED_VALUE);
      }
      return undefined;
    });

    const sanitized = sanitizeCapturedData({
      customerSecret: 'value',
      email: 'person@example.com',
      accountId: 'acct_12345',
    });

    expect(sanitized).toEqual({
      customerSecret: REDACTED_VALUE,
      email: `${REDACTED_VALUE}@example.com`,
      accountId: REDACTED_VALUE,
    });
  });

  it('redacts sensitive url search params', () => {
    const sanitized = sanitizeUrl('https://example.com/page?token=abc&tab=overview');
    expect(sanitized).toBe(
      `https://example.com/page?token=${encodeURIComponent(REDACTED_VALUE)}&tab=overview`,
    );
  });

  it('drops uncertain freeform sensitive body text in fail-closed mode', () => {
    const result = sanitizePayloadTextWithResult('password hunter2 token abc123');

    expect(result.dropped).toBe(true);
    expect(result.value).toBeUndefined();
    expect(result.reason).toBe('unclassified-sensitive-text');
  });

  it('drops uncertain freeform sensitive URL text in fail-closed mode', () => {
    const result = sanitizeUrlWithResult('token abc123');

    expect(result.dropped).toBe(true);
    expect(result.value).toBe('about:blank#sanitization-drop');
    expect(result.reason).toBe('unclassified-sensitive-url');
  });
});
