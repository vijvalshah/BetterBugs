import type { AiProviderConfig } from '../shared/types';
import type { ApiSessionDetail } from '../shared/api-client';

export interface AiCodeContextFile {
  path: string;
  reason: string;
  score: number;
  lineHint?: string;
}

export interface AiAnalysisRunOptions {
  includeCodeContext?: boolean;
  modelOverride?: string;
}

export interface AiAnalysisResult {
  summary: string;
  rootCause: string;
  suggestedFiles: string[];
  actions: string[];
  confidence: number;
  provider: string;
  model: string;
  status: 'completed' | 'fallback';
  classification?: string;
  costUsd?: number;
  similarIssueHints?: string[];
  provenance?: string[];
  codeContextFiles?: AiCodeContextFile[];
  crossFileTraces?: string[];
}

type PreparedCodeContext = {
  enabled: boolean;
  repositoryRef: string;
  files: AiCodeContextFile[];
  traces: string[];
  provenance: string[];
};

type OpenAiLikeResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const FILE_TOKEN_PATTERN =
  /(?:[A-Za-z0-9_~.-]+\/)*[A-Za-z0-9_~.-]+\.(?:ts|tsx|js|jsx|go|py|java|rb|php|cs|swift|kt|rs|vue|svelte)(?::\d+(?::\d+)?)?/gi;
const STACK_LINE_PATTERN =
  /(?:at\s+.*?\()?([^\s)]+\.(?:ts|tsx|js|jsx|go|py|java|rb|php|cs|swift|kt|rs|vue|svelte)(?::\d+(?::\d+)?)?)/gi;
const DEFAULT_CONTEXT_FILES_LIMIT = 5;

function stripCodeFences(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const lines = trimmed.split('\n');
  if (lines.length < 3) {
    return trimmed;
  }

  return lines.slice(1, lines[lines.length - 1] === '```' ? -1 : lines.length).join('\n').trim();
}

