# Story 5.1: Enforce project-key authentication and rate limits

Status: review

## Story

As a platform administrator,
I want requests authenticated and rate-limited,
so that abuse and accidental overload are contained.

## Acceptance Criteria

1. Given API calls hit protected endpoints, when keys are invalid, then access is denied with clear status codes.
2. Given valid project keys, when requests flow through middleware, then project identity is established for downstream handlers.
3. Given project-specific rate-limit profiles are configured, when thresholds are exceeded, then rate limits are applied per project profile.

## Tasks / Subtasks

- [x] Replace placeholder key-presence auth with project lookup validation (AC: 1, 2)
  - [x] Validate `X-Project-Key` against projects collection
  - [x] Return explicit unauthorized codes for missing/invalid keys
  - [x] Add internal key hashing helper with config secret salt for hash-match support
- [x] Hydrate project context for downstream middleware/handlers (AC: 2, 3)
  - [x] Set resolved project ID in request context
  - [x] Resolve optional project-level rate limits from project document
  - [x] Attach effective rate-limit profile to request context
- [x] Apply per-project rate-limit profiles in limiter middleware (AC: 3)
  - [x] Read rate-limit overrides from auth-populated context
  - [x] Scope limiter buckets by project + profile tuple to avoid cross-profile collisions
  - [x] Preserve explicit `RATE_LIMIT_EXCEEDED` response semantics

## Dev Notes

- Auth now performs project lookup and no longer accepts arbitrary non-empty keys.
- Middleware still supports transitional compatibility for existing seeded project docs using plaintext key fields.
- Rate limiting remains in-memory for now, but profile application is project-aware and deterministic.

### Project Structure Notes

- Auth and rate-limit behavior implemented in existing middleware modules.
- No route signature or handler contract changes were required.

### Technical Requirements

- Missing or invalid keys must fail with clear authorization response codes.
- Valid keys must map to a concrete project identity in context.
- Effective rate-limit profiles must be applied consistently per project.

### Architecture Compliance

- Preserves middleware chain order while strengthening enforcement behavior.
- Reuses projects collection as source of project security profile.

### Library and Framework Requirements

- Go + Gin + Mongo stack only.
- No new dependencies added.

### Testing Requirements

- API editor diagnostics on changed files are clean.
- Go toolchain was unavailable in this environment, so runtime gofmt/go test execution could not be performed here.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 5, Story 5.1)
- Source: _bmad-output/planning-artifacts/feature-specification.md (authentication and abuse protection requirements)
- Source: _bmad-output/planning-artifacts/architecture.md (API middleware and project isolation responsibilities)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Replaced placeholder auth acceptance with project key validation against Projects collection.
- Added middleware context hydration for effective per-project rate profile.
- command `which go` returned not found in this environment (toolchain unavailable).

### Completion Notes List

- Added project-key lookup and invalid-key denial in auth middleware.
- Added project context and rate profile context propagation.
- Added API-key hash support for hashed project key matching with secret salt.
- Updated rate limiter to consume project profile overrides and isolate limiter buckets per profile tuple.
- Preserved existing middleware response codes and route-level protection boundaries.
- Could not run gofmt/go test due missing local Go runtime in this environment.

### File List

- _bmad-output/implementation-artifacts/5-1-enforce-project-key-authentication-and-rate-limits.md
- apps/api/internal/middleware/auth.go
- apps/api/internal/middleware/ratelimit.go
- apps/api/internal/config/config.go
