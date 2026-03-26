# BugCatcher - Phase 1 Setup Guide

## What's Been Built

✅ **Go Backend API** (apps/api)
- Gin framework with MongoDB + MinIO
- Session creation, listing, retrieval, deletion
- API key authentication + rate limiting
- Complete Phase 1 endpoints

🔄 **Next Steps** (you'll complete these):
- Browser extension (capture logic)
- Next.js dashboard
- Docker compose infrastructure

---

## Quick Start

### 1. Install Dependencies

**Go Backend:**
```bash
cd apps/api
go mod tidy
```

This will download all Go dependencies and populate `go.sum`.

### 2. Start Infrastructure

```bash
# Start MongoDB + MinIO
docker run -d -p 27017:27017 --name bugcatcher-mongo mongo:7
docker run -d -p 9000:9000 -p 9001:9001 --name bugcatcher-minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

### 3. Configure Environment

```bash
cd apps/api
cp .env.example .env
# Edit .env if needed (defaults should work for local dev)
```

### 4. Run API

```bash
cd apps/api
make dev
# Or: go run main.go
```

API will start on http://localhost:3001

### 5. Test API

```bash
# Health check
curl http://localhost:3001/health

# Create a session (requires X-Project-Key header)
curl -X POST http://localhost:3001/api/v1/sessions \
  -H "Content-Type: application/json" \
  -H "X-Project-Key: test-key" \
  -d '{
    "projectId": "test-project",
    "url": "https://example.com",
    "timestamp": "2026-03-26T00:00:00Z",
    "environment": {
      "browser": "Chrome",
      "browserVersion": "122.0",
      "os": "Windows",
      "osVersion": "11",
      "viewport": {"width": 1920, "height": 1080},
      "language": "en-US"
    },
    "events": [
      {
        "type": "console",
        "timestamp": 1000,
        "payload": {
          "level": "error",
          "message": "Test error",
          "args": []
        }
      }
    ],
    "media": {
      "hasReplay": false
    }
  }'

# List sessions
curl http://localhost:3001/api/v1/sessions \
  -H "X-Project-Key: test-key"
```

### 6. View API Documentation

Visit http://localhost:3001/docs/index.html (after running `make swagger`)

---

## Next: Build Extension & Dashboard

The Go API is complete and ready. Next steps:

1. **Browser Extension** - Capture console/network/errors
2. **Next.js Dashboard** - View sessions
3. **Docker Compose** - Full stack orchestration

See the planning artifacts in `_bmad-output/planning-artifacts/` for complete specifications.

---

## Troubleshooting

**Go dependencies not found:**
```bash
cd apps/api
go mod tidy
```

**MongoDB connection error:**
```bash
# Check MongoDB is running
docker ps | grep mongo

# Restart if needed
docker restart bugcatcher-mongo
```

**MinIO connection error:**
```bash
# Check MinIO is running
docker ps | grep minio

# Restart if needed
docker restart bugcatcher-minio
```

---

## Project Structure

```
apps/api/
├── internal/
│   ├── config/          # Environment config
│   ├── database/        # MongoDB connection
│   ├── handlers/        # HTTP handlers
│   ├── middleware/      # Auth, rate limit
│   ├── models/          # Data models
│   ├── routes/          # Route setup
│   └── storage/         # MinIO client
├── main.go              # Entry point
├── Dockerfile           # Container build
├── Makefile             # Build commands
└── README.md            # API documentation
```

---

## Phase 1 Complete ✅

The Go backend API is fully implemented with:
- ✅ Session CRUD operations
- ✅ Event storage
- ✅ MongoDB integration
- ✅ MinIO integration (ready for Phase 2)
- ✅ API key authentication
- ✅ Rate limiting
- ✅ Swagger documentation
- ✅ Docker support

Ready for extension and dashboard development!
