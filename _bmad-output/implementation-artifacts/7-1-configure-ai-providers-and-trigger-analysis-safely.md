# Story 7.1: Configure AI providers and trigger analysis safely

Status: review

## Story

As an engineering team,
I want BYOM provider settings and analysis triggers,
so that AI assistance fits our privacy and cost constraints.

## Acceptance Criteria

1. Given a project configures OpenAI, Ollama, or other provider, when analysis is requested, then model selection and credentials are validated.
2. Given analysis is requested, when jobs execute, then status feedback is visible and results are returned clearly.

## Tasks / Subtasks

- [x] Add AI provider configuration model in extension config (AC: 1)
  - [x] Add provider settings (`enabled`, `provider`, `model`, `baseUrl`, `apiKey`, `temperature`, `maxTokens`)
  - [x] Add defaults in shared config with safe disabled baseline
  - [x] Add message types for AI analysis request/response
- [x] Add options UI for BYOM provider setup (AC: 1)
  - [x] Add provider selector (OpenAI, Ollama, Custom)
  - [x] Add fields for model/base URL/key/temperature/max tokens
  - [x] Add client-side validation for credential and model requirements
- [x] Add background AI analysis orchestrator with validation and status (AC: 1, 2)
  - [x] Add provider config validation helper
  - [x] Add provider call adapters for OpenAI-compatible and Ollama APIs
  - [x] Add fallback heuristic output path for provider failures
  - [x] Add `BC_AI_ANALYZE_SESSION_REQUEST` handling and status updates
- [x] Add popup trigger and status/result presentation (AC: 2)
  - [x] Add AI analysis panel in replay workspace
  - [x] Add run-analysis action with in-flight, success, fallback, and failure states
  - [x] Display summary/root cause/actions/confidence/provider metadata

## Dev Notes

- Validation is enforced at both options save-time and analysis run-time to prevent ambiguous failures.
- OpenAI-compatible endpoints use chat-completions JSON responses; Ollama uses `/api/generate` with JSON format.
- Provider failures return bounded fallback analysis with explicit status labeling.

### Project Structure Notes

- Added dedicated background utility module for provider interactions and result normalization.
- Reused existing session detail retrieval path from session manager for analysis input.

### Technical Requirements

- AI provider settings must be persisted in extension config.
- Analysis request must validate provider/model/credential requirements before dispatch.
- Analysis action must provide clear status feedback in popup and background status stream.

### Architecture Compliance

- Preserves existing extension message-based orchestration.
- Keeps provider invocation in background service worker boundary.

### Library and Framework Requirements

- TypeScript + MV3 extension stack only.
- No new dependencies added.

### Testing Requirements

- Extension diagnostics are clean on changed files.
- Extension test suite and production build pass.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 7, Story 7.1)
- Source: _bmad-output/planning-artifacts/technical-specification.md (AI provider integration direction)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added BYOM AI provider config schema and message contracts.
- Added options UI and validation for AI provider settings.
- Added background AI analysis orchestrator with OpenAI-compatible/Ollama support and safe fallback.
- Added replay workspace AI trigger panel and result rendering with confidence metadata.
- Verified diagnostics, tests, and build are successful.

### File List

- _bmad-output/implementation-artifacts/7-1-configure-ai-providers-and-trigger-analysis-safely.md
- apps/extension/src/shared/types.ts
- apps/extension/src/options/index.html
- apps/extension/src/options/options.ts
- apps/extension/src/background/ai-analysis.ts
- apps/extension/src/background/index.ts
- apps/extension/src/popup/popup.ts
