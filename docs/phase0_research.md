# Phase 0 Research Findings

Research conducted 2026-03-29. Deep investigation of all technical foundations before building.

## cliclick

macOS CLI tool for simulating mouse/keyboard input. Uses CoreGraphics event system.

**Implementation details**: Mouse events use `CGEventCreateMouseEvent()` + `CGEventPost(kCGHIDEventTap, event)` -- the HID level, closest to hardware. Keyboard events use `CGEventCreateKeyboardEvent()` + `CGEventPost(kCGSessionEventTap, event)` -- session level. Both paths are the same entry points real hardware uses.

**Commands**: `c:x,y` (click), `dc:x,y` (double-click), `rc:x,y` (right-click), `m:x,y` (move), `dd:/dm:/du:` (drag), `kp:key` (key press), `kd:/ku:` (modifier down/up), `t:text` (type), `w:ms` (wait), `p` (print position).

**Key names**: `return`, `enter`, `tab`, `esc`, `space`, `delete`, `fwd-delete`, `arrow-up/down/left/right`, `home`, `end`, `page-up`, `page-down`, `f1`-`f16`. Modifiers: `cmd`, `alt`, `ctrl`, `shift`, `fn`.

**Modifier combos**: `cliclick kd:cmd t:a ku:cmd` (Cmd+A). Key down, action, key up.

**Easing**: `-e N` flag generates intermediate mouse move events with cubic ease-in-out. `-e 0` (default) teleports. `-e 20` is gentle, `-e 50` heavy. Step count = `(distance * easing / 100) + 1` with 220us between steps.

**Coordinates**: Uses macOS logical points, NOT physical pixels. On Retina M3 "Looks like 1512x982", coords range 0-1512, 0-982. No Retina scaling needed. Relative coords supported: `c:+50,-20`. Multi-monitor absolute negatives: `c:=-100,200`.

**NO SCROLL SUPPORT.** Requested 2014, PR merged then reverted, abandoned. Mitigation: use key simulation (`kp:page-down`, `kp:arrow-down`, `kp:space`). Tested and confirmed working in Phase 0.

**Requirements**: Terminal must have Accessibility permission (System Settings > Privacy & Security > Accessibility). Without it, events silently fail.

**Gotchas**:
- No middle-click
- Cannot interact with login window
- `t:` types into whatever is frontmost
- Hardcoded internal delays: 15ms between mouse down/up, 10ms between keystrokes, 200ms between double-click pairs

## isTrusted Analysis

**High confidence: CGEventPost events WILL produce isTrusted=true in Chrome.**

Reasoning: Chrome's Blink engine marks events as trusted when dispatched by the user agent through its native input pipeline. `isTrusted=false` only comes from JavaScript's `dispatchEvent()`. CGEventPost enters the macOS window server at the HID layer (same as real hardware), arrives at Chrome as standard NSEvents, and Chrome has no mechanism to distinguish them. Supporting evidence from Selenium docs ("native events have isTrusted=true"), Chromium architecture docs, and multiple security researchers. No evidence anywhere of Chrome filtering CGEventPost events.

**Must still verify empirically -- 15-minute test, blocks all future work.**

## screencapture

**Capturing by window ID**: `screencapture -x -o -l <windowID> output.png`. `-x` suppresses sound, `-o` strips window shadow (critical for coordinate accuracy), `-l` targets specific window by CGWindowID (uint32).

**Getting CGWindowID**: Use CGWindowListCopyWindowInfo API. Filter for `kCGWindowOwnerName == "Google Chrome"` + `kCGWindowLayer == 0`. Can use Python with pyobjc, Swift, or the `GetWindowID` brew package (`brew install smokris/getwindowid/getwindowid`).

**Retina resolution**: screencapture captures at FULL Retina resolution (2x physical pixels on standard Retina). A DOM element at `{x:100, y:200}` in CSS pixels maps to `{x:200, y:400}` in the screenshot image. Formula: `screenshot_coord = getBoundingClientRect_value * devicePixelRatio`.

**Title bar offset**: screencapture with `-l` captures the entire window including title bar and tab strip. Vertical offset to viewport = `(window.outerHeight - window.innerHeight) * devicePixelRatio`. Typically ~76-88 CSS pixels (152-176 device pixels at 2x).

**Background capture**: Can capture windows that are partially or fully behind other windows. Window must NOT be minimized and must be on the current Space.

