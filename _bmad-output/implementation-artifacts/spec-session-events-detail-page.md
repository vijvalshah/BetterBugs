---
title: 'Session events detail page'
type: 'feature'
created: '2026-03-28'
status: 'in-review'
context: []
baseline_commit: 49415c49a684df9238c3433f88256e8e2ede8bb5
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Problem: Users can only review captured events inside the popup replay workspace; there is no dedicated page that opens in a new tab and auto-loads a chosen session, so sharing or deep-inspecting errors requires staying inside the cramped popup. 

Approach: Add a dedicated session detail page packaged in the extension that opens in a new tab from the session list, auto-seeds the selected session id, and renders events/errors fetched via the existing session-detail API (Mongo-backed events) in a structured, readable layout with clear empty/error states.

## Boundaries & Constraints

Always: Reuse the existing session detail fetch that already returns events from Mongo (no new backend schema); auto-propagate the selected session id into the new page without manual re-entry; keep the experience read-only and avoid mutating sessions/events; show loading/error/empty states instead of silent failures; keep auth/project key flow centralized in background/session-manager; keep event ordering deterministic (timestamp ascending) to make comparisons easy.

Ask First: Any backend API or schema changes beyond the current session-detail endpoint; exposing shareable public links outside the extension; persisting additional data in storage or new collections; adding pagination or filtering that would change the API signature.

Never: Duplicating event storage or writing to Mongo from the page; bypassing auth/project-key flows; leaving secrets or project keys in query params; removing the existing replay workspace without an alternative; fetching data directly from Mongo or adding new collections for this page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| View details from list | Session id passed from popup via query param; session has events and media | New tab opens extension page, auto-loads events sorted by timestamp with type and summary fields, highlights errors, shows session header (url, created time) | Inline fetch errors if request fails; retry button preserves session id |
| Missing or empty session id | Page opened directly without query param or cleared input | Page shows a small prompt/input to enter a session id and blocks fetch until provided | Validation message and disabled fetch until id present |
| Session not found | Session id does not exist or API returns 404 | Page shows “session not found” state with the attempted id | Retry action available; no crash |
| No events | Session exists but events array empty | Page shows “no events captured” empty state and still shows session header | N/A |
| API/network failure | Request errors (timeout, network, 5xx) | Page surfaces a clear error banner and allows retry without page refresh | Error banner persists until cleared; no partial data rendered |

</frozen-after-approval>

## Code Map

- apps/extension/src/popup/popup.ts -- Session list rendering and replay button handler; entry point to open the new tab with selected session id.
- apps/extension/src/manifest.ts -- Register new page as web-accessible/build output so it can be opened in a tab.
- apps/extension/src/session-details/index.html -- New tab shell for the session detail view.
- apps/extension/src/session-details/index.tsx -- Page logic: parse session id, request session detail/events via background/API client, render events/errors with states.
- apps/extension/src/shared/session-manager.ts and apps/extension/src/shared/api-client.ts -- Existing session-detail fetch; reused for event retrieval so credentials and caching stay consistent.

## Tasks & Acceptance

**Execution:**
- [x] apps/extension/src/popup/popup.ts -- Replace the “Replay” label with “View Details” and update the click handler to open the new session-detail page in a tab, passing the session id (keep existing auth and project context intact).
- [x] apps/extension/src/manifest.ts -- Register the new session-detail page as a web-accessible resource/HTML entry so chrome.runtime.getURL can open it in a tab.
- [x] apps/extension/src/session-details/index.html -- Create the HTML shell that loads the new page bundle and provides a container for the session detail UI.
- [x] apps/extension/src/session-details/index.tsx -- Implement the session detail page: parse session id from query or user input, fetch session detail/events via the background/API client, render events/errors with sorting and sections for loading/empty/error states.
- [x] apps/extension/src/shared/session-manager.ts (plus any related shared message types if needed) -- Ensure the new page can call the existing session detail fetch without duplicating API code; expose a small helper if needed for reuse/testing.
- [x] apps/extension/src/session-details/index.tsx (tests) -- Add unit coverage for parsing session id and handling fetch success/empty/error cases so the new page states are reliable.

**Acceptance Criteria:**
- Given a session in the popup list, when the user clicks “View Details,” then a new tab opens to the extension-hosted page with the session id already filled and the event list visible without manual input.
- Given a failed fetch or missing session, when the page loads, then the user sees a clear error state with an option to retry rather than a blank screen.
- Given a session with no events, when the page loads, then the UI shows an explicit “no events captured” message and no crashed components.
- Given events of mixed types, when rendered, then they appear in timestamp order with type/summary shown and error-type events visually distinguished.

## Spec Change Log

## Design Notes

Render events in chronological order with lightweight grouping (type label + timestamp + concise message) to keep the page scannable; errors can be accented with a badge or color but should remain text-first for copy/paste. Use the existing session-detail background request so project auth stays centralized and we avoid duplicating API keys or request plumbing; the page should call into session-manager (or existing message) rather than hand-rolling fetch logic. Query string seeding (`?sessionId=...`) keeps the page linkable from the popup while still allowing manual entry when opened directly. A compact header can show session id, url/created timestamp, and any summary stats already returned. Keep the layout single-column for readability; defer filters/pagination until requested.

