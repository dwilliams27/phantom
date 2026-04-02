#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHANTOM_PROFILE="$HOME/.phantom-chrome-profile"
SOCKET_PATH="/tmp/phantom.sock"

echo "============================================"
echo "  Phantom Claude E2E Test"
echo "============================================"
echo ""

# Clean state
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"
sleep 1

# Build MCP server
echo "[runner] Building MCP server..."
cd "$REPO_ROOT/phantom-mcp" && npm run build --silent 2>&1
cd "$REPO_ROOT"

# Launch Phantom Chrome
echo "[runner] Launching Phantom Chrome..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PHANTOM_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  "about:blank" &>/dev/null &
disown
sleep 5

echo "[runner] Running Claude Code headless..."
echo ""

cd "$REPO_ROOT"
claude -p --permission-mode bypassPermissions \
  "You have Phantom browser automation tools. Complete these steps in order, using take_snapshot after each action to verify the page state:

1. navigate_page to https://www.google.com
2. Take a snapshot. Find the search textbox and use fill to type 'example.com site:example.com' into it
3. press_key Enter to submit the search
4. Take a snapshot. Find and click the link to example.com in the search results
5. Take a snapshot. You should be on example.com. Find and click the 'Learn more' link
6. Take a snapshot and report the final page title and URL

Report each step as you complete it."

EXIT_CODE=$?

echo ""
echo "[runner] Claude exited with code $EXIT_CODE"

# Cleanup
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"

echo "[runner] Done."
exit $EXIT_CODE