**Performance**: ~80-150ms for PNG on Apple Silicon. ~40-80ms for BMP. CGWindowListCreateImage API directly is ~10-30ms (no subprocess/file overhead).

**Always use `-o`** to strip shadow. Without it, ~20px of transparent shadow padding on each side throws off all coordinate math.

## Chrome Extension ISOLATED World

**Confirmed**: ISOLATED world shares the DOM but has a completely separate JavaScript context. Full access to querySelector, textContent, getBoundingClientRect, getComputedStyle, attributes, tree traversal, MutationObserver, document.title/URL/readyState. No access to page-defined window variables, functions, or event listeners. Page cannot detect code running in ISOLATED world.

**chrome.scripting.executeScript with files: []**: Chrome reads the file from disk each time with NO cache. Traced through Chromium source: `FileReader` uses `base::ReadFileToStringWithMaxSize()` with no caching layer. Dynamic script injection technique (write file to unpacked extension dir, inject via files param) works reliably without unique filenames for cache-busting (though unique filenames still good for concurrency).

**CSP**: Extension content script CSP is `script-src 'self' 'wasm-unsafe-eval'`. `eval()` and `new Function()` are blocked. But `files` param loads from extension's own `'self'` origin, which IS allowed. The technique is explicitly recommended by Chrome docs as the alternative to eval.

**Return values**: Go through V8ValueConverter. JSON-compatible: null, boolean, number, string, plain objects, arrays all work. Functions are rejected. DOM nodes return `{}`. Map/Set appear as empty objects. undefined becomes null. Max recursion depth 100. Safe rule: if it survives `JSON.parse(JSON.stringify(x))`, it works.

**Timing**: Default `document_idle` (between DOMContentLoaded and window.onload). DOM guaranteed complete. Can use `injectImmediately: true` for earlier injection.

**Permissions needed**: `"scripting"` + host_permissions. The manifest in repo_foundation.md is correct. `"activeTab"` is redundant with `"<all_urls>"` but harmless.

## Native Messaging

### CRITICAL: stdin/stdout Conflict

A single Node.js process CANNOT serve both MCP (stdio to Claude Code) and Native Messaging (stdio to Chrome). Both use stdin/stdout. The parent process that launched the child owns the pipes.

**Solution**: Separate processes with IPC.
```
Claude Code --stdio--> MCP Server --unix socket--> NM Shim --stdio--> Chrome Extension
```
The NM shim is a thin Node.js script that Chrome launches. It connects to the MCP server via unix domain socket (`/tmp/phantom.sock`). Relays length-prefixed JSON bidirectionally. The MCP server is a persistent process; the shim is launched/killed by Chrome.

### Protocol

Messages are length-prefixed JSON over stdin/stdout. 4-byte little-endian uint32 length prefix, followed by UTF-8 JSON of that length. Use `readUInt32LE`/`writeUInt32LE` in Node.js.

### Message Size Limits

**1MB in BOTH directions** (Chromium source: `kMaximumNativeMessageSize = 1024 * 1024`). The foundation doc incorrectly states 64MB from extension to host. Large snapshots may need chunking if they exceed 1MB. Test empirically with real pages.

### Host Manifest (macOS)

Location: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.phantom.mcp.json`

```json
{
  "name": "com.phantom.mcp",
  "description": "Phantom MCP bridge",
  "path": "/absolute/path/to/nm-shim.js",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID_HERE/"]
}
```

Path must be absolute. File must be executable with proper shebang (`#!/usr/bin/env node`). Trailing slash on extension origin is required.

### Process Lifecycle

Chrome launches host on `connectNative()`. One process per connection. Chrome does NOT restart crashed hosts; extension must detect disconnect via `port.onDisconnect` and reconnect.

### Service Worker Keepalive

Active Native Messaging port keeps MV3 service worker alive. But if idle (no messages) for 30s, worker can be terminated. Send periodic pings every ~25s. `setInterval` alone does NOT keep the worker alive -- the active port does.

### Gotchas

- Host executable must be `chmod +x`
- NEVER use `console.log()` in the host -- it writes to stdout and corrupts the protocol. Use `console.error()` for debug logging.
- Node.js inherits a minimal environment from Chrome, NOT the user's shell. `#!/usr/bin/env node` may not find node if installed via nvm/volta. Use absolute path in shebang if needed.
- After installing host manifest, Chrome usually picks it up immediately, but restart Chrome if debugging.

## Bot Detection

