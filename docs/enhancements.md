# Enhancements Wishlist

Running list of planned improvements, ideas, and deferred features. Remove items when they ship.

## Snapshot Walker

- **Shadow DOM traversal**: Walk into open shadow roots via `element.shadowRoot`. Recurse as subtree, mark shadow content in output.
- **iframe recursion**: Use `chrome.scripting.executeScript` with `allFrames: true`. Stitch sub-frame trees into main tree at iframe positions.
- **CSS ::before/::after content**: Include pseudo-element text in accessible name computation via `getComputedStyle(el, '::before').content`.
- **aria-owns reordering**: Reparent elements based on `aria-owns` to match logical accessibility tree order. Post-processing step after tree construction.
- **Ref stability across snapshots**: Cache refs on DOM elements (WeakMap or expando) so same element keeps same ref number across sequential snapshots.
- **Incremental/diff snapshots**: Return only changed portions of tree to reduce token usage. Compare to previous snapshot, emit `[changed]`/`[unchanged]` markers.

## UI

- **Web dashboard**: Local web UI for managing the flight search system. View search tasks at a glance, add/edit/delete them intuitively. Configure overnight orchestration settings. See scheduled crons with their status and next-run times. Should feel like a simple control panel, not a developer tool.
- **Remote access**: Host UI on fly.dev as a thin frontend that proxies to the local API over a strict, limited set of endpoints. Shared with a small group of people. Auth is a single hardcoded secret (passphrase) — simplest viable approach, no user accounts or OAuth. Security considerations: allowlist of callable functions, no raw eval or shell access exposed.

## Transfer Bonus Monitoring

- **Credit card transfer promotions**: Scheduled scraping of transfer bonus promotions between credit card points programs (Amex MR, Chase UR, Citi TY, etc.) and airline partners. Catch limited-time deals where points transfer at elevated rates (e.g. 30% bonus Amex→Virgin Atlantic). Alert when a promotion is running that overlaps with airlines/programs relevant to the user's search targets.
- **Bonus-aware result ranking**: Factor active transfer bonuses into flight search result scoring. Flag redemptions that are effectively cheaper due to a live promotion (e.g. "this costs 50k ANA miles, but with the active 30% Amex→ANA bonus you only need ~38.5k MR points").
