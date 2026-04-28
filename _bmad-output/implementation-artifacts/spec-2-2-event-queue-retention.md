---
title: 'Phase 2.2 event queue and retention'
type: 'feature'
created: '2026-04-29'
status: 'in-progress'
baseline_commit: '24e52b9ea1204adeef68d5294fe16be886e56985'
context: ['_bmad-output/planning-artifacts/crikket-reference-plan.txt']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Captured debugger events need a rolling buffer per tab with retention limits so the extension can keep recent history without memory bloat.

**Approach:** Use the rolling buffer in background state to retain events per tab, expose queue size metadata for UI, and ensure eviction happens by time window and max count.

## Boundaries & Constraints

**Always:** Preserve per-tab isolation and keep retention limits configurable via constants.

**Ask First:** Change retention window or max event defaults.

**Never:** Persist events to disk (Phase 3+).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add events | Burst of events exceeds max | Oldest events evicted until within limits | N/A |
| Idle tab | No events within window | Buffer empties over time | N/A |

</frozen-after-approval>

## Code Map

- `apps/extension/src/shared/capture/rolling-buffer.ts` -- buffer eviction logic
- `apps/extension/src/background/index.ts` -- per-tab buffer storage
- `apps/extension/src/popup/popup.ts` -- preview shows queue size

## Tasks & Acceptance

**Execution:**
- [x] `apps/extension/src/shared/capture/rolling-buffer.ts` -- confirm time-based eviction and max-event cap
- [x] `apps/extension/src/background/index.ts` -- ensure per-tab buffer is used for events and snapshot metadata
- [x] `apps/extension/src/popup/popup.ts` -- show queue size in preview state (if not already)

**Acceptance Criteria:**
- Given a burst of events, when the buffer exceeds limits, then the oldest events are evicted.
- Given the popup preview renders, then the queue size reflects the current buffer length.

## Spec Change Log

## Verification

**Manual checks (if no CLI):**
- Emit > max events and confirm buffer size stays capped.
- Confirm the popup preview displays current queue size.
