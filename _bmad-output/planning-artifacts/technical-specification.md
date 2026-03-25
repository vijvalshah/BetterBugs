# Technical Specification: Open-Source AI-Native Bug Capture System

**Project:** BugCatcher (BetterBugs Alternative)  
**Version:** 1.0  
**Date:** 2026-03-25  
**Status:** Architecture & Planning Phase  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack Overview](#2-technology-stack-overview)
3. [Detailed Component Specifications](#3-detailed-component-specifications)
4. [Data Models & Schemas](#4-data-models--schemas)
5. [API Specifications](#5-api-specifications)
6. [Security & Privacy Architecture](#6-security--privacy-architecture)
7. [Infrastructure & Deployment](#7-infrastructure--deployment)
8. [Development Environment Setup](#8-development-environment-setup)
9. [Feature Specifications](#9-feature-specifications)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Executive Summary

### Project Vision
Build an open-source, self-hostable bug capture and AI analysis system that outperforms commercial alternatives (BetterBugs, Jam) in privacy, extensibility, and developer control.

### Core Differentiators
- **Zero-trust privacy**: Client-side data sanitization before transmission
- **BYOM (Bring Your Own Model)**: Support for OpenAI, Anthropic, Ollama, and custom endpoints
- **MCP-native**: First-class Model Context Protocol support for AI IDE integration
- **Framework-aware**: Pluggable state adapters for Redux, Vuex, Zustand, React Context
- **Self-hosted first**: Single docker-compose deployment, no vendor lock-in

### Target Scale
- Initial: Small-to-medium teams (10-500 users)
- Future: Enterprise deployments with multi-tenant capabilities

---

## 2. Technology Stack Overview

### 2.1 Backend Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Runtime | Node.js | 20.x LTS | Mature ecosystem, excellent TypeScript support |
| Language | TypeScript | 5.3+ | Type safety, better IDE support, AI-friendly |
| Framework | Fastify | 4.x | High performance, excellent plugin system, built-in OpenAPI |
| ORM/ODM | Mongoose | 8.x | Native MongoDB support, schema validation, middleware |
| Validation | Zod | 3.x | Runtime validation, TypeScript inference, JSON Schema export |
| Testing | Vitest | 1.x | Fast, native ESM, great TypeScript support |
| Documentation | @fastify/swagger | - | Auto-generated OpenAPI specs |

**Why TypeScript over Go:**
- Faster iteration for small team
- Shared types with frontend
- Richer ecosystem for AI integrations
- Easier for community contributions

### 2.2 Frontend Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Next.js | 14.x (App Router) | SSR/SSG, API routes, excellent DX |
| UI Library | React | 18.x | Industry standard, huge ecosystem |
| Styling | TailwindCSS | 3.x | Utility-first, rapid prototyping |
| Components | shadcn/ui | - | Headless, customizable, accessible |
| State | TanStack Query | 5.x | Server state management, caching, sync |
| Forms | React Hook Form + Zod | - | Performance, validation |
| Icons | Lucide React | - | Consistent, tree-shakeable |

### 2.3 Extension Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Build | Vite | Fast HMR, modern bundling |
| Language | TypeScript | Shared types with backend |
| Manifest | V3 | Latest Chrome extension standard |
| Content Script | vanilla TS | Minimal overhead |

### 2.4 AI Integration Stack

| Provider | Client | Notes |
|----------|--------|-------|
| OpenAI | openai npm package | GPT-4, GPT-3.5-turbo |
| Anthropic | @anthropic-ai/sdk | Claude models |
| Ollama | native fetch | Local models (llama2, codellama, etc.) |
| Custom | axios/fetch | Any OpenAI-compatible endpoint |

### 2.5 Data Storage Stack

| Type | Technology | Version | Use Case |
|------|-----------|---------|----------|
| Primary DB | MongoDB | 7.x | Session metadata, events, configs |
| Object Store | MinIO | RELEASE.2024-latest | Video, DOM snapshots |
| Cache | Redis | 7.x | Rate limiting, session caching (future) |
| Vector DB | Qdrant | 1.7+ | Code embeddings (Phase 4) |

### 2.6 Infrastructure Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Container | Docker | All services containerized |
| Orchestration | Docker Compose | Single-node deployment |
| Reverse Proxy | Traefik (optional) | Auto HTTPS, routing |
| Monitoring | Prometheus + Grafana (future) | Metrics, dashboards |

### 2.7 Development Tooling

| Tool | Purpose |
|------|---------|
| pnpm | Package manager (monorepo) |
| Turborepo | Build orchestration, caching |
| ESLint | Linting (shared config) |
| Prettier | Code formatting |
| Husky | Git hooks |
| Changesets | Versioning, changelogs |

---

## 3. Detailed Component Specifications

### 3.1 Backend Architecture (apps/api)

#### Directory Structure
```
apps/api/
├── src/
│   ├── config/           # Environment, feature flags
│   ├── plugins/          # Fastify plugins
│   │   ├── auth.ts       # API key authentication
│   │   ├── error.ts      # Error handling
│   │   └── cors.ts       # CORS configuration
│   ├── modules/          # Domain modules
│   │   ├── sessions/     # Session CRUD, search
│   │   ├── projects/     # Project management, config
│   │   ├── exports/      # GitHub, GitLab integrations
│   │   ├── ai/           # AI analysis, providers
│   │   └── mcp/          # MCP server endpoints
│   ├── services/         # Business logic layer
│   │   ├── storage/      # StorageProvider implementations
│   │   ├── blob/         # BlobProvider implementations
│   │   └── ai/           # AIProvider implementations
│   ├── models/           # Mongoose schemas
│   ├── types/            # Domain types (re-export from core-types)
│   ├── utils/            # Helpers, validators
│   └── server.ts         # Entry point
├── tests/                # Test suites
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── Dockerfile
└── package.json
```

#### Core Services

**SessionService**
```typescript
interface SessionService {
  create(data: CreateSessionDTO): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  search(query: SessionSearchQuery): Promise<Session[]>;
  delete(id: string): Promise<void>;
  
  // Analytics
  getErrorSignature(session: Session): string;
  findSimilarErrors(signature: string): Promise<Session[]>;
}
```

**StorageProvider Interface**
```typescript
interface StorageProvider {
  saveSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | null>;
  searchSessions(query: SearchQuery): Promise<Session[]>;
  updateSession(id: string, data: Partial<Session>): Promise<void>;
  deleteSession(id: string): Promise<void>;
}
```

**BlobProvider Interface**
```typescript
interface BlobProvider {
  putObject(key: string, data: Buffer | Stream): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
```

**AIProvider Interface**
```typescript
interface AIProvider {
  analyzeSession(
    session: Session,
    context?: CodeContext
  ): Promise<AIAnalysis>;
  
  validateConfig(config: AIProviderConfig): boolean;
}

interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  model: string;
  apiKey?: string;
  endpoint?: string;  // For Ollama/custom
  maxTokens?: number;
  temperature?: number;
}
```

#### API Routes

```typescript
// Session routes
POST   /api/v1/sessions              // Create session
GET    /api/v1/sessions               // List sessions (paginated)
GET    /api/v1/sessions/:id          // Get session details
DELETE /api/v1/sessions/:id          // Delete session
POST   /api/v1/sessions/:id/analyze  // Trigger AI analysis

// Export routes
POST   /api/v1/sessions/:id/export/github    // Export to GitHub
POST   /api/v1/sessions/:id/export/gitlab    // Export to GitLab
POST   /api/v1/sessions/:id/export/linear    // Export to Linear

// Project routes
GET    /api/v1/projects              // List projects
POST   /api/v1/projects              // Create project
GET    /api/v1/projects/:id          // Get project
PATCH  /api/v1/projects/:id          // Update project
DELETE /api/v1/projects/:id          // Delete project

// Project config
GET    /api/v1/projects/:id/config   // Get project config
PATCH  /api/v1/projects/:id/config   // Update config (BYOM, etc.)

// MCP routes (for AI IDEs)
GET    /api/v1/mcp/sessions          // List sessions for MCP
GET    /api/v1/mcp/sessions/:id      // Get session for MCP
```

### 3.2 Frontend Architecture (apps/dashboard)

#### Directory Structure
```
apps/dashboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Main dashboard layout
│   │   │   ├── sessions/
│   │   │   │   ├── page.tsx    # Sessions list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx # Session detail
│   │   │   ├── projects/
│   │   │   │   └── page.tsx    # Project settings
│   │   │   └── layout.tsx      # Dashboard shell
│   │   ├── api/                # API routes (auth callbacks, etc.)
│   │   └── layout.tsx          # Root layout
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── sessions/           # Session-related components
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionViewer.tsx
│   │   │   ├── Timeline.tsx
│   │   │   └── VideoPlayer.tsx
│   │   ├── common/             # Shared components
│   │   └── forms/              # Form components
│   ├── hooks/                  # Custom React hooks
│   │   ├── useSessions.ts
│   │   ├── useSession.ts
│   │   └── useAIAnalysis.ts
│   ├── lib/                    # Utilities
│   │   ├── api.ts              # API client
│   │   ├── utils.ts
│   │   └── constants.ts
│   ├── types/                  # TypeScript types
│   └── styles/
│       └── globals.css
├── public/
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

#### Key Components

**SessionViewer**
- Layout: Split-pane (video left, timeline right)
- Features:
  - Video scrubber with synchronized timeline
  - Console log viewer with filtering
  - Network request inspector
  - State snapshot viewer
  - AI analysis panel

**SessionList**
- Table/grid view of sessions
- Filters: project, date, error type, URL, commit
- Sorting: newest, most viewed, error severity
- Actions: view, export, delete

**ProjectSettings**
- BYOM configuration form
- Sanitization rule editor
- Integration settings (GitHub tokens, etc.)
- Team management (future)

### 3.3 Extension Architecture (apps/extension)

#### Directory Structure
```
apps/extension/
├── src/
│   ├── background/           # Service worker (Manifest V3)
│   │   ├── index.ts          # Entry point
│   │   ├── handlers.ts       # Message handlers
│   │   └── storage.ts        # Extension storage
│   ├── content/              # Content script
│   │   ├── index.ts          # Injected into pages
│   │   ├── capture.ts        # Capture orchestration
│   │   ├── buffer.ts         # MediaRecorder buffer
│   │   ├── network.ts        # Network interception
│   │   ├── console.ts        # Console capture
│   │   ├── state.ts          # State capture
│   │   └── sanitizer.ts      # Data sanitization
│   ├── popup/                # Extension popup UI
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── components/
│   ├── options/              # Extension options page
│   │   └── index.html
│   ├── shared/               # Shared utilities
│   │   ├── types.ts
│   │   ├── api.ts            # Backend API client
│   │   └── config.ts         # Config management
│   └── manifest.json         // Manifest V3
├── public/
├── vite.config.ts
├── tsconfig.json
└── package.json
```

#### Capture Flow

1. **Buffer Management**
   ```typescript
   interface BufferManager {
     start(): void;
     stop(): Promise<Blob>;  // Returns captured video
     clear(): void;
     getDuration(): number;
   }
   ```

2. **Event Collection**
   ```typescript
   interface EventCollector {
     start(): void;
     stop(): Promise<Event[]>;
     
     // Sub-collectors
     network: NetworkCollector;
     console: ConsoleCollector;
     errors: ErrorCollector;
     state: StateCollector;
   }
   ```

3. **Sanitization Pipeline**
   ```typescript
   interface Sanitizer {
     // Built-in rules
     addBuiltinRule(rule: SanitizerRule): void;
     
     // Custom rules from project config
     addCustomRule(pattern: RegExp | string, replacement: string): void;
     
     // Sanitize data before sending
     sanitize(data: any): SanitizedData;
   }
   ```

4. **Upload Manager**
   ```typescript
   interface UploadManager {
     uploadSession(session: SessionPayload): Promise<void>;
     uploadBlob(key: string, blob: Blob): Promise<void>;
     retryFailed(): Promise<void>;
   }
   ```

### 3.4 MCP Server Architecture (apps/mcp-server)

#### Directory Structure
```
apps/mcp-server/
├── src/
│   ├── server.ts            # MCP server entry
│   ├── handlers/            # MCP method handlers
│   │   ├── sessions.ts      // listSessions, getSession
│   │   └── search.ts        // searchSessions
│   ├── adapters/            # Backend API adapter
│   │   └── api-client.ts
│   └── types/               // MCP-specific types
├── Dockerfile
└── package.json
```

#### MCP Capabilities

```typescript
// Methods exposed to AI IDEs
interface MCPServer {
  // List sessions with filters
  listSessions(projectId: string, filters?: Filters): SessionSummary[];
  
  // Get full session details
  getSession(id: string): Session;
  
  // Search by error signature or text
  searchSessions(query: string): SessionSummary[];
}
```

---

## 4. Data Models & Schemas

### 4.1 MongoDB Collections

#### sessions Collection
```typescript
interface Session {
  _id: ObjectId;
  
  // Identity
  projectId: string;           // Reference to project
  sessionId: string;         // Unique session identifier
  
  // Metadata
  url: string;               // Page URL where bug occurred
  title?: string;            // Page title
  timestamp: Date;           // When captured
  duration: number;          // Capture duration (ms)
  
  // Environment
  environment: {
    browser: string;         // Chrome, Firefox, etc.
    browserVersion: string;
    os: string;              // Windows, macOS, Linux
    osVersion: string;
    viewport: { width: number; height: number };
    language: string;
    timezone: string;
  };
  
  // Application context
  app: {
    version?: string;          // App version
    commitSha?: string;      // Git commit
    branch?: string;         // Git branch
    featureFlags?: Record<string, boolean>;
  };
  
  // Error info
  error?: {
    message: string;
    stack?: string;
    type: string;            // Error type/name
    signature: string;       // Normalized signature for grouping
  };
  
  // Media references
  media: {
    videoKey?: string;       // Object storage key for video
    domSnapshots?: string[]; // Keys for DOM snapshots
    hasReplay: boolean;      // Whether replay data exists
  };
  
  // Stats
  stats: {
    consoleCount: number;    // Number of console entries
    networkCount: number;    // Number of network requests
    stateSnapshots: number;  // Number of state snapshots
  };
  
  // User (optional, if authenticated)
  userId?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

#### events Collection
```typescript
interface Event {
  _id: ObjectId;
  sessionId: string;         // Reference to session
  
  type: 'console' | 'network' | 'state' | 'error' | 'dom';
  timestamp: number;         // Relative to session start (ms)
  
  // Type-specific payload
  payload: ConsolePayload | NetworkPayload | StatePayload | ErrorPayload | DOMPayload;
  
  // Indexing
  createdAt: Date;
}

// Console event
interface ConsolePayload {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  args: any[];              // Serialized arguments
  stack?: string;           // For error-level logs
}

// Network event
interface NetworkPayload {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  url: string;
  status: number;
  statusText: string;
  
  // Request (sanitized)
  request: {
    headers: Record<string, string>;  // Sanitized
    body?: string;                    // Truncated if large
  };
  
  // Response (sanitized)
  response: {
    headers: Record<string, string>;
    body?: string;                    // Truncated if large
    size: number;
  };
  
  timing: {
    start: number;
    end: number;
    duration: number;
  };
}

// State snapshot
interface StatePayload {
  source: 'localStorage' | 'sessionStorage' | 'cookie' | 'redux' | 'vuex' | 'zustand' | 'context';
  key?: string;             // For storage items
  data: any;                // Serialized state
  changed?: boolean;        // Whether changed from previous
}

// Error event
interface ErrorPayload {
  message: string;
  stack: string;
  type: string;             // Error constructor name
  source?: string;          // Script URL (if available)
  line?: number;
  column?: number;
}

// DOM snapshot (periodic or on interaction)
interface DOMPayload {
  html: string;             // Serialized DOM (sanitized)
  selector?: string;        // Target element (if interaction)
  action?: 'click' | 'input' | 'scroll' | 'mutation';
}
```

#### projects Collection
```typescript
interface Project {
  _id: ObjectId;
  
  // Identity
  id: string;               // Public project ID
  name: string;
  slug: string;
  
  // API access
  apiKey: string;           // Hashed
  
  // Settings
  settings: ProjectSettings;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectSettings {
  // Capture settings
  capture: {
    videoEnabled: boolean;
    domSnapshotsEnabled: boolean;
    consoleEnabled: boolean;
    networkEnabled: boolean;
    stateEnabled: boolean;
    
    // Limits
    maxDuration: number;      // Max capture duration (ms)
    maxBodySize: number;    // Max request/response body (bytes)
  };
  
  // Sanitization rules
  sanitization: {
    headers: string[];      // Headers to strip (e.g., 'authorization')
    cookies: string[];      // Cookies to strip
    storageKeys: string[];    // localStorage keys to exclude
    urlPatterns: string[];  // URL patterns to exclude from network capture
    fieldPatterns: string[]; // Regex patterns for field exclusion
  };
  
  // BYOM configuration
  ai: {
    enabled: boolean;
    provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
    model: string;
    endpoint?: string;      // For Ollama/custom
    apiKey?: string;        // Encrypted
    maxTokens: number;
    temperature: number;
  };
  
  // Integrations
  integrations: {
    github?: {
      enabled: boolean;
      token: string;        // Encrypted
      owner: string;
      repo: string;
    };
    gitlab?: {
      enabled: boolean;
      token: string;
      url: string;          // GitLab instance URL
      projectId: string;
    };
    linear?: {
      enabled: boolean;
      token: string;
      teamId: string;
    };
  };
}
```

#### ai_analyses Collection
```typescript
interface AIAnalysis {
  _id: ObjectId;
  sessionId: string;        // Reference to session
  
  // Model info
  provider: string;
  model: string;
  
  // Analysis results
  summary: string;          // Human-readable summary
  rootCause?: string;       // Likely root cause description
  confidence?: number;        // 0-1 confidence score
  
  // Suggestions
  suggestedFiles?: string[];  // Files to investigate
  suggestedActions?: string[]; // Recommended next steps
  
  // Raw response (for debugging)
  rawResponse?: string;
  
  // Cost (for SaaS models)
  cost?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;  // USD
  };
  
  createdAt: Date;
}
```

### 4.2 Object Storage Structure

```
bucket: bugcatcher-sessions
├── videos/
│   └── {sessionId}.webm
├── dom/
│   └── {sessionId}/
│       ├── {timestamp1}.json
│       ├── {timestamp2}.json
│       └── ...
└── exports/
    └── {exportId}.json
```

### 4.3 Shared Types (packages/core-types)

All packages share these canonical types:

```typescript
// packages/core-types/src/index.ts
export * from './session';
export * from './event';
export * from './project';
export * from './ai';
export * from './export';

// Type guards and validators
export * from './validators';
```

---

## 5. API Specifications

### 5.1 Authentication

**API Key Authentication**
```
Header: X-Project-Key: {project_api_key}
```

All endpoints except health checks require authentication.

### 5.2 Rate Limiting

- **Session creation**: 100 req/min per project
- **Session retrieval**: 1000 req/min per project
- **AI analysis**: 10 req/min per project (cost control)

### 5.3 OpenAPI Schema

Auto-generated from Fastify route definitions. Available at:
```
GET /documentation/json    // OpenAPI JSON
GET /documentation/ui      // Swagger UI
```

### 5.4 Error Handling

Standard error format:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid session data",
  "code": "SESSION_INVALID",
  "details": {
    "field": "url",
    "issue": "URL is required"
  }
}
```

---

## 6. Security & Privacy Architecture

### 6.1 Zero-Trust Sanitization

**Client-Side (Extension)**
```typescript
// Sanitization pipeline (runs in browser)
const sanitizer = new Sanitizer([
  // Built-in rules
  new HeaderSanitizer(['authorization', 'cookie', 'x-api-key']),
  new CookieSanitizer(['session', 'token']),
  new StorageSanitizer(['password', 'token', 'secret']),
  new BodySanitizer({ maxSize: 1024 * 1024 }), // 1MB limit
  
  // Custom rules from project config
  ...projectConfig.sanitizationRules.map(r => new CustomRule(r))
]);

// All data passes through before transmission
const sanitized = sanitizer.process(capturedData);
```

**Fail-Closed Design**
- If a field matches a pattern and we can't verify it's safe, it's dropped
- Never send raw headers/storage without inspection
- All sanitization rules are auditable (shown in dashboard)

### 6.2 Data Encryption

**At Rest**
- MongoDB: Use MongoDB encryption (if available) or application-layer encryption for sensitive fields
- API keys: AES-256 encrypted with project-specific keys
- AI tokens: Encrypted, only decrypted server-side for API calls

**In Transit**
- TLS 1.3 for all communications
- Certificate pinning for extension (optional)

### 6.3 Access Control

**Project Isolation**
- Each project has unique API key
- Sessions are strictly scoped to project
- No cross-project access

**Dashboard Authentication (Future)**
- OAuth with GitHub/Google
- Role-based access (admin, developer, viewer)

### 6.4 Audit Logging

```typescript
interface AuditLog {
  _id: ObjectId;
  projectId: string;
  action: 'session_created' | 'session_viewed' | 'session_deleted' | 'config_updated' | 'ai_analysis';
  actor: string;            // User ID or 'system'
  resource: string;       // Session ID, config ID, etc.
  details: Record<string, any>;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}
```

---

## 7. Infrastructure & Deployment

### 7.1 Docker Compose Configuration

```yaml
# infra/docker-compose.yml
version: '3.8'

services:
  # Core application
  api:
    build:
      context: ../apps/api
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/bugcatcher
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
    depends_on:
      - mongo
      - minio
    volumes:
      - ./logs:/app/logs

  dashboard:
    build:
      context: ../apps/dashboard
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3001
    depends_on:
      - api

  mcp-server:
    build:
      context: ../apps/mcp-server
      dockerfile: Dockerfile
    ports:
      - "3002:3002"
    environment:
      - API_URL=http://api:3001
    depends_on:
      - api

  # Storage
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_ROOT_USER}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_ROOT_PASS}

  minio:
    image: minio/minio:RELEASE.2024-latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"

  # Optional: Reverse proxy
  traefik:
    image: traefik:v3
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik:/etc/traefik
    profiles:
      - production

volumes:
  mongo_data:
  minio_data:
```

### 7.2 Environment Variables

```bash
# .env.example

# Application
NODE_ENV=development
API_PORT=3001
DASHBOARD_PORT=3000
MCP_PORT=3002

# MongoDB
MONGODB_URI=mongodb://localhost:27017/bugcatcher
MONGO_ROOT_USER=admin
MONGO_ROOT_PASS=changeme

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=bugcatcher-sessions

# Security
ENCRYPTION_KEY=your-32-byte-key-here

# AI (optional - can be set per-project)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
```

### 7.3 Production Considerations

- **Database**: Use MongoDB replica set for HA
- **Object Storage**: Use real S3 for production (MinIO for dev/self-host)
- **Backup**: Automated MongoDB backups + S3 versioning
- **Monitoring**: Prometheus metrics + Grafana dashboards
- **Logging**: Centralized logging (ELK or similar)

---

## 8. Development Environment Setup

### 8.1 Prerequisites

- Node.js 20.x LTS
- pnpm 8.x
- Docker & Docker Compose
- Git

### 8.2 Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/bugcatcher.git
cd bugcatcher

# 2. Install dependencies
pnpm install

# 3. Copy environment file
cp .env.example .env
# Edit .env with your values

# 4. Start infrastructure
cd infra
docker-compose up -d mongo minio

# 5. Initialize MinIO bucket
# (script or manual - create 'bugcatcher-sessions' bucket)

# 6. Run development servers
pnpm dev  # Starts all apps via Turborepo
```

### 8.3 Development Commands

```bash
# Install dependencies for all packages
pnpm install

# Run all apps in development
pnpm dev

# Build everything
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Type checking
pnpm typecheck

# Clean build artifacts
pnpm clean
```

### 8.4 Testing Strategy

**Unit Tests**
- Services, utilities, validators
- Vitest with in-memory MongoDB

**Integration Tests**
- API endpoint testing
- Database operations
- Requires Docker services

**E2E Tests (Future)**
- Playwright for dashboard
- Extension testing with web-ext

---

## 9. Feature Specifications

### 9.1 Capture Engine Features

#### Video Capture
- **Rolling buffer**: 1-2 minutes of screen/tab audio
- **Codecs**: VP9/WebM for browser compatibility
- **Quality**: Configurable (720p/1080p, 30fps)
- **Pause/Resume**: User can pause capture if needed
- **Storage**: Direct upload to MinIO/S3

#### DOM Replay
- **Snapshots**: Periodic full-DOM captures
- **Mutations**: MutationObserver for incremental updates
- **Playback**: Accurate reconstruction in dashboard
- **Privacy**: Sensitive elements masked (passwords, etc.)

#### Network Interception
- **XHR/Fetch**: All requests captured
- **WebSocket**: Frame capture (text only)
- **Headers**: Selective capture (respects sanitization)
- **Bodies**: Size-limited, JSON parsed when possible
- **Timing**: Start, end, duration for performance analysis

#### Console & Error Capture
- **All levels**: log, warn, error, info, debug
- **Stack traces**: Captured for errors
- **Object serialization**: Safe serialization (circular refs handled)
- **Source maps**: Applied for readable stacks

#### State Capture
- **Storage**: localStorage, sessionStorage, cookies
- **Frameworks**: Redux, Vuex, Zustand, React Context
- **Adapters**: Plugin API for custom frameworks
- **Diffing**: Optional change tracking

### 9.2 AI Features

#### Root Cause Analysis (V1)
- **Input**: Session (error, logs, network, state)
- **Process**:
  1. Reduce session to compact prompt
  2. Call configured AI provider
  3. Parse structured response
- **Output**:
  - Natural language summary
  - Likely root cause
  - Suggested files to inspect
  - Confidence score

#### Smart Issue Generation
- **Title generation**: AI suggests issue title
- **Description**: Auto-generated with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Relevant logs/network entries
- **Labels**: Suggested based on error type

#### Code Context (Phase 4)
- **Repository connection**: Link to GitHub/GitLab repo
- **Vector search**: Find relevant code based on error
- **Multi-file analysis**: Cross-reference multiple files

### 9.3 Integration Features

#### GitHub Integration
- **Authentication**: OAuth or personal access token
- **Export formats**:
  - Markdown issue
  - GitHub-flavored markdown
  - JSON for custom processing
- **Attachments**:
  - Session link
  - Video thumbnail
  - Log excerpts

#### MCP Integration
- **Tools exposed**:
  - `get_recent_sessions`: Last N sessions
  - `get_session_details`: Full session data
  - `search_similar_errors`: Find similar past errors
  - `analyze_session`: Trigger AI analysis
- **Use cases**:
  - "Why is this error happening?"
  - "Show me similar past bugs"
  - "Create an issue for this session"

### 9.4 Dashboard Features

#### Session Management
- **List view**: Sortable, filterable, searchable
- **Detail view**: Comprehensive session inspection
- **Bulk actions**: Delete, export multiple
- **Sharing**: Public links (optional, expiring)

#### Replay Features
- **Video scrubbing**: Frame-accurate seeking
- **Timeline sync**: Video + events synchronized
- **Speed control**: 0.5x, 1x, 2x playback
- **Annotations**: Add notes at specific timestamps

#### Analytics (Future)
- **Error trends**: Most common errors over time
- **Performance**: Capture duration, upload times
- **AI effectiveness**: Analysis accuracy tracking

### 9.5 Extension Features

#### Capture Triggers
- **Manual**: User clicks extension icon
- **Keyboard shortcut**: Configurable (e.g., Ctrl+Shift+B)
- **Automatic**: On uncaught errors (opt-in)
- **API**: Programmatic trigger from app

#### Configuration
- **Per-project settings**: Different configs per domain
- **Visual indicator**: Recording status overlay
- **Quick actions**: Capture, settings, view recent

#### Offline Support
- **Queue**: Store captures locally if backend unreachable
- **Retry**: Automatic retry with exponential backoff
- **Sync**: Upload when connection restored

---

## 10. Implementation Roadmap

### Phase 1: Core Plumbing (Weeks 1-3)

**Goal**: Basic capture, storage, and viewing

**Backend**
- [ ] Fastify server setup
- [ ] MongoDB connection + models
- [ ] MinIO integration
- [ ] Session CRUD endpoints
- [ ] Basic auth (API keys)

**Extension**
- [ ] Manifest V3 setup
- [ ] Basic capture (console, errors)
- [ ] Simple upload to backend
- [ ] Popup UI for capture trigger

**Dashboard**
- [ ] Next.js project setup
- [ ] Sessions list page
- [ ] Basic session detail view
- [ ] API integration

**Deliverable**: Can capture console/errors and view in dashboard

### Phase 2: Time-Travel & Privacy (Weeks 4-6)

**Goal**: Video capture, DOM snapshots, sanitization

**Extension**
- [ ] MediaRecorder integration
- [ ] Rolling buffer implementation
- [ ] DOM snapshot capture
- [ ] Sanitization engine
- [ ] Project configuration sync

**Backend**
- [ ] Blob storage endpoints
- [ ] Video serving (signed URLs)
- [ ] Project settings API

**Dashboard**
- [ ] Video player component
- [ ] Timeline visualization
- [ ] Synced playback

**Deliverable**: Full replay with video, privacy-safe by default

### Phase 3: AI & Integrations (Weeks 7-9)

**Goal**: BYOM, root cause analysis, GitHub export

**Backend**
- [ ] AIProvider abstraction
- [ ] OpenAI/Anthropic implementations
- [ ] Analysis endpoint
- [ ] GitHub OAuth + export

**Dashboard**
- [ ] AI analysis tab
- [ ] Project settings (BYOM config)
- [ ] GitHub integration UI
- [ ] Export flow

**Extension**
- [ ] Framework adapters (Redux, Vuex)

**Deliverable**: AI-assisted debugging, one-click GitHub issues

### Phase 4: MCP & Ecosystem (Weeks 10-12)

**Goal**: MCP server, advanced features, community

**MCP Server**
- [ ] MCP protocol implementation
- [ ] Session exposure tools
- [ ] Search capabilities

**Backend**
- [ ] Vector search (Qdrant)
- [ ] Code embeddings
- [ ] Advanced agentic analysis

**Dashboard**
- [ ] Enhanced analytics
- [ ] Team features
- [ ] Advanced filters

**Extension**
- [ ] Community adapter API
- [ ] More framework adapters

**Deliverable**: Full MCP integration, community extensible

### Phase 5: Polish & Launch (Weeks 13-14)

**Goal**: Production readiness, documentation, launch

- [ ] Comprehensive documentation
- [ ] Security audit
- [ ] Performance optimization
- [ ] Self-hosting guide
- [ ] Community templates
- [ ] Launch on GitHub

---

## Appendix A: Glossary

- **BYOM**: Bring Your Own Model - allowing users to configure their own AI provider
- **MCP**: Model Context Protocol - protocol for AI tools to access external data
- **Session**: A complete bug capture including video, logs, network, state
- **Sanitization**: Process of removing sensitive data before transmission
- **DOM Snapshot**: Serialized representation of webpage state
- **Error Signature**: Normalized error identifier for grouping similar errors

## Appendix B: References

- [Fastify Documentation](https://www.fastify.io/docs/)
- [Next.js Documentation](https://nextjs.org/docs)
- [MongoDB Schema Design](https://www.mongodb.com/docs/manual/core/data-modeling-introduction/)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-25  
**Maintained by**: Architecture Team
