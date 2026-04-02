#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHANTOM_PROFILE="$HOME/.phantom-chrome-profile"
SOCKET_PATH="/tmp/phantom.sock"
EXIT_CODE=0

echo "============================================"
echo "  Phantom E2E Test Suite"
echo "============================================"

# Clean state
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"
sleep 1

# Build MCP server
echo ""
echo "[runner] Building MCP server..."
cd "$REPO_ROOT/phantom-mcp" && npm run build --silent 2>&1
cd "$REPO_ROOT"

# Launch Phantom Chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PHANTOM_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  "https://example.com" &>/dev/null &
disown
sleep 4

# --- Part 1: Extension tests (direct socket) ---
echo ""
echo "--- Extension Tests (direct socket) ---"
node "$REPO_ROOT/scripts/test_harness.js" &
HARNESS_PID=$!
wait $HARNESS_PID 2>/dev/null || EXIT_CODE=1

# Kill Chrome between test suites so MCP server gets a clean connection
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"
sleep 2

# Relaunch Chrome for MCP tests
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PHANTOM_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  "https://example.com" &>/dev/null &
disown
sleep 4

# --- Part 2: MCP server tests (stdio transport) ---
echo ""
echo "--- MCP Server Tests (stdio transport) ---"
cd "$REPO_ROOT/phantom-mcp"
node dist/test-mcp.js 2>&1 || EXIT_CODE=1
cd "$REPO_ROOT"

# Cleanup
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"

exit $EXIT_CODE
