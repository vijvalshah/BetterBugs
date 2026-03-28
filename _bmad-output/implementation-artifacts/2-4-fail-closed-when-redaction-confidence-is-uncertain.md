# Story 2.4: Fail closed when redaction confidence is uncertain

Status: review

## Story

As a security team,
I want uncertain payloads dropped,
so that unsafe data is never transmitted.

## Acceptance Criteria

1. Given sanitization cannot safely classify data, when upload would proceed, then the unsafe data segment is dropped.
2. Given an unsafe segment is dropped, when sanitization executes, then the event is recorded for audit visibility.

## Tasks / Subtasks

- [x] Implement fail-closed sanitizer outcomes for uncertain data (AC: 1)
  - [x] Add sanitization result contract with dropped/reason metadata
  - [x] Add uncertain freeform sensitive-text detection for fail-closed drop behavior
  - [x] Add uncertain URL text detection for fail-closed drop behavior
- [x] Integrate fail-closed behavior into emitted capture payload segments (AC: 1)
  - [x] Apply fail-closed handling for network URL/request body/response body sanitization
  - [x] Ensure dropped segments are omitted/replaced with safe placeholders only
  - [x] Keep event envelope transport intact while preventing unsafe segment emission
- [x] Record audit-visible events when sanitization drops unsafe data (AC: 2)
  - [x] Emit structured `error` capture event (`type=SanitizationDrop`) on each dropped segment
  - [x] Include segment and reason context in emitted audit event payload fields
- [x] Validate behavior and regressions (AC: 1, 2)
  - [x] Add unit tests for fail-closed payload and URL uncertain-data paths
  - [x] Run full extension test suite, type-check, and production build

## Dev Notes

- Story 2.4 is implemented as segment-level fail-closed behavior: uncertain data is dropped rather than sent.
- Audit visibility is preserved by emitting explicit sanitization drop events through existing `BC_EVENT` transport.
- Existing sanitizer extensibility from Story 2.3 remains intact.

### Project Structure Notes

- Sanitizer fail-closed logic implemented under `apps/extension/src/content/`.
- No backend schema dependency introduced for this story.

### Technical Requirements

- Fail closed for uncertain sanitization outcomes.
- Never send uncertain sensitive freeform segments as raw payloads.
- Emit audit-visible event entries for dropped segments.

### Architecture Compliance

- Maintains client-side zero-trust sanitization in capture runtime.
- Preserves `BC_EVENT` envelope and existing event transport path.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies.

### Testing Requirements

- Unit coverage for fail-closed uncertain-body and uncertain-URL paths.
- Full extension tests, type-check, and build validation gates required.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.4)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-036)
- Source: `_bmad-output/planning-artifacts/technical-specification.md` (Zero-trust sanitization, fail-closed)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story file created from sprint backlog item `2-4-fail-closed-when-redaction-confidence-is-uncertain`.
- `npm test` (green)
- `npx tsc --noEmit && npm run build` (green)

### Completion Notes List

- Added fail-closed sanitizer result APIs (`SanitizationResult`) with dropped/reason metadata.
- Added uncertain freeform sensitive-text detection for fail-closed segment dropping.
- Added uncertain URL text detection with safe placeholder replacement.
- Integrated fail-closed handling into network event sanitization pipeline.
- Added audit visibility by emitting `SanitizationDrop` error events when segments are dropped.
- Added unit tests for fail-closed payload and URL pathways.
- Validation complete: full extension test suite, TypeScript type-check, and production build pass.

### File List

- `_bmad-output/implementation-artifacts/2-4-fail-closed-when-redaction-confidence-is-uncertain.md`
- `apps/extension/src/content/sanitizer-utils.ts`
- `apps/extension/src/content/sanitizer-utils.test.ts`
- `apps/extension/src/content/index.ts`
