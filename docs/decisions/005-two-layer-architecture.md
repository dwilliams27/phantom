# ADR 005: Two-Layer Architecture (Core + Flight Search)

## Status
Accepted

## Context
Phantom was designed as a general-purpose stealth browser automation framework with airline award search as its first application. As the flight search requirements became clearer (search targets, overnight orchestration, multi-airline routing, alerting), the question arose: should airline logic live inside the core framework or on top of it?

## Decision
Separate the project into two logical layers:

**Layer 1: Phantom Core** (`phantom-extension/`, `phantom-mcp/`) -- General-purpose stealth browser automation. Extension with DOM snapshot, Native Messaging, cliclick/screencapture integration. MCP server exposing tools. Knows nothing about flights, airlines, or search targets. Reusable for any web automation task.

**Layer 2: Flight Search Application** (`flights/`) -- Built on top of Phantom Core. Search targets, airline registry, TASK.md per airline, search executor, overnight orchestrator, results storage, alerting. Uses Phantom Core's MCP tools via Claude Code but doesn't modify them.

The flight search layer lives in `flights/` at the repo root, not inside `phantom-mcp/` or `phantom-extension/`. It invokes Phantom Core by spawning Claude Code with the appropriate MCP configuration and TASK.md context.

## Consequences
- Phantom Core remains general-purpose and extensible to non-flight use cases
- Flight-specific code has a clear home and doesn't pollute the core
- Airline onboarding (TASK.md files) lives under `flights/tasks/`
- The orchestrator is a flight-layer concern, not a core concern
- Future applications (e.g., price monitoring, form filling) can build their own layers on top of the same core
