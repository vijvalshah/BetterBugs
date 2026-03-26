# BugCatcher API

Go backend API for BugCatcher - open-source bug capture and analysis system.

## Tech Stack

- **Go 1.22**
- **Gin** - HTTP framework
- **MongoDB** - Primary database
- **MinIO** - Object storage
- **Swagger** - API documentation

## Getting Started

### Prerequisites

- Go 1.22+
- MongoDB running on localhost:27017
- MinIO running on localhost:9000

### Installation

```bash
# Install dependencies
go mod tidy

# Copy environment file
cp .env.example .env

# Run development server
make dev
```

### Environment Variables

See `.env.example` for all configuration options.

### API Documentation

Once running, visit:
- Swagger UI: http://localhost:3001/docs/index.html
- OpenAPI JSON: http://localhost:3001/docs/doc.json

## Project Structure

```
apps/api/
├── internal/
│   ├── config/       # Configuration
│   ├── database/     # MongoDB connection
│   ├── handlers/     # HTTP handlers
│   ├── middleware/   # Middleware (auth, rate limit)
│   ├── models/       # Data models
│   ├── routes/       # Route definitions
│   └── storage/      # MinIO client
├── main.go           # Entry point
├── Dockerfile        # Docker build
└── Makefile          # Build commands
```

## Development

```bash
# Run with hot reload (requires air)
air

# Run tests
make test

# Run linter
make lint

# Generate Swagger docs
make swagger

# Build binary
make build
```

## Docker

```bash
# Build image
make docker-build

# Run container
docker run -p 3001:3001 --env-file .env bugcatcher-api:latest
```

## API Endpoints

### Sessions

- `POST /api/v1/sessions` - Create session
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/:id` - Get session details
- `DELETE /api/v1/sessions/:id` - Delete session

### Health

- `GET /health` - Health check

## Authentication

All API endpoints require `X-Project-Key` header with a valid project API key.

## Rate Limiting

- Default: 100 requests per minute per project
- Configurable via `RATE_LIMIT_REQUESTS` and `RATE_LIMIT_WINDOW`

## Phase 1 Scope

- ✅ Session creation and storage
- ✅ Event storage (console, network, error)
- ✅ Session listing and retrieval
- ✅ API key authentication
- ✅ Rate limiting
- ✅ MinIO integration (prepared for Phase 2)
- ✅ Swagger documentation

## Next Steps (Phase 2)

- Video/DOM blob upload
- Advanced sanitization
- Project management
- User authentication