function safeParseJson(content: string): Record<string, unknown> | null {
  const normalized = stripCodeFences(content);
  try {
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return null;
    }

    const fragment = normalized.slice(start, end + 1);
    try {
      return JSON.parse(fragment) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }

  return output;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

function normalizeFileToken(raw: string): string | null {
  let token = raw.trim().replace(/^["'(]+|["'),]+$/g, '');
  if (!token) {
    return null;
  }

  token = token.replace(/^webpack:\/\//, '').replace(/^file:\/\//, '');

  if (/^https?:\/\//i.test(token)) {
    try {
      const parsed = new URL(token);
      token = `${parsed.pathname}${parsed.search}`;
    } catch {
      // Keep original token when URL parsing fails.
    }
  }

  token = token.replace(/^\/+/, '');
  if (!token.includes('.')) {
    return null;
  }

  return token.slice(0, 220);
}

function extractFileTokensFromText(text: string): string[] {
  const matcher = new RegExp(FILE_TOKEN_PATTERN.source, 'gi');
  const values: string[] = [];
  const scopedText = text.slice(0, 6000);

  for (const match of scopedText.matchAll(matcher)) {
    const normalized = normalizeFileToken(match[0]);
    if (normalized) {
      values.push(normalized);
    }
  }

  return values;
}

function extractCrossFileTraces(stack: string, maxTraces: number): string[] {
  const matcher = new RegExp(STACK_LINE_PATTERN.source, 'gi');
  const orderedPaths: string[] = [];

  for (const match of stack.slice(0, 6000).matchAll(matcher)) {
    const normalized = normalizeFileToken(match[1] || match[0]);
    if (normalized) {
      orderedPaths.push(normalized);
    }
  }

  const traces: string[] = [];
  for (let index = 0; index < orderedPaths.length - 1 && traces.length < maxTraces; index += 1) {
    const from = orderedPaths[index];
    const to = orderedPaths[index + 1];
    if (from !== to) {
      traces.push(`${from} -> ${to}`);
    }
  }

  return dedupeStrings(traces).slice(0, maxTraces);
}

function addFileHit(
  map: Map<string, { score: number; reasons: Set<string>; lineHint?: string }>,
  filePath: string,
  reason: string,
  weight: number,
): void {
  const existing = map.get(filePath) || { score: 0, reasons: new Set<string>(), lineHint: undefined };
  existing.score += weight;
  existing.reasons.add(reason);

  if (!existing.lineHint) {
    const lineMatch = /:(\d+(?::\d+)?)$/.exec(filePath);
    if (lineMatch) {
      existing.lineHint = lineMatch[1];
    }
  }

  map.set(filePath, existing);
}

function extractCodeContextFromSession(session: ApiSessionDetail, maxFiles: number): {
  files: AiCodeContextFile[];
  traces: string[];
} {
  const fileHits = new Map<string, { score: number; reasons: Set<string>; lineHint?: string }>();
  const traces: string[] = [];

  for (const event of session.events.slice(0, 160)) {
    const payload = event.payload || {};

    const sourceMappedStack = typeof payload.sourceMappedStack === 'string' ? payload.sourceMappedStack : '';
    const stack = typeof payload.stack === 'string' ? payload.stack : '';
    const source = typeof payload.source === 'string' ? payload.source : '';
    const filename = typeof payload.filename === 'string' ? payload.filename : '';

    for (const filePath of extractFileTokensFromText(sourceMappedStack)) {
      addFileHit(fileHits, filePath, 'source-mapped-stack', 4);
    }

    for (const filePath of extractFileTokensFromText(stack)) {
      addFileHit(fileHits, filePath, 'stack-trace', 3);
    }

    for (const filePath of extractFileTokensFromText(source)) {
      addFileHit(fileHits, filePath, 'runtime-source', 2);
    }

    for (const filePath of extractFileTokensFromText(filename)) {
      addFileHit(fileHits, filePath, 'runtime-filename', 2);
    }

    if (event.type === 'network' && typeof payload.url === 'string') {
      for (const filePath of extractFileTokensFromText(payload.url)) {
        addFileHit(fileHits, filePath, 'network-resource', 1);
      }
    }

    for (const trace of extractCrossFileTraces(sourceMappedStack || stack, 6)) {
      traces.push(trace);
    }
  }

  const files = Array.from(fileHits.entries())
    .sort((left, right) => right[1].score - left[1].score)
    .slice(0, maxFiles)
    .map(([path, metadata]) => ({
      path,
      reason: Array.from(metadata.reasons).join(', '),
      score: Number(metadata.score.toFixed(2)),
      lineHint: metadata.lineHint,
    }));

  return {
    files,
    traces: dedupeStrings(traces).slice(0, 8),
  };
}

function buildSessionDigest(session: ApiSessionDetail): string {
  const digestEvents = session.events
    .slice(0, 60)
    .map((event) => {
      const payload = event.payload || {};
      const pairs = Object.entries(payload)
        .slice(0, 6)
        .map(([key, value]) => `${key}=${String(value).slice(0, 120)}`)
        .join(' ');
      return `t=${event.timestamp} type=${event.type} ${pairs}`;
    })
    .join('\n');

  const errorText = session.error
    ? `${session.error.type}: ${session.error.message}`
    : 'no explicit runtime error recorded';

  return [
    `sessionId: ${session.sessionId}`,
    `url: ${session.url}`,
    `title: ${session.title || 'untitled'}`,
    `error: ${errorText}`,
    `stats: console=${session.stats.consoleCount}, network=${session.stats.networkCount}, state=${session.stats.stateSnapshots}`,
    'events:',
    digestEvents,
  ].join('\n');
}

function buildCodeContextDigest(codeContext: PreparedCodeContext): string {
  if (!codeContext.enabled) {
    return 'code_context: disabled';
  }

  const files = codeContext.files
    .map((file) => `${file.path} | score=${file.score} | reason=${file.reason}${file.lineHint ? ` | line=${file.lineHint}` : ''}`)
    .join('\n');

  const traces = codeContext.traces.join('\n');

  return [
    `code_context.repository: ${codeContext.repositoryRef}`,
    'code_context.files:',
    files || 'none',
    'code_context.cross_file_traces:',
    traces || 'none',
  ].join('\n');
}

export function validateAiProviderConfig(config: AiProviderConfig): string | null {
  if (!config.enabled) {
    return 'AI analysis is disabled. Enable it in options to run analysis.';
  }

  if (config.provider === 'none') {
    return 'Select an AI provider before running analysis.';
  }

  if (!config.model.trim()) {
    return 'Model is required before running analysis.';
  }

  if ((config.provider === 'openai' || config.provider === 'custom') && !config.apiKey.trim()) {
    return 'API key is required for selected provider.';
  }

  if ((config.provider === 'ollama' || config.provider === 'custom') && !config.baseUrl.trim()) {
    return 'Base URL is required for selected provider.';
  }

  if (config.temperature < 0 || config.temperature > 1) {
    return 'Temperature must be between 0 and 1.';
  }

  if (config.maxTokens < 64 || config.maxTokens > 4096) {
    return 'Max tokens must be between 64 and 4096.';
  }

  if (config.maxCodeContextFiles < 1 || config.maxCodeContextFiles > 12) {
    return 'Max code context files must be between 1 and 12.';
  }

  if (config.codeContextEnabled && !config.repositoryRef.trim()) {
    return 'Repository reference is required when code-context analysis is enabled.';
  }

  if (config.codeContextEnabled && !config.embeddingsEnabled) {
    return 'Embeddings must be enabled when code-context analysis is enabled.';
  }

  return null;
}

function buildAnalysisPrompt(session: ApiSessionDetail, codeContext: PreparedCodeContext): string {
  const digest = buildSessionDigest(session);
  const contextDigest = buildCodeContextDigest(codeContext);

  return [
    'You are a debugging assistant. Return compact JSON only with keys:',
    'summary (string), rootCause (string), suggestedFiles (string[]), actions (string[]), confidence (0..1), classification (string), similarIssueHints (string[]), provenance (string[]), codeContextFiles ({path,reason,score,lineHint}[]), crossFileTraces (string[]).',
    'Keep summary concise and actionable.',
    '',
    digest,
    '',
    contextDigest,
  ].join('\n');
}

function asCodeContextFiles(value: unknown, maxFiles: number): AiCodeContextFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: AiCodeContextFile[] = [];

  for (const entry of value) {
    if (typeof entry === 'string') {
      const normalized = normalizeFileToken(entry);
      if (normalized) {
        output.push({ path: normalized, reason: 'provider-suggested', score: 1 });
      }
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as {
      path?: unknown;
      file?: unknown;
      reason?: unknown;
      score?: unknown;
      lineHint?: unknown;
      line?: unknown;
    };

    const path = typeof candidate.path === 'string'
      ? candidate.path
      : typeof candidate.file === 'string'
        ? candidate.file
        : '';
    const normalizedPath = normalizeFileToken(path);
    if (!normalizedPath) {
      continue;
    }

    const reason = typeof candidate.reason === 'string' && candidate.reason.trim().length > 0
      ? candidate.reason.trim()
      : 'provider-suggested';

    const lineHint = typeof candidate.lineHint === 'string'
      ? candidate.lineHint
      : typeof candidate.line === 'number'
        ? String(candidate.line)
        : undefined;

    output.push({
      path: normalizedPath,
      reason,
      score: Number(asNumber(candidate.score, 1).toFixed(2)),
      lineHint,
    });
  }

  const deduped = new Map<string, AiCodeContextFile>();
  for (const file of output) {
    const existing = deduped.get(file.path);
    if (!existing || file.score > existing.score) {
      deduped.set(file.path, file);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, maxFiles);
}

function normalizeResult(
  parsed: Record<string, unknown> | null,
  provider: string,
  model: string,
  codeContext: PreparedCodeContext,
): AiAnalysisResult {
  const summary = typeof parsed?.summary === 'string' ? parsed.summary : 'Analysis completed.';
  const rootCause = typeof parsed?.rootCause === 'string'
    ? parsed.rootCause
    : 'Insufficient signal for confident root-cause classification.';
  const confidenceValue = typeof parsed?.confidence === 'number' ? parsed.confidence : 0.45;

  const parsedContextFiles = asCodeContextFiles(parsed?.codeContextFiles, codeContext.files.length || DEFAULT_CONTEXT_FILES_LIMIT);
  const codeContextFiles = parsedContextFiles.length > 0 ? parsedContextFiles : codeContext.files;

  const suggestedFiles = asStringArray(parsed?.suggestedFiles);
  const mergedSuggestedFiles = suggestedFiles.length > 0
    ? suggestedFiles
    : codeContextFiles.map((file) => file.path).slice(0, 8);

  const parsedProvenance = asStringArray(parsed?.provenance);
  const provenance = dedupeStrings([
    ...parsedProvenance,
    ...codeContext.provenance,
    `provider:${provider}`,
    `model:${model}`,
  ]);

  const crossFileTraces = dedupeStrings([
    ...asStringArray(parsed?.crossFileTraces),
    ...codeContext.traces,
  ]).slice(0, 8);

  return {
    summary,
    rootCause,
    suggestedFiles: mergedSuggestedFiles,
    actions: asStringArray(parsed?.actions),
    confidence: Math.min(Math.max(confidenceValue, 0), 1),
    provider,
    model,
    status: 'completed',
    classification: typeof parsed?.classification === 'string' ? parsed.classification : undefined,
    similarIssueHints: asStringArray(parsed?.similarIssueHints),
    provenance,
    codeContextFiles,
    crossFileTraces,
  };
}

function heuristicFallback(
  session: ApiSessionDetail,
  provider: string,
  model: string,
  reason: string,
  codeContext: PreparedCodeContext,
): AiAnalysisResult {
  const inferredRoot = session.error?.message
    ? `Likely tied to captured error: ${session.error.message}`
    : 'No explicit error payload; likely workflow/state or network sequencing issue.';

  const actions = [
    'Inspect synchronized console and network events around failure timestamp.',
    'Compare state snapshots before and after the failing moment.',
    'Replay from nearest bookmark and verify deterministic reproduction.',
  ];

  if (codeContext.enabled) {
    actions.push('Inspect top code-context files and trace edges for ownership boundaries.');
  }

  return {
    summary: `Fallback analysis used because provider call failed (${reason}).`,
    rootCause: inferredRoot,
    suggestedFiles: codeContext.files.map((file) => file.path).slice(0, 8),
    actions,
    confidence: 0.35,
    provider,
    model,
    status: 'fallback',
    classification: session.error ? 'runtime-error' : 'unknown',
    similarIssueHints: [],
    provenance: dedupeStrings(['fallback-heuristic', ...codeContext.provenance, `provider:${provider}`, `model:${model}`]),
    codeContextFiles: codeContext.files,
    crossFileTraces: codeContext.traces,
  };
}

function prepareCodeContext(
  config: AiProviderConfig,
  session: ApiSessionDetail,
  options?: AiAnalysisRunOptions,
): PreparedCodeContext {
  const includeRequested = Boolean(options?.includeCodeContext);
  const repositoryRef = config.repositoryRef.trim();
  const configured = config.codeContextEnabled && config.embeddingsEnabled && repositoryRef.length > 0;

  if (!includeRequested || !configured) {
    return {
      enabled: false,
      repositoryRef,
      files: [],
      traces: [],
      provenance: [
        includeRequested ? 'code-context:requested-unavailable' : 'code-context:not-requested',
      ],
    };
  }

  const maxFiles = Math.min(Math.max(config.maxCodeContextFiles || DEFAULT_CONTEXT_FILES_LIMIT, 1), 12);
  const extracted = extractCodeContextFromSession(session, maxFiles);

  return {
    enabled: true,
    repositoryRef,
    files: extracted.files,
    traces: extracted.traces,
    provenance: [
      'code-context:enabled',
      `repository:${repositoryRef}`,
      'embeddings:enabled',
      `context-files:${extracted.files.length}`,
      `context-traces:${extracted.traces.length}`,
    ],
  };
}

async function callOpenAiLike(
  config: AiProviderConfig,
  prompt: string,
  codeContext: PreparedCodeContext,
): Promise<AiAnalysisResult> {
  const base = config.provider === 'openai'
    ? (config.baseUrl.trim() || 'https://api.openai.com/v1')
    : config.baseUrl.trim();
  const endpoint = `${base.replace(/\/+$/, '')}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        messages: [
          {
            role: 'system',
            content: 'You return only compact JSON. No markdown wrappers.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`provider returned ${response.status}`);
    }

    const payload = (await response.json()) as OpenAiLikeResponse;
    const content = payload.choices?.[0]?.message?.content || '';
    const parsed = safeParseJson(content);
    const result = normalizeResult(parsed, config.provider, config.model, codeContext);

    if (payload.usage?.total_tokens) {
      // Lightweight cost estimate placeholder until provider-specific pricing config exists.
      result.costUsd = Number((payload.usage.total_tokens * 0.000002).toFixed(6));
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOllama(
  config: AiProviderConfig,
  prompt: string,
  codeContext: PreparedCodeContext,
): Promise<AiAnalysisResult> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/api/generate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`provider returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      response?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const parsed = safeParseJson(payload.response || '');
    const result = normalizeResult(parsed, config.provider, config.model, codeContext);

    const totalTokens = (payload.prompt_eval_count || 0) + (payload.eval_count || 0);
    if (totalTokens > 0) {
      result.costUsd = 0;
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runAiAnalysis(
  config: AiProviderConfig,
  session: ApiSessionDetail,
  options?: AiAnalysisRunOptions,
): Promise<AiAnalysisResult> {
  const modelOverride = options?.modelOverride?.trim();
  const effectiveConfig: AiProviderConfig = {
    ...config,
    model: modelOverride && modelOverride.length > 0 ? modelOverride : config.model,
  };

  const validationError = validateAiProviderConfig(effectiveConfig);
  if (validationError) {
    throw new Error(validationError);
  }

  const codeContext = prepareCodeContext(effectiveConfig, session, options);
  const prompt = buildAnalysisPrompt(session, codeContext);

  try {
    if (effectiveConfig.provider === 'openai' || effectiveConfig.provider === 'custom') {
      return await callOpenAiLike(effectiveConfig, prompt, codeContext);
    }

    if (effectiveConfig.provider === 'ollama') {
      return await callOllama(effectiveConfig, prompt, codeContext);
    }

    throw new Error('unsupported provider');
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'unknown provider failure';
    return heuristicFallback(session, effectiveConfig.provider, effectiveConfig.model, reason, codeContext);
  }
}
