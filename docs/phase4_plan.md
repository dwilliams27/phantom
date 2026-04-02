# Phase 4: Overnight Orchestration + Alerting

## Goal

Automate the flight search system to run overnight, processing search targets on a schedule, storing results, and alerting when deals are found. This is the "set it and forget it" layer.

## Sub-phases

### 4A: Scheduler

Cron-based scheduler that processes the search target list overnight.

**Deliverables:**
- `flights/orchestrator.ts` -- Main scheduler loop
- Reads active search targets from SQLite
- For each target, iterates through its airline list
- Calls the search executor (Phase 3D) for each target+airline pair
- Randomized start times within a configurable window (e.g., 12am-5am)
- Random gaps between searches (2-8 minutes)
- Per-airline frequency caps (max 2 sessions per airline per night)
- Configurable nightly cap across all airlines
- Logs every run: start time, end time, target, airline, status, error

**Launch:**
```bash
node flights/dist/orchestrator.js  # runs until all targets processed, then exits
```
Triggered by macOS launchd or cron.

---

### 4B: Results Storage

SQLite database for search results, run history, and alert deduplication.

**Tables:**
- `search_results` -- Timestamped flight availability per route/airline. Columns: id, target_id, airline_id, searched_at, departure_date, flight_number, origin, destination, duration, stops, economy_price, business_price, seats_remaining, raw_json.
- `search_runs` -- Per-invocation metadata. Columns: id, target_id, airline_id, started_at, finished_at, status (success/captcha/login_required/error), result_count, error_message.
- `alert_history` -- Deduplication for sent alerts. Columns: id, result_id, alerted_at, channel.

---

### 4C: Alerting

Threshold-based alerts when interesting flights are found.

**Deliverables:**
- `flights/alerting.ts` -- Check results against thresholds, send alerts
- `flights/config/alerts.json` -- Alert configuration

**Alert config example:**
```json
{
  "rules": [
    {
      "targetId": "uuid",
      "conditions": {
        "maxBusinessPrice": 3000,
        "maxEconomyPrice": 800
      },
      "channels": ["email"],
      "cooldown": "24h"
    }
  ]
}
```

**Email via nodemailer (MVP).** Telegram later.

**Alert content:** Airline, route, date, price, class, booking page URL if available.

**Deduplication:** Don't re-alert the same flight within the cooldown period. Check alert_history table.

---

### 4D: Natural Language CLI

User-facing command for managing search targets.

**Commands:**
```bash
# Add a search target from natural language
phantom-flights add "business class Houston to Honolulu, 3+ months out, week-long trip"

# List active targets
phantom-flights list

# Disable a target
phantom-flights disable <target-id>

# Run one target immediately (for testing)
phantom-flights run <target-id>

# Run all active targets (what the scheduler calls)
phantom-flights run-all
```

The `add` command uses Claude to parse the natural language into a search target JSON, then looks up the airline registry to assign airlines, and saves to SQLite.

---

## Dependency Order

```
4B (storage) → 4A (scheduler) → 4C (alerting) → 4D (CLI)
```

4B provides the database that everything writes to. 4A uses the executor from 3D. 4C reads from 4B. 4D is the user interface on top of everything.

## Progress Tracker

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| 4A: Scheduler | Not started | |
| 4B: Results Storage | Not started | |
| 4C: Alerting | Not started | |
| 4D: Natural Language CLI | Not started | |

## Open Questions

- **Cost per night**: Each Claude Code invocation costs API credits. With 5 search targets × 3 airlines each = 15 searches per night. Need to estimate per-search cost and set budget limits.
- **Failure recovery**: If a search fails (CAPTCHA, timeout, site down), should the orchestrator retry on the next run or skip? Start with skip + log, retry next night.
- **Result freshness**: How long are search results valid? Airline prices change constantly. Results older than 24h should be considered stale.
- **Scheduling mechanism**: launchd plist vs cron vs node-cron running as a daemon. launchd is most macOS-native.
