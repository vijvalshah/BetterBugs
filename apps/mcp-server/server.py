import os
import sys
import json
from pathlib import Path
from typing import Optional, Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastmcp import FastMCP
import httpx
from dotenv import load_dotenv
from pydantic import BaseModel

from config import config

# Load .env file if exists
load_dotenv(Path(__file__).parent / ".env", override=False)

# Initialize FastMCP server
mcp = FastMCP("BetterBugs MCP Server")


class BetterBugsClient:
    """HTTP client for BetterBugs API."""

    def __init__(self, base_url: str = None, api_key: str = None):
        self.base_url = base_url or config.api_base_url
        self.api_key = api_key or config.api_key
        self.client = httpx.Client(
            headers={
                "X-Project-Key": self.api_key,
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def _request(
        self, method: str, path: str, json: dict = None, params: dict = None
    ) -> dict:
        url = f"{self.base_url}{path}"
        response = self.client.request(method, url, json=json, params=params)
        response.raise_for_status()
        return response.json()

    # Session endpoints
    def list_sessions(self, limit: int = 20, offset: int = 0, tags: str = None) -> dict:
        """List all sessions with pagination."""
        params = {"limit": limit, "offset": offset}
        if tags:
            params["tags"] = tags
        return self._request("GET", "/api/v1/sessions", params=params)

    def get_session(self, session_id: str) -> dict:
        """Get a specific session by ID."""
        return self._request("GET", f"/api/v1/sessions/{session_id}")

    def create_session(
        self,
        url: str,
        title: str = None,
        browser: str = "Chrome",
        platform: str = None,
        metadata: dict = None,
    ) -> dict:
        """Create a new session."""
        data = {
            "url": url,
            "title": title,
            "browser": browser,
            "platform": platform or "Windows",
            "metadata": metadata or {},
        }
        return self._request("POST", "/api/v1/sessions", json=data)

    def delete_session(self, session_id: str) -> dict:
        """Delete a session."""
        return self._request("DELETE", f"/api/v1/sessions/{session_id}")

    def update_session_tags(self, session_id: str, tags: list[str]) -> dict:
        """Update tags for a session."""
        return self._request(
            "PATCH", f"/api/v1/sessions/{session_id}/tags", json={"tags": tags}
        )

    def batch_update_tags(self, session_ids: list[str], tags: list[str]) -> dict:
        """Batch update tags for multiple sessions."""
        return self._request(
            "PATCH",
            "/api/v1/sessions/batch/tags",
            json={"sessionIds": session_ids, "tags": tags},
        )

    def add_comment(self, session_id: str, content: str, author: str = "MCP Agent") -> dict:
        """Add a comment to a session."""
        return self._request(
            "POST",
            f"/api/v1/sessions/{session_id}/comments",
            json={"content": content, "author": author},
        )

    # Analysis endpoints
    def analyze_session(self, session_id: str) -> dict:
        """Trigger AI analysis for a session."""
        return self._request("POST", f"/api/v1/sessions/{session_id}/analyze")

    def get_analysis(self, session_id: str) -> dict:
        """Get cached analysis for a session."""
        return self._request("GET", f"/api/v1/sessions/{session_id}/analysis")

    # Project endpoints
    def get_project_stats(self, project_id: str) -> dict:
        """Get project statistics."""
        return self._request("GET", f"/api/v1/projects/{project_id}/stats")

    def list_project_sessions(
        self, project_id: str, limit: int = 20, offset: int = 0
    ) -> dict:
        """List sessions for a specific project."""
        params = {"limit": limit, "offset": offset}
        return self._request("GET", f"/api/v1/projects/{project_id}/sessions", params=params)

    # Export endpoints
    def trigger_export(self, session_ids: list[str], format: str = "json") -> dict:
        """Trigger export of sessions."""
        return self._request(
            "POST", "/api/v1/plugin/v1/exports", json={"sessionIds": session_ids, "format": format}
        )

    def close(self):
        self.client.close()


# Global client instance
_client: Optional[BetterBugsClient] = None


def get_client() -> BetterBugsClient:
    global _client
    if _client is None:
        _client = BetterBugsClient()
    return _client


# ==================== MCP Tools ====================

# Session Management Tools
@mcp.tool()
def list_sessions(
    limit: int = 20,
    offset: int = 0,
    tags: str = None,
    session_id: str = None,
) -> str:
    """List sessions or get a specific session by ID.

    Use this tool to:
    - List all sessions with pagination
    - Get a specific session if you provide session_id

    Args:
        limit: Maximum number of sessions to return (default 20)
        offset: Number of sessions to skip for pagination (default 0)
        tags: Filter sessions by tags (comma-separated)
        session_id: If provided, fetch a specific session directly (faster than filtering)
    """
    client = get_client()

    # If session_id provided, use direct get
    if session_id:
        try:
            result = client.get_session(session_id)
            return json.dumps(result, indent=2)
        except httpx.HTTPStatusError as e:
            return json.dumps({"error": f"Session not found: {e.response.status_code}"})

    try:
        result = client.list_sessions(limit=limit, offset=offset, tags=tags)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to list sessions: {e}"})


@mcp.tool()
def create_session(
    url: str,
    title: str = None,
    browser: str = "Chrome",
    platform: str = None,
) -> str:
    """Create a new session in BetterBugs.

    Args:
        url: The URL where the bug was encountered
        title: Optional title/description of the session
        browser: Browser used (Chrome, Firefox, Safari, Edge)
        platform: Platform (Windows, macOS, Linux)
    """
    client = get_client()
    try:
        result = client.create_session(url=url, title=title, browser=browser, platform=platform)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to create session: {e}"})


@mcp.tool()
def delete_session(session_id: str) -> str:
    """Delete a session by ID.

    Args:
        session_id: The session ID to delete
    """
    client = get_client()
    try:
        result = client.delete_session(session_id)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to delete session: {e}"})


@mcp.tool()
def update_session_tags(session_id: str, tags: list[str]) -> str:
    """Update tags for a session.

    Args:
        session_id: The session ID to update
        tags: List of tags to set
    """
    client = get_client()
    try:
        result = client.update_session_tags(session_id, tags)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to update tags: {e}"})


# Analysis Tools
@mcp.tool()
def analyze_session(session_id: str) -> str:
    """Trigger AI analysis for a session.

    This requests the BetterBugs API to analyze the session data
    and return insights about the bug.

    Args:
        session_id: The session ID to analyze
    """
    client = get_client()
    try:
        result = client.analyze_session(session_id)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to analyze session: {e}"})


@mcp.tool()
def get_session_analysis(session_id: str) -> str:
    """Get existing analysis for a session.

    Returns cached analysis results if available.

    Args:
        session_id: The session ID to get analysis for
    """
    client = get_client()
    try:
        result = client.get_analysis(session_id)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to get analysis: {e}"})


# Project Tools
@mcp.tool()
def get_project_stats(project_id: str = "dev-project") -> str:
    """Get statistics for a project.

    Args:
        project_id: The project ID (default: dev-project)
    """
    client = get_client()
    try:
        result = client.get_project_stats(project_id)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to get stats: {e}"})


@mcp.tool()
def export_sessions(
    session_ids: list[str],
    format: str = "json",
) -> str:
    """Export sessions to a file.

    Args:
        session_ids: List of session IDs to export
        format: Export format (json, csv, har)
    """
    client = get_client()
    try:
        result = client.trigger_export(session_ids, format)
        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Failed to trigger export: {e}"})


# Advanced Analysis Tool (combines session data + external AI)
@mcp.tool()
def comprehensive_analysis(session_id: str) -> str:
    """Perform a comprehensive analysis of a session.

    This tool:
    1. Fetches the full session data
    2. Triggers/retrives API analysis
    3. Returns structured insights for debugging

    Use this for detailed bug investigation.
    """
    client = get_client()

    try:
        # Get session data
        session = client.get_session(session_id)

        # Get or trigger analysis
        analysis = client.get_analysis(session_id)
        if not analysis.get("analysis"):
            # Trigger new analysis if none exists
            analyze_result = client.analyze_session(session_id)
            analysis = {"status": "initiated", "sessionId": session_id}

        # Build comprehensive response
        result = {
            "session": {
                "id": session.get("sessionId"),
                "url": session.get("url"),
                "title": session.get("title"),
                "browser": session.get("browser"),
                "platform": session.get("platform"),
                "createdAt": session.get("createdAt"),
                "tags": session.get("tags", []),
            },
            "consoleLogs": session.get("consoleLogs", [])[:10],  # First 10 logs
            "networkRequests": session.get("networkRequests", [])[:10],  # First 10 requests
            "analysis": analysis.get("analysis"),
            "recommendations": [
                "Check console errors for the root cause",
                "Review network failed requests",
                "Examine state changes before the error",
            ],
        }

        return json.dumps(result, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Comprehensive analysis failed: {e}"})


# Health check
@mcp.tool()
def health_check() -> str:
    """Check if the BetterBugs API is running and accessible."""
    client = get_client()
    try:
        result = client._request("GET", "/health")
        return json.dumps({"status": "healthy", "details": result})
    except Exception as e:
        return json.dumps({"status": "unhealthy", "error": str(e)})


def main():
    """Run the FastMCP server."""
    print(f"Starting BetterBugs MCP Server...")
    print(f"API URL: {config.api_base_url}")
    print(f"API Key: {'*' * len(config.api_key) if config.api_key else 'NOT SET'}")

    # Run with stdio transport (for Claude Code / other MCP clients)
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()