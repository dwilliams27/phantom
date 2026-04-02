# Phase 1: Phantom Extension

## Goal

Build the Chrome extension that gives the MCP server DOM access and tab control through ISOLATED world execution and Native Messaging. This is the browser-side half of Phantom's architecture. After Phase 1, we can manually test all extension capabilities; Phase 2 wires them up to the MCP server that Claude Code talks to.

## Sub-phases

### 1A: Extension Scaffold + Native Messaging

Build the Manifest V3 extension skeleton and establish the Native Messaging communication channel.

**Deliverables:**
- `phantom-extension/manifest.json` (MV3, no WAR, no content_scripts, permissions: scripting/tabs/nativeMessaging/activeTab, host_permissions: <all_urls>)
- `phantom-extension/background.js` (service worker, connects via `chrome.runtime.connectNative`)
- `phantom-extension/nm-shim.js` (thin relay process Chrome launches, connects to MCP server via unix socket)
- Native Messaging host manifest installed at `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.phantom.mcp.json`
- Service worker keepalive via 25s ping interval
- Reconnection on `port.onDisconnect`

**Proof:** Load extension in Phantom Chrome profile. Send a message from a test Node.js script through the unix socket, have the extension echo it back. Log round-trip.

**Key constraint:** NM shim uses length-prefixed JSON (4-byte LE uint32 + UTF-8 payload). Never `console.log()` in the shim -- corrupts the protocol. 1MB message limit both directions.

---

### 1B: Tab Management

Implement tab listing, navigation, activation, and back/forward through the extension.

**Deliverables:**
- `navigate_page(tabId, url)` -- `chrome.tabs.update`
- `go_back(tabId)` -- `chrome.tabs.goBack`
- `go_forward(tabId)` -- `chrome.tabs.goForward`
- `list_pages()` -- `chrome.tabs.query`, returns `[{id, title, url, active}]`
- `select_page(tabId)` -- `chrome.tabs.update` with `{active: true}`

**Proof:** From the test script: list tabs, navigate to example.com, go back, go forward, open a second tab, list tabs showing both, switch between them. All via NM messages through the shim.

---

### 1C: DOM Snapshot Walker

The most important piece. Build the ISOLATED world DOM walker that produces the `[N]`-annotated accessibility tree.

**Deliverables:**
- Snapshot algorithm injected via `chrome.scripting.executeScript({world: "ISOLATED"})`
- Produces text tree with `[N]` refs, roles, names, text content, form state (value/checked/disabled), semantic structure
- Internal refMap stored in service worker memory: `{ref: {element, rect}}`
- `get_element_rect(ref)` returns screen coordinates (viewport-relative rect + window position transform for cliclick targeting)

**Output format:**
```
RootWebArea "Page Title" url="https://..."
  [0] banner
    [1] link "Home"
    [2] button "Login" (disabled)
  [3] main
    [4] textbox "Search" value=""
    [5] button "Submit"
```

**ARIA-aware design:** The walker computes accessible roles and names the same way a screen reader would. This means reading implicit roles from HTML semantics (`<button>` → button, `<a href>` → link, `<input type=text>` → textbox) AND explicit ARIA attributes (`role`, `aria-label`, `aria-labelledby`, `aria-checked`, `aria-expanded`, `aria-disabled`, `aria-selected`). Also resolves `<label for>` associations and `alt` text. This is critical for handling date pickers -- airlines face ADA/EAA legal requirements, so most use ARIA grid/gridcell patterns with accessible labels like "March 15, 2026" that Claude can navigate directly.

**Priorities:** Interactive elements > semantic structure > visible text > form state > reasonable depth (not every nested span).

**Proof:** Load a real website (e.g., example.com, then a more complex page). Take snapshot via NM message. Verify the tree is readable, refs are correct, and `get_element_rect` returns accurate coordinates by clicking an element via cliclick at the returned coords.

