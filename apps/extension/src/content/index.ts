import {
  type BackgroundMessage,
  type CaptureEvent,
  type ConsoleLevel,
  type ExtensionConfig,
  type NetworkEventPayload,
  type StateEventPayload,
  DEFAULT_CONFIG,
} from '../shared/types';
import {
  createConsoleMessage,
  createSequenceCounter,
  getConsoleStack,
  normalizeUnhandledRejection,
  normalizeWindowError,
  serializeConsoleArgs,
} from './console-capture-utils';
import {
  parseXhrResponseHeaders,
  requestBodyToText,
  sanitizeHeaderRecord,
  sanitizeHeaders,
  truncatePayloadText,
  websocketMessageToText,
} from './network-capture-utils';
import {
  registerProjectSanitizerPatterns,
  registerSanitizerRule,
  sanitizeCapturedData,
  sanitizePayloadTextWithResult,
  sanitizeUrlWithResult,
  type SanitizerRule,
} from './sanitizer-utils';
import { detectGraphQLOperation } from './network-future-utils';
import { resolveStackWithSourceMap } from './source-map-utils';
import {
  createStateCollector,
  registerRuntimeStateAdapter,
  type StateCaptureEnvironment,
} from './state-capture-utils';

const MAX_BODY_SIZE = 2048;
const MAX_NETWORK_BODY_SIZE = 1_048_576;
const STATE_CAPTURE_INTERVAL_MS = 5_000;
let config: ExtensionConfig = { ...DEFAULT_CONFIG };
const nextSequence = createSequenceCounter();
const stateCollector = createStateCollector();

type BugCatcherStateAdapterApiWindow = Window & {
  __BUGCATCHER_REGISTER_STATE_ADAPTER__?: (
    name: string,
    collector: (env: StateCaptureEnvironment) => unknown,
  ) => void;
  __BUGCATCHER_REGISTER_SANITIZER_RULE__?: (rule: SanitizerRule) => void;
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function postMessage(message: BackgroundMessage): void {
  void chrome.runtime.sendMessage(message);
}

function createEvent(type: CaptureEvent['type'], payload: CaptureEvent['payload']): CaptureEvent {
  return {
    id: uid(),
    type,
    timestamp: Date.now(),
    payload,
  };
}

function emitSanitizationAuditEvent(segment: string, reason: string): void {
  postMessage({
    type: 'BC_EVENT',
    payload: createEvent('error', {
      message: `Dropped unsafe data segment during sanitization: ${segment}`,
      type: 'SanitizationDrop',
      severity: 'error',
      source: segment,
      stack: reason,
    }),
  });
}

function sanitizeStructuredSegment<T>(value: T, segment: string, fallback: T): T {
  try {
    return sanitizeCapturedData(value);
  } catch (error: unknown) {
    emitSanitizationAuditEvent(
      segment,
      error instanceof Error ? error.message : 'sanitizer-structured-segment-failure',
    );
    return fallback;
  }
}

function emitNetworkEvent(payload: NetworkEventPayload): void {
  const sanitizedUrl = sanitizeUrlWithResult(payload.url);
  if (sanitizedUrl.dropped) {
    emitSanitizationAuditEvent('network.url', sanitizedUrl.reason ?? 'unclassified-sensitive-url');
  }

  const requestBody = sanitizePayloadTextWithResult(payload.request.body);
  if (requestBody.dropped) {
    emitSanitizationAuditEvent(
      'network.request.body',
      requestBody.reason ?? 'unclassified-sensitive-text',
    );
  }

  const responseBody = sanitizePayloadTextWithResult(payload.response.body);
  if (responseBody.dropped) {
    emitSanitizationAuditEvent(
      'network.response.body',
      responseBody.reason ?? 'unclassified-sensitive-text',
    );
  }

  const sanitizedPayload: NetworkEventPayload = {
    ...payload,
    url: sanitizedUrl.value,
    request: {
      ...payload.request,
      headers: sanitizeStructuredSegment(payload.request.headers, 'network.request.headers', {}),
      body: requestBody.value,
    },
    response: {
      ...payload.response,
      headers: sanitizeStructuredSegment(payload.response.headers, 'network.response.headers', {}),
      body: responseBody.value,
    },
  };

  postMessage({
    type: 'BC_EVENT',
    payload: createEvent('network', sanitizedPayload),
  });
}

function emitStateEvents(reason: StateEventPayload['reason']): void {
  const snapshots = stateCollector.collectSnapshots();
  for (const snapshot of snapshots) {
    const sanitizedStateData = sanitizeStructuredSegment(
      snapshot.data,
      `state.${snapshot.source}`,
      '[dropped:unsafe-state]'
    );

    postMessage({
      type: 'BC_EVENT',
      payload: createEvent('state', {
        source: snapshot.source,
        data: sanitizedStateData,
        changed: snapshot.changed,
        reason,
      }),
    });
  }
}

function beginStateCapture(): void {
  if (!config.captureState) return;

  const apiWindow = window as BugCatcherStateAdapterApiWindow;
  apiWindow.__BUGCATCHER_REGISTER_STATE_ADAPTER__ = (name, collector) => {
    registerRuntimeStateAdapter(name, collector);
  };

  stateCollector.registerAdapterErrorListener((error) => {
    postMessage({
      type: 'BC_EVENT',
      payload: createEvent('state', {
        source: 'state-adapter',
        data: {},
        changed: false,
        reason: 'adapter-error',
        adapterName: error.adapterName,
        errorMessage: error.message,
      }),
    });
  });

  emitStateEvents('init');

  window.setInterval(() => {
    if (!config.captureState) return;
    emitStateEvents('interval');
  }, STATE_CAPTURE_INTERVAL_MS);
}

function registerSanitizerRuntimeApi(): void {
  const apiWindow = window as BugCatcherStateAdapterApiWindow;
  apiWindow.__BUGCATCHER_REGISTER_SANITIZER_RULE__ = (rule) => {
    registerSanitizerRule(rule);
  };
}

function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).toString();
  } catch {
    return url;
  }
}

