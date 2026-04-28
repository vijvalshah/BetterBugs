---
title: 'Phase 1.3 tab video capture and local review'
type: 'feature'
created: '2026-04-28'
status: 'in-progress'
baseline_commit: '24e52b9ea1204adeef68d5294fe16be886e56985'
context: ['_bmad-output/planning-artifacts/crikket-reference-plan.txt']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The extension cannot record tab video for a capture session or replay it locally for review.

**Approach:** Add a background recorder that captures the current tab as a WebM, persist the video into the local media folder via the API, and render a review player in the popup with duration and stop controls.

## Boundaries & Constraints

**Always:** Use `chrome.tabCapture` (MV3) for tab recording, store videos in a dedicated folder on disk, and keep UI responsive with start/stop controls.

**Ask First:** Add new permissions or change the default recording format/bitrate.

**Never:** Implement upload sessions or presigned URLs (Phase 3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start recording | Popup action while tab active | Recorder starts and UI shows recording timer | If capture fails, show error and remain idle |
| Stop recording | Popup stop while recording | Recorder stops, preview shows playback | If stop fails, show error and keep recording state |
| Persist video | Recording completed | API stores WebM under configured folder | If API fails, still allow local replay |

</frozen-after-approval>

## Code Map

- `apps/extension/src/shared/types.ts` -- new video capture message types and payload shape
- `apps/extension/src/background/index.ts` -- tab capture recorder and preview cache
- `apps/extension/src/popup/index.html` -- recording controls + video preview player
- `apps/extension/src/popup/popup.ts` -- start/stop recording and render player
- `apps/api/internal/handlers/media.go` -- extend to accept video storage
- `apps/api/internal/routes/routes.go` -- expose video storage endpoint

## Tasks & Acceptance

**Execution:**
- [x] `apps/extension/src/shared/types.ts` -- add message types and payloads for video capture/preview
- [x] `apps/extension/src/background/index.ts` -- record tab video to WebM, cache preview, best-effort API persistence
- [x] `apps/extension/src/popup/index.html` -- add recording controls and video player preview
- [x] `apps/extension/src/popup/popup.ts` -- wire start/stop handlers, timer, and preview rendering
- [x] `apps/api/internal/handlers/media.go` -- add video storage handler for WebM
- [x] `apps/api/internal/routes/routes.go` -- wire video endpoint with auth and rate limiting

**Acceptance Criteria:**
- Given a visible tab, when recording starts, then the popup shows a recording timer within 2 seconds.
- Given recording stops, when the preview is ready, then the user can replay the recorded WebM locally.
- Given API storage fails, the preview still renders and an error status is shown.

## Spec Change Log

## Verification

**Manual checks (if no CLI):**
- Start and stop a recording; confirm timer updates and playback works.
- Confirm a WebM file is written under the configured storage directory when the API is running.
