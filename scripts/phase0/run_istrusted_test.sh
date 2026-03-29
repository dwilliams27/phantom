#!/usr/bin/env bash
set -euo pipefail

echo "============================================"
echo "  Phantom Phase 0: isTrusted Validation"
echo "============================================"
echo ""
echo "PREREQUISITE: Terminal/iTerm must have Accessibility permission."
echo "  System Settings > Privacy & Security > Accessibility"
echo "  If cliclick commands silently fail, this is why."
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_PAGE="$SCRIPT_DIR/istrusted_test.html"
SCREENSHOT_DIR="$REPO_ROOT/screenshots"

[[ -f "$TEST_PAGE" ]] || { echo "ERROR: test page not found: $TEST_PAGE"; exit 1; }

cliclick -V

mkdir -p "$SCREENSHOT_DIR"

echo "Killing any existing Chrome..."
pkill -x "Google Chrome" 2>/dev/null || true
sleep 2

echo "Opening test page in Chrome..."
open -a "Google Chrome" "file://$TEST_PAGE"
sleep 4

echo "Positioning Chrome window..."
osascript -e '
tell application "Google Chrome"
  activate
  set bounds of front window to {100, 100, 1300, 1000}
end tell
'
sleep 1

# Window at (100,100). Chrome header = 96px logical (calibrated via Retina measurement).
WIN_X=100
WIN_Y=100
VIEWPORT_X=$WIN_X
VIEWPORT_Y=$((WIN_Y + 96))

BUTTON_X=$((VIEWPORT_X + 120))
BUTTON_Y=$((VIEWPORT_Y + 115))
INPUT_X=$((VIEWPORT_X + 120))
INPUT_Y=$((VIEWPORT_Y + 200))
JS_BUTTON_X=$((VIEWPORT_X + 420))
JS_BUTTON_Y=$BUTTON_Y

echo "Coordinates: Button=($BUTTON_X,$BUTTON_Y) Input=($INPUT_X,$INPUT_Y) JSSim=($JS_BUTTON_X,$JS_BUTTON_Y)"
echo ""

echo "Step 1: Move mouse to button..."
cliclick -e 20 m:$BUTTON_X,$BUTTON_Y
sleep 0.5

echo "Step 2: Click CLICK ME button..."
cliclick c:$BUTTON_X,$BUTTON_Y
sleep 0.5

echo "Step 3: Click text input..."
cliclick c:$INPUT_X,$INPUT_Y
sleep 0.5

echo "Step 4: Type 'hello'..."
cliclick t:hello
sleep 0.5

echo "Step 5: Press Enter..."
cliclick kp:return
sleep 0.5

echo "Step 6: Select all (Cmd+A)..."
cliclick kd:cmd t:a ku:cmd
sleep 0.5

echo "Step 7: Click SIMULATE VIA JS (control group)..."
cliclick c:$JS_BUTTON_X,$JS_BUTTON_Y
sleep 1

echo ""
echo "Finding Chrome window ID..."
WINDOW_ID=$(swift -e '
import Cocoa
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    if let owner = w["kCGWindowOwnerName"] as? String, owner == "Google Chrome",
       let layer = w["kCGWindowLayer"] as? Int, layer == 0 {
        print(w["kCGWindowNumber"]!)
        break
    }
}
' 2>/dev/null)
echo "Window ID: $WINDOW_ID"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SCREENSHOT="$SCREENSHOT_DIR/istrusted_validation_$TIMESTAMP.png"

echo "Taking screenshot..."
screencapture -x -o -l "$WINDOW_ID" "$SCREENSHOT"

echo ""
echo "============================================"
echo "  Screenshot saved: $SCREENSHOT"
echo "============================================"
echo ""
echo "Verify: green rows = isTrusted=TRUE, red rows = FALSE, verdict = PASS"
echo ""

open "$SCREENSHOT"
echo "Done. Chrome left open for manual inspection."
