# Phase 2: Phantom MCP Server

## Goal

Build the MCP server that sits between Claude Code and the Phantom Extension. Claude Code calls tools via stdio (MCP JSON-RPC), the server routes them to the extension (via unix socket), cliclick (OS-level input), or screencapture (window capture), then returns results. After Phase 2, Claude Code can drive Chrome through natural tool calls.

## Sub-phases

### 2A: MCP Server Scaffold + Extension Client

Build the TypeScript MCP server skeleton with stdio transport and the unix socket client that talks to the extension through the NM shim.

**Deliverables:**
- `phantom-mcp/` directory with `package.json`, `tsconfig.json`
- `phantom-mcp/src/index.ts` -- MCP server using `@modelcontextprotocol/sdk`, stdio transport
- `phantom-mcp/src/extension-client.ts` -- unix socket client for `/tmp/phantom.sock`, NDJSON protocol, request/response correlation with Promise-based `sendCommand()`, connection management
- Register `ping` tool to prove the full round-trip: Claude Code → MCP → socket → shim → extension → shim → socket → MCP → Claude Code
- `.mcp.json` at project root for Claude Code configuration

**Proof:** Configure Claude Code to use the MCP server. Call `ping` tool from Claude Code. Verify pong response.

**Key details:**
- `@modelcontextprotocol/sdk` (v1.29.0) + `zod` as dependencies
- `"type": "module"` in package.json, ESM imports
- `server.registerTool()` API (not deprecated `server.tool()`)
- All logging to stderr (`console.error`), never stdout (stdout is MCP transport)
- `inputSchema` is plain object with zod values, NOT `z.object()`
- Handler returns `{content: [{type: 'text', text: '...'}]}` or `{content: [...], isError: true}`

---

### 2B: Navigation + Observation Tools

Wire up all tools that delegate purely to the extension (no cliclick/screencapture).

**Deliverables:**
- `navigate_page(url)` -- sends to extension, waits for response
- `go_back()`, `go_forward()` -- sends to extension
- `list_pages()` -- sends to extension, returns tab list
- `select_page(tabId)` -- sends to extension
- `take_snapshot()` -- sends to extension, returns tree text + refCount
- `get_element_rect(ref)` -- sends to extension, returns coordinates
- `evaluate_script(js)` -- writes file to eval/ dir, sends scriptPath to extension, returns result, cleans up file
- `wait_for(selector?, text?, timeout?)` -- sends to extension
- `check_page_status()` -- sends to extension

**Proof:** From Claude Code: navigate to example.com, take_snapshot, verify the tree is readable. Evaluate a script that returns document.title. Check page status.

---

### 2C: cliclick Integration (Interaction Tools)

Wire up tools that use cliclick for OS-level input simulation.

**Deliverables:**
- `phantom-mcp/src/cliclick.ts` -- subprocess wrapper, coordinate handling, key name mapping
- `click(ref)` -- get_element_rect from extension → cliclick `c:X,Y` at screen coords
- `click_at(x, y)` -- cliclick directly at given coords
- `mouse_move(x, y)` -- cliclick `m:X,Y` with easing
- `fill(ref, value)` -- click to focus → Cmd+A → type value
- `type_text(text)` -- cliclick `t:TEXT`
- `press_key(key)` -- cliclick `kp:KEY`, with modifier combo support (`kd:cmd t:a ku:cmd`)
- `scroll(direction, amount?)` -- cliclick `kp:page-down` / `kp:page-up` repeated

**Proof:** From Claude Code: navigate to example.com, take_snapshot, click a link by ref. Verify the page navigated (take_snapshot again, see new page content).

**Key details:**
- cliclick uses logical points (same as CSS pixels), no Retina scaling needed
- Extension's `get_element_rect` already returns `screenX`/`screenY` in logical points
- `fill` is a three-step sequence: click (focus), Cmd+A (select all), type (replace)
- For long text, type in chunks with variable delays for natural behavior
- `execSync` for subprocess calls (synchronous is fine, each click is a single fast operation)

---

### 2D: screencapture Integration (take_screenshot)

Wire up the screenshot tool.

