import {
  type BackgroundMessage,
  type CaptureEvent,
  type ConsoleLevel,
  type ExtensionConfig,
  DEFAULT_CONFIG,
} from '../shared/types';

const MAX_BODY_SIZE = 2048;
let config: ExtensionConfig = { ...DEFAULT_CONFIG };

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

function trimText(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return input.length > MAX_BODY_SIZE ? `${input.slice(0, MAX_BODY_SIZE)}...[truncated]` : input;
}

function toHeadersObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('cookie') || lower.includes('token')) {
      out[key] = '[redacted]';
    } else {
      out[key] = value;
    }
  });
  return out;
}

function captureConsole(): void {
  const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

  for (const level of levels) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      if (config.captureConsole) {
        const message = args
          .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
          .join(' ')
          .slice(0, MAX_BODY_SIZE);
        postMessage({
          type: 'BC_EVENT',
          payload: createEvent('console', {
            level,
            message,
            args,
          }),
        });
      }
      original.apply(console, args as []);
    };
  }
}

function captureErrors(): void {
  window.addEventListener('error', (event) => {
    if (!config.captureErrors) return;

    postMessage({
      type: 'BC_EVENT',
      payload: createEvent('error', {
        message: event.message,
        stack: event.error?.stack,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      }),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!config.captureErrors) return;

    const reason = event.reason;
    postMessage({
      type: 'BC_EVENT',
      payload: createEvent('error', {
        message: typeof reason === 'string' ? reason : 'Unhandled promise rejection',
        stack: reason?.stack,
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
        let responseBody: string | undefined;
        try {
          responseBody = trimText(await response.clone().text());
        } catch {
          responseBody = undefined;
        }

        let requestBody: string | undefined;
        try {
          requestBody = trimText(args[1]?.body ? String(args[1].body) : undefined);
        } catch {
          requestBody = undefined;
        }

        postMessage({
          type: 'BC_EVENT',
          payload: createEvent('network', {
            method: request.method,
            url: request.url,
            status: response.status,
            request: {
              headers: toHeadersObject(request.headers),
              body: requestBody,
            },
            response: {
              headers: toHeadersObject(response.headers),
              body: responseBody,
              size: Number(response.headers.get('content-length') ?? 0),
            },
            timing: {
              start,
              end,
              duration: end - start,
            },
          }),
        });
      }

      return response;
    } catch (error: unknown) {
      if (config.captureNetwork) {
        const end = Date.now();
        postMessage({
          type: 'BC_EVENT',
          payload: createEvent('network', {
            method: request.method,
            url: request.url,
            status: 0,
            request: {
              headers: toHeadersObject(request.headers),
            },
            response: {
              headers: {},
              body: error instanceof Error ? error.message : 'Network request failed',
              size: 0,
            },
            timing: {
              start,
              end,
              duration: end - start,
            },
          }),
        });
      }
      throw error;
    }
  };
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
    }
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  if (message.type === 'BC_FLUSH_REQUEST') {
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
  postMessage({ type: 'BC_ENVIRONMENT', payload: detectEnvironment() });
  captureConsole();
  captureErrors();
  captureFetch();
})();
