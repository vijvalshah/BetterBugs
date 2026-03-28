# Story 3.1: Trigger capture through intuitive extension controls

Status: review

## Story

As a developer,
I want one-click and keyboard capture controls,
so that I can report bugs quickly without breaking flow.

## Acceptance Criteria

1. Given the extension is installed and configured, when the user clicks capture or uses the shortcut, then capture starts or freezes instantly.
2. Given capture is triggered, when the action executes, then the action is acknowledged visually.

## Tasks / Subtasks

- [x] Add keyboard capture trigger support (AC: 1)
  - [x] Define extension command manifest entry for capture trigger with default shortcut
  - [x] Handle command event in background worker and trigger existing capture flow
- [x] Ensure one-click popup trigger remains aligned with keyboard path (AC: 1)
  - [x] Keep popup capture button wired to same background `BC_CAPTURE_NOW` flow
  - [x] Preserve rapid trigger behavior for both popup and shortcut entry points
- [x] Add visual acknowledgement for triggered capture actions (AC: 2)
  - [x] Add action badge status states for uploading/success/error
  - [x] Add shortcut hint visibility in popup for discoverability and user confidence
  - [x] Ensure no-active-tab failures are surfaced as visual error acknowledgement
- [x] Validate behavior and regressions (AC: 1, 2)
  - [x] Run full extension test suite, type-check, and production build

## Dev Notes

- Story 3.1 builds directly on existing capture trigger plumbing from Epic 1.
- Keyboard and one-click paths both route through background capture orchestration.
- Visual acknowledgement is implemented using action badge states plus popup status messaging.

### Project Structure Notes

- Manifest command definitions and background command handling implemented in extension app modules.
- Popup UI updated for shortcut discoverability.

### Technical Requirements

- Add default keyboard capture shortcut.
- Trigger capture from both popup and command path using existing `captureNow` flow.
- Provide immediate visual acknowledgement for trigger outcomes.

### Architecture Compliance

- Reuses existing background capture orchestration and status update message channel.
- Avoids introducing alternate/duplicated trigger implementations.

### Library and Framework Requirements

- TypeScript + Vite + Manifest V3 extension stack only.
- No new runtime dependencies.

### Testing Requirements

- Full extension tests, type-check, and build validation gates required.

### References

- Source: `_bmad-output/planning-artifacts/epics.md` (Epic 3, Story 3.1)
- Source: `_bmad-output/planning-artifacts/feature-specification.md` (CE-037, CE-038)
- Source: `_bmad-output/planning-artifacts/ux-design-specification.md` (Journey J1, Screen S1)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- Story file created from sprint backlog item `3-1-trigger-capture-through-intuitive-extension-controls`.
- `npm test` (green)
- `npx tsc --noEmit && npm run build` (green)

### Completion Notes List

- Added `commands.trigger_capture` in extension manifest with default shortcut (`Ctrl+Shift+B`, `Command+Shift+B` on macOS).
- Added background command listener to trigger existing capture flow via keyboard shortcut.
- Added action badge visual acknowledgement for uploading/success/error capture states.
- Added no-active-tab error status acknowledgement in background capture flow.
- Added popup shortcut hint populated from command metadata.
- Validation complete: full extension test suite, TypeScript type-check, and production build pass.

### File List

- `_bmad-output/implementation-artifacts/3-1-trigger-capture-through-intuitive-extension-controls.md`
- `apps/extension/src/manifest.ts`
- `apps/extension/src/background/index.ts`
- `apps/extension/src/popup/index.html`
- `apps/extension/src/popup/popup.ts`
