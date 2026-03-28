const REDACTED_VALUE = '[redacted]';

const DEFAULT_SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /authorization/i,
  /cookie/i,
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /session/i,
  /jwt/i,
  /private[-_]?key/i,
  /client[-_]?secret/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
];

const DEFAULT_SENSITIVE_VALUE_RULES: RegExp[] = [
  /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}\b/g,
  /(\bBearer\s+)[^\s,;]+/gi,
];

const SENSITIVE_KEYWORD_PATTERN =
  /(password|passphrase|token|secret|api[-_]?key|authorization|cookie|session|private[-_]?key|client[-_]?secret)/i;

export type SanitizerPatternRule =
  | string
  | RegExp
  | {
      target?: 'key' | 'value';
      pattern: string | RegExp;
      replacement?: string;
    };

export type SanitizerRuleFunction = (context: {
  key?: string;
  path: string[];
  value: unknown;
}) => unknown | undefined;

export type SanitizerRule = SanitizerPatternRule | SanitizerRuleFunction;

export interface SanitizationResult<T> {
  value: T;
  dropped: boolean;
  reason?: string;
}

type ValueRule = {
  pattern: RegExp;
  replacement: string;
};

const projectKeyPatterns: RegExp[] = [];
const runtimePatternRules = new Map<number, SanitizerPatternRule>();
const runtimeFunctionRules = new Map<number, SanitizerRuleFunction>();
let nextRuleId = 0;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureCaseInsensitive(pattern: RegExp): RegExp {
  if (pattern.flags.includes('i')) return pattern;
  return new RegExp(pattern.source, `${pattern.flags}i`);
}

function normalizePattern(input: string | RegExp): RegExp {
  if (typeof input === 'string') {
    return new RegExp(escapeRegExp(input), 'i');
  }
  return ensureCaseInsensitive(input);
}

