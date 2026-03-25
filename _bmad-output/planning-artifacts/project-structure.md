# Complete Project Structure: BugCatcher Monorepo

**Version**: 1.0  
**Date**: 2026-03-25  
**Type**: Turborepo + pnpm Workspaces

---

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Root Structure](#2-root-structure)
3. [Apps Directory](#3-apps-directory)
4. [Packages Directory](#4-packages-directory)
5. [Infrastructure](#5-infrastructure)
6. [Documentation](#6-documentation)
7. [Configuration Files](#7-configuration-files)
8. [File Count by Component](#8-file-count-by-component)

---

## 1. Repository Overview

```
bugcatcher/
├── apps/                      # Applications
│   ├── api/                   # Fastify backend API
│   ├── dashboard/             # Next.js web dashboard
│   ├── extension/             # Browser extension (Chrome/Firefox)
│   └── mcp-server/            # MCP server for AI IDEs
│
├── packages/                  # Shared packages
│   ├── core-types/            # Shared TypeScript types
│   ├── storage/               # Storage provider implementations
│   ├── ai-provider/           # AI provider abstractions
│   ├── state-adapters/        # Framework state adapters
│   ├── eslint-config/         # Shared ESLint configuration
│   └── tsconfig/              # Shared TypeScript configurations
│
├── infra/                     # Infrastructure & deployment
│   ├── docker-compose.yml     # Local development stack
│   ├── docker-compose.prod.yml # Production stack
│   ├── traefik/               # Traefik configuration
│   └── scripts/               # Infrastructure scripts
│
├── docs/                      # Documentation
│   ├── architecture/            # Architecture documentation
│   ├── api/                   # API documentation
│   ├── contributing/          # Contribution guidelines
│   └── deployment/            # Deployment guides
│
├── scripts/                   # Development scripts
├── .github/                   # GitHub workflows & templates
├── .husky/                    # Git hooks
├── package.json               # Root workspace configuration
├── turbo.json                 # Turborepo configuration
├── pnpm-workspace.yaml        # pnpm workspace definition
├── .gitignore
├── .env.example               # Environment variables template
├── LICENSE
└── README.md                  # Main project README
```

**Total Files (Estimated)**: 250+ files  
**Total Directories**: 60+ directories  
**Lines of Code (Estimated)**: 15,000+ (MVP)

---

## 2. Root Structure

### 2.1 Root Configuration Files

```
bugcatcher/
├── package.json                  # Workspace root config
├── pnpm-workspace.yaml          # pnpm workspaces definition
├── turbo.json                   # Turborepo pipeline
├── tsconfig.json                # Root TypeScript config
├── .gitignore                   # Git ignore patterns
├── .env                         # Local environment (not committed)
├── .env.example                 # Environment template
├── .eslintrc.js                 # Root ESLint config
├── .prettierrc                  # Prettier config
├── LICENSE                      # Open source license
└── README.md                    # Project overview
```

### 2.2 package.json (Root)

```json
{
  "name": "bugcatcher",
  "private": true,
  "version": "1.0.0",
  "description": "Open-source AI-native bug capture and analysis",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev --parallel",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck",
    "clean": "turbo clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "turbo build --filter=!@bugcatcher/extension && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.1",
    "eslint": "^8.57.0",
    "husky": "^9.0.0",
    "prettier": "^3.2.0",
    "turbo": "^1.12.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  },
  "packageManager": "pnpm@8.15.0"
}
```

### 2.3 turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

### 2.4 pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 3. Apps Directory

### 3.1 API Application (apps/api)

```
apps/api/
├── src/
│   ├── config/
│   │   ├── env.ts              # Environment variable validation
│   │   ├── features.ts         # Feature flags
│   │   └── index.ts            # Config exports
│   │
│   ├── plugins/
│   │   ├── auth.ts             # API key authentication
│   │   ├── cors.ts             # CORS configuration
│   │   ├── error-handler.ts    # Global error handling
│   │   ├── rate-limit.ts       # Rate limiting
│   │   └── swagger.ts          # OpenAPI/Swagger setup
│   │
│   ├── models/
│   │   ├── session.model.ts    # Session Mongoose schema
│   │   ├── event.model.ts      # Event Mongoose schema
│   │   ├── project.model.ts    # Project Mongoose schema
│   │   ├── ai-analysis.model.ts # AI analysis schema
│   │   └── index.ts            # Model exports
│   │
│   ├── modules/
│   │   ├── sessions/
│   │   │   ├── sessions.controller.ts
│   │   │   ├── sessions.routes.ts
│   │   │   ├── sessions.schema.ts    # Zod validation
│   │   │   └── sessions.service.ts
│   │   │
│   │   ├── projects/
│   │   │   ├── projects.controller.ts
│   │   │   ├── projects.routes.ts
│   │   │   ├── projects.schema.ts
│   │   │   └── projects.service.ts
│   │   │
│   │   ├── exports/
│   │   │   ├── exports.controller.ts
│   │   │   ├── exports.routes.ts
│   │   │   ├── github.service.ts
│   │   │   ├── gitlab.service.ts
│   │   │   └── linear.service.ts
│   │   │
│   │   ├── ai/
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.routes.ts
│   │   │   ├── ai.service.ts
│   │   │   └── providers/
│   │   │       ├── base.provider.ts
│   │   │       ├── openai.provider.ts
│   │   │       ├── anthropic.provider.ts
│   │   │       ├── ollama.provider.ts
│   │   │       └── custom.provider.ts
│   │   │
│   │   └── mcp/
│   │       ├── mcp.controller.ts
│   │       ├── mcp.routes.ts
│   │       └── mcp.service.ts
│   │
│   ├── services/
│   │   ├── storage/
│   │   │   ├── storage.interface.ts
│   │   │   ├── mongo.storage.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── blob/
│   │   │   ├── blob.interface.ts
│   │   │   ├── minio.blob.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── ai/
│   │   │   ├── ai.interface.ts
│   │   │   └── ai.service.ts
│   │   │
│   │   ├── github/
│   │   │   └── github.service.ts
│   │   │
│   │   └── sanitization/
│   │       └── sanitization.service.ts
│   │
│   ├── utils/
│   │   ├── errors.ts           # Custom error classes
│   │   ├── logger.ts           # Logging utility
│   │   ├── crypto.ts           # Encryption utilities
│   │   ├── validation.ts       # Validation helpers
│   │   └── index.ts
│   │
│   ├── types/
│   │   └── index.ts            # Re-exports from @bugcatcher/core-types
│   │
│   └── server.ts               # Fastify server entry
│
├── tests/
│   ├── unit/
│   │   ├── sessions.test.ts
│   │   ├── projects.test.ts
│   │   └── ai.test.ts
│   ├── integration/
│   │   ├── api.test.ts
│   │   └── storage.test.ts
│   ├── fixtures/
│   │   ├── sessions.ts
│   │   └── projects.ts
│   └── setup.ts                # Test setup
│
├── Dockerfile
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**API File Count**: ~45 files

### 3.2 Dashboard Application (apps/dashboard)

```
apps/dashboard/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx           # Dashboard shell
│   │   │   ├── page.tsx             # Dashboard home
│   │   │   │
│   │   │   ├── sessions/
│   │   │   │   ├── page.tsx         # Sessions list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx     # Session detail
│   │   │   │
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx         # Projects list
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx     # Project settings
│   │   │   │       └── config/
│   │   │   │           └── page.tsx # BYOM config
│   │   │   │
│   │   │   └── settings/
│   │   │       └── page.tsx         # User settings
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]
│   │   │   └── webhooks/
│   │   │       └── route.ts
│   │   │
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                   # Landing page
│   │   ├── error.tsx                  # Error boundary
│   │   └── loading.tsx                # Loading UI
│   │
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   │
│   │   ├── sessions/
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionCard.tsx
│   │   │   ├── SessionViewer.tsx
│   │   │   ├── SessionHeader.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── Timeline.tsx
│   │   │   ├── EventList.tsx
│   │   │   ├── ConsolePanel.tsx
│   │   │   ├── NetworkPanel.tsx
│   │   │   ├── StatePanel.tsx
│   │   │   └── AIAnalysisPanel.tsx
│   │   │
│   │   ├── common/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Logo.tsx
│   │   │   ├── Loading.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   │
│   │   ├── forms/
│   │   │   ├── ProjectForm.tsx
│   │   │   ├── BYOMConfigForm.tsx
│   │   │   ├── SanitizationRulesForm.tsx
│   │   │   └── IntegrationForm.tsx
│   │   │
│   │   └── modals/
│   │       ├── ExportModal.tsx
│   │       ├── ShareModal.tsx
│   │       └── DeleteConfirmModal.tsx
│   │
│   ├── hooks/
│   │   ├── useSessions.ts
│   │   ├── useSession.ts
│   │   ├── useProjects.ts
│   │   ├── useProject.ts
│   │   ├── useAIAnalysis.ts
│   │   ├── useExport.ts
│   │   ├── useToast.ts
│   │   └── useLocalStorage.ts
│   │
│   ├── lib/
│   │   ├── api.ts                     # API client
│   │   ├── utils.ts                   # Utility functions
│   │   ├── constants.ts               # Constants
│   │   ├── crypto.ts                  # Client-side crypto
│   │   └── validators.ts              # Zod schemas
│   │
│   ├── types/
│   │   └── index.ts                   # Re-exports from @bugcatcher/core-types
│   │
│   └── styles/
│       └── globals.css
│
├── components.json              # shadcn/ui config
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json
└── public/
    ├── logo.svg
    └── favicon.ico
```

**Dashboard File Count**: ~60 files

### 3.3 Extension Application (apps/extension)

```
apps/extension/
├── src/
│   ├── background/
│   │   ├── index.ts                # Service worker entry
│   │   ├── handlers.ts             # Message handlers
│   │   ├── storage.ts              # Extension storage mgmt
│   │   └── api.ts                  # Background API calls
│   │
│   ├── content/
│   │   ├── index.ts                # Content script entry
│   │   ├── capture.ts              # Main capture orchestrator
│   │   ├── buffer.ts               # MediaRecorder buffer
│   │   ├── network.ts              # Network interception
│   │   ├── console.ts              # Console capture
│   │   ├── errors.ts               # Error capture
│   │   ├── state.ts                # State capture
│   │   ├── dom.ts                  # DOM snapshot capture
│   │   ├── sanitizer.ts            # Sanitization engine
│   │   ├── uploader.ts             # Upload manager
│   │   └── config.ts               # Config management
│   │
│   ├── popup/
│   │   ├── index.html
│   │   ├── index.tsx               # Popup entry
│   │   ├── App.tsx                 # Popup main component
│   │   ├── components/
│   │   │   ├── CaptureButton.tsx
│   │   │   ├── StatusIndicator.tsx
│   │   │   ├── ProjectSelector.tsx
│   │   │   └── RecentSessions.tsx
│   │   └── styles.css
│   │
│   ├── options/
│   │   ├── index.html
│   │   ├── index.tsx               # Options page entry
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── GeneralSettings.tsx
│   │   │   ├── CaptureSettings.tsx
│   │   │   ├── SanitizationRules.tsx
│   │   │   ├── BYOMSettings.tsx
│   │   │   └── ProjectSettings.tsx
│   │   └── styles.css
│   │
│   ├── shared/
│   │   ├── types.ts                # Extension-specific types
│   │   ├── constants.ts            # Constants
│   │   ├── api.ts                  # API client
│   │   ├── config.ts               # Config types & defaults
│   │   ├── storage.ts              # Storage utilities
│   │   ├── messaging.ts            # Message passing
│   │   └── index.ts
│   │
│   └── manifest.json               # Extension manifest (V3)
│
├── public/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── popup.css
│
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

**Extension File Count**: ~35 files

### 3.4 MCP Server Application (apps/mcp-server)

```
apps/mcp-server/
├── src/
│   ├── server.ts                   # MCP server entry
│   ├── config.ts                   # Server configuration
│   │
│   ├── handlers/
│   │   ├── sessions.ts             # Session-related tools
│   │   ├── search.ts               # Search tools
│   │   ├── analysis.ts             # Analysis tools
│   │   └── index.ts                # Handler registration
│   │
│   ├── adapters/
│   │   └── api-client.ts           # Backend API client
│   │
│   ├── types/
│   │   └── mcp.ts                  # MCP-specific types
│   │
│   └── utils/
│       └── logger.ts
│
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

**MCP Server File Count**: ~12 files

---

## 4. Packages Directory

### 4.1 Core Types Package (packages/core-types)

```
packages/core-types/
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── session.ts                  # Session types
│   │   ├── Session                 # Main session interface
│   │   ├── SessionMetadata
│   │   ├── SessionEnvironment
│   │   ├── SessionMedia
│   │   └── CreateSessionDTO
│   │
│   ├── event.ts                    # Event types
│   │   ├── Event                   # Base event
│   │   ├── ConsoleEvent
│   │   ├── NetworkEvent
│   │   ├── StateEvent
│   │   ├── ErrorEvent
│   │   └── DOMEvent
│   │
│   ├── project.ts                  # Project types
│   │   ├── Project
│   │   ├── ProjectSettings
│   │   ├── BYOMConfig
│   │   ├── SanitizationRules
│   │   └── IntegrationConfig
│   │
│   ├── ai.ts                       # AI types
│   │   ├── AIAnalysis
│   │   ├── AIProviderConfig
│   │   ├── AnalysisResult
│   │   └── PromptTemplate
│   │
│   ├── export.ts                   # Export types
│   │   ├── ExportPayload
│   │   ├── GitHubExport
│   │   └── GitLabExport
│   │
│   ├── api.ts                      # API types
│   │   ├── ApiResponse
│   │   ├── PaginatedResponse
│   │   └── ErrorResponse
│   │
│   ├── extension.ts                # Extension types
│   │   ├── CaptureConfig
│   │   ├── CapturePayload
│   │   └── SanitizerRule
│   │
│   └── validators/                 # Zod schemas
│       ├── index.ts
│       ├── session.validator.ts
│       ├── project.validator.ts
│       └── event.validator.ts
│
├── package.json
└── tsconfig.json
```

**Core Types File Count**: ~15 files

### 4.2 Storage Package (packages/storage)

```
packages/storage/
├── src/
│   ├── index.ts
│   ├── interfaces/
│   │   ├── storage.interface.ts
│   │   └── blob.interface.ts
│   ├── implementations/
│   │   ├── mongo.storage.ts
│   │   ├── minio.blob.ts
│   │   └── s3.blob.ts
│   └── utils/
│       └── connection.ts
├── package.json
└── tsconfig.json
```

### 4.3 AI Provider Package (packages/ai-provider)

```
packages/ai-provider/
├── src/
│   ├── index.ts
│   ├── interfaces/
│   │   └── ai-provider.interface.ts
│   ├── implementations/
│   │   ├── openai.provider.ts
│   │   ├── anthropic.provider.ts
│   │   ├── ollama.provider.ts
│   │   └── custom.provider.ts
│   ├── prompts/
│   │   ├── root-cause.ts
│   │   ├── summary.ts
│   │   └── issue-generation.ts
│   └── utils/
│       ├── token-counter.ts
│       └── cost-calculator.ts
├── package.json
└── tsconfig.json
```

### 4.4 State Adapters Package (packages/state-adapters)

```
packages/state-adapters/
├── src/
│   ├── index.ts
│   ├── interfaces/
│   │   └── state-adapter.interface.ts
│   ├── adapters/
│   │   ├── redux.adapter.ts
│   │   ├── vuex.adapter.ts
│   │   ├── zustand.adapter.ts
│   │   ├── react-context.adapter.ts
│   │   └── storage.adapter.ts
│   └── registry.ts
├── package.json
└── tsconfig.json
```

### 4.5 Shared Configuration Packages

```
packages/
├── eslint-config/
│   ├── library.js                   # Base ESLint config
│   ├── next.js                      # Next.js specific
│   └── node.js                      # Node.js specific
│
└── tsconfig/
    ├── base.json                    # Base TSConfig
    ├── nextjs.json                  # Next.js specific
    ├── node.json                    # Node.js specific
    └── react-library.json           # React library
```

---

## 5. Infrastructure

```
infra/
├── docker-compose.yml               # Development stack
├── docker-compose.prod.yml          # Production stack
├── docker-compose.override.yml      # Local overrides
│
├── traefik/
│   ├── traefik.yml                  # Traefik config
│   └── dynamic/
│       └── config.yml
│
├── scripts/
│   ├── init-minio.sh                # Initialize MinIO bucket
│   ├── backup-mongo.sh              # MongoDB backup
│   ├── setup-ssl.sh                 # SSL certificate setup
│   └── migrate.sh                   # Database migrations
│
├── mongodb/
│   └── init.js                      # MongoDB initialization
│
└── README.md                        # Infrastructure docs
```

---

## 6. Documentation

```
docs/
├── README.md                        # Docs home
│
├── architecture/
│   ├── overview.md                  # System overview
│   ├── capture-engine.md            # Capture architecture
│   ├── backend.md                   # Backend architecture
│   ├── dashboard.md                 # Frontend architecture
│   ├── ai-integration.md            # AI architecture
│   └── data-flow.md                 # E2E data flow
│
├── api/
│   ├── openapi.yaml                 # OpenAPI spec
│   ├── authentication.md            # Auth guide
│   ├── sessions.md                  # Sessions API
│   ├── projects.md                  # Projects API
│   └── webhooks.md                  # Webhooks guide
│
├── contributing/
│   ├── getting-started.md           # Dev setup
│   ├── code-style.md                # Coding standards
│   ├── testing.md                   # Testing guide
│   ├── pull-requests.md             # PR process
│   └── architecture-decisions/      # ADRs
│       ├── 001-typescript-over-go.md
│       ├── 002-mongodb-over-postgres.md
│       └── 003-fastify-over-express.md
│
├── deployment/
│   ├── self-hosting.md              # Self-host guide
│   ├── docker.md                    # Docker guide
│   ├── kubernetes.md                # K8s guide (future)
│   └── configuration.md             # Config reference
│
├── extension/
│   ├── development.md               # Extension dev
│   ├── manifest-v3.md                 # MV3 guide
│   └── publishing.md                # Publishing guide
│
└── mcp/
    ├── overview.md                  # MCP overview
    ├── tools.md                     # Available tools
    └── examples.md                  # Usage examples
```

---

## 7. Configuration Files

### 7.1 GitHub Configuration

```
.github/
├── workflows/
│   ├── ci.yml                       # CI pipeline
│   ├── release.yml                  # Release workflow
│   └── extension-publish.yml        # Extension publish
│
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   ├── feature_request.md
│   └── question.md
│
├── PULL_REQUEST_TEMPLATE.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
└── FUNDING.yml
```

### 7.2 Development Tools

```
.husky/
├── pre-commit                       # Pre-commit hooks
└── commit-msg                       # Commit message lint

.vscode/
├── extensions.json                  # Recommended extensions
├── settings.json                    # Workspace settings
└── launch.json                      # Debug configurations
```

---

## 8. File Count by Component

| Component | Directory | Files | Description |
|-----------|-----------|-------|-------------|
| Backend API | apps/api | ~45 | Fastify, MongoDB, business logic |
| Dashboard | apps/dashboard | ~60 | Next.js, React, UI components |
| Extension | apps/extension | ~35 | Chrome extension, capture logic |
| MCP Server | apps/mcp-server | ~12 | MCP protocol implementation |
| Core Types | packages/core-types | ~15 | Shared TypeScript types |
| Storage | packages/storage | ~8 | Storage abstractions |
| AI Provider | packages/ai-provider | ~10 | AI provider implementations |
| State Adapters | packages/state-adapters | ~8 | Framework adapters |
| Shared Config | packages/* | ~6 | ESLint, TSConfig |
| Infrastructure | infra/ | ~10 | Docker, scripts |
| Documentation | docs/ | ~25 | Guides, API docs |
| Root Config | / | ~12 | Package, turbo, CI |
| **TOTAL** | - | **~246** | **Complete codebase** |

---

## Summary

This structure provides:

✅ **Clear separation**: Apps vs packages vs infra  
✅ **Type safety**: Shared types across all packages  
✅ **Scalability**: Each app/package can evolve independently  
✅ **Developer experience**: Clear organization, consistent patterns  
✅ **Future-proof**: Easy to add new integrations, adapters, features  

**Key Principles**:
1. **Shared types** in `packages/core-types` - single source of truth
2. **Interface-based design** - easy to swap implementations
3. **Clear boundaries** - each app has a specific responsibility
4. **Documentation-first** - docs alongside code
5. **Containerized** - everything runs in Docker for consistency

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-25
