# Story 7.2: Present actionable root-cause analysis in UI

Status: review

## Story

As a developer,
I want concise analysis outputs with confidence and next steps,
so that I can move from triage to fix quickly.

## Acceptance Criteria

1. Given AI analysis completes, when results render, then summary, likely root cause, suggested files, and actions are shown.
2. Given AI analysis completes, when results render, then confidence metadata is visible.

## Tasks / Subtasks

- [x] Improve AI result rendering for actionable triage outputs (AC: 1, 2)
  - [x] Add explicit likely root-cause emphasis and confidence visibility
  - [x] Add clickable/copyable suggested file items for faster handoff
  - [x] Add checklist-style action items with completion state in UI
- [x] Add AI result utility interactions (AC: 1)
  - [x] Add copy-summary action to quickly share analysis output
  - [x] Keep status panel synchronized with active analysis selection

## Dev Notes

- The AI result card is now structured for triage-to-fix flow: summary -> root cause -> confidence -> files -> actions.
- Suggested files are rendered as quick-copy chips to support immediate developer handoff.
- Action checklist completion is persisted per analysis run and restored when revisiting history.

### Project Structure Notes

- Reused existing replay workspace AI panel and expanded it in place.
- Maintained existing message-driven flow between popup and background.

### Technical Requirements

- Result rendering must remain safe (escaped HTML) and deterministic.
- UI must support loading, success, fallback, and failure states.

### Architecture Compliance

- No new dependencies introduced.
- Existing popup event delegation pattern preserved.

### Testing Requirements

- Extension diagnostics are clean for changed files.
- Extension unit tests and build pass after changes.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 7, Story 7.2)
- Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-27.md (FR84-FR87)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Delivered structured root-cause view with confidence and actionability.
- Added copyable suggested file paths and checklist-style action tracking.
- Added summary copy action for rapid sharing.

### File List

- _bmad-output/implementation-artifacts/7-2-present-actionable-root-cause-analysis-in-ui.md
- apps/extension/src/popup/popup.ts
- apps/extension/src/popup/index.html
