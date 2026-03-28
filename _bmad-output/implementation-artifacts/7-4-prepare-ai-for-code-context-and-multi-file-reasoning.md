# Story 7.4: Prepare AI for code-context and multi-file reasoning

Status: review

## Story

As a developer,
I want code-aware analysis pathways,
so that AI can suggest targeted investigation areas across files.

## Acceptance Criteria

1. Given repository linking and embeddings are configured, when an analysis request includes code context, then relevant files and cross-file traces are returned.
2. Given repository linking and embeddings are configured, when an analysis request includes code context, then responses include provenance cues.

## Tasks / Subtasks

- [x] Extend AI provider config for code-context readiness (AC: 1)
  - [x] Add `codeContextEnabled`, `embeddingsEnabled`, `repositoryRef`, and `maxCodeContextFiles` settings
  - [x] Add defaults and validation for code-context configuration
- [x] Add options UI for repository-linking and embeddings signals (AC: 1)
  - [x] Add controls for code-context enablement, embeddings, repository reference, and max file depth
  - [x] Ensure load/save flow deep-merges defaults for compatibility
- [x] Add code-context extraction and prompt enrichment in AI orchestrator (AC: 1, 2)
  - [x] Extract relevant file hints and cross-file traces from captured session events/stacks
  - [x] Include code-context digest in provider prompts when requested and configured
  - [x] Normalize provider output to include code-context files, cross-file traces, and provenance cues
- [x] Add popup controls to request code-context analysis per run (AC: 1, 2)
  - [x] Add include-code-context toggle in replay workspace AI panel
  - [x] Render code-context files, cross-file traces, and provenance cues in result card

## Dev Notes

- Code-context extraction uses bounded parsing over captured payloads to avoid runaway prompt growth.
- Provenance includes repository/embedding/runtime context markers to make output trust boundaries explicit.
- When provider output omits structured code-context fields, normalized fallback uses extracted session hints.

### Project Structure Notes

- Core code-context logic resides in background AI module.
- Popup remains presentation and per-run preference surface.

### Technical Requirements

- Code-context request must be opt-in at analysis time.
- Repository and embeddings settings must be explicit and validated.

### Architecture Compliance

- Preserves BYOM provider abstraction and message-based boundary.
- Reuses existing extension storage/config architecture.

### Testing Requirements

- Added AI analysis unit tests covering validation, structured output, and fallback pathways.
- Extension tests and build pass.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 7, Story 7.4)
- Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-27.md (FR116-FR119)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added end-to-end code-context configuration, extraction, prompting, and rendering pathway.
- Added cross-file trace and provenance signal surfacing in UI.
- Added unit tests for new AI analysis code paths.

### File List

- _bmad-output/implementation-artifacts/7-4-prepare-ai-for-code-context-and-multi-file-reasoning.md
- apps/extension/src/shared/types.ts
- apps/extension/src/options/index.html
- apps/extension/src/options/options.ts
- apps/extension/src/background/ai-analysis.ts
- apps/extension/src/background/index.ts
- apps/extension/src/popup/popup.ts
- apps/extension/src/background/ai-analysis.test.ts
