# Phase 3: Flight Search Layer

## Goal

Build the flight search application on top of Phantom Core. This layer translates natural language search requests into structured search targets, manages airline onboarding, and executes searches against real airline websites using Claude Code + Phantom MCP tools.

## Architecture

```
User: "business class Houston to Honolulu, 3+ months out"
  ↓
CLI (natural language → search target)
  ↓
Search Target (JSON with airports, dates, class, airlines)
  ↓
Executor (resolves dates, picks airline, spawns Claude Code with TASK.md)
  ↓
Phantom Core (MCP server → extension → cliclick → Chrome)
  ↓
Results JSON (flights, prices, dates, availability)
```

All flight-specific code lives in `flights/`. Phantom Core (`phantom-extension/`, `phantom-mcp/`) is untouched.

## Sub-phases

### 3A: Search Target Schema + Storage

Define the search target format and how targets are created, stored, and resolved.

**Search Target Schema:**
```json
{
  "id": "uuid",
  "name": "Houston to Honolulu business",
  "origin": "IAH",
  "destination": "HNL",
  "passengers": 2,
  "class": "business",
  "tripType": "roundtrip",
  "duration": { "min": 6, "max": 8, "unit": "days" },
  "dateSpec": {
    "type": "rolling",
    "earliest": { "offset": 90, "unit": "days" },
    "latest": { "offset": 180, "unit": "days" }
  },
  "airlines": ["turkish_airlines", "united"],
  "active": true,
  "createdAt": "2026-04-02T00:00:00Z"
}
```

**Date spec types:**
- `rolling`: Relative to today. `earliest: {offset: 90, unit: "days"}` means "at least 90 days from now". Shifts forward automatically -- a week from now, the earliest date is 90 days from that day.
- `fixed`: Absolute dates. `start: "2026-06-01", end: "2026-06-30"` means June 2026. Does not shift.

**Date resolution:** At search time, the executor resolves the date spec into concrete date ranges to search. For rolling specs, it computes the actual dates from today's date. For fixed specs, it uses the dates as-is.

**Storage:** SQLite via better-sqlite3. Table: `search_targets` with the JSON schema above.

**Deliverables:**
- `flights/schema.ts` -- Search target types, date spec types, validation
- `flights/db/` -- SQLite schema, migrations, CRUD operations
- `flights/cli.ts` -- Natural language → search target (Claude parses the input via a simple prompt)

---

### 3B: Airline Registry

Database of onboarded airlines, which routes they serve, and their TASK.md locations.

**Registry entry:**
```json
{
  "id": "turkish_airlines",
  "name": "Turkish Airlines",
  "taskPath": "flights/tasks/turkish_airlines/TASK.md",
  "hubs": ["IST"],
  "regions": ["europe", "asia", "americas"],
  "searchUrl": "https://www.turkishairlines.com",
  "capabilities": {
    "oneWay": true,
    "roundTrip": true,
    "multiCity": false,
    "classSelection": true,
    "milesSearch": true
  },
  "status": "onboarded",
  "lastVerified": "2026-04-02"
}
```

**Route matching:** When a search target is created, the system queries the registry to find which onboarded airlines serve the origin→destination route. This could be simple (Turkish serves IAD→BKK because it has hubs in IST and serves both regions) or based on a pre-filled route database.

**For MVP:** Start simple -- manually specify airlines per search target. Route auto-matching comes later.

**Deliverables:**
- `flights/registry.ts` -- Airline registry types, lookup functions
- `flights/config/airlines.json` -- Registry data for onboarded airlines

---

### 3C: Airline Onboarding (Turkish Airlines first)

Write the prose instructions for searching flights on Turkish Airlines. This is the template all future airlines follow.

**Deliverables:**
- `flights/tasks/turkish_airlines/TASK.md` -- Natural language navigation instructions
- `flights/tasks/turkish_airlines/onboarding.md` -- Notes from manual exploration (UI quirks, date picker behavior, etc.)
- `flights/tasks/turkish_airlines/sample_results.json` -- Expected output format

