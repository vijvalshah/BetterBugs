# Product Brief: Open-Source AI-Native Bug Capture & Analysis

**Project:** tmpfile  
**Date:** 2026-03-25  
**Author:** ADMIN

---

## 1. Problem & Why This Should Exist

### Today's Pain
- Debugging real-world bugs is slow, noisy, and heavily manual
- Existing tools like BetterBugs/Jam:
  - Are **closed-source SaaS**, not self-hostable
  - Force you onto **their AI + infra**, with opaque data handling
  - Are often priced or licensed in ways that don't fit open-source / privacy-sensitive teams

### Gap
- No leading, popular, **open-source**, **self-hostable**, **BYOM-first** bug capture + AI analysis tool
- AI debugging tools exist, but rarely combine:
  - Time-travel like replay
  - Deep network/console/state capture
  - Strong privacy guarantees
  - Pluggable LLMs

### Why People Will Use It
They want BetterBugs/Jam-level UX but:
- **Control over data** (self-host / on-prem)
- **Control over models** (BYOM + local models)
- **Integrations they can extend** (webhooks, custom exporters, MCP)

---

## 2. Target Users & Key Use Cases

### Primary Users
- Product engineers / frontend devs on web apps
- Tech leads / staff engineers responsible for reliability
- Maintainers of popular open-source web projects

### Top Use Cases
1. **"Reproduce this bug"**: Capture exact user path, environment, network, and console
2. **"Find root cause fast"**: AI points to likely file/line, not just generic error explanation
3. **"Open a high-quality issue in 1 click"**: Export to GitHub/GitLab/Linear with all context attached
4. **"Stay compliant / private"**: Have auditable sanitization and run everything on owned infra

---

## 3. Value Proposition

> **"An open-source, self-hostable BetterBugs-style bug capture system with BYOM AI analysis, zero-trust sanitization, and deep IDE/issue-tracker integrations."**

### Supporting Pillars
- **Open & self-hosted**: Docker up, no vendor lock-in
- **AI-native & BYOM-first**: Plug OpenAI/Anthropic/Ollama/custom HTTP—no forced provider
- **Privacy built-in**: Client-side redaction, configurable policies, minimal capture modes
- **Developer-obsessed UX**: Fast replay, actionable timelines, one-click exports

---

## 4. Scope – V1 ("MVP")

### 4.1 Capture & Extension

**Browser Extension (Core)**
- Rolling 1–2 min **time-travel buffer** via MediaRecorder
- Configurable modes:
  - Video only
  - DOM snapshot only
  - Both (default)

**Network & Console**
- Capture fetch/XHR, status, headers (minus secrets), JSON payloads (size-limited)
- Capture `console.log/warn/error`, uncaught errors, unhandled rejections
- Source maps for readable stack traces

**State & Environment**
- LocalStorage/SessionStorage/cookies snapshot with **per-key allow/deny**
- Browser, OS, viewport, release version/commit hash, feature flags
- Hook points for **state adapters**:
  - Redux, Zustand, Vuex, React Context (simple adapter API)

**Zero-Trust Sanitization (Mandatory)**
- Runs **in the extension** before data leaves the browser
- Built-in rules:
  - Strip `Authorization`, `Set-Cookie`, `*token*`, `*password*`, obvious PII keys
- App-level config:
  - "Never send these keys/headers/paths"
- Default: **fail closed** (drop suspicious fields)

### 4.2 Backend & Storage

**Backend Service**
- REST ingestion endpoint for sessions
- Project-level API keys
- Rate limiting + body size caps
- Technology: Go or Node.js

**Storage (V1)**
- MongoDB for metadata + events
- MinIO/S3 for video blobs

**Self-Hosting**
- Single `docker-compose.yml`:
  - Frontend, backend, MongoDB, MinIO, MCP server

### 4.3 Dashboard

**Session Viewer**
- Video/DOM replay pane
- Synchronized timeline of:
  - Console logs
  - Network events
  - State snapshots
- Filters: errors only, 4xx/5xx, by tag/environment

**Session List**
- Search by URL, error message, user/session ID, commit, tag

### 4.4 Integrations (MVP)

**Issue Trackers**
- GitHub Issues (first)
- Export includes:
  - Title suggestion
  - AI-generated summary & STR
  - Links to session, plus relevant logs/network entries

**MCP Server**
- Basic MCP that exposes:
  - `listSessions`, `getSession(id)`
- Enables Cursor/Windsurf etc. to:
  - "Fetch last session with this error/stack"

### 4.5 AI Features (MVP)

**BYOM Configuration**
- Project settings UI:
  - Provider (OpenAI/Anthropic/Ollama/custom)
  - Model name
  - API key (encrypted at rest)

**Root-Cause Helper (First Cut)**
- For a session:
  - Summarize error + key events
  - Suggest likely root cause & files to inspect
  - Not full multi-step agent yet; more like "smart focused analysis"

---

## 5. Out-of-Scope / Future

- Full **multi-tenant SaaS** mode (v2+)
- Deep **observability integration** (Sentry/Datadog) — only basic webhooks in v1
- Very advanced agentic workflows (auto-editing code, auto-PRs)
- Non-web clients (mobile SDKs) – future

---

## 6. "Star Magnet" Differentiators

- **Open-source, self-hosted**, with clean Docker + docs
- **BYOM by design**, including **local models** via Ollama
- **MCP out-of-the-box**: immediate value for AI IDE users
- **Privacy as a first-class feature**, with clear redaction rules
- **Framework adapters**: small repo of adapters (Redux/Vuex/etc.) that community can extend

---

## 7. Success Metrics

### Adoption
- GitHub stars > 1000 in first 6 months
- Active self-hosted deployments > 100 in first year

### Developer Impact
- Median time-to-root-cause reduced by 40%
- Bug report quality improvement (measured by "time to first meaningful response")

### Community
- 10+ community-contributed framework adapters
- 5+ integration plugins from community
