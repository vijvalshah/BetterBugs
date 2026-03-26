export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export type EventType = 'console' | 'network' | 'error';

export interface ConsoleEventPayload {
  level: ConsoleLevel;
  message: string;
  args?: unknown[];
  stack?: string;
}

export interface NetworkEventPayload {
  method: string;
  url: string;
  status: number;
  request: {
    headers: Record<string, string>;
    body?: string;
  };
  response: {
    headers: Record<string, string>;
    body?: string;
    size: number;
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
  source?: string;
  line?: number;
  column?: number;
}

export interface CaptureEvent {
  id: string;
  type: EventType;
  timestamp: number;
  payload: ConsoleEventPayload | NetworkEventPayload | ErrorEventPayload;
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
  };
}

export interface ExtensionConfig {
  apiBaseUrl: string;
  projectId: string;
  projectKey: string;
  captureNetwork: boolean;
  captureConsole: boolean;
  captureErrors: boolean;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  apiBaseUrl: 'http://localhost:3001/api/v1',
  projectId: 'dev-project',
  projectKey: '',
  captureNetwork: true,
  captureConsole: true,
  captureErrors: true,
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
    | 'BC_CONFIG_SAVE';
  payload?: T;
}