**TASK.md structure:**
```markdown
# Turkish Airlines Flight Search

## Prerequisites
- Navigate to turkishairlines.com
- Dismiss any cookie consent or notification popups

## Search Flow
1. Find the flight search form on the homepage
2. Set trip type (one-way or round-trip as specified)
3. Enter the origin airport code
4. Enter the destination airport code
5. Select departure date
6. Select return date (if round trip)
7. Set passenger count and class
8. Click Search Flights

## Data to Extract
For each flight result:
- Departure time, arrival time, duration
- Number of stops, connection cities
- Flight number(s)
- Economy price, Business price
- Availability notes (seats remaining, waitlisted, etc.)

## Output Format
Write JSON array to the specified output path.

## Safety Rules
- Do NOT click purchase, book, reserve, or checkout buttons
- Do NOT enter payment information
- If CAPTCHA appears, write CAPTCHA_ENCOUNTERED and stop
- If login required, write LOGIN_REQUIRED and stop
```

**Proof:** Run supervised searches with different routes and date ranges. Verify extracted data matches what's shown on screen (cross-reference with screenshots).

---

### 3D: Search Executor

The bridge between search targets and Phantom Core. Takes one search target + one airline, resolves dates, spawns Claude Code with the right context, collects results.

**Deliverables:**
- `flights/executor.ts` -- Core execution logic
- Resolves date specs into concrete search dates
- Constructs the Claude prompt with TASK.md + search parameters
- Spawns `claude -p` with Phantom MCP server configured
- Parses Claude's output into structured results JSON
- Saves results to database

**Execution flow:**
1. Receive search target + airline ID
2. Resolve date spec → concrete date range (e.g., "June 15 - June 22, 2026")
3. Load airline's TASK.md
4. Construct prompt: "Search for flights using these parameters: [origin, destination, dates, passengers, class]. Follow the instructions in TASK.md. Return results as JSON."
5. Spawn Claude Code: `claude -p --permission-mode bypassPermissions --mcp-config .mcp.json "<prompt>"`
6. Parse output, validate against expected schema
7. Store results in SQLite

**Proof:** Execute a search for IAD→BKK on Turkish Airlines via the executor. Verify results match what we got from the manual test.

---

## Directory Structure

```
flights/
  cli.ts                    # Natural language → search target
  schema.ts                 # Search target types + validation
  registry.ts               # Airline registry
  executor.ts               # Search execution (target + airline → results)
  db/
    schema.sql              # SQLite tables
    store.ts                # Database operations
  tasks/
    turkish_airlines/
      TASK.md               # Navigation instructions (prose)
      onboarding.md         # Manual exploration notes
      sample_results.json   # Expected output format
  config/
    airlines.json           # Airline registry data
  results/                  # Search output JSON
```

## Dependency Order

```
3A (schema + storage) → 3B (registry) → 3C (onboarding) → 3D (executor)
```

3A defines the data structures everything else uses. 3B provides airline lookup. 3C provides the site-specific instructions. 3D wires it all together.

## Progress Tracker

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| 3A: Search Target Schema + Storage | Not started | |
| 3B: Airline Registry | Not started | |
| 3C: Airline Onboarding (Turkish) | Not started | Ad-hoc test already working |
| 3D: Search Executor | Not started | |

## Open Questions

- **Route matching complexity**: For MVP, manually specify airlines per search target. Auto-matching (which airlines fly IAH→HNL?) requires either a route database or an API lookup. Defer to Phase 5.
- **Multiple date searches per target**: A rolling date spec covering 90 days might need multiple searches (e.g., search week by week). How granular should the executor be? Start with one search per date range, refine later.
- **Result deduplication**: Same flight might appear across multiple search runs. Handle in Phase 4 (storage layer).
- **Cost management**: Each search costs API credits (Claude inference). Need to be mindful of how many searches per night.
