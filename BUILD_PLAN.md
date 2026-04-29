# BetterBugs — Build Plan: Parallel Tracks

**Goal:** Ship the full vision. No MVP shortcuts. Two parallel work streams with zero merge conflicts.

**Principle:** Each person owns distinct directories. No shared file edits. API contracts are frozen. Frontend consumes existing endpoints + one new endpoint per phase.

---

## Owner A (Backend / Infrastructure)
**Directories:** `apps/api/` (new endpoints only), `apps/mcp-server/` (new app)

**Already shipped:** share links, session details API, plugin gateway, upload pipeline, storage policy.

### Phase 1: Backend AI Analysis (Week 1)

Move AI from extension to the server so teams share analysis results and the dashboard can display them.

**Files to create:**
- `apps/api/internal/handlers/ai_analysis.go` — `POST /api/v1/sessions/:id/analyze`
- `apps/api/internal/ai/` — Provider clients (OpenAI, Ollama, custom) with the same prompt engineering from extension
- `apps/api/internal/models/ai.go` — `AiAnalysisResult` stored on `Session`

**What it does:**
1. Accepts provider config in request body (BYOM — server-side)
2. Fetches session from DB
3. Builds the same digest + code context prompt as `ai-analysis.ts`
4. Calls AI provider
5. Stores result in `session.aiAnalysis` (MongoDB subdocument)
6. Returns result synchronously (or async with webhook/polling if >10s)

**API contract:**
```
POST /api/v1/sessions/:id/analyze
Body: { provider, model, apiKey, baseUrl, temperature, maxTokens }
Response: { summary, rootCause, suggestedFiles[], actions[], confidence, provider, model, status, classification, codeContextFiles[], crossFileTraces[], costUsd? }
```

**MongoDB schema addition:**
```go
type Session struct {
    // ... existing fields
    AiAnalysis *AiAnalysisResult `bson:"aiAnalysis,omitempty" json:"aiAnalysis,omitempty"`
}
```

**Zero conflict rule:** Only adds new files + one field to `models/session.go`. Never modifies existing handler logic.

---

### Phase 2: MCP Server (Week 2)

**New app:** `apps/mcp-server/` — TypeScript, standalone Node.js server implementing Model Context Protocol.

**What it does:** Cursor/Claude/Windsurf talks directly to BetterBugs via MCP.

**Files to create:**
```
apps/mcp-server/
├── src/
│   ├── server.ts          # MCP stdio/HTTP transport
│   ├── tools/
│   │   ├── list-sessions.ts      # get_recent_sessions
│   │   ├── get-session.ts        # get_session_details
│   │   ├── analyze-session.ts    # analyze_session (calls backend AI endpoint)
│   │   ├── search-sessions.ts    # search_sessions by error/url/tag
│   │   └── export-github.ts      # create_github_issue (placeholder)
│   ├── client/
│   │   └── api.ts         # HTTP client to plugin gateway
│   └── config.ts
├── package.json
├── tsconfig.json
└── Dockerfile
```

**MCP Tools exposed:**

| Tool | Description | Calls |
|---|---|---|
| `get_recent_sessions` | Last N sessions with stats | `GET /api/v1/plugin/v1/sessions?limit=N` |
| `get_session_details` | Full session + events + media URLs | `GET /api/v1/plugin/v1/sessions/:id` |
| `analyze_session` | Runs or fetches AI analysis | `POST /api/v1/sessions/:id/analyze` |
| `search_sessions` | Find by error message, URL, tag | `GET /api/v1/plugin/v1/sessions?tag=...` |
| `create_github_issue` | Export session to GitHub | Extension export flow (Phase 4) |

