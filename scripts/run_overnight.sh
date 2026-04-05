#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/.phantom/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/overnight_$(date +%Y%m%d_%H%M%S).log"

# Load env (Telegram token etc)
ENV_FILE="$HOME/.phantom/.env"
if [[ -f "$ENV_FILE" ]]; then
  export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
fi

echo "[$(date)] Overnight run starting" >> "$LOG_FILE"

# Build flights package
cd "$REPO_ROOT/flights"
npm run build --silent >> "$LOG_FILE" 2>&1

# Run orchestrator
node dist/orchestrator.js >> "$LOG_FILE" 2>&1

echo "[$(date)] Overnight run complete" >> "$LOG_FILE"
