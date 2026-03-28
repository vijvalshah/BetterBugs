import { afterEach, describe, expect, it } from 'vitest';

import {
  createHarArchive,
  detectGraphQLOperation,
  registerGraphQLFormatter,
} from './network-future-utils';

describe('network-future-utils', () => {
  afterEach(() => {
    registerGraphQLFormatter(undefined);
  });

  it('supports custom GraphQL formatter extension hook', () => {
    registerGraphQLFormatter((query) => query.replace(/\s+/g, ' ').trim());

    const graphql = detectGraphQLOperation({
      method: 'POST',
      url: 'https://api.example.com/graphql',
      requestHeaders: {
        'content-type': 'application/graphql',
      },
      requestBody: '   mutation   SaveUser  { saveUser { id } }   ',
    });

    expect(graphql).toEqual({
      operationType: 'mutation',
      operationName: 'SaveUser',
    });
  });

  it('detects GraphQL operation from JSON body payload', () => {
    const graphql = detectGraphQLOperation({
      method: 'POST',
      url: 'https://api.example.com/graphql',
      requestHeaders: {
        'content-type': 'application/json',
      },
      requestBody:
        '{"query":"query GetUser($id: ID!) { user(id: $id) { id name } }","operationName":"GetUser"}',
    });

    expect(graphql).toEqual({
      operationType: 'query',
      operationName: 'GetUser',
    });
  });

  it('detects GraphQL operation from GET query string', () => {
    const graphql = detectGraphQLOperation({
      method: 'GET',
      url: 'https://api.example.com/graphql?query=mutation%20SaveUser%20%7B%20saveUser%20%7B%20id%20%7D%20%7D',
      requestHeaders: {},
    });

    expect(graphql).toEqual({
      operationType: 'mutation',
      operationName: 'SaveUser',
    });
  });

  it('returns undefined when no GraphQL signal exists', () => {
    const graphql = detectGraphQLOperation({
      method: 'POST',
      url: 'https://api.example.com/users',
      requestHeaders: {
        'content-type': 'application/json',
      },
      requestBody: '{"name":"amy"}',
    });

    expect(graphql).toBeUndefined();
  });

  it('maps captured network events into HAR archive shape', () => {
    const archive = createHarArchive([
      {
        timestamp: 1,
        payload: {
          method: 'POST',
          url: 'https://api.example.com/graphql?preview=true',
          status: 200,
          graphql: {
            operationType: 'query',
            operationName: 'Ping',
          },
          request: {
            headers: {
              'content-type': 'application/json',
            },
            body: '{"query":"query Ping { ping }"}',
            truncated: false,
          },
          response: {
            headers: {
              'content-type': 'application/json',
            },
            body: '{"data":{"ping":"ok"}}',
            size: 22,
            truncated: false,
          },
          timing: {
            start: Date.parse('2026-03-28T10:00:00.000Z'),
            end: Date.parse('2026-03-28T10:00:00.120Z'),
            duration: 120,
          },
        },
      },
    ]);

    expect(archive.log.version).toBe('1.2');
    expect(archive.log.entries).toHaveLength(1);
    expect(archive.log.entries[0].request.queryString).toEqual([{ name: 'preview', value: 'true' }]);
    expect(archive.log.entries[0].request.postData?.mimeType).toBe('application/json');
    expect(archive.log.entries[0].response.content.mimeType).toBe('application/json');
    expect(archive.log.entries[0].time).toBe(120);
  });
});