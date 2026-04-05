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
- **Post-run review agent**: After every search run completes, a separate review agent examines the full chat history of the search agent that just ran. It looks for friction, failures, workarounds, or inefficiencies and considers whether the harness, task definitions, or overall system design should change. If it has actionable ideas, it writes them to `docs/agent_derived_enhancements.md` — a file similar to `enhancements.md` but exclusively for robot-originated suggestions. Each entry must include a summary of the evidence from the run (what happened, what went wrong or was slow, why the proposed change would help). When implementing: also update CLAUDE.md to document the new file and the post-run review step.
- **Live agent thinking view**: Real-time display of agent reasoning and actions as it navigates a site — what it's seeing, what it's deciding, what it's clicking. Must NOT run inside the Phantom-controlled Chrome since that would contaminate the automation environment. Options: (1) separate isolated Chrome instance just for the UI, or (2) thin Electron app that can be positioned alongside the Chrome window on screen. Separate Chrome is simpler; Electron gives tighter window layout control.

## Cloud Deployment (GCP)

Move the entire system to the cloud so it runs without a local Mac.

**Architecture**: Chromium + extension + Xvfb in Docker on Cloud Run Jobs (scale to zero). Claude Code via OAuth token env var. Telegram webhook on a lightweight Cloud Run Service. Next.js frontend on Cloud Run. Firestore or Cloud SQL for storage. Cloud Scheduler triggers overnight runs.

**Trade-offs vs local Mac**:
- (+) No Mac running overnight, accessible from anywhere, shared frontend
- (+) `chrome.tabs.captureVisibleTab()` replaces screencapture (simpler, cross-platform -- worth adopting on Mac too)
- (-) `cliclick` doesn't exist on Linux -- must use `xdotool` on Xvfb. Needs Phase 0-style `isTrusted` validation. If xdotool fails, fallback is `chrome.debugger` which reintroduces CDP
- (-) Datacenter IPs are detectable by anti-bot systems -- residential proxy mandatory ($4-30/month)
- (-) No real GPU -- SwiftShader software rendering changes WebGL fingerprint. Not a bot signal but a different device identity. Stealth audit must be re-run
- (-) Must use Chromium (not branded Chrome) since Chrome 137 removed `--load-extension` from branded builds
- (-) Cost dominated by Claude Max subscription ($100-200/month). Infrastructure only $5-20/month extra

**Blockers before attempting**: Validate xdotool produces `isTrusted: true` in Chromium on Xvfb. Without this the entire input model breaks.

## Overnight Run Reliability

- **Prevent sleep during overnight runs**: macOS cron doesn't fire when laptop is sleeping. Add `caffeinate -s` to the overnight script to keep Mac awake during the run window (kill after completion). Or use `pmset schedule wake` to wake the Mac at 2:55am before the 3am cron.
- **Missed run detection**: If the overnight run didn't fire (laptop was asleep), detect this on next wake and either run immediately or send a Telegram alert: "Last night's run was missed (Mac was asleep)."
- **launchd instead of cron**: macOS launchd supports `StartCalendarInterval` which can run missed jobs when the machine wakes. Consider migrating from cron to a launchd plist.

## Session Management

Three-layer approach to keep airline sessions alive for overnight runs without daily manual re-login.

**Layer 1: Warm-up visit (automatic)**. Before each search, the orchestrator navigates to the airline's account page. Sites with sliding session expiration (most airlines) refresh the session on page load. If still logged in, proceed to search. If not, escalate to Layer 3.

**Layer 2: Session monitor (proactive)**. Lightweight cron job runs a few times during the day (e.g., 10am, 2pm, 6pm). For each onboarded airline, visits the account page and checks if still logged in. If session is expiring or expired, sends Telegram alert: "Turkish Airlines session expired. Log in on your Mac to refresh before tonight's run." Gives the user hours of heads-up, not a 3am surprise.

**Layer 3: LOGIN_REQUIRED escalation (reactive)**. When the overnight agent hits an expired session during a search, it writes LOGIN_REQUIRED and stops that airline. Orchestrator sends immediate Telegram alert with which airline needs re-login. Skips to next airline/target. Retries next night.

**Onboarding step: session inspection**. During airline onboarding, inspect session mechanics with evaluate_script: `document.cookie` to see auth cookie names, expiration times, HttpOnly flags. Check for "remember me" persistent tokens. Document session lifetime in onboarding.md (e.g., "Turkish Airlines: session cookie `TK_SESSION` expires after 24h, sliding expiration on page load, remember-me token lasts 90 days"). This tells the orchestrator whether warm-up visits will work for that airline.

**Implementation**: Add `sessionCheck` field to airline registry with a URL to visit for checking login status (e.g., account page). Add detection patterns to `check_page_status` for each airline's logged-in vs logged-out state. Session monitor is a separate script (`flights/src/session-monitor.ts`) triggered by cron.

## Transfer Bonus Monitoring

- **Credit card transfer promotions**: Scheduled scraping of transfer bonus promotions between credit card points programs (Amex MR, Chase UR, Citi TY, etc.) and airline partners. Catch limited-time deals where points transfer at elevated rates (e.g. 30% bonus Amex→Virgin Atlantic). Alert when a promotion is running that overlaps with airlines/programs relevant to the user's search targets.
- **Bonus-aware result ranking**: Factor active transfer bonuses into flight search result scoring. Flag redemptions that are effectively cheaper due to a live promotion (e.g. "this costs 50k ANA miles, but with the active 30% Amex→ANA bonus you only need ~38.5k MR points").
