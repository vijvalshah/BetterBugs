---
title: 'Phase 2.1 injected runtime instrumentation'
type: 'feature'
created: '2026-04-28'
status: 'in-progress'
baseline_commit: '24e52b9ea1204adeef68d5294fe16be886e56985'
context: ['_bmad-output/planning-artifacts/crikket-reference-plan.txt']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The extension does not consistently capture console, action, and network events from the page runtime for debugger payloads.

**Approach:** Add injected runtime instrumentation in the content/page world scripts that captures console and network events, relays them to the background, and surfaces them in the extension within the required latency.

## Boundaries & Constraints

**Always:** Use the existing content/page world scripts and message routing to background; keep event shapes compatible with shared types.

**Ask First:** Add new permissions or change event schemas.

**Never:** Implement event retention (Phase 2.2) or upload pipeline (Phase 3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Console capture | console.log/error in page | Event appears in extension within 2s | If bridge fails, ignore event and keep running |
| Network capture | fetch/XHR request | Event appears with method + status | If response unreadable, mark response truncated |

</frozen-after-approval>

## Code Map

- `apps/extension/src/content/index.ts` -- content script bridge
- `apps/extension/src/content/page-world-capture.ts` -- page world instrumentation
- `apps/extension/src/content/console-capture-utils.ts` -- console capture helpers
- `apps/extension/src/content/network-capture-utils.ts` -- network capture helpers
- `apps/extension/src/background/index.ts` -- message routing to buffer

## Tasks & Acceptance

**Execution:**
- [x] `apps/extension/src/content/page-world-capture.ts` -- inject console + network hooks and emit events
- [x] `apps/extension/src/content/index.ts` -- bridge page-world events into background messages
- [x] `apps/extension/src/content/console-capture-utils.ts` -- ensure payloads include message/stack/level
- [x] `apps/extension/src/content/network-capture-utils.ts` -- ensure payloads include method/status/timing
- [x] `apps/extension/src/background/index.ts` -- receive events and add to buffer (if not already)

**Acceptance Criteria:**
- Given console.log occurs, when the popup is open, then the event appears within 2 seconds.
- Given a network request occurs, then the event appears with method and status.

## Spec Change Log

## Verification

**Manual checks (if no CLI):**
- Trigger console logs and network requests in a page and confirm they appear in the extension.
