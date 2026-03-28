# Story 4.4: Enforce storage quotas and retention policies

Status: review

## Story

As an operator,
I want retention and quota controls,
so that storage usage remains predictable and cost-aware.

## Acceptance Criteria

1. Given project retention and quota settings are configured, when thresholds are reached, then cleanup executes according to policy.
2. Given cleanup operations remove expired or over-quota sessions, when media exists, then related blob objects are removed and no orphaned blob keys are intentionally left behind.
3. Given storage utilization approaches configured limits, when ingestion proceeds, then warning metadata is returned for operator visibility.

## Tasks / Subtasks

- [x] Add configurable storage-policy defaults in API config (AC: 1, 3)
  - [x] Add `STORAGE_QUOTA_SESSIONS`, `STORAGE_RETENTION_DAYS`, and `STORAGE_WARNING_RATIO` config fields
  - [x] Validate and normalize config defaults to safe baseline values
  - [x] Document env vars in API `.env.example`
- [x] Implement project storage-policy resolution and enforcement (AC: 1, 3)
  - [x] Resolve policy from projects collection with fallback to config defaults
  - [x] Apply retention cleanup before insert using retention cutoff windows
  - [x] Apply quota cleanup (oldest-first) to make room for incoming session writes
- [x] Ensure cleanup removes linked session artifacts (AC: 2)
  - [x] Add shared session artifact deletion helper for session doc, event docs, and blob media keys
  - [x] Reuse helper in retention/quota cleanup paths
  - [x] Reuse helper in explicit delete endpoint to avoid blob orphan drift
- [x] Surface storage status in ingestion responses (AC: 3)
  - [x] Include utilization, cleanup counts, and warning metadata in create-session response

## Dev Notes

- Storage policy supports project-level overrides while preserving fallback defaults for unconfigured projects.
- Cleanup order is deterministic (oldest-first) to make retention/quota behavior predictable.
- Media cleanup is enforced through the same deletion helper used by explicit delete operations.

### Project Structure Notes

- Storage policy logic implemented in a dedicated handler helper module for maintainability.
- Session create/delete handlers now call shared storage-cleanup helpers.

### Technical Requirements

- Enforce retention and quota policy before accepting new session writes.
- Provide deterministic cleanup order for capacity reclamation.
- Include operator-facing storage utilization warning in ingestion response.

### Architecture Compliance

- Aligns with session-lifecycle ownership in backend API handlers.
- Reuses existing Mongo + MinIO storage abstractions without adding dependencies.

### Library and Framework Requirements

- Go + Gin + Mongo + MinIO stack only.
- No new dependencies added.

### Testing Requirements

- API editor diagnostics on changed files are clean.
- Go toolchain was unavailable in this environment, so runtime gofmt/go test execution could not be performed here.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 4, Story 4.4)
- Source: _bmad-output/planning-artifacts/technical-specification.md (storage lifecycle constraints)
- Source: _bmad-output/planning-artifacts/architecture.md (session service and blob storage responsibilities)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Added policy config defaults and env wiring for storage enforcement controls.
- Added retention/quota enforcement and shared artifact cleanup in API handlers.
- command `which go` returned not found in this environment (toolchain unavailable).

### Completion Notes List

- Added storage policy config: quota, retention, warning threshold.
- Added project policy resolution with defaults fallback.
- Added retention and quota cleanup execution in ingestion path.
- Added shared session artifact cleanup including media object deletion.
- Updated session delete endpoint to use full artifact cleanup path.
- Included storage utilization and warning metadata in create-session response.
- Could not run gofmt/go test due missing local Go runtime in this environment.

### File List

- _bmad-output/implementation-artifacts/4-4-enforce-storage-quotas-and-retention-policies.md
- apps/api/internal/config/config.go
- apps/api/internal/handlers/sessions.go
- apps/api/internal/handlers/sessions_storage_policy.go
- apps/api/internal/routes/routes.go
- apps/api/.env.example
- .env
