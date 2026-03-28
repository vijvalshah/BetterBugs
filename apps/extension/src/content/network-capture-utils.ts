const SENSITIVE_HEADER_PATTERNS = ['authorization', 'cookie', 'token', 'api-key', 'x-api-key'];

export interface TruncateResult {
  text?: string;
  truncated: boolean;
}

export function truncatePayloadText(input: string | undefined, maxSize: number): TruncateResult {
  if (input === undefined) {
    return {
      text: undefined,
      truncated: false,
    };
  }

  if (input.length <= maxSize) {
    return {
      text: input,
      truncated: false,
    };
  }

  return {
    text: `${input.slice(0, maxSize)}...[truncated]`,
    truncated: true,
  };
}

export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_PATTERNS.some((pattern) => lower.includes(pattern))) {
      out[key] = '[redacted]';
      return;
    }
    out[key] = value;
  });
  return out;
}

export function sanitizeHeaderRecord(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_PATTERNS.some((pattern) => lower.includes(pattern))) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function parseXhrResponseHeaders(rawHeaders: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = rawHeaders.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

export function websocketMessageToText(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return `[arraybuffer:${data.byteLength}]`;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return `[blob:${data.size}]`;
  if (data === undefined || data === null) return undefined;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function requestBodyToText(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof Blob !== 'undefined' && body instanceof Blob) return `[blob:${body.size}]`;
  if (body instanceof ArrayBuffer) return `[arraybuffer:${body.byteLength}]`;
  if (ArrayBuffer.isView(body)) return `[arraybuffer-view:${body.byteLength}]`;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return '[formdata]';
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
