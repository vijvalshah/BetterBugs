---
stepsCompleted: []
inputDocuments: []
workflowType: 'architecture'
project_name: 'tmpfile'
user_name: 'ADMIN'
date: '2026-03-25'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## 1. High-Level Architecture Overview

The system is composed of five primary components:

- **[1] Browser Capture Client**
- **[2] Ingestion API & Core Backend**
- **[3] Storage Layer (sessions, blobs, embeddings)**
- **[4] Web Dashboard**
- **[5] AI & MCP Integration Layer**

These components are designed to be loosely coupled and replaceable, with clear interfaces so that future contributors or AI agents can evolve individual parts without breaking the whole.

## 2. Components

### 2.1 Browser Capture Client (Extension / SDK)

**Responsibilities**

- Maintain a rolling time-travel buffer (1–2 minutes) using the browser MediaRecorder API.
- Capture:
  - Network activity (fetch/XHR/WebSocket summaries).
  - Console output and errors, including unhandled rejections.
  - State snapshots (localStorage, sessionStorage, cookies, and framework state via adapters).
  - Environment (OS, browser, viewport, app version, feature flags).
- Perform client-side sanitization of all data before sending (zero-trust design).
- Bundle the captured information into a single "session" payload and POST to the ingestion API.

**Internal Modules**

- `bufferManager` – manages rolling video/DOM buffer.
- `eventCollector` – hooks into console, network APIs, and error handlers.
- `stateCollectors` – generic collectors plus pluggable framework adapters.
- `sanitizer` – rule engine applying built-in and project-defined redaction rules.
- `uploader` – handles retries, backoff, and transmission to `/api/sessions`.

**Extensibility Points**

- `registerStateAdapter(name, collectorFn)` for framework-specific state (e.g., Redux, Vuex, Zustand, React Context).
- `registerSanitizerRule(ruleFn | pattern)` so teams can add their own redaction logic.

### 2.2 Ingestion API & Core Backend

The backend can be implemented in Go or Node/TypeScript. It is structured as services but can be deployed as a single application initially.

**Public Endpoints (v1)**

- `POST /api/sessions` – accept new captured sessions.
- `GET /api/sessions` – list/filter sessions by URL, error, tag, commit, etc.
- `GET /api/sessions/:id` – retrieve a full session for dashboard/AI.
- `POST /api/sessions/:id/export/github` – export session to GitHub Issues.
- `POST /api/sessions/:id/analyze` – trigger AI root-cause assistance.

**Internal Services**

- `SessionService` – validates payloads, orchestrates persistence to DB and object storage.
- `ExportService` – implements integrations (GitHub first; GitLab/Linear later).
- `AIService` – normalizes calls to multiple LLM providers via an AIProvider interface.
- `MCPAdapter` – exposes core capabilities to the MCP server.

**Abstractions**

- `StorageProvider` interface with operations like `saveSession`, `getSession`, `searchSessions`.
- `BlobProvider` interface with `putObject` and `getSignedUrl` operations.
- `AIProvider` interface with a method such as `analyzeSession(session, codeContext) -> AnalysisResult`.

### 2.3 Storage Layer

**MongoDB (v1)**

- `sessions` collection:
  - `_id`, timestamps, projectId, optional userId.
  - URL, environment, commitSha, tags.
  - `errorSignature` (normalized error message/stack fingerprint).
  - References to blobs: `videoKey`, `domSnapshotRefs`.
- `events` collection:
  - `sessionId`, `type` (console, network, state), timestamp, payload.
- Optional `ai_analyses` collection for storing AI outputs per session.

**Object Storage**

- MinIO/S3-compatible storage for large artifacts:
  - `video/{sessionId}.webm` (or similar).
  - `dom/{sessionId}/{timestamp}.json` for DOM snapshots.

**Vector Index (Later Phase)**

- Dedicated store (e.g., Qdrant/PGVector) or Mongo-based vector search for:
  - Code embeddings.
  - Error signature embeddings to support advanced agentic analysis.

### 2.4 Web Dashboard

Typically a React-based SPA or Next.js app consuming the backend API.

**Key Views**

- Sessions list:
  - Filter by project, URL, error type, tag, date, commit.
- Session detail:
  - Left pane: video/DOM replay with scrubber.
  - Right pane: timeline of console logs, network events, and state snapshots.
  - Tabs for AI summary, root-cause hypotheses, and exports.
- Project settings:
  - BYOM configuration (provider, model, key).
  - Redaction/sanitization rules.
  - Integrations (GitHub, future tools).

### 2.5 AI & MCP Integration Layer

**BYOM / AI Provider Abstraction**

- Per-project configuration model:
  - `provider`: `openai`, `anthropic`, `ollama`, or `custom`.
  - `model`: model identifier string.
  - `endpoint?`: custom endpoint for local/custom providers.
  - `apiKey`: stored encrypted at rest.

- `AIProvider` interface:
  - Accepts a session plus optional code context and returns a structured analysis.

**Root-Cause Workflow (v1)**

1. Reduce the session to a compact prompt (error summary, key logs/events).
2. Optionally look up relevant code via embeddings.
3. Ask the configured model for:
   - Likely root-cause description.
   - Candidate files/paths to inspect.
   - Suggestions for next debugging steps.

**MCP Server**

- Exposes the following capabilities to AI IDEs via MCP:
  - `listSessions(project, filters)`.
  - `getSession(id)`.
  - `searchSessions(errorSignature/text)`.
- Reuses the same data access layer as the core backend to avoid duplication.

## 3. End-to-End Data Flow

1. A user experiences a bug and uses the extension to report it.
2. The extension freezes the time-travel buffer, gathers logs, network activity, state, and environment, applies sanitization, then uploads the payload and media to the ingestion API.
3. The backend stores metadata and events in MongoDB and video/DOM artifacts in MinIO/S3.
4. The dashboard fetches sessions from `/api/sessions` and details from `/api/sessions/:id`, loading video via signed URLs.
5. When a developer requests analysis, the backend calls the configured `AIProvider`, stores the result, and returns it to the UI.
6. When exporting, the backend composes an issue payload (title, summary, steps-to-reproduce, links) and calls the target issue tracker API.

## 4. Implementation Phases

To guide future contributors and AI agents, the system is intended to be built in phases:

- **Phase 1 – Core Plumbing**
  - Implement MongoDB + MinIO + backend skeleton.
  - Implement minimal extension capturing network, console, and errors.
  - Provide a simple sessions list and detail page.

- **Phase 2 – Time-Travel & Sanitization**
  - Add MediaRecorder-based time-travel buffer and DOM snapshots.
  - Implement robust client-side sanitization and configuration UI.

- **Phase 3 – Integrations and BYOM**
  - Complete GitHub export flow.
  - Implement BYOM configuration and first AIProvider (e.g., OpenAI).
  - Add basic root-cause helper endpoint and UI tab.

- **Phase 4 – MCP and Framework Adapters**
  - Implement MCP server exposing sessions to AI IDEs.
  - Ship Redux/Vuex/Zustand adapters.
  - Document plugin APIs for community extensions.

## 5. Design Principles for Future Agents

- Keep each component replaceable behind a clear interface.
- Favor boring, well-understood technologies for core reliability.
- Treat privacy and self-hosting as non-negotiable constraints.
- Bias toward simple data models that are easy to query and extend.
- Document all new integrations and adapters with input/output shapes so future CAs/LLMs can interact safely.

