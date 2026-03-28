# Story 3.2: Provide capture preview, queueing, and project switching

Status: review

## Story

As a multi-project contributor,
I want capture preview and reliable offline queueing,
so that I control what is sent and avoid losing reports.

## Acceptance Criteria

1. Given the user is offline or switches project context, when capture is triggered, then sessions queue reliably and sync on reconnect.
2. Given capture is triggered, when preview is shown before upload, then preview and project context are visible before transmission.

## Tasks / Subtasks

- [x] Implement offline queueing for capture payloads (AC: 1)
  - [x] Add bounded queue model and helper utilities for queued session payloads
  - [x] Persist queued captures in extension local storage
  - [x] Queue recoverable upload failures instead of dropping payloads
- [x] Implement queued sync behavior (AC: 1)
  - [x] Add periodic queue sync via extension alarms
  - [x] Add best-effort queued sync after successful foreground capture
  - [x] Keep queued sessions scoped to payload project context at capture time
- [x] Add preview and project-context response path (AC: 2)
  - [x] Add background preview message route with active project and queue count
  - [x] Add popup preview panel showing project context and queue status
  - [x] Keep capture trigger UX updated after upload/queue actions
- [x] Validate behavior and regressions (AC: 1, 2)
  - [x] Add unit tests for queue helper behavior
  - [x] Run full extension test suite, type-check, and production build

## Dev Notes

- Queueing is implemented for recoverable upload failures (transport failure and 5xx responses), preserving payload data for later sync.
- Preview surfaces active project context and queued count before/around upload actions.
- Queue sync runs on alarm cadence and after successful foreground captures.

### Project Structure Notes

- Queueing logic and transport integration are implemented in extension background runtime files.
- Popup UI is updated to surface preview and queue context.

### Technical Requirements

- Persist queued sessions and bound queue growth.
- Retry queued captures without user intervention when runtime is active.
- Expose project context and preview data to popup.

### Architecture Compliance

- Reuses existing background capture orchestration and message channel patterns.
- Avoids changing session payload transport envelope shape.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies.

### Testing Requirements

- Queue utility unit tests added.
- Full extension tests, type-check, and build run successfully.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 3, Story 3.2)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-041, CE-042, CE-043)
- Source: `_bmad-output/planning-artifacts/ux-design-specification.md` (Journey J1)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story file created from sprint backlog item `3-2-provide-capture-preview-queueing-and-project-switching`.
- `npm test` (green)
- `npx tsc --noEmit && npm run build` (green)

### Completion Notes List

- Added offline queue helper module with bounded queue retention and FIFO dequeue semantics.
- Added background queue persistence and retry sync loop via extension alarms.
- Added recoverable-failure queueing behavior to capture upload flow.
- Added preview response message API and popup preview panel with project context and queue count.
- Added queue unit tests and validated full extension test/build/type-check gates.

### File List

- `_bmad-output/implementation-artifacts/3-2-provide-capture-preview-queueing-and-project-switching.md`
- `apps/extension/src/shared/types.ts`
- `apps/extension/src/background/queue-utils.ts`
- `apps/extension/src/background/queue-utils.test.ts`
- `apps/extension/src/background/index.ts`
- `apps/extension/src/popup/index.html`
- `apps/extension/src/popup/popup.ts`
