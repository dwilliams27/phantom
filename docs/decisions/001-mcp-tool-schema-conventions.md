# ADR-001: MCP Tool Schema Conventions Research

**Status**: Research Complete
**Date**: 2026-03-29
**Context**: Phantom wants to mirror existing browser automation MCP tool schemas so Claude already knows the interaction patterns from training data.

---

## Three Reference Servers Analyzed

1. **Chrome DevTools MCP** (`ChromeDevTools/chrome-devtools-mcp`) -- Official Google/Chrome team server. Uses Puppeteer/CDP under the hood. 29 tools. The naming convention Phantom's `repo_foundation.md` already references.

2. **Playwright MCP** (`microsoft/playwright-mcp`, source in `microsoft/playwright`) -- Microsoft's official server. 40+ tools. Uses Playwright's built-in accessibility snapshot (`page.ariaSnapshot({mode: 'ai'})`). Most widely adopted browser MCP server.

3. **Browser Use** (`browser-use/browser-use`) -- Open-source Python agent framework. Not an MCP server itself, but has an MCP client wrapper that consumes Playwright MCP tools. Uses its own DOM serialization format.

---

## 1. Chrome DevTools MCP -- Complete Tool List

### Navigation (6 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `navigate_page` | `url?: string`, `type?: 'url'\|'back'\|'forward'\|'reload'`, `timeout?: number`, `ignoreCache?: boolean`, `handleBeforeUnload?: 'accept'\|'decline'`, `initScript?: string` | Go to a URL, or back, forward, reload |
| `list_pages` | *(none)* | Get list of open pages |
| `select_page` | `pageId: number`, `bringToFront?: boolean` | Select a page as context for future tool calls |
| `close_page` | `pageId: number` | Close page by index |
| `new_page` | `url: string`, `background?: boolean`, `isolatedContext?: string`, `timeout?: number` | Open new tab and load URL |
| `wait_for` | `text: string[]`, `timeout?: number` | Wait for text to appear on page |

### Input (9 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `click` | `uid: string`, `dblClick?: boolean`, `includeSnapshot?: boolean` | Click element by UID from snapshot |
| `click_at` | `x: number`, `y: number`, `dblClick?: boolean`, `includeSnapshot?: boolean` | Click at coordinates (requires computerVision capability) |
| `hover` | `uid: string`, `includeSnapshot?: boolean` | Hover over element |
| `fill` | `uid: string`, `value: string`, `includeSnapshot?: boolean` | Type text into input/textarea or select option from `<select>` |
| `fill_form` | `elements: {uid, value}[]`, `includeSnapshot?: boolean` | Fill multiple form elements at once |
| `type_text` | `text: string`, `submitKey?: string` | Type into currently focused input |
| `press_key` | `key: string`, `includeSnapshot?: boolean` | Press key or combination (e.g., "Enter", "Control+A") |
| `drag` | `from_uid: string`, `to_uid: string`, `includeSnapshot?: boolean` | Drag element onto another |
| `upload_file` | `uid: string`, `filePath: string`, `includeSnapshot?: boolean` | Upload file through element |
| `handle_dialog` | `action: 'accept'\|'dismiss'`, `promptText?: string` | Handle browser dialog |

### Observation (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `take_snapshot` | `verbose?: boolean`, `filePath?: string` | Accessibility tree snapshot with UIDs |
| `take_screenshot` | `filePath?: string`, `format?: 'png'\|'jpeg'\|'webp'`, `quality?: number`, `fullPage?: boolean`, `uid?: string` | Screenshot of page or element |

### Debugging (4 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `evaluate_script` | `function: string`, `args?: any[]` | Evaluate JS function in page context |
| `list_console_messages` | `types?: string[]`, `pageIdx?: number`, `pageSize?: number`, `includePreservedMessages?: boolean` | List console output |
| `get_console_message` | `msgid: number` | Get specific console message |
| `lighthouse_audit` | `device?: 'desktop'\|'mobile'`, `mode?: 'navigation'\|'snapshot'`, `outputDirPath?: string` | Run Lighthouse audit |

### Network (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_network_requests` | `resourceTypes?: string[]`, `pageIdx?: number`, `pageSize?: number`, `includePreservedRequests?: boolean` | List network requests |
| `get_network_request` | `reqid?: number`, `requestFilePath?: string`, `responseFilePath?: string` | Get network request details |

