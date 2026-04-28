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

export type CaptureState = 'idle' | 'recording' | 'review';

export interface TabCaptureStatus {
  state: CaptureState;
  startTime?: number;
  stopTime?: number;
  eventCount?: number;
  durationMs?: number;
}

export interface ScreenshotPreview {
  dataUrl: string;
  capturedAt: string;
  storedPath?: string;
}

export interface VideoPreview {
  objectUrl: string;
  capturedAt: string;
  durationMs?: number;
  storedPath?: string;
}

export interface CaptureMediaMetadata {
  resolution: '720p' | '1080p';
  frameRate: number;
  bufferWindowMs: number;
  frozenAt: string;
  eventCount: number;
}

export type AiProvider = 'none' | 'openai' | 'ollama' | 'custom';

export interface AiProviderConfig {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  codeContextEnabled: boolean;
  embeddingsEnabled: boolean;
  repositoryRef: string;
  maxCodeContextFiles: number;
}

export interface GitHubExportConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  token: string;
  labels: string;
  assignees: string;
}

export interface GitLabExportConfig {
  enabled: boolean;
  baseUrl: string;
  projectId: string;
  token: string;
  labels: string;
  assigneeIds: string;
}

export interface LinearExportConfig {
  enabled: boolean;
  apiUrl: string;
  teamId: string;
  token: string;
  labelIds: string;
  assigneeId: string;
}

export type ShareLinkPermission = 'viewer' | 'commenter' | 'editor';

export interface ShareLinkConfig {
  enabled: boolean;
  baseUrl: string;
  defaultPermission: ShareLinkPermission;
  defaultExpiryHours: number;
  requireAuth: boolean;
}

export interface RoutingConfig {
  enabled: boolean;
  ownershipRules: string;
  labelRules: string;
}

export interface NotificationConfig {
  enabled: boolean;
  slackWebhookUrl: string;
  webhookUrl: string;
  maxRetries: number;
  retryBackoffMs: number;
}

export type ExportDestination = 'github' | 'gitlab' | 'linear' | 'share-link';

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
  ai: AiProviderConfig;
  github: GitHubExportConfig;
  gitlab: GitLabExportConfig;
  linear: LinearExportConfig;
  shareLinks: ShareLinkConfig;
  routing: RoutingConfig;
  notifications: NotificationConfig;
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
  ai: {
    enabled: false,
    provider: 'none',
    model: '',
    baseUrl: '',
    apiKey: '',
    temperature: 0.2,
    maxTokens: 700,
    codeContextEnabled: false,
    embeddingsEnabled: false,
    repositoryRef: '',
    maxCodeContextFiles: 5,
  },
  github: {
    enabled: false,
    owner: '',
    repo: '',
    token: '',
    labels: '',
    assignees: '',
  },
  gitlab: {
    enabled: false,
    baseUrl: 'https://gitlab.com',
    projectId: '',
    token: '',
    labels: '',
    assigneeIds: '',
  },
  linear: {
    enabled: false,
    apiUrl: 'https://api.linear.app/graphql',
    teamId: '',
    token: '',
    labelIds: '',
    assigneeId: '',
  },
  shareLinks: {
    enabled: true,
    baseUrl: '',
    defaultPermission: 'viewer',
    defaultExpiryHours: 72,
    requireAuth: true,
  },
  routing: {
    enabled: true,
    ownershipRules: '',
    labelRules: '',
  },
  notifications: {
    enabled: false,
    slackWebhookUrl: '',
    webhookUrl: '',
    maxRetries: 3,
    retryBackoffMs: 1000,
  },
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
    | 'BC_CAPTURE_PREVIEW_RESPONSE'
    | 'BC_CAPTURE_START_REQUEST'
    | 'BC_CAPTURE_START_RESPONSE'
    | 'BC_CAPTURE_STOP_REQUEST'
    | 'BC_CAPTURE_STOP_RESPONSE'
    | 'BC_CAPTURE_STATE_REQUEST'
    | 'BC_CAPTURE_STATE_RESPONSE'
    | 'BC_CAPTURE_SCREENSHOT_REQUEST'
    | 'BC_CAPTURE_SCREENSHOT_RESPONSE'
    | 'BC_CAPTURE_SCREENSHOT_PREVIEW_REQUEST'
    | 'BC_CAPTURE_SCREENSHOT_PREVIEW_RESPONSE'
    | 'BC_CAPTURE_VIDEO_START_REQUEST'
    | 'BC_CAPTURE_VIDEO_START_RESPONSE'
    | 'BC_CAPTURE_VIDEO_STOP_REQUEST'
    | 'BC_CAPTURE_VIDEO_STOP_RESPONSE'
    | 'BC_CAPTURE_VIDEO_PREVIEW_REQUEST'
    | 'BC_CAPTURE_VIDEO_PREVIEW_RESPONSE'
    | 'BC_GET_SESSIONS_REQUEST'
    | 'BC_GET_SESSIONS_RESPONSE'
    | 'BC_GET_SESSION_DETAIL_REQUEST'
    | 'BC_GET_SESSION_DETAIL_RESPONSE'
    | 'BC_SEARCH_SESSIONS_REQUEST'
    | 'BC_SEARCH_SESSIONS_RESPONSE'
    | 'BC_ADD_COMMENT_REQUEST'
    | 'BC_ADD_COMMENT_RESPONSE'
    | 'BC_ADD_TAG_REQUEST'
    | 'BC_ADD_TAG_RESPONSE'
    | 'BC_DELETE_SESSION_REQUEST'
    | 'BC_DELETE_SESSION_RESPONSE'
    | 'BC_TEST_API_CONNECTION_REQUEST'
    | 'BC_TEST_API_CONNECTION_RESPONSE'
    | 'BC_AI_ANALYZE_SESSION_REQUEST'
    | 'BC_AI_ANALYZE_SESSION_RESPONSE'
    | 'BC_EXPORT_GITHUB_ISSUE_REQUEST'
    | 'BC_EXPORT_GITHUB_ISSUE_RESPONSE'
    | 'BC_EXPORT_DESTINATION_REQUEST'
    | 'BC_EXPORT_DESTINATION_RESPONSE';
  payload?: T;
}
