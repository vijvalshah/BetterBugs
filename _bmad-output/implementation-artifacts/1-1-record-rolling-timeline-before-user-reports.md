# Story 1.1: Record rolling timeline before user reports

Status: review

## Story

As a developer,
I want the extension to maintain a rolling media buffer,
so that the moments leading up to the bug are preserved.

## Acceptance Criteria

1. Given capture is enabled, when an issue occurs and the user triggers capture, then the prior 2 minutes of context are frozen and included.
2. Given capture uses configured media settings, when metadata is attached to the session payload, then resolution and frame-rate settings are present and valid.
3. Given capture is idle, when recording starts, then rolling buffer storage stays bounded and continuously evicts older segments.
4. Given upload initiation fails, when a capture is triggered, then user-facing error state is shown with retry guidance and no unsafe data leak.

## Tasks / Subtasks

- [x] Implement rolling buffer manager for extension capture runtime (AC: 1, 3)
  - [x] Add bounded in-memory segment ring for last ~120 seconds
  - [x] Ensure deterministic segment eviction and freeze behavior
  - [x] Add metadata packaging for capture quality fields
- [x] Integrate capture trigger flow with freeze-and-package pipeline (AC: 1, 2)
  - [x] Wire trigger action to stop-write and seal buffer snapshot
  - [x] Include capture config metadata in payload envelope
- [x] Implement resilient error path and UX feedback (AC: 4)
  - [x] Emit extension status transitions for success/failure
  - [x] Provide retry-safe failure handling without partial unsafe send
- [x] Add tests for buffer bounds and trigger behavior (AC: 1, 3, 4)
  - [x] Unit tests for ring buffer retention and eviction
  - [x] Integration-style tests for trigger freeze and payload shape

## Dev Notes

- This story establishes the base capture primitive used by downstream network/console/state stories in Epic 1.
- Keep implementation isolated in extension capture modules to avoid coupling with backend ingestion details.
- Favor simple deterministic structures over complex stream abstractions for first delivery.

### Project Structure Notes

- Extension code should be implemented under `apps/extension/src/`.
- API integration touchpoints should align with `apps/api/` contracts and avoid hard-coding endpoint assumptions.
- Preserve existing Vite + TypeScript patterns in extension package (`apps/extension/package.json`, `apps/extension/tsconfig.json`).

### Technical Requirements

- Implement bounded rolling timeline of approximately 2 minutes.
- Use browser-compatible media capture primitives in line with extension stack choices.
- Include capture settings metadata (quality and frame-rate) in packaged payload.
- Ensure zero-trust posture is preserved (no sensitive raw payload bypass on errors).

### Architecture Compliance

- Align with architecture modules: `bufferManager`, `uploader`, and sanitization-first flow.
- Preserve replaceable component boundaries so later stories can extend network and state capture without refactor.

### Library and Framework Requirements

- Extension stack: TypeScript + Vite + Manifest V3.
- Do not introduce additional capture libraries unless required; prefer browser-native APIs and small helpers.

### File Structure Requirements

- Add or update files in extension capture domain only (for example capture service and trigger handling modules).
- Keep naming and module boundaries consistent with existing extension src layout.

### Testing Requirements

- Add automated tests for ring-buffer logic and trigger freeze behavior.
- Validate bounded retention and no unbounded memory growth.
- Validate metadata presence in payload envelope for downstream API consumption.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.1)
- Source: `_bmad-output/planning-artifacts/architecture.md` (Section 2.1 Browser Capture Client)
- Source: `_bmad-output/planning-artifacts/technical-specification.md` (Section 2.3 Extension Stack)
- Source: `_bmad-output/planning-artifacts/ux-design-specification.md` (Journey J1, Screen S1)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Sprint status created at `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `npm --prefix apps/extension install --legacy-peer-deps`
- `npm --prefix apps/extension install -D @crxjs/vite-plugin@^2.4.0`
- `npm --prefix apps/extension test` (pass)
- `npx --prefix apps/extension tsc --noEmit` (pass)
- `npm --prefix apps/extension run build` (pass)

### Completion Notes List

- Implemented rolling bounded buffer with deterministic eviction and freeze snapshots.
- Integrated freeze-and-package capture flow in background worker and attached capture metadata.
- Added popup status updates for uploading/success/error transitions.
- Implemented retry-safe failure messaging for HTTP and transport upload failures without raw response/body leakage.
- Added unit coverage for buffer behavior and capture utility payload/message shaping.
- Validation: tests, type-check, and extension build pass.

### File List

- `apps/extension/src/shared/types.ts`
- `apps/extension/src/shared/capture/rolling-buffer.ts`
- `apps/extension/src/shared/capture/rolling-buffer.test.ts`
- `apps/extension/src/background/capture-utils.ts`
- `apps/extension/src/background/capture-utils.test.ts`
- `apps/extension/src/background/index.ts`
- `apps/extension/src/popup/popup.ts`
- `apps/extension/src/options/options.ts`
- `apps/extension/package.json`
- `apps/extension/package-lock.json`
- `apps/extension/vitest.config.ts`
- `_bmad-output/implementation-artifacts/1-1-record-rolling-timeline-before-user-reports.md`
