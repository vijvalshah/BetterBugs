# Plugin Gateway Contract (v1.0)

This document defines the versioned plugin contract for IDE/automation connectors to consume BetterBugs sessions and exports without changing core APIs.

## Versioning and Negotiation

- Contract versions supported: `1.0` (use `X-Plugin-Version` header; defaults to latest when omitted).
- Compatibility response on mismatch: HTTP 409 with code `UNSUPPORTED_VERSION` and supported versions list.
- Breaking changes require a new contract version; older versions remain until explicitly deprecated.

## Authentication and Rate Limits

- Auth: project-scoped API key in `X-Project-Key` header.
- Rate limits mirror API defaults: requests per window are derived from `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW`; respect HTTP 429 and back off.

## Capabilities

- `readSessions`: list sessions (filter by `projectId`, `tag`, pagination).
- `fetchArtifacts`: retrieve signed URLs for video/DOM snapshots when storage is configured.
- `triggerExport`: stubbed handler keeps the contract stable while export orchestration is finalized; returns structured `not-implemented` payload.

## Endpoints (prefix `/api/v1/plugin/v1`)

- `GET /manifest` — returns manifest with capabilities, auth, rate limits, endpoints, and error codes.
- `GET /sessions` — returns paginated session summaries plus signed artifacts when available.
- `GET /sessions/{id}` — returns full session document and signed artifacts.
- `POST /exports` — accepts `{ sessionId, destination, options }`; currently returns `not-implemented` status with guidance.

## Payload Shapes

### Manifest
```json
{
  "contractVersion": "1.0",
  "supportedVersions": ["1.0"],
  "capabilities": ["readSessions", "fetchArtifacts", "triggerExport"],
  "endpoints": {
    "manifest": "/api/v1/plugin/1.0/manifest",
    "list": "/api/v1/plugin/1.0/sessions",
    "get": "/api/v1/plugin/1.0/sessions/{id}",
    "export": "/api/v1/plugin/1.0/exports"
  },
  "auth": { "type": "apiKey", "header": "X-Project-Key" },
  "rateLimits": { "requestsPerWindow": 100, "windowSeconds": 60 },
  "errorCodes": ["UNSUPPORTED_VERSION", "INVALID_PAYLOAD", "SESSION_NOT_FOUND", "DB_FIND_ERROR", "DB_COUNT_ERROR"]
}
```

### Session List
```json
{
  "items": [
    {
      "sessionId": "<uuid>",
      "title": "Session title",
      "url": "https://example.com",
      "timestamp": 1711739920,
      "error": { "message": "..." },
      "stats": { "consoleCount": 3, "networkCount": 10, "stateSnapshots": 2 },
      "tags": ["frontend"],
      "triage": { "hasUsefulSignal": true },
      "artifacts": { "video": "<signed-url>", "domSnapshots": ["<signed-url>"] }
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Export (stub)
```json
{
  "status": "not-implemented",
  "destination": "github",
  "sessionId": "<uuid>",
  "message": "Export orchestration not yet implemented; use gateway contract for forward compatibility.",
  "retryAfterSec": 0
}
```

## Error Model

- Standard payload: `{ "code": "...", "message": "...", "detail": "..." }`
- Common codes: `UNSUPPORTED_VERSION`, `INVALID_PAYLOAD`, `SESSION_NOT_FOUND`, `DB_FIND_ERROR`, `DB_COUNT_ERROR`.

## Observability

- Request correlation via `X-Request-ID` header in responses.
- Metrics fields: latency_ms, status_code, rate_limit_hits (provided in logs/metrics pipeline server-side).

## Quickstart: VS Code Adapter (pseudo-TypeScript)

```ts
const BASE = "http://localhost:3001/api/v1/plugin/1.0";
const headers = {
  "X-Project-Key": process.env.BETTERBUGS_KEY!,
  "X-Plugin-Version": "1.0",
};

export async function listSessions() {
  const res = await fetch(`${BASE}/sessions?projectId=demo`, { headers });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

export async function getSession(sessionId: string) {
  const res = await fetch(`${BASE}/sessions/${sessionId}`, { headers });
  if (!res.ok) throw new Error(`get failed: ${res.status}`);
  return res.json();
}

export async function triggerExport(sessionId: string, destination: string) {
  const res = await fetch(`${BASE}/exports`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, destination }),
  });
  return res.json();
}
```

## Quickstart: Automation Connector (Node/CLI sketch)

```bash
curl -H "X-Project-Key: $BETTERBUGS_KEY" -H "X-Plugin-Version: 1.0" \
  "http://localhost:3001/api/v1/plugin/1.0/sessions?limit=5" | jq
```

Use the manifest to self-discover endpoints and capabilities before issuing calls.
