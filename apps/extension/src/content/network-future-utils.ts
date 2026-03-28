import type { GraphQLOperationPayload, NetworkEventPayload } from '../shared/types';

const GRAPHQL_OPERATION_PATTERN = /(query|mutation|subscription)\s*([_A-Za-z][_0-9A-Za-z]*)?/;
const URL_FALLBACK_BASE = 'http://localhost';

type GraphQLDetectionInput = {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
};

type GraphQLFormatter = (query: string) => string;

export interface HarArchive {
  log: {
    version: '1.2';
    creator: {
      name: 'BetterBugs';
      version: string;
    };
    entries: HarEntry[];
  };
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: HarNameValue[];
    queryString: HarNameValue[];
    headersSize: number;
    bodySize: number;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: HarNameValue[];
    content: {
      size: number;
      mimeType: string;
      text?: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: {
    send: number;
    wait: number;
    receive: number;
  };
}

interface HarNameValue {
  name: string;
  value: string;
}

export interface NetworkHarCaptureEvent {
  timestamp: number;
  payload: NetworkEventPayload;
}

const defaultGraphQLFormatter: GraphQLFormatter = (query) => query.trim();
let graphQLFormatter: GraphQLFormatter = defaultGraphQLFormatter;

export const NETWORK_CAPTURE_EXTENSIONS = {
  registerGraphQLFormatter,
  formatGraphQLDocument,
  detectGraphQLOperation,
  createHarArchive,
};

export function registerGraphQLFormatter(formatter?: GraphQLFormatter): void {
  graphQLFormatter = formatter ?? defaultGraphQLFormatter;
}

export function formatGraphQLDocument(query: string): string {
  return graphQLFormatter(query);
}

function getHeaderValue(headers: Record<string, string> | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  const lowerKey = key.toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lowerKey) {
      return value;
    }
  }
  return undefined;
}

function parseOperationFromQuery(query: string): GraphQLOperationPayload {
  const normalized = formatGraphQLDocument(query);
  if (!normalized) {
    return {
      operationType: 'unknown',
    };
  }

  if (normalized.startsWith('{')) {
    return {
      operationType: 'query',
    };
  }

  const match = normalized.match(GRAPHQL_OPERATION_PATTERN);
  if (!match) {
    return {
      operationType: 'unknown',
    };
  }

  const operationType = match[1] as GraphQLOperationPayload['operationType'];
  return {
    operationType,
    operationName: match[2],
  };
}

function extractGraphQLRequest(url: string, body: string | undefined, contentType: string | undefined): {
  query?: string;
  operationName?: string;
  hasGraphQLSignal: boolean;
} {
  let queryFromUrl: string | undefined;
  let operationNameFromUrl: string | undefined;
  try {
    const parsed = new URL(url, URL_FALLBACK_BASE);
    queryFromUrl = parsed.searchParams.get('query') ?? undefined;
    operationNameFromUrl = parsed.searchParams.get('operationName') ?? undefined;
  } catch {
    queryFromUrl = undefined;
    operationNameFromUrl = undefined;
  }

  const bodyText = body?.trim();
  const contentTypeLower = (contentType ?? '').toLowerCase();

  let queryFromBody: string | undefined;
  let operationNameFromBody: string | undefined;

  if (bodyText) {
    if (contentTypeLower.includes('application/json')) {
      try {
        const parsedBody = JSON.parse(bodyText) as {
          query?: string;
          operationName?: string;
        };
        queryFromBody = parsedBody.query;
        operationNameFromBody = parsedBody.operationName;
      } catch {
        queryFromBody = undefined;
      }
    }

    if (!queryFromBody) {
      if (contentTypeLower.includes('application/graphql')) {
        queryFromBody = bodyText;
      } else if (GRAPHQL_OPERATION_PATTERN.test(bodyText)) {
        queryFromBody = bodyText;
      }
    }
  }

  const hasGraphQLSignal =
    url.toLowerCase().includes('graphql') ||
    Boolean(queryFromUrl) ||
    Boolean(queryFromBody) ||
    Boolean(operationNameFromBody) ||
    Boolean(operationNameFromUrl);

  return {
    query: queryFromBody ?? queryFromUrl,
    operationName: operationNameFromBody ?? operationNameFromUrl,
    hasGraphQLSignal,
  };
}

export function detectGraphQLOperation(input: GraphQLDetectionInput): GraphQLOperationPayload | undefined {
  const method = input.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    return undefined;
  }

  const request = extractGraphQLRequest(
    input.url,
    input.requestBody,
    getHeaderValue(input.requestHeaders, 'content-type'),
  );

  if (!request.hasGraphQLSignal) {
    return undefined;
  }

  const parsed = request.query ? parseOperationFromQuery(request.query) : { operationType: 'unknown' as const };

  return {
    ...parsed,
    operationName: parsed.operationName ?? request.operationName,
  };
}

function headersToHar(headers: Record<string, string>): HarNameValue[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function queryStringToHar(url: string): HarNameValue[] {
  try {
    const parsed = new URL(url, URL_FALLBACK_BASE);
    return Array.from(parsed.searchParams.entries()).map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function getMimeType(headers: Record<string, string>, fallback: string): string {
  const contentType = getHeaderValue(headers, 'content-type');
  return contentType || fallback;
}

function createHarEntry(event: NetworkHarCaptureEvent): HarEntry {
  const { payload } = event;
  const waitTime = Math.max(payload.timing.duration, 0);

  return {
    startedDateTime: new Date(payload.timing.start).toISOString(),
    time: waitTime,
    request: {
      method: payload.method,
      url: payload.url,
      httpVersion: 'HTTP/1.1',
      headers: headersToHar(payload.request.headers),
      queryString: queryStringToHar(payload.url),
      headersSize: -1,
      bodySize: payload.request.body?.length ?? -1,
      postData: payload.request.body
        ? {
            mimeType: getMimeType(payload.request.headers, 'text/plain'),
            text: payload.request.body,
          }
        : undefined,
    },
    response: {
      status: payload.status,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      headers: headersToHar(payload.response.headers),
      content: {
        size: payload.response.size,
        mimeType: getMimeType(payload.response.headers, 'application/octet-stream'),
        text: payload.response.body,
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: payload.response.body?.length ?? -1,
    },
    cache: {},
    timings: {
      send: 0,
      wait: waitTime,
      receive: 0,
    },
  };
}

export function createHarArchive(
  events: NetworkHarCaptureEvent[],
  appVersion: string = '0.1.0',
): HarArchive {
  return {
    log: {
      version: '1.2',
      creator: {
        name: 'BetterBugs',
        version: appVersion,
      },
      entries: events.map(createHarEntry),
    },
  };
}