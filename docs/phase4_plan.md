# Phase 4: Overnight Orchestration + Alerting

## Goal

Automate the flight search system to run overnight, processing search targets on a schedule, storing results, and alerting when deals are found. This is the "set it and forget it" layer.

## Sub-phases

### 4A: Results Storage

SQLite database for search results, run history, and alert deduplication. Note: `search_results` table already exists from Phase 3D. This sub-phase adds `search_runs` for execution tracking and `alert_history` for deduplication.

**Tables:**
- `search_results` -- Already exists (Phase 3D). Raw JSON blobs per search execution.
- `search_runs` -- Per-invocation metadata. Columns: id, target_id, airline_id, started_at, finished_at, status (success/captcha/login_required/error), result_count, error_message.
- `alert_history` -- Deduplication for sent alerts. Columns: id, result_id, alerted_at, channel.

---

### 4B: Scheduler

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

### 4C: Result Ranking + Alerting

The scrape agent (Phase 3) collects ALL flight results from a search page. Phase 4C ranks them and decides which ones to alert on.

**Two-stage pipeline:**
1. **Ranking**: Score and filter raw results. Configurable per search target with weights for price vs travel time. Filter out unreasonable options (e.g., 30+ hour travel times).
2. **Alerting**: Apply threshold rules to ranked results. Send alerts for deals that meet criteria.

**Ranking config** (added to search target or alerts.json):
```json
{
  "ranking": {
    "maxTravelHours": 24,
    "preferNonstop": true,
    "weights": {
      "price": 0.7,
      "duration": 0.3
    }
  }
}
```

The ranking algo takes raw results, filters by maxTravelHours, scores remaining by weighted combination of price (lower = better) and duration (shorter = better), returns top N.

**Deliverables:**
- `flights/ranking.ts` -- Score and rank raw search results, filter unreasonable travel times
- `flights/alerting.ts` -- Check ranked results against thresholds, send alerts
- `flights/config/alerts.json` -- Alert rules + ranking configuration

**Alert config example:**
```json
{
  "rules": [
    {
      "targetId": "uuid",
      "ranking": {
        "maxTravelHours": 24,
        "preferNonstop": true,
        "weights": { "price": 0.7, "duration": 0.3 }
      },
      "conditions": {
        "maxBusinessPoints": 200000,
        "maxEconomyPoints": 80000
      },
      "channels": ["email"],
      "cooldown": "24h"
    }
  ]
}
```

**Telegram Bot (primary channel).** Free, excellent webhook support, proper security via bot token. Both user and wife install Telegram and message the bot. Bot responds with results, alerts, and accepts natural language commands for managing search targets.

**Email via nodemailer (secondary/optional).** For users who want email alerts instead of or in addition to Telegram.

**Alert content:** Airline, route, date, points/miles required, class, travel time, stops, ranked position.

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

Telegram integration: the bot accepts the same natural language commands via text message. Inbound Telegram message → webhook → `claude -p --permission-mode dontAsk --allowedTools "..."` with locked-down permissions → CLI action → response sent back via Telegram. Only messages from allowlisted Telegram user IDs are processed.

---

## Dependency Order

```
4A (storage) → 4B (scheduler) → 4C (alerting) → 4D (CLI)
```

4A extends the database with run tracking and alert dedup tables. 4B uses the executor from 3D with scheduling logic. 4C reads results and applies ranking + alerting. 4D is the user interface on top of everything.

## Progress Tracker

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| 4A: Results Storage | Not started | search_results exists from 3D, adds search_runs + alert_history |
| 4B: Scheduler | Not started | |
| 4C: Result Ranking + Alerting | Not started | |
| 4D: Natural Language CLI | Not started | Most commands already exist from 3A |

## Open Questions

- **Cost per night**: Each Claude Code invocation costs API credits. With 5 search targets × 3 airlines each = 15 searches per night. Need to estimate per-search cost and set budget limits.
- **Failure recovery**: If a search fails (CAPTCHA, timeout, site down), should the orchestrator retry on the next run or skip? Start with skip + log, retry next night.
- **Result freshness**: How long are search results valid? Airline prices change constantly. Results older than 24h should be considered stale.
- **Scheduling mechanism**: launchd plist vs cron vs node-cron running as a daemon. launchd is most macOS-native.