function parsePatternRule(input: SanitizerPatternRule): { target: 'key' | 'value'; rule: ValueRule | RegExp } {
  if (typeof input === 'string' || input instanceof RegExp) {
    return {
      target: 'key',
      rule: normalizePattern(input),
    };
  }

  const pattern = normalizePattern(input.pattern);
  const target = input.target ?? 'key';
  if (target === 'value') {
    return {
      target,
      rule: {
        pattern: pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`),
        replacement: input.replacement ?? REDACTED_VALUE,
      },
    };
  }

  return {
    target,
    rule: pattern,
  };
}

function getRuntimeKeyPatterns(): RegExp[] {
  const patterns: RegExp[] = [];
  for (const rule of runtimePatternRules.values()) {
    const parsed = parsePatternRule(rule);
    if (parsed.target === 'key') {
      patterns.push(parsed.rule as RegExp);
    }
  }
  return patterns;
}

function getRuntimeValueRules(): ValueRule[] {
  const rules: ValueRule[] = [];
  for (const rule of runtimePatternRules.values()) {
    const parsed = parsePatternRule(rule);
    if (parsed.target === 'value') {
      rules.push(parsed.rule as ValueRule);
    }
  }
  return rules;
}

function getAllKeyPatterns(): RegExp[] {
  return [...DEFAULT_SENSITIVE_KEY_PATTERNS, ...projectKeyPatterns, ...getRuntimeKeyPatterns()];
}

function getAllValueRules(): ValueRule[] {
  return [
    ...DEFAULT_SENSITIVE_VALUE_RULES.map((pattern) => ({ pattern, replacement: REDACTED_VALUE })),
    ...getRuntimeValueRules(),
  ];
}

function isSensitiveKey(key: string, path: string[]): boolean {
  const dottedPath = path.join('.');
  return getAllKeyPatterns().some((pattern) => pattern.test(key) || pattern.test(dottedPath));
}

function applyValueRules(input: string): string {
  let output = input;
  for (const rule of getAllValueRules()) {
    output = output.replace(rule.pattern, (...args) => {
      if (rule.pattern.source.includes('\\bBearer\\s+')) {
        const prefix = args[1] as string;
        return `${prefix}${rule.replacement}`;
      }
      return rule.replacement;
    });
  }
  return output;
}

function applyRuntimeFunctionRules(value: unknown, key: string | undefined, path: string[]): unknown {
  let output = value;
  for (const rule of runtimeFunctionRules.values()) {
    const candidate = rule({ key, path, value: output });
    if (candidate !== undefined) {
      output = candidate;
    }
  }
  return output;
}

function sanitizeUnknown(value: unknown, path: string[]): unknown {
  if (typeof value === 'string') {
    return applyRuntimeFunctionRules(applyValueRules(value), path[path.length - 1], path);
  }

  if (Array.isArray(value)) {
    const sanitized = value.map((entry, index) => sanitizeUnknown(entry, [...path, String(index)]));
    return applyRuntimeFunctionRules(sanitized, path[path.length - 1], path);
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = [...path, key];
      if (isSensitiveKey(key, nestedPath)) {
        output[key] = REDACTED_VALUE;
        continue;
      }
      output[key] = sanitizeUnknown(nestedValue, nestedPath);
    }
    return applyRuntimeFunctionRules(output, path[path.length - 1], path);
  }

  return applyRuntimeFunctionRules(value, path[path.length - 1], path);
}

function redactDelimitedKeyValuePairs(input: string): string {
  return input.replace(/(^|[?&;\s])([\w.-]+)=([^&;\s]*)/g, (match, prefix: string, key: string) => {
    if (!isSensitiveKey(key, [key])) {
      return match;
    }
    return `${prefix}${key}=${REDACTED_VALUE}`;
  });
}

function hasSensitiveKeywords(input: string): boolean {
  return SENSITIVE_KEYWORD_PATTERN.test(input);
}

function hasStructuredSecrets(input: string): boolean {
  if (/^\s*[{[]/.test(input)) {
    return true;
  }

  if (/(^|[?&;\s])[\w.-]+=/.test(input)) {
    return true;
  }

  if (/"[\w.-]+"\s*:/.test(input)) {
    return true;
  }

  return false;
}

function shouldFailClosed(input: string): boolean {
  return hasSensitiveKeywords(input) && !hasStructuredSecrets(input);
}

export function registerProjectSanitizerPatterns(patterns: Array<string | RegExp>): void {
  projectKeyPatterns.length = 0;
  for (const pattern of patterns) {
    projectKeyPatterns.push(normalizePattern(pattern));
  }
}

export function registerSanitizerRule(rule: SanitizerRule): () => void {
  const id = nextRuleId;
  nextRuleId += 1;

  if (typeof rule === 'function') {
    runtimeFunctionRules.set(id, rule);
  } else {
    runtimePatternRules.set(id, rule);
  }

  return () => {
    runtimePatternRules.delete(id);
    runtimeFunctionRules.delete(id);
  };
}

export function sanitizeCapturedData<T>(value: T): T {
  return sanitizeUnknown(value, []) as T;
}

export function sanitizePayloadTextWithResult(
  input: string | undefined,
): SanitizationResult<string | undefined> {
  if (input === undefined) {
    return {
      value: undefined,
      dropped: false,
    };
  }

  let text = input;
  try {
    const parsed = JSON.parse(input) as unknown;
    const sanitized = sanitizeCapturedData(parsed);
    text = JSON.stringify(sanitized);
  } catch {
    if (shouldFailClosed(input)) {
      return {
        value: undefined,
        dropped: true,
        reason: 'unclassified-sensitive-text',
      };
    }

    text = redactDelimitedKeyValuePairs(input);
  }

  text = applyValueRules(text);
  return {
    value: applyRuntimeFunctionRules(text, undefined, ['payload']) as string,
    dropped: false,
  };
}

export function sanitizeUrlWithResult(input: string): SanitizationResult<string> {
  try {
    const parsed = new URL(input);
    for (const [key] of parsed.searchParams.entries()) {
      if (isSensitiveKey(key, [key])) {
        parsed.searchParams.set(key, REDACTED_VALUE);
      }
    }
    return {
      value: parsed.toString(),
      dropped: false,
    };
  } catch {
    if (shouldFailClosed(input)) {
      return {
        value: 'about:blank#sanitization-drop',
        dropped: true,
        reason: 'unclassified-sensitive-url',
      };
    }

    return {
      value: redactDelimitedKeyValuePairs(input),
      dropped: false,
    };
  }
}

export function sanitizePayloadText(input: string | undefined): string | undefined {
  return sanitizePayloadTextWithResult(input).value;
}

export function sanitizeUrl(input: string): string {
  return sanitizeUrlWithResult(input).value;
}

export function resetSanitizerRulesForTests(): void {
  projectKeyPatterns.length = 0;
  runtimePatternRules.clear();
  runtimeFunctionRules.clear();
  nextRuleId = 0;
}

export { REDACTED_VALUE };
