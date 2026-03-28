# Story 5.2: Encrypt secrets and capture audit evidence

Status: review

## Story

As a compliance stakeholder,
I want encrypted sensitive values and auditable actions,
so that security controls are verifiable.

## Acceptance Criteria

1. Given tokens and secrets are persisted, when data is stored and updated, then values are encrypted at rest.
2. Given sensitive values are updated, when changes are written, then audit logs record who changed what and when.

## Tasks / Subtasks

- [x] Add encryption configuration and utility primitives (AC: 1)
  - [x] Add `ENCRYPTION_KEY` config wiring
  - [x] Add AES-GCM encrypt/decrypt helper with deterministic key derivation support
  - [x] Add encrypted-value marker format (`enc:v1:`)
- [x] Add audit-log persistence collection (AC: 2)
  - [x] Add `audit_logs` collection handle in database layer
  - [x] Add request-context audit writer with actor, action, resource, timestamp, IP, and user-agent
- [x] Enforce secret-at-rest migration in auth flow (AC: 1, 2)
  - [x] Detect plaintext sensitive values in project docs
  - [x] Encrypt sensitive fields during update path and persist encrypted values
  - [x] Migrate plaintext `apiKey` into `apiKeyEncrypted` + `apiKeyHash`
  - [x] Remove legacy plaintext `apiKey` field
  - [x] Emit audit event for secret migration updates

## Dev Notes

- Encryption is implemented at application layer using AES-GCM and a prefixed encrypted payload format (`enc:v1:`).
- Secret migration runs in authenticated project-key middleware to upgrade legacy plaintext fields without adding a separate migration job.
- Audit writes are best-effort to avoid request path regressions while still capturing compliance evidence in normal operation.

### Project Structure Notes

- Added new security utility package for encryption primitives.
- Added middleware helper file for secret migration and audit event recording.

### Technical Requirements

- Sensitive values must not remain plaintext once update path executes.
- Legacy plaintext project key storage is automatically hardened on successful authenticated requests.
- Audit event includes actor, changed fields, and timestamp for traceability.

### Architecture Compliance

- Reuses existing middleware authentication choke point for secure migration.
- Keeps security and audit concerns in API backend without introducing external services.

### Library and Framework Requirements

- Go + Gin + Mongo stack only.
- No new third-party dependencies added.

### Testing Requirements

- API editor diagnostics on changed files are clean.
- Go runtime is unavailable in this environment, so gofmt/go test could not be executed here.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 5, Story 5.2)
- Source: _bmad-output/planning-artifacts/technical-specification.md (Sections 6.2 and 6.4)
- Source: _bmad-output/planning-artifacts/feature-specification.md (BE-020, BE-021)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Added encryption key config and AES-GCM utility for sensitive field protection.
- Added audit-log collection support and middleware audit event insertion.
- Added authenticated secret migration logic for legacy plaintext project fields.
- command `which go` returns not found in this environment (toolchain unavailable).

### Completion Notes List

- Added `ENCRYPTION_KEY` config and env wiring.
- Added reusable AES-GCM helper (`enc:v1:` payload format).
- Added `AuditLogs` collection handle to database struct.
- Added secret migration helper that encrypts sensitive fields on update.
- Added automatic migration from plaintext `apiKey` to encrypted+hash representation.
- Added audit evidence records for migration updates with actor/resource/details/timestamp/IP/UA.
- Could not run gofmt/go test due missing local Go runtime in this environment.

### File List

- _bmad-output/implementation-artifacts/5-2-encrypt-secrets-and-capture-audit-evidence.md
- apps/api/internal/config/config.go
- apps/api/internal/database/database.go
- apps/api/internal/security/encryption.go
- apps/api/internal/middleware/auth.go
- apps/api/internal/middleware/auth_security.go
- apps/api/.env.example
- .env