### Completely Irrelevant to Phantom (no CDP = no detection)

- `navigator.webdriver` -- not set, no automation flags
- `Runtime.enable` side effects -- no CDP connection
- `cdc_` / `__webdriver_` variables -- no ChromeDriver/Selenium
- Playwright/Puppeteer JS injection -- no framework attached
- `Page.evaluateOnNewDocument` artifacts -- no CDP
- Headless mode fingerprints -- running headed
- SwiftShader/Mesa WebGL -- real M3 GPU
- TLS/JA3/JA4 mismatch -- real Chrome TLS stack
- Viewport defaults (800x600, 1280x720) -- real window size
- DevTools open detection -- DevTools not open
- Extension enumeration via WAR -- no WAR declared, unknown random extension ID

### Still Detectable (behavioral, not fingerprint)

- **Mouse movement ML** (MEDIUM risk): Anti-bot systems train on millions of real trajectories. Simple Bezier curves distinguishable ~80% of time. Mitigated by cliclick easing + Claude's variable inference latency + intermediate movements.
- **Session heuristics** (LOW-MEDIUM over time): Same routes, unusual hours, search-never-book pattern. Mitigated by randomized scheduling, frequency caps.
- **IP reputation** (LOW for residential): Datacenter IPs flagged immediately. Residential is clean.
- **Fresh profile** (VERY LOW): New profiles mildly suspicious but accumulate state naturally over time.

### Test Sites

- **CreepJS** (creepjs.com): 21 categories of fingerprint consistency checks. Real Chrome + real hardware = clean.
- **BrowserScan** (browserscan.net): 50+ data points including webdriver, CDP, UA, TLS. All pass.
- **bot.sannysoft.com**: Focused automation detection. 30+ webdriver-related property checks. All pass.
- **bot.incolumitas.com**: Most comprehensive. Behavioral scoring at 1.5s/4s/7s/10s/15s intervals plus fingerprinting.
- **nowsecure.nl**: Live Cloudflare challenge page. TLS + fingerprint + behavioral.
- **pixelscan.net**: 73+ navigator params, 37 webdriver properties. All pass.

### Launch Flags

`--no-first-run` and `--no-default-browser-check` are NOT detectable by page JS. Only visible on `chrome://version` which pages can't access. Widely used by enterprise/power users. Safe.

## Network Containment (Deferred)

Research concluded Little Snitch is the best option ($59 one-time). pf cannot filter by domain dynamically and cannot filter per-app without a separate user account. Deferred to when overnight autonomous runs begin. For now, user will supervise sessions directly.

When implemented: disable Chrome's DNS-over-HTTPS (`--disable-features=DnsOverHttps` flag) to prevent DoH bypass.

## MCP Tool Schema Conventions

Analyzed Chrome DevTools MCP (29 tools), Playwright MCP (40+ tools), and Browser Use.

**Conclusion**: Tool names in repo_foundation.md already match Chrome DevTools MCP exactly (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `press_key`, `evaluate_script`, etc.). The `[N]` integer ref format is a good hybrid -- more compact than Chrome DevTools MCP's `uid=1_1` or Playwright's `[ref=e2]`.

Full comparison and tool schema reference in `docs/decisions/001-mcp-tool-schema-conventions.md`.

## Open Questions Resolved

| Question from Foundation Doc | Answer |
|---|---|
| cliclick coordinate accuracy / Retina scaling | cliclick uses logical points, same as CSS pixels. No Retina scaling needed for clicks. Only screencapture output needs 2x adjustment. |
| Chrome window ID for screencapture | CGWindowListCopyWindowInfo API, filter by owner name + layer 0. Or `GetWindowID` brew package. |
| Native Messaging message size limits | 1MB BOTH directions (not 64MB from extension). May need chunking for large snapshots. |
| evaluate_script file caching | No cache. Chrome reads from disk each time via FileReader. |
| Service worker lifecycle | Active NM port keeps worker alive. Send pings every ~25s to prevent idle termination. |

## Open Questions Remaining

- **Scroll implementation details**: Key simulation works but need to test smooth scrolling behavior on airline sites specifically. Some sites intercept keyboard scroll events.
- **Chrome window position for coordinate transform**: Need to determine how to get Chrome's window position and title bar height reliably for mapping getBoundingClientRect to screen coordinates.
- **Auto mode permissiveness**: Will Claude Code's auto mode classifier allow our MCP tool calls (shell commands, file writes)? Test early.