function captureConsole(): void {
  const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

  for (const level of levels) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      if (config.captureConsole) {
        const sequence = nextSequence();
        const serializedArgs = serializeConsoleArgs(args);
        const message = createConsoleMessage(args, MAX_BODY_SIZE);
        postMessage({
          type: 'BC_EVENT',
          payload: createEvent('console', {
            level,
            message,
            args: serializedArgs,
            stack: getConsoleStack(level),
            sequence,
          }),
        });
      }
      original.apply(console, args as []);
    };
  }
}

function captureErrors(): void {
  window.addEventListener('error', async (event) => {
    if (!config.captureErrors) return;

    const sequence = nextSequence();
    const normalized = normalizeWindowError({
      message: event.message,
      error: event.error,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
    const sourceMapResult = await resolveStackWithSourceMap(normalized.stack);

    postMessage({
      type: 'BC_EVENT',
      payload: createEvent('error', {
        ...normalized,
        ...sourceMapResult,
        sequence,
      }),
    });
  });

  window.addEventListener('unhandledrejection', async (event) => {
    if (!config.captureErrors) return;

    const sequence = nextSequence();
    const normalized = normalizeUnhandledRejection(event.reason);
    const sourceMapResult = await resolveStackWithSourceMap(normalized.stack);

    postMessage({
      type: 'BC_EVENT',
      payload: createEvent('error', {
        ...normalized,
        ...sourceMapResult,
        sequence,
      }),
    });
  });
}

function captureFetch(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const start = Date.now();
    const request = new Request(args[0], args[1]);

    try {
      const response = await originalFetch(...args);
      const end = Date.now();

      if (config.captureNetwork) {
        let responseBodyRaw: string | undefined;
        try {
          responseBodyRaw = await response.clone().text();
        } catch {
          responseBodyRaw = undefined;
        }

        const requestBodyResult = truncatePayloadText(
          requestBodyToText(args[1]?.body),
          MAX_NETWORK_BODY_SIZE,
        );
        const responseBodyResult = truncatePayloadText(responseBodyRaw, MAX_NETWORK_BODY_SIZE);
        const requestHeaders = sanitizeHeaders(request.headers);
        const responseHeaders = sanitizeHeaders(response.headers);
        const graphql = detectGraphQLOperation({
          method: request.method,
          url: request.url,
          requestHeaders,
          requestBody: requestBodyResult.text,
        });

        emitNetworkEvent({
          method: request.method,
          url: request.url,
          status: response.status,
          graphql,
          request: {
            headers: requestHeaders,
            body: requestBodyResult.text,
            truncated: requestBodyResult.truncated,
          },
          response: {
            headers: responseHeaders,
            body: responseBodyResult.text,
            size: Number(response.headers.get('content-length') ?? responseBodyRaw?.length ?? 0),
            truncated: responseBodyResult.truncated,
          },
          timing: {
            start,
            end,
            duration: end - start,
          },
        });
      }

      return response;
    } catch (error: unknown) {
      if (config.captureNetwork) {
        const end = Date.now();
        const errorBody = truncatePayloadText(
          error instanceof Error ? error.message : 'Network request failed',
          MAX_NETWORK_BODY_SIZE,
        );
        const requestHeaders = sanitizeHeaders(request.headers);
        const graphql = detectGraphQLOperation({
          method: request.method,
          url: request.url,
          requestHeaders,
          requestBody: requestBodyToText(args[1]?.body),
        });
        emitNetworkEvent({
          method: request.method,
          url: request.url,
          status: 0,
          graphql,
          request: {
            headers: requestHeaders,
          },
          response: {
            headers: {},
            body: errorBody.text,
            size: errorBody.text?.length ?? 0,
            truncated: errorBody.truncated,
          },
          timing: {
            start,
            end,
            duration: end - start,
          },
        });
      }
      throw error;
    }
  };
}

function captureXhr(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  type XhrMeta = {
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody?: string;
    requestTruncated: boolean;
    start: number;
  };

  const xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>();

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    xhrMeta.set(this, {
      method,
      url,
      requestHeaders: {},
      requestBody: undefined,
      requestTruncated: false,
      start: 0,
    });
    originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (header: string, value: string): void {
    const meta = xhrMeta.get(this);
    if (meta) {
      meta.requestHeaders[header] = value;
    }
    originalSetRequestHeader.call(this, header, value);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
    const meta =
      xhrMeta.get(this) ?? {
        method: 'GET',
        url: window.location.href,
        requestHeaders: {},
        requestBody: undefined,
        requestTruncated: false,
        start: 0,
      };

    meta.start = Date.now();
    const requestBody = truncatePayloadText(requestBodyToText(body), MAX_NETWORK_BODY_SIZE);
    meta.requestBody = requestBody.text;
    meta.requestTruncated = requestBody.truncated;
    xhrMeta.set(this, meta);

    this.addEventListener(
      'loadend',
      () => {
        if (!config.captureNetwork) return;

        const end = Date.now();
        const parsedResponseHeaders = parseXhrResponseHeaders(this.getAllResponseHeaders());
        const requestHeaders = sanitizeHeaderRecord(meta.requestHeaders);
        const responseHeaders = sanitizeHeaderRecord(parsedResponseHeaders);
        const responseText =
          this.responseType === '' || this.responseType === 'text'
            ? this.responseText
            : `[${this.responseType || 'unknown'}]`;
        const responseBody = truncatePayloadText(responseText, MAX_NETWORK_BODY_SIZE);
        const graphql = detectGraphQLOperation({
          method: meta.method,
          url: toAbsoluteUrl(meta.url),
          requestHeaders,
          requestBody: meta.requestBody,
        });

        emitNetworkEvent({
          method: meta.method,
          url: toAbsoluteUrl(meta.url),
          status: this.status,
          graphql,
          request: {
            headers: requestHeaders,
            body: meta.requestBody,
            truncated: meta.requestTruncated,
          },
          response: {
            headers: responseHeaders,
            body: responseBody.text,
            size: responseText?.length ?? 0,
            truncated: responseBody.truncated,
          },
          timing: {
            start: meta.start,
            end,
            duration: end - meta.start,
          },
        });
      },
      { once: true },
    );

    originalSend.call(this, body);
  };
}

function captureWebSocket(): void {
  const OriginalWebSocket = window.WebSocket;

  class CapturedWebSocket extends OriginalWebSocket {
    private readonly captureUrl: string;
    private readonly openedAt: number;

    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols as string | string[] | undefined);
      this.captureUrl = typeof url === 'string' ? url : url.toString();
      this.openedAt = Date.now();

      this.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (!config.captureNetwork) return;
        const at = Date.now();
        const body = truncatePayloadText(websocketMessageToText(event.data), MAX_NETWORK_BODY_SIZE);
        emitNetworkEvent({
          method: 'WEBSOCKET_RECV',
          url: this.captureUrl,
          status: 101,
          request: { headers: {} },
          response: {
            headers: {},
            body: body.text,
            size: body.text?.length ?? 0,
            truncated: body.truncated,
          },
          timing: {
            start: at,
            end: at,
            duration: 0,
          },
        });
      });

      this.addEventListener('error', () => {
        if (!config.captureNetwork) return;
        const at = Date.now();
        emitNetworkEvent({
          method: 'WEBSOCKET_ERROR',
          url: this.captureUrl,
          status: 0,
          request: { headers: {} },
          response: {
            headers: {},
            body: 'WebSocket error',
            size: 15,
          },
          timing: {
            start: this.openedAt,
            end: at,
            duration: at - this.openedAt,
          },
        });
      });

      this.addEventListener('close', (event: CloseEvent) => {
        if (!config.captureNetwork) return;
        const at = Date.now();
        emitNetworkEvent({
          method: 'WEBSOCKET_CLOSE',
          url: this.captureUrl,
          status: event.code,
          request: { headers: {} },
          response: {
            headers: {},
            body: event.reason || 'WebSocket closed',
            size: (event.reason || 'WebSocket closed').length,
          },
          timing: {
            start: this.openedAt,
            end: at,
            duration: at - this.openedAt,
          },
        });
      });
    }

    override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      if (config.captureNetwork) {
        const at = Date.now();
        const body = truncatePayloadText(websocketMessageToText(data), MAX_NETWORK_BODY_SIZE);
        emitNetworkEvent({
          method: 'WEBSOCKET_SEND',
          url: this.captureUrl,
          status: 101,
          request: {
            headers: {},
            body: body.text,
            truncated: body.truncated,
          },
          response: {
            headers: {},
            size: 0,
          },
          timing: {
            start: at,
            end: at,
            duration: 0,
          },
        });
      }
      super.send(data);
    }
  }

  window.WebSocket = CapturedWebSocket as typeof WebSocket;
}

