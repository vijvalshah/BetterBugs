# Story 6.2: Improve list signal with severity and previews

Status: review

## Story

As a triage engineer,
I want severity cues and thumbnail previews,
so that I can prioritize investigation efficiently.

## Acceptance Criteria

1. Given sessions include error data and media, when list rows render, then severity and preview cues are visible.
2. Given list rows are scanned rapidly, when triage happens, then visual hierarchy supports fast scanning.

## Tasks / Subtasks

- [x] Add severity classification for session rows (AC: 1, 2)
  - [x] Compute severity level from error presence/type and session signal density
  - [x] Render color-coded severity badges in list rows
  - [x] Add severity visual accents for rapid scanning
- [x] Add thumbnail preview support in list rows (AC: 1)
  - [x] Extend API client list/session types to support `signedMedia` payloads
  - [x] Render DOM snapshot thumbnail when available
  - [x] Render fallback preview blocks when thumbnails are unavailable
- [x] Improve row information hierarchy (AC: 2)
  - [x] Surface title + severity + summary as primary row signals
  - [x] Keep URL/timestamp/stats as secondary metadata
  - [x] Preserve quick actions without context switching

## Dev Notes

- Severity scoring intentionally biases toward explicit runtime errors while also considering high-volume console/network/state noise.
- Thumbnail previews consume existing signed DOM snapshot URLs already emitted by backend session endpoints.
- Fallback preview blocks preserve scanability when media previews are missing.

### Project Structure Notes

- Implemented in extension popup list rendering and CSS hierarchy.
- No backend endpoint changes required for this story.

### Technical Requirements

- Severity and preview cues are rendered inline for each visible list row.
- Visual hierarchy keeps high-signal fields prominent in compact popup layout.
- Existing list controls and quick actions remain available.

### Architecture Compliance

- Reuses API list response structure and existing popup rendering flow.
- Keeps implementation in extension-first delivery track ahead of dashboard app.

### Library and Framework Requirements

- TypeScript + MV3 extension stack only.
- No new dependencies added.

### Testing Requirements

- Extension diagnostics are clean for changed files.
- Extension tests and production build pass.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 6, Story 6.2)
- Source: _bmad-output/planning-artifacts/feature-specification.md (triage signal requirements)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added severity scoring and badge rendering in popup list rows.
- Added list-row visual hierarchy with severity border accents.
- Added preview image support from signed DOM snapshots with fallback rendering.
- Verified diagnostics, tests, and build are successful.

### File List

- _bmad-output/implementation-artifacts/6-2-improve-list-signal-with-severity-and-previews.md
- apps/extension/src/popup/index.html
- apps/extension/src/popup/popup.ts
- apps/extension/src/shared/api-client.ts
