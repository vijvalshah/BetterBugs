# Story 1.4: Provide future-ready advanced capture extensions

Status: review

## Story

As a product team,
I want GraphQL, HAR export, and source-map pathways planned,
so that advanced diagnostics can be added without rework.

## Acceptance Criteria

1. Given Phase 3/4 work is scheduled, when implementation begins, then extension points for GraphQL formatting and HAR export are defined.
2. Given minified stack traces are captured, when source-map enrichment is available, then source-map enriched stack traces are supported by architecture.

## Tasks / Subtasks

- [x] Define GraphQL capture extension points (AC: 1)
  - [x] Add GraphQL formatting hook registration for future pretty-print strategies
  - [x] Add GraphQL operation detection utility for captured network events
  - [x] Add optional GraphQL metadata field to shared network payload contract
- [x] Define HAR export extension points (AC: 1)
  - [x] Add HAR archive/entry typing and mapper from captured network events
  - [x] Expose network extension utility surface for future export workflows
- [x] Add source-map enrichment hook for runtime errors (AC: 2)
  - [x] Add source-map resolver registration and stack enrichment utility
  - [x] Extend error payload contract with source-map status and optional mapped stack
  - [x] Wire source-map enrichment into runtime error and rejection capture flow
- [x] Validate behavior and regressions (AC: 1, 2)
  - [x] Add unit coverage for GraphQL detection and HAR mapping
  - [x] Add unit coverage for source-map resolver hooks and failure handling
  - [x] Run full extension test suite, type-check, and production build

## Dev Notes

- Story 1.4 intentionally introduces extension pathways, not full production GraphQL formatting or HAR export UI flows.
- Runtime behavior remains backward compatible: new GraphQL and source-map fields are optional and non-breaking.
- Source-map resolution is pluggable through resolver registration so future Phase 3 implementation can attach real mapping engines.

### Project Structure Notes

- Future extension utilities implemented under `apps/extension/src/content/` to keep capture pipeline modular.
- Shared payload contract updates constrained to `apps/extension/src/shared/types.ts`.

### Technical Requirements

- Capture pathway supports GraphQL operation metadata extraction.
- HAR export pathway supports conversion from captured network events to HAR 1.2 archive shape.
- Source-map enrichment pathway supports mapped/unmapped/failure status without breaking raw stack capture.

### Architecture Compliance

- Preserves event collector responsibilities in content runtime.
- Keeps `BC_EVENT` envelope unchanged while extending payload metadata.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies introduced.

### File Structure Requirements

- Added focused utility modules for future capabilities:
  - `network-future-utils.ts`
  - `source-map-utils.ts`

### Testing Requirements

- Unit tests added for GraphQL detection heuristics and HAR mapper output.
- Unit tests added for source-map hook behavior in mapped/unmapped/error scenarios.
- Full extension validation gates completed (tests, type-check, build).

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.4)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-014, CE-015, CE-020)
- Source: `_bmad-output/planning-artifacts/architecture.md` (Browser `eventCollector` extensibility)
- Source: `_bmad-output/planning-artifacts/technical-specification.md` (extension collector architecture)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story created from sprint backlog item `1-4-provide-future-ready-advanced-capture-extensions`.
- `npm test` (red: GraphQL false-positive heuristic test failure)
- `npm test` (green after GraphQL detection tightening)
- `npx tsc --noEmit` (green)
- `npm run build` (green)

### Completion Notes List

- Added `network-future-utils` with explicit extension surface for GraphQL formatter registration, operation detection, and HAR 1.2 export mapping.
- Added optional `graphql` metadata in network payload contract and wired detection into fetch/XHR capture pipeline.
- Added `source-map-utils` with pluggable resolver registration and safe mapped/unmapped/error enrichment statuses.
- Wired runtime error and unhandled rejection capture flow to attach optional source-map enrichment metadata.
- Added comprehensive unit coverage for GraphQL detection, HAR mapping, and source-map resolver pathways.
- Validation complete: full extension test suite, TypeScript type-check, and production build pass.

### File List

- `apps/extension/src/content/index.ts`
- `apps/extension/src/content/network-future-utils.ts`
- `apps/extension/src/content/network-future-utils.test.ts`
- `apps/extension/src/content/source-map-utils.ts`
- `apps/extension/src/content/source-map-utils.test.ts`
- `apps/extension/src/shared/types.ts`
- `_bmad-output/implementation-artifacts/1-4-provide-future-ready-advanced-capture-extensions.md`