---
title: 'Phase 1.2 tab screenshot capture and preview'
type: 'feature'
created: '2026-04-28'
status: 'in-progress'
baseline_commit: '24e52b9ea1204adeef68d5294fe16be886e56985'
context: ['_bmad-output/planning-artifacts/crikket-reference-plan.txt']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The extension cannot capture a screenshot of the current tab or show a visual preview in the popup.

**Approach:** Add a background helper that captures a tab screenshot, cache it for preview, and persist it into a local media folder via an API endpoint while keeping the popup preview responsive.

## Boundaries & Constraints

**Always:** Use MV3 background capture APIs, keep screenshots in memory for preview, and store files in a dedicated folder on disk.

**Ask First:** Add new permissions or change the capture format defaults.

**Never:** Implement video recording (Phase 1.3) or presigned uploads (Phase 3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Capture screenshot | Popup action while tab active | Screenshot dataUrl captured, cached, and preview renders | If capture fails, show status and keep prior preview |
| Persist to folder | Screenshot captured | API stores file under configured folder and returns path | If API fails, still keep in-memory preview |

</frozen-after-approval>

## Code Map

- `apps/extension/src/shared/types.ts` -- new screenshot message types and payload shape
- `apps/extension/src/background/index.ts` -- screenshot capture helper, cached preview state
- `apps/extension/src/popup/index.html` -- preview container for screenshot
- `apps/extension/src/popup/popup.ts` -- trigger screenshot capture and render preview
- `apps/api/internal/config/config.go` -- media storage directory config
- `apps/api/internal/handlers` -- screenshot storage endpoint
- `apps/api/internal/routes/routes.go` -- expose screenshot storage route
- `apps/api/.env.example` -- document storage directory env var

## Tasks & Acceptance

**Execution:**
- [x] `apps/extension/src/shared/types.ts` -- add message types and payloads for screenshot capture/preview
- [x] `apps/extension/src/background/index.ts` -- capture screenshot, cache metadata, best-effort API persistence
- [x] `apps/extension/src/popup/index.html` -- add screenshot preview block with image element
- [x] `apps/extension/src/popup/popup.ts` -- add capture button for screenshot and render preview image
- [x] `apps/api/internal/config/config.go` -- add media storage directory config
- [x] `apps/api/internal/handlers/media.go` -- add API handler that stores screenshot into folder
- [x] `apps/api/internal/routes/routes.go` -- wire media endpoint with auth and rate limiting
- [x] `apps/api/.env.example` -- document media storage env var

**Acceptance Criteria:**
- Given a visible tab, when the user triggers screenshot capture, then the popup renders the latest screenshot preview.
- Given a screenshot is captured, when the API is reachable, then a file is stored inside the configured screenshots folder.
- Given the API is unreachable, when a screenshot is captured, then the preview still renders and an error status is shown.

## Spec Change Log

## Verification

**Manual checks (if no CLI):**
- Trigger screenshot capture from the popup and confirm preview updates.
- Confirm a screenshot file is written under the configured storage directory when the API is running.
