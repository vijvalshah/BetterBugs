# Story 4.1: Ingest and validate session payloads

Status: review

## Story

As a backend service,
I want strict schema validation for incoming sessions,
so that stored data remains consistent and queryable.

## Acceptance Criteria

1. Given a client uploads a session, when payload validation succeeds, then metadata and event references are persisted.
2. Given a client uploads invalid session payloads, when validation fails, then invalid payloads return actionable error responses.

## Tasks / Subtasks

- [x] Implement strict payload validation for session ingestion (AC: 2)
  - [x] Add validation helper covering required metadata fields and environment structure
  - [x] Add validation helper covering event type/timestamp/payload shape guards
  - [x] Return actionable field-level validation issues for invalid payloads
- [x] Persist metadata with event references on valid ingestion (AC: 1)
  - [x] Persist event records first for stable event reference capture
  - [x] Persist session document with event reference IDs
  - [x] Add best-effort cleanup for event records when session insert fails
- [x] Validate ingestion logic quality (AC: 1, 2)
  - [x] Add unit tests for validation helper behavior and error-condition coverage
  - [x] Verify API diagnostics are clean in editor

## Dev Notes

- Validation now returns field-level issue entries to make failures actionable.
- Session ingestion now persists event references (`eventRefs`) on session metadata documents.
- Handler behavior remains API-compatible (`POST /api/v1/sessions`) while strengthening validation and persistence guarantees.

### Project Structure Notes

- Validation helpers and tests implemented under API handler package.
- Session model extended with event references.

### Technical Requirements

- Reject invalid payloads with explicit field + reason details.
- Persist session metadata and linked event references for valid uploads.
- Keep ingestion resilient when multi-step persistence operations partially fail.

### Architecture Compliance

- Aligns with backend ingestion responsibility in architecture artifacts.
- Keeps route and handler boundaries unchanged while hardening implementation.

### Library and Framework Requirements

- Go + Gin + Mongo stack only.
- No new dependencies added.

### Testing Requirements

- Unit tests added for validation helper logic.
- Go toolchain was unavailable in this environment, so runtime `go test` and `gofmt` could not be executed here.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 4, Story 4.1)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (BE session ingestion requirements)
- Source: `_bmad-output/planning-artifacts/architecture.md` (Ingestion API responsibilities)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story file created from sprint backlog item `4-1-ingest-and-validate-session-payloads`.
- `command -v go` and `command -v gofmt` returned unavailable in this environment.
- Editor diagnostics scan on changed API files: clean.

### Completion Notes List

- Added strict validation helper with field-level actionable issues for session payload ingestion.
- Updated session create handler to return structured validation issues when payloads are invalid.
- Updated ingestion flow to persist events first and store `eventRefs` on session metadata.
- Added best-effort cleanup of inserted events when session metadata insertion fails.
- Added handler-level unit tests for validation behavior.
- Could not run gofmt/go test due missing local Go toolchain in this runtime.

### File List

- `_bmad-output/implementation-artifacts/4-1-ingest-and-validate-session-payloads.md`
- `apps/api/internal/handlers/sessions.go`
- `apps/api/internal/handlers/sessions_validation.go`
- `apps/api/internal/handlers/sessions_validation_test.go`
- `apps/api/internal/models/session.go`
