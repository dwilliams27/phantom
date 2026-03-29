# ADR 003: isTrusted Validation Results

## Status
Accepted

## Context
Phantom's architecture assumes cliclick's CGEventPost-based events produce `isTrusted=true` in Chrome's Blink engine. If false, sites could trivially detect our input as programmatic and the entire OS-level input approach would be broken. This is the single highest-risk assumption in the project.

## Test
Ran `scripts/phase0/run_istrusted_test.sh` + manual follow-up which:
- Launched Chrome with the Phantom profile (no automation flags, no CDP, no remote debugging)
- Loaded a test page (`scripts/phase0/istrusted_test.html`) with event listeners logging `isTrusted` for mouse and keyboard events
- Used cliclick to click a button, type text into an input, and press keys
- Used JavaScript `dispatchEvent()` as a control group (expected `isTrusted=false`)
- Captured screenshots as proof artifacts

## Results

**All cliclick-generated events are `isTrusted=true`.** All JS-dispatched events are `isTrusted=false`.

Mouse events verified (all TRUE): `mousemove`, `mousedown`, `mouseup`, `click`
Keyboard events verified (all TRUE): `focus`, `keydown`, `input`, `keyup`
Control group (all FALSE): `click` via `dispatchEvent`, `mousedown` via `dispatchEvent`, `keydown` via `dispatchEvent`, `input` via `dispatchEvent`

Proof artifacts:
- `screenshots/istrusted_validation_20260329_135646.png` -- mouse events TRUE, JS control FALSE
- `screenshots/istrusted_with_keyboard.png` -- keyboard events TRUE, input field shows "hello" typed by cliclick

## Decision
Proceed with cliclick as the OS-level input channel. The architecture's core assumption is validated: CGEventPost events at kCGHIDEventTap (mouse) and kCGSessionEventTap (keyboard) are treated as trusted by Chrome's Blink engine, indistinguishable from real hardware input.

## Consequences
- The click, fill, type_text, press_key, and mouse_move MCP tools can be built on cliclick
- No CDP-based input fallback is needed
- Coordinate mapping (getBoundingClientRect -> screen coordinates) is the next challenge to solve, not trust
- Scroll must use key simulation (page-down, arrow keys) since cliclick has no scroll support
