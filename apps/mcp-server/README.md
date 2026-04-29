# BetterBugs MCP Server

FastMCP server that provides tools to interact with the BetterBugs API for agentic workflows.

## Setup

```bash
cd apps/mcp-server
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
BETTERBUGS_API_URL=http://localhost:3001
BETTERBUGS_API_KEY=dev-key
```

## Running

### For Claude Code / MCP Clients

```bash
python server.py
```

This starts the server with stdio transport (default for MCP integration).

### For HTTP/Web Access

```bash
python server_http.py
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_sessions` | List sessions with pagination or get specific session |
| `create_session` | Create a new bug session |
| `delete_session` | Delete a session |
| `update_session_tags` | Tag a session |
| `analyze_session` | Trigger AI analysis |
| `get_session_analysis` | Get cached analysis |
| `get_project_stats` | Get project statistics |
| `export_sessions` | Export sessions to JSON/CSV/HAR |
| `comprehensive_analysis` | Full session + analysis + recommendations |
| `health_check` | Check API connectivity |

## Usage with Claude Code

Add to your MCP settings in `settings.json`:

```json
{
  "mcpServers": {
    "betterbugs": {
      "command": "python",
      "args": ["apps/mcp-server/server.py"],
      "env": {
        "BETTERBUGS_API_URL": "http://localhost:3001",
        "BETTERBUGS_API_KEY": "dev-key"
      }
    }
  }
}
```

## API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/sessions` | GET | List sessions |
| `/api/v1/sessions/:id` | GET | Get session |
| `/api/v1/sessions` | POST | Create session |
| `/api/v1/sessions/:id` | DELETE | Delete session |
| `/api/v1/sessions/:id/analyze` | POST | Trigger analysis |
| `/api/v1/sessions/:id/analysis` | GET | Get analysis |
| `/api/v1/projects/:id/stats` | GET | Project stats |

All endpoints require `X-API-Key` header (default: `dev-key`).