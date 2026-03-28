export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export type EventType = 'console' | 'network' | 'error' | 'state';

export interface ConsoleEventPayload {
  level: ConsoleLevel;
  message: string;
  args?: unknown[];
  stack?: string;
  sequence?: number;
}

export interface NetworkEventPayload {
  method: string;
  url: string;
  status: number;
  graphql?: GraphQLOperationPayload;
  request: {
    headers: Record<string, string>;
    body?: string;
    truncated?: boolean;
  };
  response: {
    headers: Record<string, string>;
    body?: string;
    size: number;
    truncated?: boolean;
  };
  timing: {
    start: number;
    end: number;
    duration: number;
  };
}

export interface ErrorEventPayload {
  message: string;
  stack?: string;
  sourceMappedStack?: string;
  sourceMapStatus?: 'mapped' | 'unmapped' | 'resolver-error';
  type?: string;
  severity?: 'error' | 'unhandledrejection';
  sequence?: number;
  source?: string;
  line?: number;
  column?: number;
}

export interface StateEventPayload {
  source: 'localStorage' | 'sessionStorage' | 'cookie' | 'redux' | string;
  data: unknown;
  changed?: boolean;
  reason?: 'init' | 'interval' | 'flush' | 'adapter-error';
  adapterName?: string;
  errorMessage?: string;
}

export interface GraphQLOperationPayload {
  operationType: 'query' | 'mutation' | 'subscription' | 'unknown';
  operationName?: string;
}

export interface CaptureEvent {
  id: string;
  type: EventType;
  timestamp: number;
  payload: ConsoleEventPayload | NetworkEventPayload | ErrorEventPayload | StateEventPayload;
}

export interface EnvironmentInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  language: string;
  viewport: {
    width: number;
    height: number;
  };
}

export interface SessionPayload {
  projectId: string;
  url: string;
  title?: string;
  timestamp: string;
  environment: EnvironmentInfo;
  events: CaptureEvent[];
  media: {
    hasReplay: boolean;
    metadata?: CaptureMediaMetadata;
  };
}

export interface CaptureMediaMetadata {
  resolution: '720p' | '1080p';
  frameRate: number;
  bufferWindowMs: number;
  frozenAt: string;
  eventCount: number;
}

export interface ExtensionConfig {
  apiBaseUrl: string;
  projectId: string;
  projectKey: string;
  captureNetwork: boolean;
  captureConsole: boolean;
  captureErrors: boolean;
  captureState: boolean;
  sanitizationRules?: string[];
  captureResolution: '720p' | '1080p';
  captureFrameRate: number;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  apiBaseUrl: 'http://localhost:3001/api/v1',
  projectId: 'dev-project',
  projectKey: '',
  captureNetwork: true,
  captureConsole: true,
  captureErrors: true,
  captureState: true,
  captureResolution: '1080p',
  captureFrameRate: 30,
};

export interface BackgroundMessage<T = unknown> {
  type:
    | 'BC_EVENT'
    | 'BC_ENVIRONMENT'
    | 'BC_FLUSH_REQUEST'
    | 'BC_FLUSH_RESPONSE'
    | 'BC_CONFIG_REQUEST'
    | 'BC_CONFIG_RESPONSE'
    | 'BC_STATUS_UPDATE'
    | 'BC_CAPTURE_NOW'
    | 'BC_CAPTURE_RESULT'
    | 'BC_CONFIG_SAVE'
    | 'BC_CAPTURE_PREVIEW_REQUEST'
    | 'BC_CAPTURE_PREVIEW_RESPONSE';
  payload?: T;
}
