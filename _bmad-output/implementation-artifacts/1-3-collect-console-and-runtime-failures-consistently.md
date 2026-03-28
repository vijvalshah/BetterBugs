# Story 1.3: Collect console and runtime failures consistently

Status: review

## Story

As a developer,
I want console and error events captured in order,
so that I can reconstruct runtime failures exactly.

## Acceptance Criteria

1. Given logs and errors occur during a session, when capture is uploaded, then logs and stack traces preserve original order and severity.
2. Given console arguments include complex or circular objects, when captured, then serialization is safe and does not crash capture flow.

## Tasks / Subtasks

- [x] Implement safe console argument serialization utilities (AC: 2)
  - [x] Add depth-limited, circular-safe serialization helper for console arguments
  - [x] Add utility coverage for complex types (Error, functions, symbols, arrays/objects)
  - [x] Add utility coverage for circular references and depth cutoff behavior
- [x] Refactor console capture pipeline for deterministic, resilient output (AC: 1, 2)
  - [x] Route console argument handling through serialization helpers
  - [x] Preserve level and sequence metadata for each emitted console/error event
  - [x] Attach stack traces for error-level console entries
- [x] Harden runtime error and rejection capture normalization (AC: 1)
  - [x] Normalize window error payload with message, type, stack, source location, severity
  - [x] Normalize unhandled rejection payload for Error and non-Error reasons without crashes
  - [x] Ensure emitted payloads remain serializable and aligned with shared types
- [x] Validate extension capture behavior and regressions (AC: 1, 2)
  - [x] Run full extension test suite
  - [x] Run type-check and production build
  - [x] Verify all ACs satisfied and update story records

## Dev Notes

- Prior stories established rolling buffering and network timing capture. Story 1.3 extends event reliability for console/runtime diagnostics.
- Keep event transport shape unchanged (`BC_EVENT`) and maintain extension-safe serializable payloads.
- Implement serialization in reusable content utility module to keep capture hooks thin and testable.

### Project Structure Notes

- Primary implementation under `apps/extension/src/content/`.
- Shared payload contract changes limited to `apps/extension/src/shared/types.ts` when needed.

### Technical Requirements

- Capture console levels: log/warn/error/info/debug.
- Capture runtime failures: `window.onerror` and `unhandledrejection`.
- Ensure object serialization is circular-safe and depth-limited.

### Architecture Compliance

- Align with browser `eventCollector` responsibility for console/error capture.
- Preserve serializable event payloads for extension runtime message transport.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies.

### File Structure Requirements

- Prefer pure utility extraction for serialization/normalization testability.
- Keep content entrypoint (`index.ts`) focused on hook wiring and event emission.

### Testing Requirements

- Add unit tests for serialization and runtime error normalization helper logic.
- Run all extension tests, type-check, and build before marking complete.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.3)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-016, CE-017, CE-018, CE-019)
- Source: `_bmad-output/planning-artifacts/architecture.md` (Browser capture client, eventCollector)
- Source: `_bmad-output/planning-artifacts/technical-specification.md` (Console/Error capture requirements)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story created from sprint backlog item `1-3-collect-console-and-runtime-failures-consistently`.
- `npm test` (red: missing `console-capture-utils.ts` expected during TDD)
- `npm test` (green after utility implementation)
- `npm test` (green after capture refactor)
- `npm test && npx tsc --noEmit && npm run build` (green)

### Completion Notes List

- Added `console-capture-utils` module with circular-safe, depth-limited serialization for console and runtime error payload data.
- Added deterministic sequence metadata helpers and error-level stack capture helper for console event ordering fidelity.
- Refactored content console capture to emit serialized args, bounded message text, sequence metadata, and error-level stack traces.
- Refactored runtime error and unhandled rejection handlers to emit normalized payloads with `type`, `severity`, stack, and source location fields.
- Extended shared event typings for `sequence`, `severity`, and error `type` metadata without changing transport envelope (`BC_EVENT`).
- Added comprehensive unit tests for serialization, normalization, sequence counter behavior, and stack helper semantics.
- Validation complete: full test suite, TypeScript type-check, and production build pass.

### File List

- `apps/extension/src/content/console-capture-utils.ts`
- `apps/extension/src/content/console-capture-utils.test.ts`
- `apps/extension/src/content/index.ts`
- `apps/extension/src/shared/types.ts`
- `_bmad-output/implementation-artifacts/1-3-collect-console-and-runtime-failures-consistently.md`
