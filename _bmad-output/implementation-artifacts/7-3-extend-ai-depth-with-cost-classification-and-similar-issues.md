# Story 7.3: Extend AI depth with cost, classification, and similar issues

Status: review

## Story

As a platform owner,
I want advanced AI telemetry and quality controls,
so that AI usage is measurable and continuously improved.

## Acceptance Criteria

1. Given advanced AI features are enabled, when analyses run, then cost, classification, and similarity signals are stored.
2. Given advanced AI features are enabled, when analyses run, then users can compare outputs where supported.

## Tasks / Subtasks

- [x] Persist AI telemetry signals per session analysis run (AC: 1)
  - [x] Store per-run cost/classification/similarity metadata in local history
  - [x] Persist and restore run metadata using extension local storage
- [x] Add analysis history and compare controls in replay workspace (AC: 2)
  - [x] Add past analysis selector with timestamp/model context
  - [x] Add compare-against selector with confidence/classification/file-overlap summary
  - [x] Keep active result selection synchronized with status and rendering
- [x] Add rerun flexibility with model override support (AC: 2)
  - [x] Pass model override from popup to background AI run request
  - [x] Validate provider config using override model when provided

## Dev Notes

- Analysis history is bounded and session-scoped to keep local storage predictable.
- Compare view intentionally surfaces operationally useful deltas (confidence, classification, file overlap, model pair).
- Existing cost/classification/similarity fields from provider output now have durable local persistence.

### Project Structure Notes

- Implemented storage in popup-side local storage map keyed by session ID.
- Kept background orchestration stateless and request-driven.

### Technical Requirements

- Store advanced AI metadata without breaking existing AI response schema.
- Support safe fallback behavior while still preserving telemetry history shape.

### Architecture Compliance

- Preserves extension MV3 service-worker and popup separation.
- Avoids introducing non-essential dependencies.

### Testing Requirements

- Added targeted unit tests for AI analysis behavior.
- Extension test suite and build pass.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 7, Story 7.3)
- Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-27.md (FR88, FR89, FR107, FR111, FR112, FR115)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added persistent AI analysis history with cost/classification/similarity fields.
- Added history comparison workflow in replay workspace.
- Enabled model override reruns and aligned background validation.

### File List

- _bmad-output/implementation-artifacts/7-3-extend-ai-depth-with-cost-classification-and-similar-issues.md
- apps/extension/src/popup/popup.ts
- apps/extension/src/background/index.ts
- apps/extension/src/background/ai-analysis.ts
