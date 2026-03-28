# Story 6.4: Support advanced replay controls and bookmarks

Status: review

## Story

As an investigator,
I want zoom, pan, DOM replay, and bookmarks,
so that I can focus on key moments during diagnosis.

## Acceptance Criteria

1. Given a complex session timeline, when advanced controls are used, then bookmarks and zoom states persist.
2. Given saved investigation points, when users navigate bookmarks, then they can jump quickly to key moments.

## Tasks / Subtasks

- [x] Add advanced replay controls (AC: 1)
  - [x] Add timeline zoom control
  - [x] Add timeline pan control
  - [x] Add playback speed control
  - [x] Add step forward/back controls
- [x] Add bookmark creation and navigation (AC: 1, 2)
  - [x] Add bookmark labels and save action at current replay time
  - [x] Render bookmark chips with jump navigation actions
  - [x] Keep bookmarks sorted chronologically
- [x] Persist advanced replay state per session (AC: 1)
  - [x] Persist bookmarks in extension local storage
  - [x] Persist zoom/pan preferences in extension local storage
  - [x] Restore state when replay workspace is re-opened
- [x] Keep DOM replay aligned with timeline (AC: 1, 2)
  - [x] Choose DOM snapshot based on current timeline ratio
  - [x] Refresh DOM preview on timeline/video sync updates

## Dev Notes

- Persistence is scoped by sessionId to ensure investigation context survives popup close/reopen cycles.
- Bookmark and preference storage uses existing extension storage permissions and avoids new services.
- Zoom/pan controls manipulate the active visible timeline window while preserving synchronized panel behavior.

### Project Structure Notes

- Implemented entirely in popup replay workspace state and event handlers.
- No background or backend changes required for persistence support.

### Technical Requirements

- Bookmark add/jump flows are available inline in replay workspace.
- Replay state restoration happens immediately after loading detail session.
- Advanced controls coexist with baseline synchronized replay behavior.

### Architecture Compliance

- Uses extension local storage for lightweight per-session persistence.
- Preserves current message-based data retrieval architecture.

### Library and Framework Requirements

- TypeScript + MV3 extension stack only.
- No new dependencies added.

### Testing Requirements

- Extension diagnostics are clean for changed files.
- Extension tests and production build pass.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 6, Story 6.4)
- Source: _bmad-output/planning-artifacts/feature-specification.md (investigation tooling expectations)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added zoom/pan/speed/step controls for advanced replay workflows.
- Added bookmark authoring and jump navigation.
- Added per-session persistence for bookmarks and replay preferences.
- Added timeline-driven DOM preview synchronization.
- Verified diagnostics, tests, and build are successful.

### File List

- _bmad-output/implementation-artifacts/6-4-support-advanced-replay-controls-and-bookmarks.md
- apps/extension/src/popup/popup.ts
- apps/extension/src/popup/index.html
