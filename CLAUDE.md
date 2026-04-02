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
- `docs/enhancements.md` -- running wishlist of planned improvements
- `docs/phase1_plan.md` -- Phase 1 sub-phase plan and progress tracker
- `phantom-extension/` -- Chrome extension (background.js, snapshot.js, nm-shim.js, page-status.js)
- `phantom-mcp/` -- MCP server (TypeScript, stdio transport, cliclick/screencapture wrappers)
- `scripts/` -- test harness, setup, e2e test runner (`./scripts/run_harness_test.sh`)
- `.mcp.json` -- Claude Code MCP server configuration

Planned (not yet created): `flights/` (Phase 3 -- flight search application layer, separate from core).

## Two-Layer Architecture

Layer 1 (Phantom Core): `phantom-extension/` + `phantom-mcp/` -- general-purpose stealth browser automation. Knows nothing about flights. Reusable for any web automation task. Layer 2 (Flight Search): `flights/` -- search targets, airline registry, TASK.md per airline, executor, orchestrator, alerting. Built on top of Core via Claude Code + MCP tools. See ADR 005.

## Phases

0: Environment & stealth validation. 1: Extension (NM, snapshot, eval, health). 2: MCP Server (tools, cliclick, screencapture). 3: Flight Search Layer (search targets, airline registry, Turkish onboarding, executor). 4: Overnight Orchestration (scheduler, storage, alerting, natural language CLI). 5: Scale airlines. 6: General-purpose hardening.

## Development Rules

NO FALLBACKS. During development and testing, the system must hard crash on unexpected states. Do not add try/catch safety nets, silent fallbacks, default values that mask failures, or graceful degradation. If something unexpected happens, it must fail loudly and immediately. Do not add any fallback or resilience behavior without explicitly checking with the user and getting approval. This applies to all code until the user specifically approves resilience for production site runs.

Run /simplify before every commit that contains code changes. This is a HARD REQUIREMENT -- do not skip it, do not commit first and simplify later. The flow is always: write code → run e2e tests → /simplify → fix issues → re-test → commit.

After adding any new functionality, you MUST prove it works. The user will not closely read code. Walk through new functionality and generate artifacts (logs, screenshots, output) that demonstrate it works according to spec. Always run real, full integration tests when adding new functionality. If you build a new function for the agent, test it by actually calling that function inside the real environment the agent would use. All tests must mimic actual system operation as closely as possible. No mocks, no stubs, no simulated environments when the real thing is available.

## E2E Test

`./scripts/run_harness_test.sh` runs the full e2e test suite. It launches a clean Phantom Chrome instance, connects via the NM channel, runs all test assertions, reports pass/fail, then kills Chrome and exits. Exit code 0 = all pass, 1 = failures. Add new test assertions to `scripts/test_harness.js` whenever new extension commands are implemented. Run this after every feature addition to catch regressions. For interactive debugging, run `node scripts/test_harness.js --interactive` (requires Phantom Chrome to be running separately).

## Enhancements Wishlist

`docs/enhancements.md` is a running wishlist of planned improvements, ideas, and deferred features. Add new items anytime. Remove items completely when they ship. Not a roadmap -- just a grab bag of things we want to get to eventually.

## Conventions

- Log everything: tool calls, reasoning, timing, screenshots
- Full architecture reference: `repo_foundation.md`
