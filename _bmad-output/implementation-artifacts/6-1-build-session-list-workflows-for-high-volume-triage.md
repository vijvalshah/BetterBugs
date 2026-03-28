# Story 6.1: Build session list workflows for high-volume triage

Status: review

## Story

As a triage engineer,
I want sorting, filtering, and search in session lists,
so that I can identify critical sessions quickly.

## Acceptance Criteria

1. Given many sessions exist, when list controls are used, then sorting, filtering, and pagination remain responsive.
2. Given users triage sessions, when interacting with rows, then quick actions are available without leaving context.

## Tasks / Subtasks

- [x] Add list query support in extension session manager (AC: 1)
  - [x] Add list API wrapper for q/hasError/limit/offset/sort fields
  - [x] Add list cache keying by filter/sort/pagination tuple
  - [x] Fix recent-session cache fallback logic
- [x] Add background handlers for triage list workflows (AC: 1, 2)
  - [x] Add `BC_GET_SESSIONS_REQUEST` handler with pagination metadata response
  - [x] Add `BC_GET_SESSION_DETAIL_REQUEST` and `BC_DELETE_SESSION_REQUEST` quick action handlers
  - [x] Reset session-manager instance when config changes
- [x] Add popup triage UI controls and paging interactions (AC: 1, 2)
  - [x] Add search, error filter, sort field/order, and page-size controls
  - [x] Add previous/next paging controls with page range metadata
  - [x] Add inline row quick actions (view details and delete) without page navigation

## Dev Notes

- Triage workflow is implemented in the active extension popup to provide immediate operator utility before dashboard app implementation.
- Existing capture flow remains intact while adding a second section focused on list triage.
- Response metadata from background list handlers enables responsive pagination state updates in popup UI.

### Project Structure Notes

- Added triage controls to popup markup and popup script logic.
- Reused session-manager and background message architecture instead of introducing new infrastructure.

### Technical Requirements

- Query path supports search, hasError filter, sort controls, and limit/offset pagination.
- Row-level quick actions are accessible directly in list rows.
- Control changes reset pagination and trigger deterministic refresh behavior.

### Architecture Compliance

- Aligns with extension-first workflows and existing message-passing model.
- Reuses existing backend list endpoint capabilities from Epic 4 stories.

### Library and Framework Requirements

- TypeScript + MV3 extension stack only.
- No new dependencies added.

### Testing Requirements

- Extension diagnostics are clean on all changed files.
- Extension automated tests pass (9 files, 48 tests).

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 6, Story 6.1)
- Source: _bmad-output/planning-artifacts/feature-specification.md (triage workflows)
- Source: _bmad-output/planning-artifacts/technical-specification.md (session list controls)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Added extension popup list triage controls and row quick actions.
- Added background message handlers for paged session list and session detail/delete actions.
- Ran extension test suite successfully after implementation.

### Completion Notes List

- Added queryable session list support in shared session manager.
- Added background handlers for list/detail/delete and connection-test pathways.
- Added popup controls for search/filter/sort/page size and pager navigation.
- Added inline row actions for view/delete within popup context.
- Preserved existing capture workflow and status messaging in popup.
- Verified diagnostics and tests are green.

### File List

- _bmad-output/implementation-artifacts/6-1-build-session-list-workflows-for-high-volume-triage.md
- apps/extension/src/shared/session-manager.ts
- apps/extension/src/background/index.ts
- apps/extension/src/popup/index.html
- apps/extension/src/popup/popup.ts
