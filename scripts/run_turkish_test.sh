#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHANTOM_PROFILE="$HOME/.phantom-chrome-profile"
SOCKET_PATH="/tmp/phantom.sock"
RESULTS_DIR="$REPO_ROOT/tmp/turkish_test_$(date +%Y%m%d_%H%M%S)"

echo "============================================"
echo "  Phantom Turkish Airlines Test"
echo "============================================"
echo ""
echo "Results directory: $RESULTS_DIR"
echo ""

# Clean state
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"
sleep 1

# Build MCP server
echo "[test] Building MCP server..."
cd "$REPO_ROOT/phantom-mcp" && npm run build --silent 2>&1
cd "$REPO_ROOT"

mkdir -p "$RESULTS_DIR"

# Launch Phantom Chrome
echo "[test] Launching Phantom Chrome..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PHANTOM_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  --disable-notifications \
  "about:blank" &>/dev/null &
disown
sleep 5

echo "[test] Running Claude Code..."
echo ""

cd "$REPO_ROOT"
claude -p --permission-mode bypassPermissions \
  "You have Phantom browser automation tools. Search for flights on Turkish Airlines from IAD (Washington Dulles) to BKK (Bangkok) and report the price of the first available flight.

HARD RULES:
- Do NOT click any purchase, buy, reserve, book, or checkout buttons
- Do NOT enter any payment information
- You are ONLY searching and reading results

Steps:
1. navigate_page to https://www.turkishairlines.com
2. take_snapshot and take_screenshot to see the homepage
3. Find the flight search form. You need to:
   - Set the departure airport to IAD (Washington Dulles)
   - Set the arrival airport to BKK (Bangkok)
   - Leave the dates as whatever the page defaults to (note what they are)
   - Set trip type to one-way if possible (simpler results)
4. Search for flights (click the search button)
5. Wait for results to load (use wait_for or just take snapshots until results appear)
6. take_screenshot of the results page -- this is the proof artifact
7. take_snapshot to read the results

Report back:
- The departure date (whatever the form defaulted to or you selected)
- The return date (if round trip)
- The price of the FIRST flight option shown
- The flight number(s) if visible
- Any class/cabin information shown

Be patient with the site -- airline sites are complex. Use take_snapshot frequently to understand the page state. If you encounter a cookie consent popup or language selector, dismiss it. If you encounter a CAPTCHA, report CAPTCHA_ENCOUNTERED and stop. If you need to log in, report LOGIN_REQUIRED and stop.

Take your time, use snapshots to navigate step by step." \
  > "$RESULTS_DIR/claude_report.txt" 2>"$RESULTS_DIR/stderr.txt"

EXIT_CODE=$?

echo ""
echo "[test] Claude exited with code $EXIT_CODE"
echo ""

echo "[test] Report:"
echo ""
cat "$RESULTS_DIR/claude_report.txt"
echo ""

# Cleanup
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"

echo ""
echo "[test] Screenshots and report in: $RESULTS_DIR"
exit $EXIT_CODE
