# Story 2.3: Redact sensitive data before transmission

Status: review

## Story

As a security-conscious user,
I want sensitive values stripped automatically,
so that credentials never leave the browser unredacted.

## Acceptance Criteria

1. Given headers, storage values, and payload fields contain secrets, when sanitizer rules execute, then sensitive values are redacted by default patterns.
2. Given project-specific sanitization requirements, when sanitizer rules are extended, then project rules can extend sanitization coverage.

## Tasks / Subtasks

- [x] Implement sanitizer utility with default redaction rules (AC: 1)
  - [x] Add key-pattern based redaction for nested payload structures
  - [x] Add body string redaction for JSON and query/form-style payloads
  - [x] Add URL query parameter redaction for sensitive keys
- [x] Add project-extensible sanitization rule registration (AC: 2)
  - [x] Add runtime sanitizer rule API (`registerSanitizerRule`) with pattern/function support
  - [x] Add project-level key pattern injection (`registerProjectSanitizerPatterns`)
  - [x] Expose content runtime hook (`window.__BUGCATCHER_REGISTER_SANITIZER_RULE__`)
- [x] Integrate sanitization into capture pipeline before transmission (AC: 1, 2)
  - [x] Sanitize network payload URLs, headers, and request/response body text before event emission
  - [x] Sanitize state snapshot payload data before event emission
  - [x] Preserve config-provided sanitization rule patterns during options save flow
- [x] Validate behavior and regressions (AC: 1, 2)
  - [x] Add unit tests for default redaction and extensibility scenarios
  - [x] Run full extension test suite, type-check, and production build

## Dev Notes

- This story adds the sanitizer rule engine expected in Epic 2 and keeps sanitization client-side before payload transmission.
- Existing header sanitization from Story 1.2 was retained and expanded for API-key style headers.
- Runtime extension points are aligned with architecture expectations (`registerSanitizerRule(ruleFn | pattern)`).

### Project Structure Notes

- Sanitizer implementation added under `apps/extension/src/content/`.
- Shared config typing extended in `apps/extension/src/shared/types.ts`.

### Technical Requirements

- Sensitive headers, storage values, and body payload fields must be redacted by default.
- Sanitization rules must be extensible at project/runtime level.
- Sanitization must run before event transmission to background/session upload flow.

### Architecture Compliance

- Aligns with architecture `sanitizer` module intent and `registerSanitizerRule` extensibility point.
- Preserves existing `BC_EVENT` envelope behavior while sanitizing payload content.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies.

### Testing Requirements

- Unit coverage for default key redaction, payload redaction, URL redaction, project rules, and runtime rule functions.
- Full test/type-check/build validation required before completion.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.3)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-029 to CE-034)
- Source: `_bmad-output/planning-artifacts/architecture.md` (`sanitizer`, `registerSanitizerRule`)
- Source: `_bmad-output/planning-artifacts/technical-specification.md` (Zero-trust sanitization pipeline)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story file created from sprint backlog item `2-3-redact-sensitive-data-before-transmission`.
- `npm test` (green)
- `npx tsc --noEmit && npm run build` (green)

### Completion Notes List

- Added `sanitizer-utils` with default redaction patterns for sensitive keys and values, plus JSON/query payload and URL sanitization.
- Added extensibility APIs: runtime `registerSanitizerRule` and project pattern registration via `registerProjectSanitizerPatterns`.
- Wired sanitization into content capture pipeline for network and state events before `BC_EVENT` transmission.
- Added optional extension config field `sanitizationRules` and preserved it in options save flow.
- Expanded header sanitization defaults to include API-key style headers.
- Added sanitizer test suite covering default redaction and project/runtime extensibility.
- Validation complete: full extension test suite, TypeScript type-check, and production build pass.

### File List

- `_bmad-output/implementation-artifacts/2-3-redact-sensitive-data-before-transmission.md`
- `apps/extension/src/content/sanitizer-utils.ts`
- `apps/extension/src/content/sanitizer-utils.test.ts`
- `apps/extension/src/content/index.ts`
- `apps/extension/src/content/network-capture-utils.ts`
- `apps/extension/src/content/network-capture-utils.test.ts`
- `apps/extension/src/options/options.ts`
- `apps/extension/src/shared/types.ts`
