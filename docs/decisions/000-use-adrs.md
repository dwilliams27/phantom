# ADR 000: Use Architecture Decision Records

## Status
Accepted

## Context
Phantom has many non-obvious architectural choices (ISOLATED world only, no CDP, OS-level input, file-based script injection to bypass CSP). These decisions and their rationale need to be captured so they aren't lost or second-guessed without context.

## Decision
We will use Architecture Decision Records (ADRs) in `docs/decisions/` to capture significant architectural and design decisions. Each ADR is a numbered markdown file (`NNN-title.md`) with Status, Context, Decision, and Consequences sections.

## Consequences
- Decisions are discoverable and searchable
- New decisions reference prior ones when relevant
- Superseded decisions are marked as such, not deleted