**The demo moment:**
```
User in Cursor: "Why is the auth failing on production?"
Cursor calls MCP: search_sessions(tag="auth-error", limit=5)
Cursor: "Found 3 sessions. Session abc123 has a 401 at 14:32 with 
         'token expired' in console. Want me to analyze it?"
User: "Yes"
Cursor calls MCP: analyze_session(id="abc123")
Cursor: "Root cause: Token refresh returned 500 from /api/refresh.
         Likely file: src/auth/refresh.ts:43. Want me to open it?"
```

**Zero conflict rule:** Entirely new directory. Only external dependency is the existing plugin gateway API.

---

### Phase 3: API Hardening (Week 3)

**Files to modify:**
- `apps/api/internal/handlers/sessions.go` — Add `?includeAi=true` query param to `GET /sessions/:id`
- `apps/api/internal/handlers/sessions.go` — Add `GET /sessions/:id/analysis` to retrieve cached analysis
- `apps/api/internal/handlers/sessions.go` — Add `DELETE /sessions/:id/analysis` to re-trigger
- `apps/api/internal/middleware/` — Add project-level AI rate limiting (separate from capture rate limit)

**Dashboard helper endpoints (no conflict with dashboard work):**
- `GET /api/v1/projects/:id/stats` — Session count, error trends, storage used
- `GET /api/v1/sessions?errorType=...&url=...&dateFrom=...` — Enhanced filtering for dashboard

---

## Owner B (Frontend / Product)
**Directories:** `apps/dashboard/` (new app), `apps/extension/` (existing, new features only)

### Phase 1: Next.js Dashboard (Week 1-2)

**New app:** `apps/dashboard/` — Next.js 15, App Router, Tailwind CSS, shadcn/ui.

This is the team collaboration surface. QA/PM/devs browse, filter, replay, and share sessions without touching the extension.

**Pages:**

