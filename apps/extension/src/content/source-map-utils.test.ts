import { afterEach, describe, expect, it } from 'vitest';

import {
  registerSourceMapResolver,
  resolveStackWithSourceMap,
  type SourceMapResolver,
} from './source-map-utils';

describe('source-map-utils', () => {
  afterEach(() => {
    registerSourceMapResolver(undefined);
  });

  it('returns unmapped when no resolver is registered', async () => {
    const result = await resolveStackWithSourceMap('Error: boom\n at app.min.js:1:2');
    expect(result).toEqual({ sourceMapStatus: 'unmapped' });
  });

  it('returns mapped result when resolver rewrites stack trace', async () => {
    const resolver: SourceMapResolver = {
      resolveStackTrace: async () => 'Error: boom\n at src/app.ts:42:7',
    };
    registerSourceMapResolver(resolver);

    const result = await resolveStackWithSourceMap('Error: boom\n at app.min.js:1:2');
    expect(result).toEqual({
      sourceMappedStack: 'Error: boom\n at src/app.ts:42:7',
      sourceMapStatus: 'mapped',
    });
  });

  it('returns resolver-error status when resolver fails', async () => {
    const resolver: SourceMapResolver = {
      resolveStackTrace: async () => {
        throw new Error('resolver unavailable');
      },
    };
    registerSourceMapResolver(resolver);

    const result = await resolveStackWithSourceMap('Error: boom\n at app.min.js:1:2');
    expect(result).toEqual({ sourceMapStatus: 'resolver-error' });
  });
});