function detectEnvironment() {
  const ua = navigator.userAgent;
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('Firefox/')
      ? 'Firefox'
      : ua.includes('Chrome/')
        ? 'Chrome'
        : 'Unknown';

  const browserVersionMatch = ua.match(/(Edg|Firefox|Chrome)\/([\d.]+)/);
  const browserVersion = browserVersionMatch?.[2] ?? 'Unknown';

  const os = ua.includes('Windows')
    ? 'Windows'
    : ua.includes('Mac OS X')
      ? 'macOS'
      : ua.includes('Linux')
        ? 'Linux'
        : 'Unknown';

  return {
    browser,
    browserVersion,
    os,
    osVersion: 'Unknown',
    language: navigator.language,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

async function loadConfig(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({ type: 'BC_CONFIG_REQUEST' })) as BackgroundMessage;
    const nextConfig = response?.payload as ExtensionConfig | undefined;
    if (nextConfig) {
      config = { ...DEFAULT_CONFIG, ...nextConfig };
      registerProjectSanitizerPatterns(config.sanitizationRules ?? []);
    }
  } catch {
    config = { ...DEFAULT_CONFIG };
    registerProjectSanitizerPatterns([]);
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  if (message.type === 'BC_FLUSH_REQUEST') {
    if (config.captureState) {
      emitStateEvents('flush');
    }
    sendResponse({
      type: 'BC_FLUSH_RESPONSE',
      payload: {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

(async () => {
  await loadConfig();
  registerSanitizerRuntimeApi();
  postMessage({ type: 'BC_ENVIRONMENT', payload: detectEnvironment() });
  captureConsole();
  captureErrors();
  captureFetch();
  captureXhr();
  captureWebSocket();
  beginStateCapture();
})();
