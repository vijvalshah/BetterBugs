# Story 8.2: Expand export and sharing options

Status: review

## Story

As a cross-functional team,
I want GitLab/Linear exports and share links,
so that different teams can collaborate in their preferred tools.

## Acceptance Criteria

1. Given supported integrations are configured, when export or share is requested, then artifacts are generated with correct permissions and expiry.
2. Given supported integrations are configured, when export or share is requested, then audit records include destination metadata.

## Tasks / Subtasks

- [x] Extend integration configuration and messaging contracts (AC: 1, 2)
  - [x] Add GitLab, Linear, and share link config models with defaults
  - [x] Add generic destination export message contracts for popup/background orchestration
  - [x] Deep-merge new config nodes across options/popup/background loaders
- [x] Add options UI for additional destinations (AC: 1)
  - [x] Add GitLab setup fields (base URL, project, token, labels, assignee IDs)
  - [x] Add Linear setup fields (GraphQL URL, team ID, token, labels, assignee)
  - [x] Add share link defaults (permission, expiry, auth requirement)
  - [x] Add validation for enabled destination requirements and share expiry constraints
- [x] Implement destination export and share-link generation pipeline (AC: 1, 2)
  - [x] Add background export utility for GitLab and Linear issue creation with structured payloads
  - [x] Add share-link artifact generation with explicit permission and expiry metadata
  - [x] Add destination audit record persistence in background storage with artifact metadata
  - [x] Add generic background export handler for all destinations while keeping GitHub flow compatible
- [x] Upgrade replay workspace export UX (AC: 1)
  - [x] Add destination actions for GitHub, GitLab, and Linear
  - [x] Add share-link controls (permission + expiry hours)
  - [x] Add unified status/result panel and copy-link actions per destination
  - [x] Expand config summary to surface GL/Linear/share readiness
- [x] Add tests for new destination utilities (AC: 1, 2)
  - [x] Validate share-link permission/expiry behavior
  - [x] Validate GitLab and Linear success paths
  - [x] Validate generic destination routing for share-link artifact generation

## Dev Notes

- Added a generalized destination export utility that supports GitHub/GitLab/Linear issue creation plus share-link artifacts.
- Share-link artifacts now include explicit permission and expiry metadata, and can be overridden per export request from popup controls.
- Background service worker now stores export audit records with destination metadata for traceability.

### Project Structure Notes

- Added new background export utility and tests for destination orchestration.
- Reused replay workspace panel structure while extending controls for additional destinations.

### Technical Requirements

- Destination exports require each integration to be explicitly enabled and configured in options.
- Share links enforce bounded expiry hours and permission modes (`viewer`, `commenter`, `editor`).

### Architecture Compliance

- Maintains message-driven popup -> background orchestration model.
- Keeps credentials/API traffic in background service worker boundary.

### Testing Requirements

- Extension test suite passes with newly added destination export tests.
- Extension production build passes after Story 8.2 implementation.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 8, Story 8.2)
- Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-27.md (FR90-FR95)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added GitLab and Linear issue export support driven by options configuration.
- Added share-link generation with permission and expiry controls.
- Added export destination audit metadata persistence in background storage.
- Extended replay workspace export panel to support all destinations and link copy actions.
- Added export utility tests and verified tests/build pass.

### File List

- _bmad-output/implementation-artifacts/8-2-expand-export-and-sharing-options.md
- apps/extension/src/shared/types.ts
- apps/extension/src/options/index.html
- apps/extension/src/options/options.ts
- apps/extension/src/background/index.ts
- apps/extension/src/background/export-destinations.ts
- apps/extension/src/background/export-destinations.test.ts
- apps/extension/src/popup/popup.ts