### Emulation (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `emulate` | `viewport?: string`, `userAgent?: string`, `colorScheme?: string`, `networkConditions?: string`, `cpuThrottlingRate?: number`, `geolocation?: string` | Emulate device/network conditions |
| `resize_page` | `width: number`, `height: number` | Resize viewport |

### Performance (4 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `performance_start_trace` | `autoStop?: boolean`, `filePath?: string`, `reload?: boolean` | Start performance trace |
| `performance_stop_trace` | `filePath?: string` | Stop performance trace |
| `performance_analyze_insight` | `insightName: string`, `insightSetId: string` | Analyze trace insight |
| `take_memory_snapshot` | `filePath: string` | Capture memory heapsnapshot |

---

## 2. Playwright MCP -- Complete Tool List

### Core Tools (always available)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_navigate` | `url: string` | Navigate to URL |
| `browser_navigate_back` | *(none)* | Go back in history |
| `browser_navigate_forward` | *(none)* | Go forward (skill-only) |
| `browser_reload` | *(none)* | Reload page (skill-only) |
| `browser_snapshot` | `filename?: string`, `selector?: string`, `depth?: number` | Capture accessibility snapshot |
| `browser_take_screenshot` | `type?: 'png'\|'jpeg'`, `filename?: string`, `element?: string`, `ref?: string`, `selector?: string`, `fullPage?: boolean` | Take screenshot |
| `browser_click` | `element?: string`, `ref: string`, `selector?: string`, `doubleClick?: boolean`, `button?: 'left'\|'right'\|'middle'`, `modifiers?: ('Alt'\|'Control'\|'ControlOrMeta'\|'Meta'\|'Shift')[]` | Click element by ref |
| `browser_hover` | `element?: string`, `ref: string`, `selector?: string` | Hover over element |
| `browser_drag` | `startElement: string`, `startRef: string`, `startSelector?: string`, `endElement: string`, `endRef: string`, `endSelector?: string` | Drag and drop |
| `browser_type` | `element?: string`, `ref: string`, `selector?: string`, `text: string`, `submit?: boolean`, `slowly?: boolean` | Type text into element |
| `browser_select_option` | `element?: string`, `ref: string`, `selector?: string`, `values: string[]` | Select dropdown option |
| `browser_check` | `element?: string`, `ref: string`, `selector?: string` | Check checkbox/radio |
| `browser_uncheck` | `element?: string`, `ref: string`, `selector?: string` | Uncheck checkbox/radio |
| `browser_fill_form` | `fields: {name, type, ref, selector?, value}[]` | Fill multiple form fields |
| `browser_press_key` | `key: string` | Press keyboard key |
| `browser_type` | `element?: string`, `ref: string`, `selector?: string`, `text: string`, `submit?: boolean`, `slowly?: boolean` | Type text into element |
| `browser_file_upload` | `paths?: string[]` | Upload files |
| `browser_handle_dialog` | `accept: boolean`, `promptText?: string` | Handle dialog |
| `browser_tabs` | `action: 'list'\|'new'\|'close'\|'select'`, `index?: number` | Manage tabs |
| `browser_close` | *(none)* | Close page |
| `browser_resize` | `width: number`, `height: number` | Resize viewport |
| `browser_wait_for` | `time?: number`, `text?: string`, `textGone?: string` | Wait for text or time |
| `browser_evaluate` | `function: string`, `element?: string`, `ref?: string`, `selector?: string`, `filename?: string` | Evaluate JavaScript |
| `browser_run_code` | `code: string` | Execute Playwright code snippet |
| `browser_console_messages` | `level: string`, `all?: boolean`, `filename?: string` | Get console messages |
| `browser_network_requests` | `includeStatic: boolean`, `filename?: string` | List network requests |

### Vision Tools (opt-in: `--caps=vision`)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_mouse_click_xy` | `x: number`, `y: number`, `button?: string`, `clickCount?: number`, `delay?: number` | Click at coordinates |
| `browser_mouse_move_xy` | `x: number`, `y: number` | Move mouse |
| `browser_mouse_down` | `button?: 'left'\|'right'\|'middle'` | Press mouse down |
| `browser_mouse_up` | `button?: 'left'\|'right'\|'middle'` | Release mouse |
| `browser_mouse_wheel` | `deltaX?: number`, `deltaY?: number` | Scroll wheel |
| `browser_mouse_drag_xy` | `startX: number`, `startY: number`, `endX: number`, `endY: number` | Drag by coordinates |

---

## 3. Browser Use -- Complete Action List

Browser Use uses a different architecture (Python agent framework, not MCP server) but its action names and element indexing are worth noting.

