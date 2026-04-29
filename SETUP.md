# BetterBugs - Complete Setup Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      BetterBugs Architecture                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐   │
│  │   Browser    │     │   Dashboard  │     │   MCP Server     │   │
│  │  Extension   │     │  (Next.js)   │     │   (Python)       │   │
│  │  (Chrome)    │     │   :3002      │     │   (FastMCP)      │   │
│  └──────┬───────┘     └──────┬───────┘     └────────┬─────────┘   │
│         │                    │                       │             │
│         │                    │   HTTP                │  stdio      │
│         ▼                    ▼                       ▼             │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Go API Server (:3001)                        ││
│  │  • Sessions CRUD    • Tags & Comments   • Analysis              ││
│  │  • Media Uploads    • Rate Limiting     • Project Stats         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                       │
│              ┌───────────────┴───────────────┐                      │
│              ▼                               ▼                      │
│  ┌─────────────────────┐         ┌─────────────────────┐           │
│  │   MongoDB Atlas     │         │   MinIO (optional)  │           │
│  │   (Persistence)     │         │   (File Storage)    │           │
│  └─────────────────────┘         └─────────────────────┘           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## What You Get

- **Go Backend API** (`apps/api`) - Gin framework with MongoDB + MinIO
- **Browser Extension** (`apps/extension`) - React + TypeScript + Vite
- **Dashboard** (`apps/dashboard`) - Next.js 14 web interface
- **MCP Server** (`apps/mcp-server`) - Python FastMCP for agentic workflows

---

## Quick Start

### Prerequisites

- Go 1.22+
- Node.js 18+
- Python 3.10+
- MongoDB Atlas or local MongoDB
- Chrome browser

### Automated Setup

**Windows:**
```bash
.\setup.bat
```

**Mac/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

---

## Manual Setup

### Step 1: API Server

```bash
# Navigate to API directory
cd apps/api

# Install Go dependencies
go mod tidy

# Copy environment file
copy .env.example .env

# Run the API server
go run main.go
```

**API runs on:** http://localhost:3001

---

### Step 2: Dashboard

```bash
# Navigate to dashboard directory
cd apps/dashboard

# Install dependencies
npm install

# Run development server
npm run dev
```

**Dashboard runs on:** http://localhost:3002

---

### Step 3: Browser Extension

```bash
# Navigate to extension directory
cd apps/extension

# Install dependencies
npm install

# Build extension
npm run build
```

**Load in Chrome:**
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `apps/extension/dist`

**Configure Extension:**
- API Base URL: `http://localhost:3001/api/v1`
- Project ID: `dev-project`
- Project Key: `dev-key`

---

### Step 4: MCP Server (Optional - for Agentic Workflows)

```bash
# Navigate to MCP server directory
cd apps/mcp-server

# Install Python dependencies
pip install -r requirements.txt

# Run MCP server (uses stdio transport)
python server.py
```

**MCP Server Tools:**
- `list_sessions` - List sessions with pagination
- `get_session` - Get a specific session
- `create_session` - Create a new session
- `delete_session` - Delete a session
- `update_session_tags` - Tag sessions
- `analyze_session` - Trigger AI analysis
- `get_session_analysis` - Get cached analysis
- `get_project_stats` - Get project statistics
- `comprehensive_analysis` - Full analysis with recommendations
- `health_check` - Check API connectivity
- `export_sessions` - Export sessions to JSON/CSV/HAR

---

## Testing

```bash
# Health check
curl http://localhost:3001/health

# List sessions
curl http://localhost:3001/api/v1/sessions -H "X-Project-Key: dev-key"

# Get project stats
curl http://localhost:3001/api/v1/projects/dev-project/stats -H "X-Project-Key: dev-key"
```

Dashboard available at: http://localhost:3002

---

## Environment Variables

### API (`apps/api/.env`)

```bash
# Server
PORT=3001
GIN_MODE=debug

# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/bugcatcher
MONGODB_DATABASE=bugcatcher
SEED_PROJECT_ID=dev-project
SEED_PROJECT_API_KEY=dev-key

# MinIO (optional)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=bugcatcher-sessions
MINIO_USE_SSL=false

# Security
API_KEY_SECRET=your-secret-key-here
ENCRYPTION_KEY=your-32-byte-key-here

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
```

### MCP Server (`apps/mcp-server/.env`)

```bash
# API Configuration
BETTERBUGS_API_URL=http://localhost:3001
BETTERBUGS_API_KEY=dev-key

# Optional: AI Providers
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
```

---

## Troubleshooting

**API won't start:**
- Check MongoDB connection string in `apps/api/.env`
- Run `go mod tidy` to reset dependencies

**Extension not loading:**
- Ensure `apps/extension/dist` exists after `npm run build`
- Check Chrome Developer mode is enabled

**Dashboard won't start:**
- Ensure Node.js 18+ is installed
- Run `npm install` in `apps/dashboard` directory

**MCP Server issues:**
- Ensure Python 3.10+ is installed
- Run `pip install -r requirements.txt`
- Check API is running on port 3001

---

## Project Structure

```
apps/
├── api/                    # Go backend API
│   ├── internal/           # Handlers, models, middleware
│   ├── main.go             # Entry point
│   ├── .env.example        # Environment template
│   └── Makefile            # Build commands
│
├── dashboard/              # Next.js Dashboard
│   ├── app/                # Next.js app router
│   ├── package.json
│   └── .env.example
│
├── extension/              # Chrome Extension
│   ├── src/                # Source code
│   ├── dist/               # Build output
│   └── package.json
│
└── mcp-server/             # Python MCP Server
    ├── server.py           # Main MCP server
    ├── config.py           # Configuration
    ├── requirements.txt    # Python dependencies
    └── .env.example
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/sessions` | GET | List sessions |
| `/api/v1/sessions` | POST | Create session |
| `/api/v1/sessions/:id` | GET | Get session |
| `/api/v1/sessions/:id` | DELETE | Delete session |
| `/api/v1/sessions/:id/tags` | PATCH | Update tags |
| `/api/v1/sessions/:id/analyze` | POST | Trigger analysis |
| `/api/v1/sessions/:id/analysis` | GET | Get analysis |
| `/api/v1/projects/:id/stats` | GET | Project stats |
| `/docs/*any` | GET | Swagger docs |

All endpoints (except `/health`) require `X-Project-Key` header.