```
apps/dashboard/
├── app/
│   ├── layout.tsx              # Root layout, dark mode, sidebar nav
│   ├── page.tsx                # Sessions list (grid + table toggle)
│   ├── sessions/
│   │   └── [id]/
│   │       └── page.tsx        # Session detail — THE BIG PAGE
│   └── share/
│       └── [id]/
│           └── page.tsx        # Public share view (consumes /share/:id API)
├── components/
│   ├── session-list/
│   │   ├── SessionCard.tsx     # Thumbnail + stats + tags
│   │   ├── SessionTable.tsx    # Sortable columns
│   │   └── FilterBar.tsx       # URL, error, date, tag filters
│   ├── session-detail/
│   │   ├── VideoPlayer.tsx     # HTML5 video + custom controls
│   │   ├── Timeline.tsx        # Synced scrubber with event markers
│   │   ├── ConsolePanel.tsx    # Syntax-highlighted logs, level filters
│   │   ├── NetworkPanel.tsx    # Request/response viewer, status colors
│   │   ├── StatePanel.tsx      # JSON tree, diff between snapshots
│   │   ├── AiPanel.tsx         # Analysis results display
│   │   └── DomReplay.tsx       # iframe with DOM snapshot
│   └── ui/                     # shadcn components
├── lib/
│   ├── api.ts                  # API client (calls existing API endpoints)
│   └── utils.ts
├── public/
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

**The Sessions List page (`/`):**
- Dark mode by default
- Grid view: cards with screenshot thumbnail, URL, error badge, timestamp, tags
- Table view: sortable columns (date, errors, network, duration)
- Filter bar: search URL, filter by error type, date range, tag
- Quick actions: view, copy share link, delete
- Real-time feel: auto-refresh every 30s or SSE (optional)

**The Session Detail page (`/sessions/[id]`):**
- Left: Video player with custom controls (play, pause, speed 0.5x/1x/2x)
- Below video: Timeline scrubber with event markers (console=gray dot, error=red dot, network=blue dot)
- Click timeline marker → video jumps to that timestamp
- Right: Tabbed panel (Console | Network | State | AI Analysis)
- Console tab: syntax-highlighted, filter by level, stack trace expandable
- Network tab: request list → click to see headers + body (sanitized shown as "[REDACTED]")
- State tab: JSON viewer with diff highlighting between snapshots
- AI tab: Shows `session.aiAnalysis` with confidence badge, root cause, suggested files as clickable links, actions checklist
- Top bar: Session metadata, tags editor (inline), comments thread, share link button

**Design quality:**
- No default HTML styling. Everything is Tailwind + shadcn.
- Colors: zinc/slate base, indigo accents, semantic colors (red errors, yellow warnings, green success)
- Typography: Inter or Geist font
- Spacing: generous, not cramped
- Loading states: skeleton screens, not spinners
- Empty states: illustrated, not "No data"

**Zero conflict rule:** Entirely new app. Only consumes existing API + new `GET /sessions/:id?includeAi=true`. Never touches API code.

---

### Phase 2: Extension Polish + GitHub Export (Week 2-3)

**Files to modify (new features only, no refactoring existing):**

**Extension popup AI integration:**
- `apps/extension/src/popup/session-popup.ts` — After capture, show "Analyze with AI" button. Calls backend AI endpoint instead of local analysis. Shows loading state.
- `apps/extension/src/popup/index.html` — Better layout: capture button prominent, recent sessions list below, settings gear icon.

**Extension options page redesign:**
- `apps/extension/src/options/index.html` — Modern form layout, tabs: (General | AI Providers | Privacy | Advanced)
- Toggle: "Use server-side AI" vs "Extension AI" (for offline/air-gapped)
- GitHub integration: OAuth or PAT input, repo selector

**GitHub Export (full implementation):**
- `apps/extension/src/background/github-export.ts` — Create actual GitHub issues via API
- Issue body template:
  ```markdown
  ## Bug Report: {session.title}
  
  **URL:** {session.url}
  **Browser:** {session.environment.browser}
  **Captured:** {session.timestamp}
  
  ### Error
  ```{session.error.type}: {session.error.message}```
  
  ### AI Analysis
  {aiAnalysis.summary}
  **Root Cause:** {aiAnalysis.rootCause}
  **Suggested Files:** {aiAnalysis.suggestedFiles.join(', ')}
  
  ### Session Link
  {shareLink}
  
  ### Attachments
  - Screenshot: {screenshotUrl}
  - Video: {videoUrl}
  ```

**Session details page enhancements:**
- `apps/extension/src/session-details/index.html` — Add AI analysis panel (fetches from backend if available, falls back to local)
- Add GitHub export button
- Add "Open in Dashboard" button (links to `dashboard/sessions/[id]`)

**Zero conflict rule:** Only adds/modifies extension files. No API changes needed.

---

### Phase 3: Landing + Share Page Polish (Week 3)

**Landing page (`apps/dashboard/app/page.tsx` or separate `apps/landing/`):**
- Hero: "Bugs deserve context. Capture everything."
- Feature grid: screen recording + console + network + AI analysis
- MCP badge: "Works inside Cursor, Claude, Windsurf"
- BYOM badge: "Your API key, your model, your data"
- Open source badge: "Self-host in 5 minutes"
- CTA: GitHub stars, docs link

**Share page (`/share/[id]`):**
- Consume existing `GET /share/:id` HTML or build a React version
- Show video player, timeline, event cards
- "Powered by BetterBugs" branding
- "View full analysis" CTA to dashboard (if logged in / have key)

---

## API Contract Freeze

These endpoints exist and are frozen. Both owners build against them without changing them:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Status |
| `POST /api/v1/sessions` | Create session |
| `GET /api/v1/sessions` | List sessions |
| `GET /api/v1/sessions/:id` | Get session |
| `DELETE /api/v1/sessions/:id` | Delete session |
| `PATCH /api/v1/sessions/:id/tags` | Update tags |
| `PATCH /api/v1/sessions/batch/tags` | Batch tags |
| `POST /api/v1/sessions/:id/comments` | Add comment |
| `POST /api/v1/media/screenshots` | Upload screenshot |
| `POST /api/v1/media/videos` | Upload video |
| `POST /api/v1/uploads/sessions` | Create upload |
| `POST /api/v1/uploads/sessions/:id/finalize` | Finalize upload |
| `GET /api/v1/plugin/v1/manifest` | Plugin manifest |
| `GET /api/v1/plugin/v1/sessions` | Plugin list |
| `GET /api/v1/plugin/v1/sessions/:id` | Plugin get |
| `POST /api/v1/plugin/v1/exports` | Plugin export (stub) |
| `GET /share/:id` | Public share HTML |

**New endpoints (Owner A creates, Owner B consumes):**

| Endpoint | Creator | Consumer |
|---|---|---|
| `POST /api/v1/sessions/:id/analyze` | Owner A | Dashboard AI panel, Extension analysis button |
| `GET /api/v1/sessions/:id/analysis` | Owner A | Dashboard AI panel (cached) |
| `GET /api/v1/projects/:id/stats` | Owner A | Dashboard homepage |
| `GET /api/v1/sessions?errorType=...` | Owner A | Dashboard filter |

---

## Development Order

**Week 1:**
- Owner A: Backend AI endpoint (`POST /sessions/:id/analyze`)
- Owner B: Dashboard scaffold (Next.js + shadcn), Sessions list page, API client

**Week 2:**
- Owner A: MCP server (`apps/mcp-server/`), all 5 tools
- Owner B: Dashboard session detail page (video + timeline + panels), extension AI calls backend

**Week 3:**
- Owner A: API hardening (stats endpoint, enhanced filtering, AI rate limits)
- Owner B: Extension GitHub export, landing page, share page polish, dashboard AI panel

**Week 4:**
- Both: Integration testing, Docker Compose for full stack, docs update, demo video

---

## Conflict Prevention Checklist

- [ ] Owner A never touches `apps/dashboard/` or `apps/extension/`
- [ ] Owner B never touches `apps/api/` (except if adding new endpoint is needed, then coordinate)
- [ ] `apps/mcp-server/` is 100% Owner A
- [ ] Shared types: if `Session` model needs `aiAnalysis` field, Owner A adds it, notifies Owner B
- [ ] Git workflow: feature branches, PRs, no direct main pushes
- [ ] API versioning: new endpoints are v1, existing endpoints untouched

---

## Definition of Done ("Not Bullshit")

**Dashboard:**
- [ ] Dark mode, Tailwind + shadcn, no unstyled elements
- [ ] Video player with synced timeline scrubber
- [ ] Console/network/state panels with real data
- [ ] AI analysis panel renders backend results with confidence badge
- [ ] Filters work (URL search, error type, date range, tag)
- [ ] Mobile responsive (tablet minimum, phone nice-to-have)
- [ ] Loading skeletons, not spinners
- [ ] Copy share link from any session

**MCP Server:**
- [ ] Works in Cursor with `@betterbugs` mention
- [ ] `get_recent_sessions` returns formatted list
- [ ] `analyze_session` triggers backend AI and returns readable result
- [ ] `search_sessions` filters meaningfully
- [ ] Published as npm package or npx runnable

**Backend AI:**
- [ ] Same prompt quality as extension AI analysis
- [ ] Supports OpenAI + Ollama + custom endpoints
- [ ] Results cached in MongoDB (no duplicate API calls)
- [ ] Rate limited per project
- [ ] Cost estimation displayed

**Extension:**
- [ ] Can trigger backend AI and show results
- [ ] GitHub export creates real issues with full context
- [ ] "Open in Dashboard" deep link
- [ ] Options page redesigned, modern layout

**DevEx:**
- [ ] `docker-compose up` starts API + Dashboard + MongoDB
- [ ] One-command dev: `make dev` in api, `npm run dev` in dashboard
- [ ] README has screenshots / demo GIF