| Action | Parameters | Description |
|--------|-----------|-------------|
| `click` | `index?: int`, `coordinate_x?: int`, `coordinate_y?: int` | Click by element index or coordinates |
| `input` | `index: int`, `text: str`, `clear?: bool` | Input text into element |
| `navigate` | `url: str`, `new_tab?: bool` | Navigate to URL |
| `go_back` | *(none)* | Browser back |
| `scroll` | `down: bool`, `pages?: float`, `index?: int` | Scroll page or element |
| `send_keys` | `keys: str` | Send keyboard input |
| `search` | `query: str`, `engine?: str` | Search using engine |
| `switch` | `tab_id: str` | Switch tab |
| `close` | `tab_id: str` | Close tab |
| `extract` | `query: str`, various extraction options | Extract structured data from page |
| `search_page` | `pattern: str`, regex/scope options | Search page text (like grep) |
| `find_elements` | `selector: str`, attribute options | Query DOM by CSS selector |
| `find_text` | `text: str` | Scroll to text on page |
| `screenshot` | `file_name?: str` | Take screenshot |
| `evaluate` | `code: str` | Execute JavaScript |
| `wait` | `seconds?: int` | Wait for time |
| `dropdown_options` | `index: int` | Get dropdown options |
| `select_dropdown` | `index: int`, `text: str` | Select dropdown option |
| `upload_file` | `index: int`, `path: str` | Upload file |
| `done` | `text: str`, `success: bool` | Complete task |

---

## 4. Snapshot / Accessibility Tree Output Formats

### Chrome DevTools MCP Format

Uses `uid=ID` prefix with role and name:

```
uid=1_1 root "root"
  uid=1_2 button "button" disableable disabled focusable focused
  uid=1_3 textbox "textbox" value="value"
```

Key formatting rules:
- Each line: `uid=<ID> <role> "<name>" [attributes...]`
- 2-space indentation per depth level
- UIDs are string IDs like `1_1`, `1_2`, `1_3` (derived from backend node IDs)
- Boolean attributes rendered as bare keywords: `disabled`, `checked`, `focused`, `busy`, `atomic`
- Boolean capability mappings: `disabled` also shows `disableable`, `focused` also shows `focusable`, `expanded` also shows `expandable`, `selected` also shows `selectable`
- String attributes: `value="text"`, `live="polite"`, `relevant="additions"`
- Role `none` renders as `ignored`
- Excluded from serialization: `id`, `role`, `name`, `elementHandle`, `children`, `backendNodeId`, `loaderId`
- Attributes sorted alphabetically

### Playwright MCP Format (YAML-based aria snapshot)

Uses `[ref=ID]` inline tags with YAML-style indentation:

```yaml
- generic [active] [ref=e1]:
  - button "Submit" [ref=e2]
  - textbox "Search" [active] [ref=e3]
  - list [ref=e4]:
    - listitem [ref=e5]: Item 1
    - listitem [ref=e6]: Item 2
  - link "Home" [ref=e7] [cursor=pointer]:
    - /url: https://example.com
    - text: Home Page
```

Key formatting rules:
- Each line prefixed with `- ` (YAML list item)
- Format: `- <role> "<name>" [attributes] [ref=<ID>]: <inline_text>`
- Refs are string IDs like `e1`, `e2`, `e3` (for elements), `f1e1`, `f1e2` (for iframe elements -- `f{frameN}e{elementN}`)
- `[active]` marks the currently focused/active element
- `[checked]` for checked checkboxes/radios
- `[cursor=pointer]` for elements with pointer cursor
- Links show `/url:` as a child
- Text content appears either inline after `:` or as `text:` children
- 2-space indentation per depth level
- Incremental snapshots use `<changed>` prefix and `[unchanged]` markers
- `generic` role used for elements without semantic roles (divs, spans)
- Elements without pointer-events get no ref (not clickable)

### Browser Use Format

Uses `[index]<tagname>` with HTML-like notation:

```
[5]<input type="text" placeholder="Search" value="" />
[6]<button class="btn-primary" />
	Submit
[7]<a href="/about" />
	About Us
*[8]<div class="new-element" />
	Newly appeared content
|SCROLL|[9]<div class="scrollable" />
	Scrollable container
```

Key formatting rules:
- Interactive elements: `[backend_node_id]<tag attributes />`
- New elements since last step: `*[backend_node_id]<tag />`
- Scrollable elements: `|SCROLL|[backend_node_id]<tag />`
- Shadow DOM: `|SHADOW(open)|[backend_node_id]<tag />`
- Text nodes rendered as indented plain text
- Tab indentation for depth
- Only visible, interactive elements get numeric indexes
- Indexes are backend node IDs (integers)

