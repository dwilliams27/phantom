#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHANTOM_PROFILE="$HOME/.phantom-chrome-profile"
SOCKET_PATH="/tmp/phantom.sock"

echo "============================================"
echo "  Phantom E2E Test"
echo "============================================"

# Clean state
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"
sleep 1

# Start harness (runs tests automatically, exits when done)
node "$REPO_ROOT/scripts/test_harness.js" &
HARNESS_PID=$!
sleep 1

# Launch Phantom Chrome (--disable-session-crashed-bubble suppresses "Restore pages?" dialog)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PHANTOM_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  "https://example.com" &>/dev/null &
disown

# Wait for harness to finish (it exits after tests pass/fail)
wait $HARNESS_PID 2>/dev/null
EXIT_CODE=$?

# Cleanup
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"

exit $EXIT_CODE
