# Story 8.1: Create first-class GitHub issue export flow

Status: review

## Story

As a developer,
I want one-click GitHub issue creation from sessions,
so that triage insights become trackable work immediately.

## Acceptance Criteria

1. Given a session has sufficient context, when export to GitHub is triggered, then issue title, body, and links are pre-filled.
2. Given a session has sufficient context, when export to GitHub is triggered, then export completion is confirmed with issue URL.

## Tasks / Subtasks

- [x] Add GitHub export configuration model and persistence (AC: 1)
  - [x] Add GitHub integration fields in shared extension config (`enabled`, `owner`, `repo`, `token`, `labels`, `assignees`)
  - [x] Add defaults and message contract for GitHub export request/response
  - [x] Deep-merge GitHub config in background/options/popup config loading paths
- [x] Add options UI for GitHub integration setup (AC: 1)
  - [x] Add GitHub settings section with enable toggle and repository/token fields
  - [x] Add validation for required fields when export is enabled
- [x] Add background export orchestration to GitHub Issues API (AC: 1, 2)
  - [x] Build issue title/body from session context plus AI analysis hint when available
  - [x] Post issue to GitHub API with labels/assignees support
  - [x] Return created issue URL/number/title to popup
- [x] Add replay workspace export controls and confirmation (AC: 1, 2)
  - [x] Add Export to GitHub action in session replay workspace
  - [x] Display export status and created issue URL in result panel
  - [x] Add one-click copy for issue URL
- [x] Add tests for GitHub export utility (AC: 1, 2)
  - [x] Validate required config behavior
  - [x] Validate successful creation path and payload composition
  - [x] Validate API failure path with actionable error messaging

## Dev Notes

- Export flow is background-driven to keep token usage in the service worker boundary.
- Issue content is pre-filled from captured error context and AI output (when available), including direct session identifiers and links.
- Popup provides deterministic success/failure states and confirms success using returned GitHub issue URL.

### Project Structure Notes

- Added dedicated background utility for GitHub export API integration.
- Reused existing replay workspace panel architecture and status rendering pattern.

### Technical Requirements

- GitHub export requires explicit owner/repo/token configuration.
- Issue body should remain human-editable and structured for triage handoff.

### Architecture Compliance

- Maintains message-driven popup -> background orchestration.
- Avoids introducing additional dependencies.

### Testing Requirements

- Extension test suite passes with added GitHub export tests.
- Extension build passes after export integration changes.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 8, Story 8.1)
- Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-27.md (FR90)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added complete GitHub issue export flow from replay workspace.
- Added options-based GitHub integration configuration and validation.
- Added background GitHub API issue creation with URL confirmation.
- Added utility tests and verified tests/build pass.

### File List

- _bmad-output/implementation-artifacts/8-1-create-first-class-github-issue-export-flow.md
- apps/extension/src/shared/types.ts
- apps/extension/src/options/index.html
- apps/extension/src/options/options.ts
- apps/extension/src/background/github-export.ts
- apps/extension/src/background/index.ts
- apps/extension/src/background/github-export.test.ts
- apps/extension/src/popup/popup.ts
