# Story 6.3: Provide detailed synchronized replay workspace

Status: review

## Story

As a developer,
I want video, timeline, logs, network, and state synchronized,
so that I can reconstruct failure behavior precisely.

## Acceptance Criteria

1. Given a user opens session detail, when they scrub timeline or video, then diagnostics panels synchronize to the same timestamp.
2. Given synchronized replay interactions, when users inspect signals, then interaction latency remains acceptable.

## Tasks / Subtasks

- [x] Build synchronized replay detail workspace shell (AC: 1)
  - [x] Add timeline scrubber and time readout
  - [x] Add replay video panel and DOM replay panel
  - [x] Add synchronized diagnostics panels (logs/network/state)
- [x] Implement timeline synchronization logic (AC: 1)
  - [x] Synchronize current replay time across timeline, video, DOM preview, and diagnostics windows
  - [x] Update panels to reflect a shared rolling time window
  - [x] Keep synchronization stable when driven by either slider or video playback events
- [x] Keep interactions responsive in popup context (AC: 2)
  - [x] Limit panel rendering to synchronized window slices
  - [x] Cap event list output per panel to avoid UI thrash
  - [x] Use incremental UI updates without re-fetching detail payloads

## Dev Notes

- Backend session detail already returns events and signed media; client parsing was updated to materialize these into a single detail model used by the workspace.
- Synchronization window is fixed-duration and anchored to current replay time for consistent cross-panel correlation.
- Workspace rendering favors bounded panel output for responsiveness in extension popup form factor.

### Project Structure Notes

- Implemented in popup detail rendering and replay state logic.
- API client detail parsing updated to include events and signed media from backend response envelope.

### Technical Requirements

- Scrubbing timeline updates diagnostics and DOM preview immediately.
- Video playback time updates shared timeline state.
- Logs/network/state panels remain synchronized to same replay point.

### Architecture Compliance

- Uses existing background message path and session-detail fetch contract.
- No backend contract changes required.

### Library and Framework Requirements

- TypeScript + MV3 extension stack only.
- No new dependencies added.

### Testing Requirements

- Extension diagnostics are clean for changed files.
- Extension tests and production build pass.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 6, Story 6.3)
- Source: _bmad-output/planning-artifacts/technical-specification.md (replay synchronization expectations)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added synchronized replay workspace with timeline, video, DOM preview, and diagnostics panels.
- Added shared replay-time state and sync logic for slider/video-driven updates.
- Added bounded panel rendering strategy to keep latency acceptable.
- Verified diagnostics, tests, and build are successful.

### File List

- _bmad-output/implementation-artifacts/6-3-provide-detailed-synchronized-replay-workspace.md
- apps/extension/src/popup/popup.ts
- apps/extension/src/popup/index.html
- apps/extension/src/shared/api-client.ts
