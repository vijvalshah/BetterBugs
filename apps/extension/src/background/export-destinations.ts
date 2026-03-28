import type { ApiSessionDetail } from '../shared/api-client';
import type {
  ExtensionConfig,
  ExportDestination,
  GitLabExportConfig,
  LinearExportConfig,
  RoutingConfig,
  ShareLinkConfig,
  ShareLinkPermission,
} from '../shared/types';
import { createGitHubIssue } from './github-export';

export interface ExportAnalysisHint {
  summary?: string;
  rootCause?: string;
  classification?: string;
  actions?: string[];
  suggestedFiles?: string[];
}

export interface ExportArtifactResult {
  destination: ExportDestination;
  artifactUrl: string;
  artifactId?: string;
  artifactTitle?: string;
  permission?: ShareLinkPermission;
  expiresAt?: string;
  metadata: Record<string, string | number | boolean>;
  routing?: RoutingRecommendation;
}

export interface RoutingRecommendation {
  labels: string[];
  assignees: string[];
  reasons: string[];
}

function splitCsv(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function splitCsvToNumbers(input: string): number[] {
  return splitCsv(input)
    .map((item) => Number.parseInt(item, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function truncate(input: string, maxLength: number): string {
  return input.length > maxLength ? `${input.slice(0, maxLength - 3)}...` : input;
}

function normalizeRoutingToken(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseRoutingRuleEntries(input: string): Array<{ pattern: string; values: string[] }> {
  return input
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.includes('=>') ? '=>' : ':';
      const separatorIndex = entry.indexOf(separator);
      if (separatorIndex <= 0) {
        return null;
      }

      const pattern = entry.slice(0, separatorIndex).trim().toLowerCase();
      const rawValue = entry.slice(separatorIndex + separator.length).trim();
      const values = rawValue
        .split('|')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (!pattern || values.length === 0) {
        return null;
      }

      return { pattern, values };
    })
    .filter((entry): entry is { pattern: string; values: string[] } => Boolean(entry));
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function mergeCsv(baseValue: string, additions: string[]): string {
  return uniqueValues([...splitCsv(baseValue), ...additions.map((item) => item.trim()).filter(Boolean)]).join(',');
}

function computeSeverityLevel(session: ApiSessionDetail): 'critical' | 'high' | 'medium' | 'low' {
  let score = 0;
  if (session.error) {
    score += 60;
  }
  score += Math.min(session.stats.consoleCount, 50) * 0.4;
  score += Math.min(session.stats.networkCount, 50) * 0.25;
  score += Math.min(session.stats.stateSnapshots, 30) * 0.2;

  if (score >= 85) {
    return 'critical';
  }

  if (score >= 60) {
    return 'high';
  }

  if (score >= 35) {
    return 'medium';
  }

  return 'low';
}

export function buildRoutingRecommendation(
  config: RoutingConfig,
  session: ApiSessionDetail,
  analysis?: ExportAnalysisHint,
): RoutingRecommendation {
  if (!config.enabled) {
    return {
      labels: [],
      assignees: [],
      reasons: [],
    };
  }

  const labels = new Set<string>();
  const assignees = new Set<string>();
  const reasons: string[] = [];

  labels.add('bug');
  labels.add(`severity:${computeSeverityLevel(session)}`);

  if (analysis?.classification?.trim()) {
    const token = normalizeRoutingToken(analysis.classification);
    if (token) {
      labels.add(`classification:${token}`);
      reasons.push(`classification:${token}`);
    }
  }

  if (session.error?.type) {
    const token = normalizeRoutingToken(session.error.type);
    if (token) {
      labels.add(`error:${token}`);
    }
  }

  const context = [
    session.url,
    session.title,
    session.error?.message,
    session.error?.type,
    analysis?.summary,
    analysis?.rootCause,
    analysis?.classification,
    ...(analysis?.suggestedFiles || []),
  ]
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .join(' ')
    .toLowerCase();

  for (const rule of parseRoutingRuleEntries(config.labelRules)) {
    if (!context.includes(rule.pattern)) {
      continue;
    }

    for (const value of rule.values) {
      const token = normalizeRoutingToken(value);
      if (token) {
        labels.add(token);
      }
    }
    reasons.push(`label-rule:${rule.pattern}`);
  }

  for (const rule of parseRoutingRuleEntries(config.ownershipRules)) {
    if (!context.includes(rule.pattern)) {
      continue;
    }

    for (const value of rule.values) {
      assignees.add(value);
    }
    reasons.push(`owner-rule:${rule.pattern}`);
  }

  return {
    labels: Array.from(labels.values()),
    assignees: Array.from(assignees.values()),
    reasons: uniqueValues(reasons),
  };
}

function normalizeErrorSummary(session: ApiSessionDetail): string {
  if (session.error?.message) {
    return session.error.message;
  }

  const errorEvent = session.events.find((event) => event.type === 'error');
  if (errorEvent && typeof errorEvent.payload?.message === 'string') {
    return errorEvent.payload.message;
  }

  return 'No explicit runtime error captured.';
}

function buildIssueTitle(session: ApiSessionDetail, analysis?: ExportAnalysisHint): string {
  const host = (() => {
    try {
      return new URL(session.url).host;
    } catch {
      return 'unknown-host';
    }
  })();

  const root = analysis?.rootCause?.trim() || normalizeErrorSummary(session);
  return truncate(`[BugCatcher] ${root} (${host})`, 120);
}

function renderList(items: string[] | undefined): string {
  if (!items || items.length === 0) {
    return '- N/A';
  }

  return items.map((item) => `- ${item}`).join('\n');
}

function buildIssueBody(session: ApiSessionDetail, analysis?: ExportAnalysisHint): string {
  const createdAt = new Date(session.createdAt).toISOString();
  const errorSummary = normalizeErrorSummary(session);

  return [
    '## Bug Summary',
    analysis?.summary?.trim() || 'Captured via BugCatcher replay workflow.',
    '',
    '## Likely Root Cause',
    analysis?.rootCause?.trim() || errorSummary,
    '',
    '## Classification',
    analysis?.classification?.trim() || 'unclassified',
    '',
    '## Suggested Files',
    renderList(analysis?.suggestedFiles),
    '',
    '## Recommended Actions',
    renderList(analysis?.actions),
    '',
    '## Session Context',
    `- Session ID: ${session.sessionId}`,
    `- Captured URL: ${session.url}`,
    `- Captured At: ${createdAt}`,
    `- Error Signal: ${errorSummary}`,
    `- Console Events: ${session.stats.consoleCount}`,
    `- Network Events: ${session.stats.networkCount}`,
    `- State Snapshots: ${session.stats.stateSnapshots}`,
    '',
    '---',
    'Generated by BugCatcher extension export flow.',
  ].join('\n');
}

export function validateGitLabExportConfig(config: GitLabExportConfig): string | null {
  if (!config.enabled) {
    return 'GitLab export is disabled. Enable it in options before exporting.';
  }

  if (!config.baseUrl.trim()) {
    return 'GitLab base URL is required before exporting.';
  }

  if (!config.projectId.trim()) {
    return 'GitLab project ID/path is required before exporting.';
  }

  if (!config.token.trim()) {
    return 'GitLab token is required before exporting.';
  }

  return null;
}

export function validateLinearExportConfig(config: LinearExportConfig): string | null {
  if (!config.enabled) {
    return 'Linear export is disabled. Enable it in options before exporting.';
  }

  if (!config.apiUrl.trim()) {
    return 'Linear API URL is required before exporting.';
  }

  if (!config.teamId.trim()) {
    return 'Linear team ID is required before exporting.';
  }

  if (!config.token.trim()) {
    return 'Linear token is required before exporting.';
  }

  return null;
}

export function validateShareLinkConfig(config: ShareLinkConfig): string | null {
  if (!config.enabled) {
    return 'Share links are disabled. Enable sharing in options before generating a link.';
  }

  if (config.defaultExpiryHours < 1 || config.defaultExpiryHours > 720) {
    return 'Share link expiry must be between 1 and 720 hours.';
  }

  if (!['viewer', 'commenter', 'editor'].includes(config.defaultPermission)) {
    return 'Share link permission must be viewer, commenter, or editor.';
  }

  return null;
}

function parseGitLabError(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const candidate = payload as { message?: unknown; error?: string };
    if (typeof candidate.error === 'string') {
      return candidate.error;
    }

    if (typeof candidate.message === 'string') {
      return candidate.message;
    }

    if (candidate.message && typeof candidate.message === 'object') {
      const detail = Object.entries(candidate.message)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(', ');
      if (detail) {
        return detail;
      }
    }
  }

  return `GitLab API returned ${status}`;
}

export async function createGitLabIssue(
  config: GitLabExportConfig,
  session: ApiSessionDetail,
  analysis?: ExportAnalysisHint,
): Promise<ExportArtifactResult> {
  const validationError = validateGitLabExportConfig(config);
  if (validationError) {
    throw new Error(validationError);
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(config.projectId)}/issues`;
  const body = new URLSearchParams();
  body.set('title', buildIssueTitle(session, analysis));
  body.set('description', buildIssueBody(session, analysis));

  const labels = splitCsv(config.labels);
  if (labels.length > 0) {
    body.set('labels', labels.join(','));
  }

  const assigneeIds = splitCsvToNumbers(config.assigneeIds);
  for (const assigneeId of assigneeIds) {
    body.append('assignee_ids[]', String(assigneeId));
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'PRIVATE-TOKEN': config.token,
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    web_url?: string;
    iid?: number;
    title?: string;
  };

  if (!response.ok) {
    throw new Error(`GitLab export failed: ${parseGitLabError(payload, response.status)}`);
  }

  if (!payload.web_url) {
    throw new Error('GitLab export failed: response did not include issue URL.');
  }

  return {
    destination: 'gitlab',
    artifactUrl: payload.web_url,
    artifactId: typeof payload.iid === 'number' ? String(payload.iid) : undefined,
    artifactTitle: payload.title,
    metadata: {
      baseUrl: config.baseUrl,
      projectId: config.projectId,
      labels: labels.join(','),
      assigneeIds: assigneeIds.join(','),
    },
  };
}

export async function createLinearIssue(
  config: LinearExportConfig,
  session: ApiSessionDetail,
  analysis?: ExportAnalysisHint,
): Promise<ExportArtifactResult> {
  const validationError = validateLinearExportConfig(config);
  if (validationError) {
    throw new Error(validationError);
  }

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `;

  const input: {
    teamId: string;
    title: string;
    description: string;
    labelIds?: string[];
    assigneeId?: string;
  } = {
    teamId: config.teamId,
    title: buildIssueTitle(session, analysis),
    description: buildIssueBody(session, analysis),
  };

  const labelIds = splitCsv(config.labelIds);
  if (labelIds.length > 0) {
    input.labelIds = labelIds;
  }

  if (config.assigneeId.trim()) {
    input.assigneeId = config.assigneeId.trim();
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.token,
    },
    body: JSON.stringify({
      query: mutation,
      variables: { input },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: {
      issueCreate?: {
        success?: boolean;
        issue?: {
          id?: string;
          identifier?: string;
          title?: string;
          url?: string;
        };
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    throw new Error(`Linear export failed: HTTP ${response.status}`);
  }

  if (payload.errors?.[0]?.message) {
    throw new Error(`Linear export failed: ${payload.errors[0].message}`);
  }

  const issue = payload.data?.issueCreate?.issue;
  if (!payload.data?.issueCreate?.success || !issue?.url) {
    throw new Error('Linear export failed: response did not include issue URL.');
  }

  return {
    destination: 'linear',
    artifactUrl: issue.url,
    artifactId: issue.identifier || issue.id,
    artifactTitle: issue.title,
    metadata: {
      apiUrl: config.apiUrl,
      teamId: config.teamId,
      labelCount: labelIds.length,
      assigneeId: config.assigneeId.trim(),
    },
  };
}

function createRandomToken(): string {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createShareLinkArtifact(
  config: ShareLinkConfig,
  apiBaseUrl: string,
  sessionId: string,
  overrides?: { permission?: ShareLinkPermission; expiresInHours?: number },
): ExportArtifactResult {
  const validationError = validateShareLinkConfig(config);
  if (validationError) {
    throw new Error(validationError);
  }

  if (!sessionId.trim()) {
    throw new Error('Session ID is required to generate a share link.');
  }

  const permission = overrides?.permission || config.defaultPermission;
  const expiresInHours = overrides?.expiresInHours || config.defaultExpiryHours;
  if (expiresInHours < 1 || expiresInHours > 720) {
    throw new Error('Share link expiry must be between 1 and 720 hours.');
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const base = (config.baseUrl.trim() || apiBaseUrl).replace(/\/+$/, '');
  const shareUrl = new URL(`${base}/sessions/${encodeURIComponent(sessionId)}/share`);
  shareUrl.searchParams.set('token', createRandomToken());
  shareUrl.searchParams.set('permission', permission);
  shareUrl.searchParams.set('expiresAt', expiresAt);
  shareUrl.searchParams.set('auth', config.requireAuth ? 'required' : 'optional');

  return {
    destination: 'share-link',
    artifactUrl: shareUrl.toString(),
    permission,
    expiresAt,
    metadata: {
      permission,
      expiresInHours,
      requireAuth: config.requireAuth,
      baseUrl: base,
    },
  };
}

export async function createExportArtifact(
  destination: ExportDestination,
  config: ExtensionConfig,
  session: ApiSessionDetail,
  analysis?: ExportAnalysisHint,
  shareOptions?: { permission?: ShareLinkPermission; expiresInHours?: number },
): Promise<ExportArtifactResult> {
  const routing = buildRoutingRecommendation(config.routing, session, analysis);

  if (destination === 'github') {
    const issue = await createGitHubIssue(
      {
        ...config.github,
        labels: mergeCsv(config.github.labels, routing.labels),
        assignees: mergeCsv(config.github.assignees, routing.assignees),
      },
      session,
      analysis,
    );

    return {
      destination: 'github',
      artifactUrl: issue.issueUrl,
      artifactId: String(issue.issueNumber),
      artifactTitle: issue.title,
      metadata: {
        owner: config.github.owner,
        repo: config.github.repo,
        labels: config.github.labels,
        assignees: config.github.assignees,
        routingLabels: routing.labels.join(','),
        routingAssignees: routing.assignees.join(','),
        routingReasons: routing.reasons.join(' | '),
      },
      routing,
    };
  }

  if (destination === 'gitlab') {
    const artifact = await createGitLabIssue(
      {
        ...config.gitlab,
        labels: mergeCsv(config.gitlab.labels, routing.labels),
      },
      session,
      analysis,
    );

    return {
      ...artifact,
      metadata: {
        ...artifact.metadata,
        routingLabels: routing.labels.join(','),
        routingAssignees: routing.assignees.join(','),
        routingReasons: routing.reasons.join(' | '),
      },
      routing,
    };
  }

  if (destination === 'linear') {
    const artifact = await createLinearIssue(config.linear, session, analysis);
    return {
      ...artifact,
      metadata: {
        ...artifact.metadata,
        routingLabels: routing.labels.join(','),
        routingAssignees: routing.assignees.join(','),
        routingReasons: routing.reasons.join(' | '),
      },
      routing,
    };
  }

  const shareArtifact = createShareLinkArtifact(config.shareLinks, config.apiBaseUrl, session.sessionId, shareOptions);
  return {
    ...shareArtifact,
    metadata: {
      ...shareArtifact.metadata,
      routingLabels: routing.labels.join(','),
      routingAssignees: routing.assignees.join(','),
      routingReasons: routing.reasons.join(' | '),
    },
    routing,
  };
}