---

## 5. Element Reference Systems Compared

| | Chrome DevTools MCP | Playwright MCP | Browser Use |
|---|---|---|---|
| **Ref format** | `uid` (string: `"1_1"`, `"1_2"`) | `ref` (string: `"e1"`, `"e2"`, `"f1e2"`) | `index` (integer: `5`, `6`, `7`) |
| **In snapshot** | `uid=1_1 button "Click"` | `button "Click" [ref=e2]` | `[5]<button />` |
| **In tool call** | `click({uid: "1_1"})` | `browser_click({ref: "e2"})` | `click({index: 5})` |
| **Generation** | Backend node IDs, mapped to MCP IDs | Playwright's aria snapshot engine, prefixed `e` for elements, `f{N}e{N}` for iframes | Backend node IDs from CDP |
| **Stability** | Per-snapshot (regenerated each snapshot) | Per-snapshot (regenerated each snapshot, but stable across incremental snapshots) | Per-snapshot (regenerated each snapshot) |
| **Fallback** | `click_at(x, y)` for coordinate-based | `browser_mouse_click_xy(x, y)` (requires vision cap) | `click(coordinate_x=X, coordinate_y=Y)` |

---

## 6. Response Formats for Key Tools

### Navigation Response

**Chrome DevTools MCP**: Returns text confirmation + optional page list.
```
Content: [{type: "text", text: "Successfully navigated to https://..."}]
```
When `includePages` is set, appends page list. No automatic snapshot.

**Playwright MCP**: Returns text with embedded snapshot + generated code.
```
Content: [{
  type: "text",
  text: "## Result\nNavigated to https://...\n\n## Snapshot\n```yaml\n- generic [active] [ref=e1]:\n  - heading \"Page Title\" [ref=e2]\n```\n\n## Code\nawait page.goto('https://...');"
}]
```
Navigation tools automatically include a snapshot in the response.

### Snapshot Response

**Chrome DevTools MCP**: Returns the tree as text content.
```
Content: [{type: "text", text: "uid=1_1 root \"Page\"\n  uid=1_2 heading \"Title\"\n  uid=1_3 button \"Submit\" ..."}]
```

**Playwright MCP**: Returns YAML snapshot in a code block, optionally saves to file.
```
Content: [{type: "text", text: "## Snapshot\n```yaml\n- heading \"Title\" [ref=e1]\n- button \"Submit\" [ref=e2]\n```"}]
```

### Screenshot Response

Both return base64-encoded PNG as `ImageContent`:
```
Content: [
  {type: "text", text: "Screenshot captured"},
  {type: "image", data: "iVBOR...", mimeType: "image/png"}
]
```
Playwright scales images to fit Claude's vision constraints (max 1.15 megapixels, max 1568px linear dimension).

### Click Response

**Chrome DevTools MCP**:
```
Content: [{type: "text", text: "Successfully clicked on the element"}]
```
With `includeSnapshot: true`, appends the updated snapshot.

**Playwright MCP**:
```
Content: [{type: "text", text: "## Result\nClicked \"Submit button\"\n\n## Snapshot\n```yaml\n- button \"Submit\" [active] [ref=e2]\n```\n\n## Code\nawait page.getByRole('button', { name: 'Submit' }).click();"}]
```
Always includes updated snapshot after click.

### Fill/Type Response

**Chrome DevTools MCP**:
```
Content: [{type: "text", text: "Successfully filled out the element"}]
```

**Playwright MCP**:
```
Content: [{type: "text", text: "## Result\nFilled \"Search\" with \"query text\"\n\n## Snapshot\n...\n\n## Code\nawait page.getByRole('textbox', { name: 'Search' }).fill('query text');"}]
```

---

## 7. Key Design Pattern Differences

### Snapshot-on-every-action (Playwright) vs Snapshot-on-demand (Chrome DevTools)

**Playwright MCP** automatically includes a snapshot after every mutation tool (click, type, navigate). The LLM always sees the updated page state. This reduces round trips.

**Chrome DevTools MCP** requires explicit `includeSnapshot: true` on each tool call, or a separate `take_snapshot()` call. More control but more round trips.

### Tool Naming

**Chrome DevTools MCP**: Short names without prefix: `click`, `fill`, `navigate_page`, `take_snapshot`, `take_screenshot`, `press_key`, `evaluate_script`

**Playwright MCP**: `browser_` prefix on everything: `browser_click`, `browser_snapshot`, `browser_navigate`, `browser_type`, `browser_press_key`, `browser_evaluate`

### Element Targeting

**Chrome DevTools MCP**: Single `uid` parameter.

**Playwright MCP**: Triple parameter pattern: `element` (human-readable description for permission), `ref` (exact reference from snapshot), `selector` (CSS/ARIA fallback). The `ref` is the primary targeting method.

---

## 8. Other Notable Browser MCP Servers

| Server | Notes |
|--------|-------|
| **Charlotte** (`TickTockBent/charlotte`) | Token-efficient structured pages instead of raw accessibility dumps |
| **Camoufox MCP** (`redf0x1/camofox-mcp`) | Anti-detection browser MCP using Camoufox (Firefox-based stealth) |
| **puppeteer-real-browser MCP** (`withLinda/puppeteer-real-browser-mcp-server`) | Detection-resistant using puppeteer-extra-plugin-stealth |

None of these have significant adoption compared to Chrome DevTools MCP and Playwright MCP. They are not worth mirroring.

---

## 9. Recommendations for Phantom

### Which convention to follow

Phantom should follow **Chrome DevTools MCP naming** (without `browser_` prefix) as already specified in `repo_foundation.md`. Rationale:

1. The tool names in `repo_foundation.md` (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `press_key`, `evaluate_script`) already match Chrome DevTools MCP exactly.
2. Chrome DevTools MCP is the Google-official server and Claude has extensive training data on it.
3. The shorter names without prefix are cleaner for a single-purpose MCP server.

### Snapshot format

The `repo_foundation.md` snapshot format (with `[N]` integer refs) is a hybrid that doesn't exactly match either server. Consider aligning with one:

**Option A: Chrome DevTools MCP style** -- `uid=N role "name" attributes`
```
uid=0 banner
  uid=1 link "Home"
  uid=2 button "Login" disabled
