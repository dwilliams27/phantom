# Project Phantom

## Vision

A general-purpose stealth browser automation framework driven by Claude Code. The system enables Claude to navigate arbitrary websites — visually, through DOM inspection, and via structured tool calls — while presenting **zero detectable automation fingerprint**. By design, no programmatic connection exists between the controlling agent and the browser's page context. There is nothing to detect because there is nothing there.

Claude Code runs overnight in a sandboxed environment with domain-restricted network access, completing multi-step browsing tasks autonomously.

The first application is airline award search: finding business class flights posted for unusually low points prices across airline loyalty programs — the kind of deals where you transfer credit card points to the airline and book before availability disappears. But the framework itself is site-agnostic.

---

## Core Insight: Three Invisible Channels

Every existing browser automation tool (Playwright, Puppeteer, Selenium, Chrome DevTools MCP) controls Chrome through the Chrome DevTools Protocol (CDP). CDP is a WebSocket connection to Chrome's debugging interface. Anti-bot systems have spent years learning to detect CDP side effects — `Runtime.enable` artifacts, `cdc_` window variables, `navigator.webdriver`, injected scripts via `Page.evaluateOnNewDocument`. Even Patchright, which patches the most obvious leaks, is fighting a losing battle against an ever-expanding catalog of CDP side-channel detections.

Phantom takes a fundamentally different approach. It controls the browser through three channels that are **architecturally invisible** to page-side JavaScript:

### 1. Chrome Extension APIs (ISOLATED World)

A Chrome extension's content scripts running in the ISOLATED world share the same DOM as the page but execute in a completely separate JavaScript context. The page cannot see, detect, or interfere with code running in the ISOLATED world. This gives us full DOM access — `querySelector`, `textContent`, `getBoundingClientRect`, `getComputedStyle`, attribute reads, tree traversal — with zero page-side footprint.

The extension uses no Web Accessible Resources (so sites cannot probe for its existence), injects no content scripts via the manifest (so there are no static artifacts), and makes no modifications to the page's DOM.

### 2. OS-Level Input Simulation (cliclick on macOS)

Mouse clicks, keyboard input, and scrolling are synthesized at the operating system level using `cliclick` (macOS). These arrive at Chrome through the same input path as physical hardware — the OS event system via `CGEventPost`. Chrome processes them through its normal event pipeline, indistinguishable from real mouse and keyboard events at the browser level. There is no programmatic API call inside the browser, no CDP command, no JavaScript `dispatchEvent`. Events synthesized this way should have `isTrusted=true` since Chrome's Blink engine sees them as user-agent-generated — to be verified in Phase 0.

### 3. Display Capture (screencapture on macOS)

Screenshots are captured from the OS display buffer using macOS `screencapture`. This reads pixels from the window manager, not from inside Chrome. The browser has no knowledge that its window is being captured.

**None of these channels touch CDP. No WebSocket debugger connection exists. No remote debugging port is open. From the browser's page-context perspective, there is no automation happening.**

---

## Architecture

```
Claude Code  ←──stdio──→  Phantom MCP Server  ←──Native Messaging──→  Phantom Extension
  (Opus 4.6)                (Node.js process)     (chrome.runtime         (background
                                  │                 .connectNative)         service worker)
                                  │                                              │
                                  │                                    ┌─────────┴──────────┐
                                  │                                    │ ISOLATED world      │
                                  │                                    │ DOM access:         │
                                  │                                    │  querySelector      │
                                  │                                    │  textContent        │
                                  │                                    │  getBoundingRect    │
                                  │                                    │  element tree walk  │
                                  │                                    │  accessibility info │
                                  │                                    │                     │
                                  │                                    │ Tab management:     │
                                  │                                    │  chrome.tabs.*      │
                                  │                                    │  chrome.scripting.* │
                                  │                                    └─────────────────────┘
                                  │
                          ┌───────┴────────┐
                          │ OS-level I/O   │
                          │                │
                          │ cliclick       │──→ Mouse clicks, movement, keyboard
                          │ (macOS input)  │    events via OS event system
                          │                │
                          │ screencapture  │──→ Window pixel capture via
                          │ (macOS)        │    OS display buffer
                          │                │
                          │ fs.writeFile   │──→ Writes dynamic JS to extension
                          │ (evaluate_     │    directory for ISOLATED world
                          │  script)       │    injection via files: [] param
                          └────────────────┘
```

