# Story 2.2: Enable pluggable state adapters for ecosystem growth

Status: review

## Story

As a platform maintainer,
I want custom adapter registration,
so that teams can integrate non-standard state systems.

## Acceptance Criteria

1. Given a custom adapter function is registered, when capture runs, then custom state is included in session payloads.
2. Given adapter failures occur, when capture runs, then adapter failures are isolated and observable.

## Tasks / Subtasks

- [x] Implement runtime adapter registration API (AC: 1)
  - [x] Add pluggable runtime adapter registration utility
  - [x] Ensure adapters registered after collector initialization are honored at capture time
  - [x] Expose content runtime hook for custom adapter registration
- [x] Add observable adapter failure reporting while preserving isolation (AC: 2)
  - [x] Add adapter error listener/observer contract in state collector
  - [x] Emit observable capture event payload for adapter failures
  - [x] Ensure adapter failures do not break other state collectors
- [x] Validate behavior and regressions (AC: 1, 2)
  - [x] Add unit coverage for runtime registration and adapter failure observability
  - [x] Run full extension test suite, type-check, and production build

## Dev Notes

- Build on Story 2.1 state collector foundation and keep API changes incremental.
- Keep failure reporting observable through capture events without introducing transport-breaking schema changes.
- Preserve extension runtime resilience for console/network/error/state collectors when custom adapters fail.

### Project Structure Notes

- Implement under `apps/extension/src/content/` and shared payload typing in `apps/extension/src/shared/types.ts`.

### Technical Requirements

- Support custom adapter registration at runtime.
- Include custom adapter snapshot output in `state` events.
- Failures from custom adapters must be isolated and observable.

### Architecture Compliance

- Align with `stateCollectors` extensibility (`registerStateAdapter`) in architecture artifact.
- Continue using `BC_EVENT` envelope for emitted capture events.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies.

### Testing Requirements

- Add tests for runtime adapter registration and observable failure hooks.
- Run full tests, type-check, and build before marking complete.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.2)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-027 custom adapters intent)
- Source: `_bmad-output/planning-artifacts/architecture.md` (`registerStateAdapter` extensibility)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story created from sprint backlog item `2-2-enable-pluggable-state-adapters-for-ecosystem-growth`.
- `npm test` (green)
- `npx tsc --noEmit && npm run build` (green)

### Completion Notes List

- Added runtime adapter registration API (`registerRuntimeStateAdapter`) for pluggable, post-initialization state adapter injection.
- Added state adapter error observer contract with isolated listener notifications for adapter failures.
- Added content runtime adapter registration hook (`window.__BUGCATCHER_REGISTER_STATE_ADAPTER__`) to enable custom adapter wiring.
- Added observable adapter failure capture events (`state` event with `reason=adapter-error`, adapter name, and error message) while preserving collector resilience.
- Added unit coverage for runtime registration and observable failure hooks, including failure isolation behavior.
- Validation complete: full extension test suite, TypeScript type-check, and production build pass.

### File List

- `_bmad-output/implementation-artifacts/2-2-enable-pluggable-state-adapters-for-ecosystem-growth.md`
- `apps/extension/src/shared/types.ts`
- `apps/extension/src/content/state-capture-utils.ts`
- `apps/extension/src/content/state-capture-utils.test.ts`
- `apps/extension/src/content/index.ts`