uid=3 main
  uid=4 textbox "From" value="IST"
  uid=5 button "Search Flights"
```

**Option B: Playwright MCP YAML style** -- `- role "name" [ref=eN]`
```yaml
- banner [ref=e1]:
  - link "Home" [ref=e2]
  - button "Login" [ref=e3]
- main [ref=e4]:
  - textbox "From" [ref=e5]
  - button "Search Flights" [ref=e6]
```

**Option C: Keep the current `[N]` style from repo_foundation.md**, which is simpler and more token-efficient:
```
RootWebArea "Page Title" url="https://..."
  [0] banner
    [1] link "Home"
    [2] button "Login" (disabled)
  [3] main
    [4] textbox "From" value="IST"
    [5] button "Search Flights"
```

Option C is fine -- Claude understands all three formats from training. The `[N]` integer refs are the most compact and the most intuitive for tool calls (`click({ref: 0})` vs `click({uid: "1_2"})`).

### Key tools to implement (matching Chrome DevTools MCP names)

| Phantom Tool | Chrome DevTools MCP Equivalent | Notes |
|---|---|---|
| `navigate_page` | `navigate_page` | Exact match |
| `go_back` | `navigate_page({type: 'back'})` | Phantom splits into separate tool (simpler) |
| `go_forward` | `navigate_page({type: 'forward'})` | Phantom splits into separate tool (simpler) |
| `list_pages` | `list_pages` | Exact match |
| `select_page` | `select_page` | Exact match |
| `take_snapshot` | `take_snapshot` | Exact match |
| `take_screenshot` | `take_screenshot` | Exact match |
| `click` | `click` | Use `ref` instead of `uid` (Phantom uses integer refs) |
| `click_at` | `click_at` | Exact match (x, y coordinates) |
| `fill` | `fill` | Exact match |
| `type_text` | `type_text` | Exact match |
| `press_key` | `press_key` | Exact match |
| `scroll` | *(no equivalent)* | Phantom-specific. Playwright has `browser_mouse_wheel`. |
| `mouse_move` | *(no equivalent in CDT MCP)* | Playwright has `browser_mouse_move_xy`. |
| `evaluate_script` | `evaluate_script` | Exact match |
| `wait_for` | `wait_for` | Exact match |
| `check_page_status` | *(no equivalent)* | Phantom-specific health check |
| `select_option` | `fill` (handles selects) | CDT MCP uses `fill` for selects too |
| `get_element_rect` | *(no equivalent)* | Phantom-specific for coordinate resolution |
