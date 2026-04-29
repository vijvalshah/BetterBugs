#!/bin/bash

# ============================================
# BetterBugs Automated Setup Script (Mac/Linux)
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  BetterBugs Automated Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# Step 1: Check Prerequisites
# ============================================
echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"

# Check Go
if ! command -v go &> /dev/null; then
    echo -e "${RED}  ERROR: Go is not installed or not in PATH${NC}"
    echo -e "${RED}  Please install Go 1.22+ from https://go.dev/dl/${NC}"
    exit 1
fi
GO_VERSION=$(go version | awk '{print $3}')
echo -e "  Go: $GO_VERSION"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}  ERROR: Node.js is not installed or not in PATH${NC}"
    echo -e "${RED}  Please install Node.js 18+ from https://nodejs.org/${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "  Node.js: $NODE_VERSION"

# Check Python (optional)
PYTHON_AVAILABLE=1
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}  WARNING: Python not found - MCP server will not be available${NC}"
    PYTHON_AVAILABLE=0
else
    PYTHON_VERSION=$(python3 --version)
    echo -e "  Python: $PYTHON_VERSION"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}  ERROR: npm is not installed${NC}"
    exit 1
fi

echo -e "  ${GREEN}All prerequisites met!${NC}"
echo ""

# ============================================
# Step 2: Setup API
# ============================================
echo -e "${YELLOW}[2/7] Setting up API server...${NC}"

cd "$SCRIPT_DIR/apps/api"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "  Created .env from template"
    fi
fi

go mod tidy
echo "  API dependencies installed"

# ============================================
# Step 3: Setup Dashboard
# ============================================
echo -e "${YELLOW}[3/7] Setting up Dashboard...${NC}"

cd "$SCRIPT_DIR/apps/dashboard"

if [ ! -d "node_modules" ]; then
    npm install
    echo "  Dashboard dependencies installed"
else
    echo "  Dashboard dependencies already installed"
fi

# ============================================
# Step 4: Setup Extension
# ============================================
echo -e "${YELLOW}[4/7] Setting up Extension...${NC}"

cd "$SCRIPT_DIR/apps/extension"

if [ ! -d "node_modules" ]; then
    npm install
fi

npm run build
echo "  Extension built successfully"

# ============================================
# Step 5: Setup MCP Server
# ============================================
echo -e "${YELLOW}[5/7] Setting up MCP Server...${NC}"

cd "$SCRIPT_DIR/apps/mcp-server"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "  Created .env from template"
    fi
fi

if [ $PYTHON_AVAILABLE -eq 1 ]; then
    # Try pip3 first, then pip
    if command -v pip3 &> /dev/null; then
        pip3 install -r requirements.txt || echo -e "${YELLOW}  WARNING: Failed to install MCP dependencies${NC}"
    elif command -v pip &> /dev/null; then
        pip install -r requirements.txt || echo -e "${YELLOW}  WARNING: Failed to install MCP dependencies${NC}"
    fi
    echo "  MCP dependencies installed"
fi

# ============================================
# Step 6: Start Services
# ============================================
echo -e "${YELLOW}[6/7] Starting services...${NC}"
echo ""

# Start API in background
echo -e "  ${BLUE}Starting API Server (port 3001)...${NC}"
cd "$SCRIPT_DIR/apps/api"
go run main.go &
API_PID=$!
echo "  API started (PID: $API_PID)"

# Wait for API to start
sleep 3

# Start Dashboard in background
echo -e "  ${BLUE}Starting Dashboard (port 3002)...${NC}"
cd "$SCRIPT_DIR/apps/dashboard"
npm run dev &
DASHBOARD_PID=$!
echo "  Dashboard started (PID: $DASHBOARD_PID)"

# ============================================
# Step 7: Verify Services
# ============================================
echo -e "${YELLOW}[7/7] Verifying services...${NC}"
echo ""

# Check API
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}[OK]${NC} API Server running on http://localhost:3001"
else
    echo -e "  ${YELLOW}[WARN]${NC} API Server not responding yet"
fi

# Check Dashboard
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "  ${GREEN}[OK]${NC} Dashboard running on http://localhost:3002"
else
    echo -e "  ${YELLOW}[WARN]${NC} Dashboard not responding yet"
fi

# ============================================
# Summary
# ============================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "  Services:"
echo "  - API:       http://localhost:3001"
echo "  - Dashboard: http://localhost:3002"
echo "  - Swagger:   http://localhost:3001/docs/index.html"
echo ""

if [ $PYTHON_AVAILABLE -eq 1 ]; then
    echo "  To start MCP Server manually:"
    echo "  cd apps/mcp-server"
    echo "  python3 server.py"
    echo ""
fi

echo "  To load the Extension:"
echo "  1. Open Chrome and go to chrome://extensions"
echo "  2. Enable Developer mode"
echo "  3. Click Load unpacked"
echo "  4. Select: apps/extension/dist"
echo ""
echo "  Configuration:"
echo "  - API Base URL: http://localhost:3001/api/v1"
echo "  - Project ID: dev-project"
echo "  - Project Key: dev-key"
echo ""

# Save PIDs to file for reference
echo "$API_PID" > "$SCRIPT_DIR/.betterbugs-api.pid"
echo "$DASHBOARD_PID" > "$SCRIPT_DIR/.betterbugs-dashboard.pid"
echo ""
echo "Service PIDs saved to .betterbugs-*.pid files"
echo "To stop services: kill \$(cat .betterbugs-api.pid) \$(cat .betterbugs-dashboard.pid)"