**Known risks:**
- Large pages may produce snapshots >1MB (NM limit). May need truncation strategy.
- Airline date pickers: most major carriers use ARIA grid/gridcell patterns (ADA/EAA legal requirement) which our ARIA-aware walker should handle. Canvas-rendered or completely non-semantic widgets fall back to screenshot + click_at.
- Refs are NOT stable across snapshots -- fresh snapshot needed after each page mutation.

---

### 1D: Dynamic Script Injection (evaluate_script)

Enable arbitrary JavaScript execution in ISOLATED world via the file-write + executeScript technique.

**Deliverables:**
- Extension handles `evaluate_script` command: receives a script file path, injects via `chrome.scripting.executeScript({world: "ISOLATED", files: [path]})`
- Returns `InjectionResult[].result` back through NM
- File is written by the caller (MCP server in production, test script for now) to `phantom-extension/eval/script_{uuid}.js`
- Script wrapped in IIFE with try/catch harness by the caller

**Proof:** Write a script that queries `document.title` and returns it. Inject via the extension. Verify the title string comes back through NM. Then test a more complex query (querySelectorAll, map over results, return array of objects).

**Key facts:**
- Chrome reads the file fresh from disk each time (no cache)
- Return values must be JSON-serializable (no DOM nodes, no functions)
- CSP allows `'self'` origin scripts via `files` param even though `eval()` is blocked

---

### 1E: Page Health Checks

Implement `check_page_status` and `wait_for` for session health monitoring.

**Deliverables:**
- `check_page_status(tabId)` -- runs in ISOLATED world, returns `{url, title, hasLoginForm, hasCaptcha, hasError}`
  - Login detection: looks for common login form patterns (password inputs, "sign in"/"log in" text)
  - CAPTCHA detection: looks for known CAPTCHA element patterns (reCAPTCHA, hCaptcha, Cloudflare Turnstile iframes/divs)
  - Error detection: looks for HTTP error messages, rate limit text, "access denied" patterns
- `wait_for(tabId, {selector?, text?, timeout})` -- polls every 500ms in ISOLATED world, resolves when found or times out

**Proof:** Navigate to a page with a form, verify login detection. Navigate to a known CAPTCHA test page if available, or mock one. Test wait_for with a selector that exists and one that doesn't (timeout).

---

## Dependency Order

```
1A (scaffold + NM) → 1B (tabs) → 1C (snapshot) → 1D (eval_script) → 1E (health checks)
```

1A must come first -- everything else depends on the NM channel. 1B is simple and proves the channel works for real Chrome API calls. 1C is the big one. 1D and 1E are independent of each other but both depend on 1A.

## Progress Tracker

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| 1A: Extension Scaffold + NM | Complete | Round-trip verified: ping/echo/error + reconnection |
| 1B: Tab Management | Complete | list/navigate/back/forward/select verified via harness |
| 1C: DOM Snapshot Walker | Complete | ARIA-aware tree, [N] refs, get_element_rect, auto-reload |
| 1D: Dynamic Script Injection | Complete | evaluate_script via file write + executeScript, 29 tests |
| 1E: Page Health Checks | Complete | check_page_status + wait_for, 39 tests total |

## Open Questions for Phase 1

- **Snapshot size on real airline pages** -- will large fare tables exceed the 1MB NM limit? Test empirically once 1C is built.
- **Coordinate mapping accuracy** -- `window.screenX + rect.left` and `window.screenY + (outerHeight - innerHeight) + rect.top` should give exact cliclick coordinates. Verify empirically in 1C.
- **Auto mode permissiveness** -- will Claude Code's auto mode allow our MCP tool calls (shell commands, file writes)? Test in Phase 2 when MCP server exists. If too restrictive, fall back to `--dangerously-skip-permissions`.
- **Scroll on airline sites** -- key simulation works but some sites intercept keyboard scroll. Fallback: `evaluate_script` calling `element.scrollIntoView()`. Test per-site in Phase 3.
