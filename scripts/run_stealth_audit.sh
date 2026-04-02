#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHANTOM_PROFILE="$HOME/.phantom-chrome-profile"
SOCKET_PATH="/tmp/phantom.sock"
AUDIT_DIR="$REPO_ROOT/tmp/stealth_audit_$(date +%Y%m%d_%H%M%S)"

echo "============================================"
echo "  Phantom Stealth Audit"
echo "============================================"
echo ""
echo "Audit directory: $AUDIT_DIR"
echo ""

# Clean state
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"
sleep 1

# Build MCP server
echo "[audit] Building MCP server..."
cd "$REPO_ROOT/phantom-mcp" && npm run build --silent 2>&1
cd "$REPO_ROOT"

# Create audit output directory
mkdir -p "$AUDIT_DIR"

# Launch Phantom Chrome
echo "[audit] Launching Phantom Chrome..."
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

echo "[audit] Running stealth audit via Claude Code..."
echo ""

cd "$REPO_ROOT"
claude -p --permission-mode bypassPermissions \
  "You have Phantom browser automation tools. You are conducting a STEALTH AUDIT to prove our browser automation is undetectable. Visit each bot detection site below, wait for its tests to complete, take a screenshot, and use evaluate_script to extract the key results.

For EACH site, do this sequence:
1. navigate_page to the URL
2. Wait 8-10 seconds (use wait_for with a timeout, or multiple short waits) for the site's detection tests to run
3. take_screenshot (this saves proof)
4. take_snapshot to read any visible test results
5. Use evaluate_script to extract specific detection values from the DOM
6. Report the findings clearly

SITES TO AUDIT (do them in this order):

## Site 1: bot.sannysoft.com
Tests for: navigator.webdriver, Chrome automation properties, headless indicators, plugin checks
After waiting, extract results with:
evaluate_script: document.querySelector('#results')?.innerText || document.body.innerText.substring(0, 2000)

## Site 2: browserscan.net/bot-detection
Tests for: webdriver detection, CDP detection, user-agent analysis, browser fingerprint
After waiting, extract with:
evaluate_script: Array.from(document.querySelectorAll('[class*=result], [class*=detect], [class*=status], [class*=check]')).map(el => el.textContent).join(' | ')

## Site 3: pixelscan.net
Tests for: 73+ navigator params, 37 webdriver properties, automation signatures
After waiting, extract with:
evaluate_script: document.querySelector('[class*=result], [class*=score], main')?.innerText?.substring(0, 3000) || document.body.innerText.substring(0, 2000)

## Site 4: bot.incolumitas.com
Tests for: behavioral analysis, fingerprinting, bot scoring
This site scores from 0-1. After waiting 15 seconds (it has timed behavioral tests), extract:
evaluate_script: document.body.innerText.substring(0, 3000)

## Site 5: abrahamjuliot.github.io/creepjs
Tests for: fingerprint consistency, API tampering, prototype lies
This is the most thorough. Wait 15 seconds. Extract trust score and key results:
evaluate_script: document.body.innerText.substring(0, 4000)

AFTER ALL SITES, write a summary report. For each site:
- What it tested
- Whether we PASSED or FAILED each check
- Any concerning findings
- Overall verdict: CLEAN or DETECTED

Save all screenshots to the filesystem. The critical things to verify are:
- navigator.webdriver is NOT set (should be undefined/false, not true)
- No CDP/DevTools connection detected
- No ChromeDriver/Selenium/Puppeteer/Playwright artifacts
- WebGL renderer shows real GPU (Apple M3 or similar), not SwiftShader
- Plugin array is populated (not empty)
- User-agent is normal Chrome (no HeadlessChrome)

Be thorough. This is the validation that proves the entire Phantom architecture works." \
  > "$AUDIT_DIR/claude_report.txt" 2>"$AUDIT_DIR/stderr.txt"

EXIT_CODE=$?

echo ""
echo "[audit] Claude exited with code $EXIT_CODE"
echo ""

# Copy any screenshots from tmp/ to audit dir
cp "$REPO_ROOT/tmp/test_screenshot.png" "$AUDIT_DIR/last_screenshot.png" 2>/dev/null || true

echo "[audit] Report saved to: $AUDIT_DIR/claude_report.txt"
echo ""
cat "$AUDIT_DIR/claude_report.txt"
echo ""

# Cleanup
pkill -f "user-data-dir=.*phantom-chrome-profile" 2>/dev/null || true
rm -f "$SOCKET_PATH"

echo ""
echo "[audit] Audit complete. Screenshots and report in: $AUDIT_DIR"
exit $EXIT_CODE
