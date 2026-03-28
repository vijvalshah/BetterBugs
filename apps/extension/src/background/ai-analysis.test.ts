import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAiAnalysis, validateAiProviderConfig, type AiAnalysisResult } from './ai-analysis';
import type { AiProviderConfig } from '../shared/types';
import type { ApiSessionDetail } from '../shared/api-client';

const baseConfig: AiProviderConfig = {
  enabled: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'test-key',
  temperature: 0.2,
  maxTokens: 700,
  codeContextEnabled: true,
  embeddingsEnabled: true,
  repositoryRef: 'example-org/example-repo',
  maxCodeContextFiles: 5,
};

const session: ApiSessionDetail = {
  id: 'db-1',
  sessionId: 's-1',
  url: 'https://app.example.dev/dashboard',
  title: 'Dashboard Crash',
  timestamp: '2026-03-28T00:00:00.000Z',
  error: {
    type: 'TypeError',
    message: 'Cannot read properties of undefined',
    signature: 'TypeError:cannot-read-properties',
  },
  stats: {
    consoleCount: 6,
    networkCount: 4,
    stateSnapshots: 3,
  },
  tags: [],
  commentCount: 0,
  media: {
    hasReplay: true,
  },
  createdAt: '2026-03-28T00:00:01.000Z',
  environment: {
    browser: 'Chrome',
    browserVersion: '123',
    os: 'macOS',
    osVersion: '14',
    viewport: { width: 1440, height: 900 },
    language: 'en-US',
  },
  events: [
    {
      id: 'e1',
      type: 'error',
      timestamp: 100,
      payload: {
        message: 'TypeError: boom',
        stack: 'TypeError: boom\\n at render (src/components/App.tsx:42:9)\\n at fetchData (src/services/api.ts:88:3)',
        sourceMappedStack:
          'TypeError: boom\\n at render (src/components/App.tsx:42:9)\\n at fetchData (src/services/api.ts:88:3)',
        source: 'src/components/App.tsx',
      },
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ai-analysis', () => {
  it('validates repository and embeddings requirements for code-context mode', () => {
    const invalidConfig: AiProviderConfig = {
      ...baseConfig,
      repositoryRef: '',
    };

    expect(validateAiProviderConfig(invalidConfig)).toBe(
      'Repository reference is required when code-context analysis is enabled.',
    );
  });

  it('returns structured analysis with provenance and extracted code context', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'UI render path fails after API response.',
                rootCause: 'Null data assumption in render branch.',
                actions: ['Add null guard in render path'],
                confidence: 0.81,
                classification: 'frontend-runtime',
                similarIssueHints: ['Recent null crashes in dashboard module'],
              }),
            },
          },
        ],
        usage: {
          total_tokens: 1200,
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await runAiAnalysis(baseConfig, session, {
      includeCodeContext: true,
    });

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('render path fails');
    expect(result.codeContextFiles?.length).toBeGreaterThan(0);
    expect(result.suggestedFiles.length).toBeGreaterThan(0);
    expect(result.provenance?.some((entry) => entry.includes('repository:example-org/example-repo'))).toBe(true);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('falls back safely and still includes code-context hints when provider call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch,
    );

    const result: AiAnalysisResult = await runAiAnalysis(baseConfig, session, {
      includeCodeContext: true,
      modelOverride: 'gpt-4.1-mini',
    });

    expect(result.status).toBe('fallback');
    expect(result.summary).toContain('Fallback analysis used');
    expect(result.model).toBe('gpt-4.1-mini');
    expect(result.codeContextFiles?.length).toBeGreaterThan(0);
    expect(result.crossFileTraces?.length).toBeGreaterThan(0);
  });
});
