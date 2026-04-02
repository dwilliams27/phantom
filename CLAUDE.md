# Phantom

Stealth browser automation framework. Controls Chrome through three invisible channels instead of CDP. No WebSocket, no remote debugging, nothing for page-side JS to detect.

First application: airline award search (low-points business class flights). Framework is site-agnostic.

## Architecture

Claude Code -> stdio -> Phantom MCP Server (TypeScript/Node.js) -> Native Messaging -> Phantom Extension (Manifest V3 background service worker, ISOLATED world DOM access). MCP server also directly invokes cliclick (OS-level mouse/keyboard via CGEventPost, isTrusted=true) and screencapture (OS-level window capture by CGWindowID). Dynamic script injection via fs.writeFile to extension directory + chrome.scripting.executeScript files param (bypasses CSP eval restriction). Storage: SQLite via better-sqlite3. Scheduling: node-cron.

## Hard Rules

- NEVER click purchase/buy/reserve/book/checkout buttons
- NEVER enter payment information
- NEVER navigate to domains not in config/network_allowlist.txt
- On CAPTCHA: write CAPTCHA_ENCOUNTERED to results, stop
- If unsure whether action is a purchase action: do NOT click
- On expired login: write LOGIN_REQUIRED, stop. Do not re-enter credentials.

## Design Constraints

- ISOLATED world only. Never MAIN world. No access to page JS variables; total invisibility.
- No CDP, no remote debugging port, no automation flags on Chrome launch.
- Extension: no web_accessible_resources, no content_scripts in manifest.
- MCP tool names/response formats follow Chrome DevTools MCP conventions.
- Site logic lives in tasks/{airline}/TASK.md as prose, not code/DSLs.

## Project Structure

- `repo_foundation.md` -- full architecture, tool surface, stealth profile, phase details
- `docs/decisions/NNN-title.md` -- ADRs
- `phantom-extension/` -- Chrome extension
- `phantom-mcp/` -- MCP server
- `tasks/{airline}/TASK.md` -- per-site prose instructions
- `config/` -- routes.json, alerts.json, network_allowlist.txt
- `results/` -- search output JSON
- `screenshots/` -- debug captures
- `scripts/` -- orchestrator, setup

## Phases

0: Environment & stealth validation (Chrome profile, cliclick isTrusted verify, screencapture, network restrictions, bot detection sites). 1: Extension (Native Messaging, DOM snapshot walker, element refs, tab mgmt). 2: MCP Server (stdio transport, Native Messaging client, cliclick/screencapture wrappers, tool registration). 3: First airline (Turkish Airlines). 4: Orchestrator & alerting. 5: Scale airlines. 6: General-purpose hardening.

## Development Rules

NO FALLBACKS. During development and testing, the system must hard crash on unexpected states. Do not add try/catch safety nets, silent fallbacks, default values that mask failures, or graceful degradation. If something unexpected happens, it must fail loudly and immediately. Do not add any fallback or resilience behavior without explicitly checking with the user and getting approval. This applies to all code until the user specifically approves resilience for production site runs.

Run /simplify before every commit that contains code changes.

After adding any new functionality, you MUST prove it works. The user will not closely read code. Walk through new functionality and generate artifacts (logs, screenshots, output) that demonstrate it works according to spec. Always run real, full integration tests when adding new functionality. If you build a new function for the agent, test it by actually calling that function inside the real environment the agent would use. All tests must mimic actual system operation as closely as possible. No mocks, no stubs, no simulated environments when the real thing is available.

## E2E Test

`./scripts/run_harness_test.sh` runs the full e2e test suite. It launches a clean Phantom Chrome instance, connects via the NM channel, runs all test assertions, reports pass/fail, then kills Chrome and exits. Exit code 0 = all pass, 1 = failures. Add new test assertions to `scripts/test_harness.js` whenever new extension commands are implemented. Run this after every feature addition to catch regressions. For interactive debugging, run `node scripts/test_harness.js --interactive` (requires Phantom Chrome to be running separately).

## Enhancements Wishlist

`docs/enhancements.md` is a running wishlist of planned improvements, ideas, and deferred features. Add new items anytime. Remove items completely when they ship. Not a roadmap -- just a grab bag of things we want to get to eventually.

## Conventions

- Log everything: tool calls, reasoning, timing, screenshots
- Full architecture reference: `repo_foundation.md`
