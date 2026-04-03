#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_DIR="$HOME/.phantom"
ENV_FILE="$ENV_DIR/.env"
CONFIG_FILE="$REPO_ROOT/flights/config/telegram.json"

echo "============================================"
echo "  Phantom Telegram Bot Setup"
echo "============================================"
echo ""
echo "Step 1: Create a Telegram bot"
echo "  1. Open Telegram and message @BotFather"
echo "  2. Send /newbot"
echo "  3. Choose a name (e.g., 'Phantom Flights')"
echo "  4. Choose a username (e.g., 'phantom_flights_bot')"
echo "  5. Copy the bot token"
echo ""
read -p "Bot token: " BOT_TOKEN
[[ -n "$BOT_TOKEN" ]] || { echo "ERROR: Token cannot be empty"; exit 1; }

echo ""
echo "Step 2: Get your Telegram user ID"
echo "  1. Message @userinfobot on Telegram"
echo "  2. It will reply with your user ID (a number)"
echo ""
read -p "Your user ID: " USER_ID
[[ -n "$USER_ID" ]] || { echo "ERROR: User ID cannot be empty"; exit 1; }

echo ""
echo "Step 3: Additional user IDs (optional)"
echo "  Enter comma-separated IDs for other users (e.g., wife's ID)"
echo "  Press Enter to skip."
echo ""
read -p "Additional IDs: " EXTRA_IDS

# Build the user ID array
IDS="$USER_ID"
if [[ -n "$EXTRA_IDS" ]]; then
  IDS="$IDS,$EXTRA_IDS"
fi
# Convert to JSON array
ID_ARRAY=$(echo "$IDS" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | awk '{printf "%s,", $0}' | sed 's/,$//' | sed 's/\([0-9]*\)/\1/g')
JSON_IDS="[${ID_ARRAY}]"

# Save token
mkdir -p "$ENV_DIR"
if grep -q "PHANTOM_TELEGRAM_TOKEN" "$ENV_FILE" 2>/dev/null; then
  sed -i '' "s|PHANTOM_TELEGRAM_TOKEN=.*|PHANTOM_TELEGRAM_TOKEN=$BOT_TOKEN|" "$ENV_FILE"
else
  echo "PHANTOM_TELEGRAM_TOKEN=$BOT_TOKEN" >> "$ENV_FILE"
fi
echo "Token saved to $ENV_FILE"

# Save config
cat > "$CONFIG_FILE" << EOF
{
  "allowedUserIds": $JSON_IDS,
  "alertChatIds": $JSON_IDS
}
EOF
echo "Config saved to $CONFIG_FILE"

echo ""
echo "============================================"
echo "  Setup Complete"
echo "============================================"
echo ""
echo "To start the bot:"
echo "  source $ENV_FILE"
echo "  cd $REPO_ROOT/flights && npm run telegram"
echo ""
echo "To test: send 'help' to your bot on Telegram"
