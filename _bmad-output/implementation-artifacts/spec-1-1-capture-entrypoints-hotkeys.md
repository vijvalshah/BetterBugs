---
title: 'Phase 1.1 capture entrypoints and hotkeys'
type: 'feature'
created: '2026-04-28'
status: 'done'
baseline_commit: '24e52b9ea1204adeef68d5294fe16be886e56985'
context: ['_bmad-output/planning-artifacts/crikket-reference-plan.txt']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The extension lacks a start/stop capture flow with a visible capture state that matches the Phase 1.1 acceptance checks.

**Approach:** Add a capture state machine in the background, wire hotkey and popup actions to start/stop, and render idle/recording/review states in the popup without implementing screenshot/video capture yet.

## Boundaries & Constraints

**Always:** Preserve the MV3 background architecture, keep existing data models, and avoid copying Crikket source.

**Ask First:** Add any new extension permissions or change the default hotkey binding.

**Never:** Implement screenshot or video capture (Phase 1.2/1.3), or perform uploads during start/stop in this step.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start capture (idle) | Popup start or hotkey while idle | State becomes recording and popup shows recording | If no active tab, return error and remain idle |
| Stop capture (recording) | Popup stop or hotkey while recording | State becomes review with duration and event count | If stop requested without active tab, surface error |
| Start capture (review) | Popup start or hotkey in review state | State resets to recording and prior review data is cleared | N/A |

</frozen-after-approval>

## Code Map

- `apps/extension/src/manifest.ts` -- command definition for capture hotkey
- `apps/extension/src/shared/types.ts` -- background message types and capture state shape
- `apps/extension/src/background/index.ts` -- capture state machine, hotkey handling, state responses
- `apps/extension/src/popup/index.html` -- capture UI layout
- `apps/extension/src/popup/popup.ts` -- UI state rendering and message wiring

## Tasks & Acceptance

**Execution:**
- [x] `apps/extension/src/shared/types.ts` -- add capture state types and message variants for start/stop/state updates -- supports typed messaging
- [x] `apps/extension/src/background/index.ts` -- implement per-tab capture state, start/stop handlers, and send state updates -- enables hotkey and popup control
- [x] `apps/extension/src/popup/index.html` -- add capture state and review info containers -- renders idle/recording/review
- [x] `apps/extension/src/popup/popup.ts` -- wire start/stop actions, request initial state, and render state transitions -- fulfills UI acceptance

**Acceptance Criteria:**
- Given the popup is opened and the tab is idle, when the user clicks Start or presses the hotkey, then the popup shows recording state within 2 seconds.
- Given capture is recording, when the user clicks Stop or presses the hotkey, then the popup shows review state with duration and event count.
- Given review state is showing, when the user starts capture again, then the popup returns to recording and clears prior review details.

## Spec Change Log

## Verification

**Manual checks (if no CLI):**
- Open the extension popup, start/stop capture via button and hotkey, and confirm state transitions and review details render.
