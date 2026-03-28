# Story 8.3: Improve routing with labels, assignees, and notifications

Status: review

## Story

As an engineering manager,
I want suggested labels and assignees plus Slack/webhook signals,
so that incident routing is fast and consistent.

## Acceptance Criteria

1. Given project heuristics and ownership rules exist, when export or alert events occur, then recommendations and notifications are generated.
2. Given project heuristics and ownership rules exist, when export or alert events occur, then retry handling prevents silent delivery failures.

## Tasks / Subtasks

- [x] Extend routing and notification configuration models and contracts (AC: 1, 2)
  - [x] Add routing rule config (`ownershipRules`, `labelRules`) and notification config (`enabled`, endpoints, retry settings) with defaults
  - [x] Deep-merge new config nodes across background/options/popup loading paths
- [x] Add options UI for routing heuristics and notification delivery (AC: 1, 2)
  - [x] Add routing rule controls for label and assignee suggestion mappings
  - [x] Add Slack/webhook notification controls and bounded retry parameters
  - [x] Add validation to prevent invalid retry ranges and enabled-without-endpoint configuration
- [x] Implement routing suggestion engine in destination export pipeline (AC: 1)
  - [x] Generate suggested labels and assignees from session context, analysis hints, and configured rules
  - [x] Apply routing suggestions to GitHub payload generation while preserving existing defaults
  - [x] Include routing recommendations in export response metadata for UI and audit visibility
- [x] Implement notification dispatch with retry guarantees for export events (AC: 1, 2)
  - [x] Add background notification sender for Slack and generic webhook channels
  - [x] Add bounded exponential retry behavior and explicit terminal failure reporting
  - [x] Record notification outcomes in export audit metadata and user-visible response
- [x] Add tests and replay export result enhancements (AC: 1, 2)
  - [x] Add unit tests for routing suggestion behavior and export payload composition
  - [x] Add unit tests for notification retry success/failure paths
  - [x] Show routing recommendations and notification delivery summary in replay export panel

## Dev Notes

- Preserve message-driven popup to background orchestration and keep all credentials in the service worker boundary.
- Keep retry behavior bounded and deterministic to avoid hidden infinite retries.
- Export completion must still return structured notification outcome metadata when notification channels fail.

### Project Structure Notes

- Routing and notification logic should remain in background export services.
- Popup should remain presentation-oriented and consume returned metadata.

### Technical Requirements

- Routing rules are operator-controlled, string-configurable mappings for quick setup.
- Notification retries must not be silent; failed channels must be reported back to user and audit metadata.

### Architecture Compliance

- Maintains extension storage config pattern and deep-merge strategy.
- Maintains popup -> background message contract pattern.

### Testing Requirements

- Extension test suite passes with additional routing/notification tests.
- Extension production build passes after Story 8.3 implementation.

### References

- Source: _bmad-output/planning-artifacts/epics.md (Epic 8, Story 8.3)
- Source: _bmad-output/implementation-artifacts/sprint-status.yaml (Story key: 8-3-improve-routing-with-labels-assignees-and-notifications)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Completion Notes List

- Added routing and notification configuration models in shared types with defaults for rules, endpoints, and retry bounds.
- Added options UI and validation for routing heuristics and export notifications.
- Added routing recommendation engine driven by session context, AI hints, and configurable rules.
- Added notification dispatch with bounded exponential retry and explicit delivery outcomes.
- Added export response and replay panel rendering for routing recommendations and notification summaries.
- Added and passed unit tests for routing recommendation logic and notification retry behavior.
- Verified `npm test` and `npm run build` pass in `apps/extension`.

### File List

- _bmad-output/implementation-artifacts/8-3-improve-routing-with-labels-assignees-and-notifications.md
- apps/extension/src/shared/types.ts
- apps/extension/src/options/index.html
- apps/extension/src/options/options.ts
- apps/extension/src/background/export-destinations.ts
- apps/extension/src/background/index.ts
- apps/extension/src/background/routing-notifications.ts
- apps/extension/src/popup/popup.ts
- apps/extension/src/background/export-destinations.test.ts
- apps/extension/src/background/routing-notifications.test.ts
