#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTENSION_DIR="$REPO_ROOT/phantom-extension"
NM_SHIM="$EXTENSION_DIR/nm-shim.js"
NM_LAUNCHER="$EXTENSION_DIR/nm-shim-launch.sh"
PHANTOM_PROFILE="$HOME/.phantom-chrome-profile"
NM_HOST_DIR_DEFAULT="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
NM_HOST_DIR_PROFILE="$PHANTOM_PROFILE/NativeMessagingHosts"

echo "============================================"
echo "  Phantom Phase 1A: Extension Setup"
echo "============================================"
echo ""

[[ -f "$NM_SHIM" ]] || { echo "ERROR: nm-shim.js not found at $NM_SHIM"; exit 1; }
[[ -f "$EXTENSION_DIR/manifest.json" ]] || { echo "ERROR: manifest.json not found"; exit 1; }
[[ -f "$EXTENSION_DIR/background.js" ]] || { echo "ERROR: background.js not found"; exit 1; }

# Detect absolute node path (resolves nvm/volta symlinks)
NODE_PATH="$(which node)"
[[ -n "$NODE_PATH" ]] || { echo "ERROR: node not found in PATH"; exit 1; }
NODE_PATH="$(python3 -c "import os; print(os.path.realpath('$NODE_PATH'))")"
echo "Node binary: $NODE_PATH"
"$NODE_PATH" --version

# Generate launcher wrapper (gitignored, machine-specific)
cat > "$NM_LAUNCHER" << EOF
#!/bin/bash
exec "$NODE_PATH" "$NM_SHIM"
EOF
chmod +x "$NM_LAUNCHER"
chmod +x "$NM_SHIM"
echo "Generated launcher: $NM_LAUNCHER"

echo ""
echo "Load the extension in Chrome:"
echo "  1. Open chrome://extensions"
echo "  2. Enable Developer mode (toggle in top right)"
echo "  3. Click 'Load unpacked' and select: $EXTENSION_DIR"
echo "  4. Copy the Extension ID shown under the extension name"
echo ""
read -p "Extension ID: " EXTENSION_ID

[[ -n "$EXTENSION_ID" ]] || { echo "ERROR: Extension ID cannot be empty"; exit 1; }
if [[ ! "$EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
  echo "WARNING: Extension ID doesn't look standard (expected 32 lowercase letters)"
  read -p "Continue anyway? [y/N] " confirm
  [[ "$confirm" == "y" || "$confirm" == "Y" ]] || exit 1
fi

NM_MANIFEST_CONTENT=$(cat << EOF
{
  "name": "com.phantom.mcp",
  "description": "Phantom MCP bridge",
  "path": "$NM_LAUNCHER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF
)

# Install to both default Chrome and Phantom profile (custom --user-data-dir needs its own copy)
for dir in "$NM_HOST_DIR_DEFAULT" "$NM_HOST_DIR_PROFILE"; do
  mkdir -p "$dir"
  echo "$NM_MANIFEST_CONTENT" > "$dir/com.phantom.mcp.json"
  echo "Installed: $dir/com.phantom.mcp.json"
done
echo ""
echo ""
echo "Next steps:"
echo "  1. Start the test harness:  node $REPO_ROOT/scripts/test_harness.js"
echo "  2. Reload the extension in Chrome (chrome://extensions)"
echo "  3. Watch for round-trip messages in the harness output"