**Deliverables:**
- `phantom-mcp/src/screencapture.ts` -- window ID resolution + capture subprocess
- `take_screenshot()` -- find Chrome window ID via Swift CGWindowListCopyWindowInfo, invoke `screencapture -x -o -l <windowID>`, read PNG, return as base64 image content

**Proof:** E2e test calls take_screenshot, verifies response has base64 image data, decodes and writes PNG to `tmp/` (gitignored) for manual inspection. Also verify file is a valid PNG (check magic bytes). Claude's description of the image is not sufficient proof on its own -- the dumped file is the ground truth.

**Key details:**
- Window ID lookup via Swift one-liner (proven in Phase 0): `swift -e 'import Cocoa; ...'`
- `screencapture -x -o -l <windowID> /tmp/phantom_shot.png` -- `-x` no sound, `-o` no shadow
- Return format: `{content: [{type: 'image', data: base64, mimeType: 'image/png'}]}`
- Delete temp PNG after reading

---

### 2E: End-to-End Integration Test

Full pipeline test proving Claude Code can drive Chrome autonomously.

**Deliverables:**
- Update e2e test to cover the full MCP → extension → cliclick pipeline
- Test scenario: Claude Code navigates to example.com → takes snapshot → clicks a link → takes snapshot of new page → verifies navigation succeeded
- Document how to configure Claude Code with the Phantom MCP server

**Proof:** Claude Code successfully completes a multi-step browsing task using only MCP tool calls.

---

## Dependency Order

```
2A (scaffold + extension client) → 2B (navigation + observation) → 2C (cliclick) → 2D (screencapture) → 2E (integration)
```

2B depends on 2A (needs the extension client). 2C and 2D are independent of each other but both depend on 2A. 2E depends on all of them.

## Progress Tracker

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| 2A: MCP Server Scaffold + Extension Client | Not started | |
| 2B: Navigation + Observation Tools | Not started | |
| 2C: cliclick Integration | Not started | |
| 2D: screencapture Integration | Not started | |
| 2E: End-to-End Integration Test | Not started | |

## Tool Registration Summary

All 19 tools with their input schemas:

| Tool | Params | Implementation |
|------|--------|----------------|
| `navigate_page` | `{url: string}` | Extension |
| `go_back` | `{}` | Extension |
| `go_forward` | `{}` | Extension |
| `list_pages` | `{}` | Extension |
| `select_page` | `{tabId: number}` | Extension |
| `take_snapshot` | `{}` | Extension (snapshot.js) |
| `take_screenshot` | `{}` | screencapture subprocess |
| `get_element_rect` | `{ref: number}` | Extension (globalThis.__phantom_refs) |
| `click` | `{ref: number}` | Extension (coords) → cliclick |
| `click_at` | `{x: number, y: number}` | cliclick directly |
| `mouse_move` | `{x: number, y: number}` | cliclick with easing |
| `fill` | `{ref: number, value: string}` | Extension (coords) → cliclick sequence |
| `select_option` | `{ref: number, value: string}` | Composed: click → snapshot → click option |
| `scroll` | `{direction: 'up'\|'down', amount?: number}` | cliclick key simulation |
| `press_key` | `{key: string}` | cliclick `kp:KEY` |
| `type_text` | `{text: string}` | cliclick `t:TEXT` |
| `evaluate_script` | `{js: string}` | File write → extension inject |
| `wait_for` | `{selector?: string, text?: string, timeout?: number}` | Extension (polls) |
| `check_page_status` | `{}` | Extension (page-status.js) |

## MCP Response Format Conventions

**Text result:** `{content: [{type: 'text', text: '...'}]}`
**Image result:** `{content: [{type: 'image', data: base64, mimeType: 'image/png'}]}`
**Error result:** `{content: [{type: 'text', text: 'Error: ...'}], isError: true}`
**Structured data:** Serialize as JSON string in text content

## Open Questions

- **select_option**: Composed from primitives (click to open, snapshot, click option). Complex to implement robustly. May defer to Phase 3 when testing on real airline dropdowns.
- **mouse_move easing amount**: What `-e` value for cliclick? Start with `-e 20` (gentle), tune later.
- **Screenshot size for Claude's vision**: Full Retina screenshots may be very large. Consider resizing before base64 encoding if token limits become an issue.
