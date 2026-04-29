# BetterBugs - Complete Setup Guide

## What's Been Built

✅ **Go Backend API** (`apps/api`)
- Gin framework with MongoDB + MinIO
- Session management (create, list, get, delete, tags, comments)
- Media uploads (screenshots, videos)
- Plugin gateway for extension integration
- API key authentication + rate limiting
- Swagger documentation

✅ **Browser Extension** (`apps/extension`)
- React + TypeScript + Vite
- Manifest V3 Chrome extension
- Console, network, and error capture
- AI-powered analysis
- Export to GitHub and other destinations
- Session replay and details view

---

## Quick Start

### Prerequisites

- Go 1.22+
- Node.js 18+
- Docker (for MongoDB and MinIO)
- Chrome browser (for extension)

### 1. Start Infrastructure

```bash
# Start MongoDB
docker run -d -p 27017:27017 --name bugcatcher-mongo mongo:7

# Start MinIO
docker run -d -p 9000:9000 -p 9001:9001 --name bugcatcher-minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

### 2. Setup and Run API

```bash
cd apps/api

# Install dependencies
go mod tidy

# Configure environment
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# Run development server
make dev
# Or: go run main.go
```

API will start on http://localhost:3001

### 3. Build and Load Extension

```bash
cd apps/extension

# Install dependencies
npm install

# Build extension
npm run build
```

Load in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `apps/extension/dist`

### 4. Configure Extension

1. Click the extension icon → **Options**
2. Set configuration:
   - API Base URL: `http://localhost:3001/api/v1`
   - Project ID: `dev-project`
   - Project Key: `dev-key`
3. Save settings

### 5. Test the Full Flow

1. Open any webpage
2. Click the extension icon → **Capture Current Session**
3. View captured sessions via API:
   ```bash
   curl http://localhost:3001/api/v1/sessions \
     -H "X-Project-Key: dev-key"
   ```

---

## API Endpoints

### Health
- `GET /health` - Health check

### Sessions (requires `X-Project-Key` header)
- `POST /api/v1/sessions` - Create session
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/:id` - Get session details
- `DELETE /api/v1/sessions/:id` - Delete session
- `PATCH /api/v1/sessions/:id/tags` - Update session tags
- `PATCH /api/v1/sessions/batch/tags` - Batch update tags
- `POST /api/v1/sessions/:id/comments` - Add comment

### Media
- `POST /api/v1/media/screenshots` - Store screenshot
- `POST /api/v1/media/videos` - Store video

### Uploads
- `POST /api/v1/uploads/sessions` - Create upload session
- `POST /api/v1/uploads/sessions/:id/finalize` - Finalize upload

### Plugin Gateway (for extension)
- `GET /api/v1/plugin/v1/manifest` - Get plugin manifest
- `GET /api/v1/plugin/v1/sessions` - List sessions
- `GET /api/v1/plugin/v1/sessions/:id` - Get session
- `POST /api/v1/plugin/v1/exports` - Trigger export

### Documentation
- Swagger UI: http://localhost:3001/docs/index.html

---

## Development

### API Development

```bash
cd apps/api

# Run tests
make test

# Run linter
make lint

# Generate Swagger docs
make swagger

# Build binary
make build

# Build Docker image
make docker-build
```

### Extension Development

```bash
cd apps/extension

# Development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch
```

---

## Project Structure

```
apps/
├── api/                    # Go backend API
│   ├── internal/
│   │   ├── config/         # Environment config
│   │   ├── database/       # MongoDB connection
│   │   ├── handlers/       # HTTP handlers
│   │   ├── middleware/     # Auth, rate limiting
│   │   ├── models/         # Data models
│   │   ├── routes/         # Route setup
│   │   └── storage/        # MinIO client
│   ├── main.go             # Entry point
│   ├── Dockerfile          # Container build
│   ├── Makefile            # Build commands
│   └── README.md           # API documentation
│
└── extension/              # Browser extension
    ├── src/
    │   ├── background/     # Service worker
    │   ├── content/        # Content scripts
    │   ├── popup/          # Popup UI
    │   ├── options/        # Options page
    │   ├── session-details/# Session details page
    │   ├── shared/         # Shared utilities
    │   └── manifest.ts     # Extension manifest
    ├── dist/               # Build output
    ├── package.json
    ├── vite.config.ts
    └── tsconfig.json
```

---

## Environment Variables

### API (`apps/api/.env`)

```bash
# Server
PORT=3001
GIN_MODE=debug

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=bugcatcher
SEED_PROJECT_ID=dev-project
SEED_PROJECT_API_KEY=dev-key

# MinIO
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

# Storage Policy
STORAGE_QUOTA_SESSIONS=1000
STORAGE_RETENTION_DAYS=30
STORAGE_WARNING_RATIO=0.90
```

---

## Testing

### Test API

```bash
# Health check
curl http://localhost:3001/health

# Create session
curl -X POST http://localhost:3001/api/v1/sessions \
  -H "Content-Type: application/json" \
  -H "X-Project-Key: dev-key" \
  -d '{
    "projectId": "dev-project",
    "url": "https://example.com",
    "timestamp": "2026-03-26T00:00:00Z",
    "environment": {
      "browser": "Chrome",
      "browserVersion": "122.0",
      "os": "macOS",
      "osVersion": "14",
      "viewport": {"width": 1920, "height": 1080},
      "language": "en-US"
    },
    "events": [],
    "media": {"hasReplay": false}
  }'

# List sessions
curl http://localhost:3001/api/v1/sessions \
  -H "X-Project-Key: dev-key"
```

### Test Extension

```bash
cd apps/extension
npm run test
```

---

## Troubleshooting

**API won't start:**
```bash
# Check MongoDB is running
docker ps | grep mongo
docker restart bugcatcher-mongo

# Check MinIO is running
docker ps | grep minio
docker restart bugcatcher-minio

# Reset Go dependencies
cd apps/api
go mod tidy
```

**Extension not loading:**
- Ensure `apps/extension/dist` exists after running `npm run build`
- Check Chrome Developer mode is enabled
- Check manifest.json is valid in the dist folder

**CORS errors:**
- Ensure API is running on `localhost:3001`
- Check `GIN_MODE` is set to `debug` for local development

**Rate limiting:**
- Default: 100 requests per minute per project
- Adjust `RATE_LIMIT_REQUESTS` and `RATE_LIMIT_WINDOW` in `.env`

---

## Features

### API Features
- ✅ Session CRUD operations
- ✅ Event storage (console, network, error)
- ✅ Media upload (screenshots, videos)
- ✅ MongoDB integration
- ✅ MinIO object storage
- ✅ API key authentication
- ✅ Rate limiting
- ✅ Swagger documentation
- ✅ Docker support

### Extension Features
- ✅ Console capture (log, warn, error, info)
- ✅ Network request capture
- ✅ Error tracking
- ✅ AI-powered session analysis
- ✅ Export to GitHub issues
- ✅ Session tags and comments
- ✅ Screenshot and video recording
- ✅ Keyboard shortcut (Ctrl+Shift+B / Cmd+Shift+B)