### Communication Flow

1. **Claude Code** invokes MCP tools (e.g., `click`, `take_snapshot`, `navigate_page`)
2. **Phantom MCP Server** receives the tool call via stdio (standard MCP protocol)
3. For DOM operations: MCP server sends a command via **Native Messaging** to the Phantom Extension, which executes in Chrome's ISOLATED world and returns results
4. For input operations: MCP server invokes **cliclick** to synthesize OS-level mouse/keyboard events
5. For screenshots: MCP server invokes **screencapture** to grab the Chrome window's pixels
6. MCP server returns structured results to Claude Code

Native Messaging is a Chrome extension API that connects an extension's background service worker to a local process via stdin/stdout JSON messages. No network. No WebSocket. No CDP.

---

## Tool Surface

The Phantom MCP server exposes tools whose schemas mirror the Chrome DevTools MCP and Browser Use ecosystems. Claude already knows how to compose these actions from its training. We are not inventing new interaction primitives — we are reimplementing proven interfaces through invisible channels.

### Navigation

| Tool | Implementation |
|---|---|
| `navigate_page(url)` | Extension: `chrome.tabs.update(tabId, {url})` |
| `go_back()` | Extension: `chrome.tabs.goBack(tabId)` |
| `go_forward()` | Extension: `chrome.tabs.goForward(tabId)` |
| `list_pages()` | Extension: `chrome.tabs.query({})` — returns tab list with titles and URLs |
| `select_page(tabId)` | Extension: `chrome.tabs.update(tabId, {active: true})` |

### Observation

Claude uses two complementary observation tools. `take_snapshot` provides a structured DOM/accessibility tree — fast, precise, and sufficient for most interactions. `take_screenshot` provides a visual image — essential for understanding layout, identifying elements the DOM tree doesn't capture well (custom-rendered widgets, canvas elements, visually-distinguished-but-semantically-identical elements), and for cross-referencing what Claude "reads" in the tree with what it "sees" on screen.

