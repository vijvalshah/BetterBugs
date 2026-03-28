# Story 1.2: Collect network context with timing fidelity

Status: review

## Story

As a developer,
I want request and response activity captured with precise timing,
so that I can diagnose backend and transport failures.

## Acceptance Criteria

1. Given a page emits fetch, XHR, or WebSocket traffic, when a session is captured, then request metadata, statuses, and timings are persisted.
2. Given network payload bodies are captured, when payload-size limits are reached, then bodies are safely truncated and marked without breaking capture flow.

## Tasks / Subtasks

- [x] Implement network capture utility layer for timing and payload limits (AC: 1, 2)
  - [x] Add reusable payload truncation helper for request/response bodies
  - [x] Add response-header parsing helper for XHR capture
  - [x] Add unit tests for truncation and header parsing behavior
- [x] Extend content capture to include XHR and WebSocket events (AC: 1)
  - [x] Add XHR instrumentation preserving method/url/status/start/end/duration
  - [x] Add WebSocket instrumentation for send/receive/error/close events with timing metadata
  - [x] Ensure captured network events are emitted as `network` events consistently
- [x] Align fetch capture with safe payload limits and shared helpers (AC: 1, 2)
  - [x] Refactor fetch capture to use shared truncation helper
  - [x] Preserve request/response metadata and sanitize sensitive headers
  - [x] Ensure failure paths still emit structured network events
- [x] Validate end-to-end capture stability for extension script path (AC: 1, 2)
  - [x] Run full extension test suite and type-check
  - [x] Run extension production build
  - [x] Verify all ACs satisfied and update story records

## Dev Notes

- Story 1.1 established the rolling buffer and upload flow. Story 1.2 must feed richer `network` events into that pipeline without changing upload contracts.
- Keep instrumentation in the extension content runtime and avoid backend/schema coupling in this story.
- Favor deterministic timing metadata (`start`, `end`, `duration`) for every captured network event.

### Project Structure Notes

- Implement under `apps/extension/src/content/` and related shared typing utilities only as needed.
- Reuse existing background/event transport shape through `BC_EVENT` messages.

### Technical Requirements

- Capture fetch, XHR, and WebSocket network activity as `network` events.
- Enforce body capture limits with safe truncation markers.
- Preserve header sanitization for secrets (authorization/cookie/token patterns).

### Architecture Compliance

- Align with architecture event collector role for console/network/error capture.
- Keep event payloads serializable and safe for extension message transport.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependency unless explicitly required.

### File Structure Requirements

- Prefer extracting shared network-capture helpers in `apps/extension/src/content/`.
- Keep existing event payload contract in `apps/extension/src/shared/types.ts` backward compatible.

### Testing Requirements

- Add unit tests for all new network utility logic.
- Run all extension tests, type-check, and build before marking complete.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.2)
- Source: `_bmad-output/planning-artifacts/architecture.md` (Browser capture client, eventCollector)
- Source: `_bmad-output/planning-artifacts/technical-specification.md` (Extension stack requirements)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story created from sprint backlog item `1-2-collect-network-context-with-timing-fidelity`.
- `npm run build` (pass)
- `npm test` (pass)
- `npx tsc --noEmit` (pass)

### Completion Notes List

- Added shared network capture utilities for payload truncation, header sanitization/parsing, and body normalization across fetch, XHR, and WebSocket flows.
- Extended content script instrumentation to capture XHR and WebSocket activity with deterministic timing metadata (`start`, `end`, `duration`) and consistent `network` event emission.
- Refactored fetch capture to use shared helpers, preserve sanitized request/response metadata, and mark truncated payloads explicitly.
- Updated shared network event typing to include optional truncation flags for request and response payloads.
- Added unit coverage for network helper utilities and verified full extension build/test/type-check gates.

### File List

- `apps/extension/src/content/index.ts`
- `apps/extension/src/content/network-capture-utils.ts`
- `apps/extension/src/content/network-capture-utils.test.ts`
- `apps/extension/src/shared/types.ts`
- `_bmad-output/implementation-artifacts/1-2-collect-network-context-with-timing-fidelity.md`
