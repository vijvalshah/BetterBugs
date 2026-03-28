# Story 2.1: Capture application state with adapter model

Status: review

## Story

As a developer,
I want framework state captured through adapters,
so that debugging includes relevant app state transitions.

## Acceptance Criteria

1. Given supported frameworks are in use, when sessions are captured, then state snapshots and diffs are collected through adapter contracts.
2. Given unsupported frameworks are present, when state capture runs, then capture fails gracefully without breaking other event collection.

## Tasks / Subtasks

- [x] Implement state adapter contract and collector pipeline (AC: 1, 2)
  - [x] Add state payload types for capture events
  - [x] Add state collector utility with adapter registration and snapshot diffing
  - [x] Add built-in storage adapters (localStorage, sessionStorage, cookies)
  - [x] Add built-in Redux-style adapter detection for framework-aware capture
- [x] Integrate state capture into content event pipeline (AC: 1, 2)
  - [x] Emit state events with source, serialized data, and changed flags
  - [x] Trigger state snapshot capture on init and before flush responses
  - [x] Ensure unsupported adapter scenarios are isolated and non-fatal
- [x] Validate behavior and regressions (AC: 1, 2)
  - [x] Add unit tests for adapter registration, snapshot diffing, and graceful failure paths
  - [x] Run full extension test suite, type-check, and production build

## Dev Notes

- This story introduces adapter-driven state capture primitives for Epic 2 and should stay decoupled from sanitization-heavy stories 2.3/2.4.
- Maintain transport compatibility by continuing to emit through `BC_EVENT` envelope.
- Keep adapter failures isolated so console/network/error capture paths remain healthy.

### Project Structure Notes

- Implement state collector modules under `apps/extension/src/content/`.
- Shared type extensions should be limited to `apps/extension/src/shared/types.ts`.

### Technical Requirements

- Capture state from localStorage, sessionStorage, and cookies.
- Support framework-aware capture through adapter contracts (initial Redux-style support).
- Track changed flags via snapshot diffing to support future diff UX.

### Architecture Compliance

- Align to architecture `stateCollectors` model and adapter extensibility points.
- Preserve isolation and resilience for unsupported framework paths.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies.

### Testing Requirements

- Unit tests required for adapter contract behavior, diff computation, and failure isolation.
- Full test/type-check/build validation required before completion.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.1)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-022, CE-023)
- Source: `_bmad-output/planning-artifacts/architecture.md` (`stateCollectors`, `registerStateAdapter`)
- Source: `_bmad-output/planning-artifacts/technical-specification.md` (State capture + adapter patterns)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story created from sprint backlog item `2-1-capture-application-state-with-adapter-model`.
- `npm test` (green)
- `npx tsc --noEmit && npm run build` (green)

### Completion Notes List

- Added `StateEventPayload` and `state` event type support in shared capture contracts.
- Added `state-capture-utils` with adapter contract registration, built-in storage/cookie collectors, Redux-style adapter detection, and snapshot diff tracking.
- Integrated state capture into content runtime to emit state snapshots at init, interval, and flush boundaries through existing `BC_EVENT` transport.
- Implemented graceful failure isolation so unsupported frameworks and adapter exceptions do not break capture flow.
- Added unit coverage for adapter registration, built-in collectors, Redux support, diff tracking, and failure isolation.
- Validation complete: full extension test suite, TypeScript type-check, and production build pass.

### File List

- `_bmad-output/implementation-artifacts/2-1-capture-application-state-with-adapter-model.md`
- `apps/extension/src/shared/types.ts`
- `apps/extension/src/options/options.ts`
- `apps/extension/src/content/state-capture-utils.ts`
- `apps/extension/src/content/state-capture-utils.test.ts`
- `apps/extension/src/content/index.ts`