In practice, Claude will typically `take_snapshot` to understand the page structure and plan its next action, and `take_screenshot` when it needs visual context (first page load, after a complex navigation, or when the snapshot doesn't contain enough information to act).

| Tool | Implementation |
|---|---|
| `take_snapshot()` | Extension (ISOLATED world): walk the DOM tree, build an accessibility-style representation with element refs (`[0]`, `[1]`, ...), roles, text content, bounding rectangles, input types, and interactive state (enabled/disabled, checked, selected). Returns a structured text tree that Claude can reason over. |
| `take_screenshot()` | macOS `screencapture -x -C -l <windowID> /tmp/phantom_shot.png` — captures the specific Chrome window without the menu bar click sound. Returns base64-encoded PNG. |
| `get_element_rect(ref)` | Extension (ISOLATED world): look up element by ref from the last snapshot, return `getBoundingClientRect()` coordinates. Used internally by `click` and `fill` but also exposed for Claude's spatial reasoning. |

### Interaction

The interaction model follows the industry-proven hybrid approach: **DOM refs as the primary targeting method, with raw coordinates as a fallback** for elements that don't appear cleanly in the accessibility tree (canvas-rendered date pickers, image-based UI, custom widgets). Production browser agents (Stagehand, Browser Use, rtrvr.ai) all converge on this pattern — the DOM tree gives Claude unambiguous element identity ("this is the Search Flights button, it's enabled"), while screenshots + coordinates handle visual edge cases that the DOM can't represent.

| Tool | Implementation |
|---|---|
| `click(ref)` | Extension resolves ref → center coordinates. MCP server invokes `cliclick c:X,Y` to click via OS. Optional: intermediate mouse movement to the region first for more natural behavior. **Primary click method — preferred whenever the target appears in the snapshot.** |
| `click_at(x, y)` | MCP server invokes `cliclick c:X,Y` directly at the specified coordinates. **Fallback for elements that aren't represented in the DOM snapshot** — e.g., canvas-rendered date picker cells, image maps, or custom-drawn UI. Claude determines coordinates from a screenshot. |
| `mouse_move(x, y)` | MCP server invokes `cliclick m:X,Y` to move the cursor. Used for hover effects, revealing tooltips or dropdown menus, or breaking up click actions into move-then-click for more natural behavior. |
| `fill(ref, value)` | Extension resolves ref → coordinates. MCP server: `cliclick c:X,Y` (focus), `cliclick kp:cmd-a` (select all), then `cliclick t:VALUE` (type text). For sensitive fields, types character-by-character with jitter. |
| `select_option(ref, value)` | Click to open dropdown, take_snapshot to find the matching option element, click the option. Composed from primitives, not a single atomic action. |
| `scroll(direction, amount)` | `cliclick` scroll events via OS, or Page Down/Up key simulation. Variable amounts with jitter. |
| `press_key(key)` | `cliclick kp:KEY` — supports Enter, Tab, Escape, arrow keys, modifier combos. |
| `type_text(text)` | `cliclick t:TEXT` — types into whatever element currently has focus. For long text, types in chunks with variable delays. |

### Evaluation

| Tool | Implementation |
|---|---|
| `evaluate_script(js)` | Claude provides arbitrary JavaScript as a string. The MCP server writes it to a file in the extension's local directory (e.g., `eval/script_{uuid}.js`), then instructs the extension to inject it via `chrome.scripting.executeScript({target: {tabId}, world: "ISOLATED", files: ["eval/script_{uuid}.js"]})`. The script runs in ISOLATED world with full DOM access — `querySelector`, `textContent`, `getAttribute`, `classList`, computed styles, tree traversal, geometry — but cannot see page-defined JS variables on `window`. The return value of the last expression is captured directly by `executeScript` in `InjectionResult[].result` — no DOM modification needed for result passing. This is not `eval()` — Chrome's CSP blocks `eval()` in ISOLATED world, but allows loading scripts from the extension's own `'self'` origin via the `files` parameter. Because the extension is loaded unpacked from a local directory, the MCP server can write new script files at any time. This gives Claude full arbitrary JavaScript execution with zero CSP restrictions and zero DOM side effects. |
| `wait_for(selector_or_text, timeout)` | Extension (ISOLATED world): polls at 500ms intervals using `querySelector` or text search. Resolves when found or times out. |

### Session Health

| Tool | Implementation |
|---|---|
| `check_page_status()` | Extension (ISOLATED world): returns structured report — current URL, page title, whether common login form patterns are detected, whether CAPTCHA-like elements are present, whether error/rate-limit messaging is visible. |

### ISOLATED World — What It Can and Cannot Do

**Full access (invisible to page):**
- All DOM queries: `querySelector`, `querySelectorAll`, `getElementById`, etc.
- All element properties: `textContent`, `innerText`, `innerHTML`, `value`, attributes, `classList`, `dataset`
- All geometry: `getBoundingClientRect()`, `offsetWidth/Height`, scroll positions
- Computed styles: `getComputedStyle(element)`
- DOM tree traversal: `parentElement`, `children`, `nextSibling`, etc.
- MutationObserver for watching DOM changes
- `document.title`, `document.URL`, `document.readyState`

**No access (and we don't need it):**
- Page-defined `window` variables (React state, `__NEXT_DATA__`, etc.)
- Page-defined functions
- Page's event listeners (we can't read them, but we can trigger events via OS input)

For airline award search — reading fare tables, form fields, availability calendars, flight result lists — DOM access in ISOLATED world covers everything we need. We never need to read the page's JavaScript state.

---

## Stealth Profile

### What a page can detect: Nothing.

| Detection Method | Our Exposure |
|---|---|
| `navigator.webdriver` check | ✅ Not set. No automation flags. Chrome launched normally. |
| CDP `Runtime.enable` side effects | ✅ No CDP connection exists. No remote debugging port open. |
| `cdc_` / `__webdriver_` window variables | ✅ No ChromeDriver, no Selenium, no CDP client of any kind. |
| Playwright/Puppeteer JS injection | ✅ No automation framework attached to the browser. |
| `Page.evaluateOnNewDocument` detection | ✅ No CDP commands sent. Extension uses Chrome APIs, not CDP. |
| Web Accessible Resources probe | ✅ Extension declares no WAR. Cannot be probed by page JS. |
| DOM mutation from automation | ✅ Extension runs in ISOLATED world. No DOM writes. |
| DevTools open detection | ✅ DevTools are not open. No debugging connection. |
| Headless mode fingerprint | ✅ Running in normal headed mode on macOS. |
| TLS/JA3 fingerprint mismatch | ✅ Real Chrome binary. Real TLS stack. |
| Canvas/WebGL/AudioContext inconsistency | ✅ Real Chrome with real GPU rendering on M3. |
| Input event origin analysis | ✅ OS-level events via cliclick (`CGEventPost`). Events arrive at Chrome through the OS event queue — the same path as physical hardware. Chrome should process these as `isTrusted=true` since they're indistinguishable from hardware input at the browser level. **Verify in Phase 0.** |
| Extension enumeration | ✅ No WAR, no content scripts in manifest. Extension cannot be detected by page JavaScript. The known timing side-channel for extension detection requires probing a known extension ID — ours is a random hash from the unpacked path, not in any public database. Effectively invisible. |
| `chrome://gpu` command line inspection | ✅ No `--remote-debugging-port`, no `--headless`, no `--enable-automation`. The `--no-first-run` and `--no-default-browser-check` flags are present but are not automation signals (widely used by enterprise/power users) and are only visible via `chrome://` pages, which page JavaScript cannot access. |

### What remains detectable

- **Behavioral ML analysis**: Mouse movement patterns, click timing, scroll velocity, keystroke rhythm. Mitigated by Claude's inherently variable reasoning pace + random delays + variable mouse movements. Not defeated with certainty.
- **Session-level heuristics**: Searching the same routes repeatedly at 3am every night. Mitigated by randomized scheduling, variable timing windows, and conservative per-airline frequency caps.
- **Account-level anomaly detection**: An account that only ever searches and never books. This is a long-term signal that we can't fully mitigate, but many real users browse heavily without booking.

These are behavioral/statistical signals, not browser fingerprinting. They require pattern analysis over time, not a one-shot detection check. Our low frequency (max 2 sessions per airline per night) keeps us well below the threshold where these become actionable.

---

## Phantom Extension Design

### Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Phantom",
  "version": "1.0",
  "permissions": [
    "scripting",
    "tabs",
    "nativeMessaging",
    "activeTab"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

Key design decisions:
- **No `web_accessible_resources`** — nothing for pages to probe
- **No `content_scripts` in manifest** — no static injection on any page
- **`host_permissions: <all_urls>`** — needed for `chrome.scripting.executeScript` on arbitrary sites. This is a broad permission but it's a locally-installed extension, not a Chrome Web Store listing.
- **Background service worker only** — all logic runs in the background, dispatched via Native Messaging

### Native Messaging Host

A JSON manifest registered at `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.phantom.mcp.json`:

```json
{
  "name": "com.phantom.mcp",
  "description": "Phantom MCP bridge",
  "path": "/path/to/phantom-mcp-server",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID_HERE/"
  ]
}
```

The Phantom MCP Server is a Node.js process that the extension connects to via `chrome.runtime.connectNative("com.phantom.mcp")`. Messages flow as length-prefixed JSON over stdin/stdout.

### Snapshot Algorithm

The `take_snapshot` tool is the most important piece of the extension. It must produce a representation that Claude can reason over efficiently — element refs for interaction, text content for understanding, and spatial layout for context.

The snapshot walker runs in ISOLATED world and produces output like:

```
RootWebArea "Turkish Airlines - Book with Miles" url="https://www.turkishairlines.com/..."
  [0] banner
    [1] link "Home"
    [2] link "Miles&Smiles"
    [3] button "Login" (disabled)
  [4] main
    [5] heading "Award Ticket Search" level=1
    [6] group "Trip Type"
      [7] radio "One Way" (checked)
      [8] radio "Round Trip"
    [9] group "Flight Details"
      [10] textbox "From" value="IST"
      [11] textbox "To" value=""
      [12] button "Select Date" aria-expanded=false
    [13] button "Search Flights" (primary)
  [14] contentinfo
    [15] link "Contact Us"
```

Each `[N]` ref maps to an internal lookup table that stores the element's DOM reference and bounding rect. When Claude says `click([13])`, the extension looks up ref 13, gets its center coordinates, and returns them to the MCP server for cliclick dispatch.

The snapshot algorithm prioritizes:
- Interactive elements (buttons, links, inputs, selects)
- Semantic structure (headings, landmarks, lists, tables)
- Visible text content
- Form state (values, checked/selected status, enabled/disabled)
- Reasonable depth (not every nested span, but enough structure for Claude to understand layout)

**Known limitation**: Airline date pickers are notoriously hard for DOM-based agents. Many are built with custom rendering (canvas, absolutely-positioned divs with no semantic markup, or third-party widgets that don't expose clean accessibility info). When the snapshot doesn't represent a date picker well, Claude should fall back to `take_screenshot` + `click_at(x, y)` to visually identify and click the correct date cell.

### Dynamic Script Injection (`evaluate_script`)

Chrome's extension CSP blocks `eval()` and `new Function()` in ISOLATED world. This would normally prevent executing arbitrary JavaScript at runtime. We bypass this cleanly by exploiting the fact that CSP *does* allow loading scripts from the extension's own origin (`'self'`) via the `files` parameter of `chrome.scripting.executeScript`.

The mechanism:

1. Claude provides arbitrary JavaScript as a string via the `evaluate_script` MCP tool
2. The MCP server writes the JS to a file in the extension's local directory (e.g., `phantom-extension/eval/script_{uuid}.js`), wrapping it in a result-capture harness:
   ```javascript
   // Written by MCP server to extension directory
   // The last evaluated expression is captured by chrome.scripting.executeScript
   // and returned in InjectionResult[].result — no DOM modification needed
   (() => {
     try {
       // === Claude's arbitrary JS inserted here ===
       const rows = document.querySelectorAll('.fare-row');
       return Array.from(rows).map(r => ({
         flight: r.querySelector('.flight-num')?.textContent,
         miles: r.querySelector('.miles')?.textContent,
       }));
       // === end Claude's JS ===
     } catch(e) {
       return {__error: true, message: e.message, stack: e.stack};
     }
   })();
   ```
3. The MCP server tells the extension (via Native Messaging) to inject the file
4. The extension calls `chrome.scripting.executeScript({target: {tabId}, world: "ISOLATED", files: ["eval/script_{uuid}.js"]})`
5. The script executes in ISOLATED world with full DOM access
6. `executeScript` resolves with `InjectionResult[]` containing the return value — no DOM reads or writes needed for result passing
7. The extension sends the result back to the MCP server via Native Messaging
8. The temporary script file is deleted

This gives Claude the same power as a raw `eval()` — full arbitrary JavaScript execution, any DOM query, any traversal, any data extraction — without violating CSP. The extension must be loaded unpacked (not from the Chrome Web Store) for the MCP server to have write access to its directory.

---

## Dedicated Chrome Profile

A fresh Chrome profile created specifically for Phantom. This provides environment isolation:

- **No payment methods, no autofill data, no saved passwords** for non-airline sites, no other extensions. The browsing environment contains only what's needed for the task.
- **No cross-contamination with personal browsing** — history, cookies, localStorage are fully separated. If a site is compromised or serves malicious content, the blast radius is contained to this profile.
- **Airline logins are established manually** before automated runs. Cookies persist between sessions.
- The profile accumulates natural browsing history and cookie state over time, appearing as a consistent returning user.

Launch Chrome with the dedicated profile:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir="$HOME/.phantom-chrome-profile" \
  --no-first-run \
  --no-default-browser-check
```

No `--remote-debugging-port`. No `--headless`. No automation flags. Just Chrome.

---

## Network Domain Allowlist

The sandboxed environment enforces a strict domain allowlist at the OS network level. This is the primary defense against prompt injection and unintended navigation. Even if malicious page content somehow influenced Claude's actions, network requests to disallowed domains would fail at the firewall.

Enforced via macOS **pf** (packet filter) or **Little Snitch**, not inside the browser:

```
# Airline domains (add subdomains as discovered during onboarding)
turkishairlines.com
*.turkishairlines.com
united.com
*.united.com
aeroplan.ca
*.aeroplan.ca

# Required for Claude Code
api.anthropic.com
statsig.anthropic.com

# CDNs that airline sites load from
*.cloudfront.net
*.akamaized.net
*.akamai.net
```

All other domains are blocked. This is deterministic, OS-level containment — not prompt-based.

---

## Claude Code Execution Model

### How a Task Runs

Each search task is a Claude Code invocation with task-specific context:

```
phantom/
├── CLAUDE.md                    # global project rules + MCP tool docs
├── tasks/
│   ├── turkish_airlines/
│   │   ├── TASK.md              # natural language site instructions
│   │   ├── onboarding.md        # notes from manual exploration
│   │   └── sample_results.json  # expected output format
│   ├── united/
│   │   └── ...
│   └── aeroplan/
│       └── ...
├── results/                     # Claude writes results here
│   └── {airline}_{date}_{timestamp}.json
├── screenshots/                 # debug captures
├── config/
│   ├── routes.json              # origin-destination pairs + dates
│   ├── alerts.json              # thresholds and channels
│   └── network_allowlist.txt    # permitted domains
└── scripts/
    ├── orchestrator.ts          # scheduler + alerting
    └── setup.sh                 # profile + network + extension setup
```

The orchestrator invokes:

```bash
cd phantom/tasks/turkish_airlines
claude --model claude-opus-4-6 \
  --auto-mode \
  "Complete the search task described in TASK.md. Write results to ../../results/"
```

### TASK.md Structure (Per-Site)

Each airline gets a TASK.md written in natural language after manual onboarding:

```markdown
# Turkish Airlines Award Search

## Login
You should already be logged in via saved cookies. If you see a login page,
write "LOGIN_REQUIRED" to the results file and stop.

## Search Flow
1. Navigate to turkishairlines.com
2. Find and click the Miles&Smiles award booking option
3. If there's a "Use Miles" toggle, select it
4. Set trip type to one-way
5. Enter the origin airport code in the departure field
6. Enter the destination airport code in the arrival field
7. Select the departure date
8. Search
9. Extract Business class availability from results

## Routes to Search
Read from ../../config/routes.json

## Data to Extract
For each result with Business class availability:
- Date, flight number(s), points/miles required
- Taxes/fees if shown, seat count if shown
- Whether waitlisted or confirmed

## Output
Write JSON to ../../results/turkish_{date}_{timestamp}.json

## Safety Rules
- Do NOT interact with purchase, reserve, book, or payment buttons
- Do NOT enter payment information
- If you encounter a CAPTCHA, write "CAPTCHA_ENCOUNTERED" and stop
- Only navigate to turkishairlines.com domains
```

### Site Onboarding Process

Before an airline runs autonomously:

1. **Interactive exploration** — manually browse the site in the Phantom Chrome profile. Log in, navigate the award search, note the UI patterns and quirks.
2. **Write TASK.md** — translate the flow into natural language instructions.
3. **Supervised test runs** — run Claude Code interactively, watch it attempt the task, iterate on instructions where it gets confused.
4. **Collect sample results** — save example output for format validation.
5. **Unsupervised validation** — 3-5 overnight runs, verify results each morning, check for account warnings.
6. **Promote to schedule** — add to the orchestrator's cron config.

---

## Behavioral Stealth

- **Frequency**: Maximum 2 search sessions per airline per night. Configurable nightly cap across all airlines.
- **Timing**: Randomized start times within a multi-hour window (e.g., 12am-5am). Random gaps between airline sessions.
- **Pacing**: Claude's inference latency (5-30 seconds per action) naturally mimics slow human browsing. Additional random delays (2-8 seconds) added between actions.
- **Mouse movement**: cliclick supports intermediate movement. Move to the general area first, then to the target — not pixel-perfect teleportation.
- **Session warmup**: Navigate to the airline's homepage first, don't deep-link to the search form.
- **Error recovery**: On CAPTCHA, error, or unexpected state — abort, log screenshots, retry on next scheduled run.

---

## Safety & Isolation

### CLAUDE.md Safety Rules

```markdown
## Hard Rules
- Never click purchase, buy, reserve, book, or checkout buttons
- Never enter payment information of any kind
- Never navigate to domains not in config/network_allowlist.txt
- If you encounter a CAPTCHA, write CAPTCHA_ENCOUNTERED to results and stop
- If unsure whether an action is a purchase action, do NOT click it
- If login has expired, write LOGIN_REQUIRED and stop — do not re-enter credentials
```

### Permission Model

**Auto mode** (preferred): Claude Code's classifier evaluates each action, blocking destructive operations while allowing browser MCP tool calls. Configure custom allow rules for Phantom MCP tools.

**`--dangerously-skip-permissions`** (fallback): Acceptable in this environment because the network allowlist is the real containment boundary. The permission system is defense-in-depth, not the primary safety layer.

### Chrome Profile Isolation

- No saved payment methods — no cards, no PayPal, nothing. Purchase is physically impossible.
- No sensitive autofill data beyond airline logins.
- No other extensions. No password managers.
- Scoped working directory — Claude Code cannot access files outside the phantom project folder.

---

## Alerting & Data

### Storage (SQLite via better-sqlite3)

- **search_results** — timestamped availability snapshots per airline/route
- **search_runs** — per-invocation metadata (airline, timing, status, errors)
- **alert_history** — deduplication (don't re-alert same flight within 24h)

### Alert Pipeline

The orchestrator handles alerting after Claude Code completes:

1. Read results JSON
2. Compare against thresholds in `config/alerts.json`
3. Check deduplication in `alert_history`
4. Send via email (MVP), Telegram (later)
5. Include: airline, route, date, points required, booking page URL if available

---

## Project Phases

### Phase 0: Environment & Stealth Validation
- Create dedicated Chrome profile, verify clean launch with no automation flags
- Install cliclick (`brew install cliclick`), verify OS-level input works in Chrome
- **Verify `isTrusted=true`**: open a test page with a click handler that logs `event.isTrusted`, use cliclick to click it, confirm the event is trusted. This is a critical assumption of the architecture.
- Verify `screencapture` can target the Chrome window by window ID
- Choose and implement network restriction (pf / Little Snitch)
- Confirm blocked domains actually fail from within Chrome
- Visit bot detection test sites (CreepJS, BrowserScan, nowsecure.nl) — confirm perfect stealth
- Set up Claude Code auto mode permissions

### Phase 1: Phantom Extension
- Build Manifest V3 extension scaffold (background service worker, no WAR, no content scripts)
- Implement Native Messaging host registration and connection
- Implement DOM snapshot walker in ISOLATED world — element tree with refs, text, roles, bounding rects
- Implement element ref lookup → coordinates for click targeting
- Implement `chrome.scripting.executeScript` wrapper for arbitrary DOM queries in ISOLATED world
- Implement tab management (list, activate, navigate, go back/forward)
- Implement page health checks (login detection, CAPTCHA detection, error state detection)
- Test all functionality manually with the extension loaded in the Phantom Chrome profile

### Phase 2: Phantom MCP Server
- Build MCP server with stdio transport (standard MCP protocol that Claude Code speaks)
- Implement Native Messaging client to communicate with the extension
- Implement cliclick wrapper for mouse/keyboard actions with coordinate transforms
- Implement screencapture wrapper for Chrome window targeting + base64 encoding
- Register all tools with schemas matching Chrome DevTools MCP naming conventions
- Wire up the full pipeline: Claude Code → MCP → extension/cliclick/screencapture → results
- Test end-to-end: Claude Code invokes tools, navigates to example.com, extracts page title, writes to file

### Phase 3: First Airline (Turkish Airlines)
- Manual onboarding: interactive exploration of Miles&Smiles award search
- Write TASK.md with natural language instructions
- Supervised Claude Code runs — watch and iterate on instructions
- Validate data extraction accuracy against manual checks
- Unsupervised overnight runs (3-5 nights), verify each morning
- Monitor account for warnings or anomalies
- Tune pacing, delays, and session warmup patterns

### Phase 4: Orchestrator & Alerting
- Build cron-based scheduler with randomized timing
- Implement per-airline frequency caps and cooldown periods
- Build alert pipeline (email MVP)
- Implement SQLite storage for results, run history, and deduplication
- Run the full system for a week, monitor stability

### Phase 5: Scaling Airlines
- Add airlines one at a time, each through full onboarding
- Candidates: United MileagePlus, Air Canada Aeroplan, ANA Mileage Club, Singapore KrisFlyer, Avianca LifeMiles
- Each airline = new TASK.md + domain additions to allowlist
- Identify common UI patterns, refine the snapshot algorithm for fare grids/calendars/result tables

### Phase 6: General-Purpose Hardening
- Abstract framework away from airline-specific assumptions
- Task template system for faster onboarding of new sites
- Dashboard for viewing results, run history, alert status
- Optional: record real browsing sessions for behavioral replay training
- Evaluate Camoufox integration for the browser layer if additional fingerprint rotation is ever needed

---

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Agent | Claude Code (Opus 4.6) | Native MCP tool calling, vision, overnight autonomy |
| Permission Mode | auto mode (or skip-permissions in sandbox) | Unattended operation |
| MCP Server | Custom "Phantom MCP" (TypeScript/Node.js) | Zero-CDP design, mirrors DevTools MCP schemas |
| Browser Bridge | Phantom Extension (Manifest V3) | ISOLATED world DOM access, Native Messaging, no WAR |
| Input Simulation | cliclick (macOS) | OS-level mouse/keyboard events |
| Display Capture | screencapture (macOS) | OS-level window capture |
| Browser | Chrome (real binary, no flags) | Genuine fingerprint, no automation signals |
| Network Safety | macOS pf / Little Snitch | OS-level domain allowlist |
| Scheduling | node-cron + shell scripts | Simple, reliable |
| Storage | SQLite (better-sqlite3) | No server, sufficient for personal scale |
| Alerts | nodemailer (email MVP) | Easy setup, Telegram later |

---

## Open Questions

- **cliclick coordinate accuracy** — cliclick works in screen coordinates. Need to verify that `getBoundingClientRect()` from the extension (which returns viewport-relative coords) can be reliably transformed to screen coords accounting for Chrome's title bar, tab bar, and any macOS display scaling on M3 Retina.
- **Chrome window ID for screencapture** — `screencapture -l <windowID>` needs the CGWindowID. Can be obtained via `osascript` or the `CGWindowListCopyWindowInfo` API. Need a reliable way to find the Phantom Chrome window.
- **Native Messaging message size limits** — Messages FROM the native host TO the extension are capped at 1MB. Messages FROM the extension TO the host are capped at 64MB. Snapshot results flow extension→host (64MB limit, plenty of room). Commands flow host→extension (1MB limit, commands are small). The 1MB direction is not a concern for our use case.
- **`evaluate_script` file caching** — Chrome may cache extension files loaded via `chrome.scripting.executeScript({files: [...]})`. The MCP server writes dynamic JS to the extension directory and injects it as a file to bypass CSP's `eval()` restriction. Need to verify in Phase 1 whether Chrome re-reads the file on each injection or caches it. If cached, use unique filenames per invocation (e.g., `eval_{timestamp}.js`) and clean up after execution.
- **Service worker lifecycle** — Manifest V3 service workers can be terminated after 30 seconds of inactivity. The Native Messaging connection keeps it alive, but need to handle reconnection if Chrome suspends the worker mid-task.
- **Auto mode permissiveness** — auto mode is available on Max plan. The open question is whether its classifier is too aggressive for our use case — browser MCP tool calls involve file writes (`evaluate_script` writes JS files), shell commands (cliclick, screencapture), and Native Messaging, all of which the classifier might flag as risky. If auto mode blocks too frequently, fall back to `--dangerously-skip-permissions` with network containment as the real safety boundary. Test this early in Phase 1.
- **CAPTCHA strategy** — abort and retry on next scheduled run. If CAPTCHAs become frequent for a specific airline, reduce search frequency for that site.

---

## Principles for Claude Code Implementation

1. **Claude Code builds this project.** Every phase is a Claude Code task.
2. **Adopt existing tool schemas** — mirror Chrome DevTools MCP naming and response formats. Claude already knows these patterns.
3. **ISOLATED world always** — never execute in MAIN world. We trade access to page JS variables for perfect invisibility. For airline award search, we never need page JS state.
4. **Natural language over code for site logic** — TASK.md files are prose, not DSLs.
5. **Test stealth first** — Phase 0 validates the detection profile before anything else is built.
6. **Log everything** — screenshots, tool calls, Claude's reasoning, timing.
7. **Fail gracefully** — unexpected states → clean abort + good logs, not crashes or loops.
8. **Prefer simplicity** — personal tool, not a product. No premature abstraction.
9. **Iterate site-by-site** — get one airline perfect, then replicate.
