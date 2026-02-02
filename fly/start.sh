#!/bin/bash
# Automna Gateway startup script for Fly.io

set -e

CONFIG_DIR="/root/.clawdbot"
CONFIG_FILE="$CONFIG_DIR/clawdbot.json"
WORKSPACE_DIR="/root/clawd"
DATA_DIR="/data"

echo "[startup] Starting Automna Gateway..."

# Restore from persistent volume if available
if [ -d "$DATA_DIR/config" ] && [ -f "$DATA_DIR/config/clawdbot.json" ]; then
    echo "[startup] Restoring config from volume..."
    cp -a "$DATA_DIR/config/." "$CONFIG_DIR/"
fi

if [ -d "$DATA_DIR/workspace" ]; then
    echo "[startup] Restoring workspace from volume..."
    cp -a "$DATA_DIR/workspace/." "$WORKSPACE_DIR/"
fi

# Create config from template if needed
if [ ! -f "$CONFIG_FILE" ]; then
    echo "[startup] Creating config from template..."
    mkdir -p "$CONFIG_DIR"
    
    if [ -f "$CONFIG_DIR/clawdbot.json.template" ]; then
        cp "$CONFIG_DIR/clawdbot.json.template" "$CONFIG_FILE"
    else
        # Create minimal config
        cat > "$CONFIG_FILE" << 'EOFCONFIG'
{
  "agents": {
    "defaults": {
      "workspace": "/root/clawd"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "auth": {
      "mode": "token"
    }
  }
}
EOFCONFIG
    fi
fi

# Update config with environment variables using Node
echo "[startup] Updating config from environment..."
node << 'EOFNODE'
const fs = require('fs');

const configPath = '/root/.clawdbot/clawdbot.json';
console.log('Updating config at:', configPath);
let config = {};

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.log('Starting with empty config');
}

// Ensure nested objects exist
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.gateway = config.gateway || {};

// Gateway configuration
config.gateway.port = 18789;
config.gateway.mode = 'local';
config.gateway.bind = 'lan';

// Set gateway token if provided
if (process.env.MOLTBOT_GATEWAY_TOKEN) {
    config.gateway.auth = config.gateway.auth || {};
    config.gateway.auth.mode = 'token';
    config.gateway.auth.token = process.env.MOLTBOT_GATEWAY_TOKEN;
    console.log('Gateway token configured');
}

// Allow insecure auth for web chat
config.gateway.controlUi = config.gateway.controlUi || {};
config.gateway.controlUi.allowInsecureAuth = true;

// Write updated config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Config updated successfully');
EOFNODE

# Initialize workspace if needed
if [ ! -f "$WORKSPACE_DIR/AGENTS.md" ]; then
    echo "[startup] Initializing workspace..."
    cd "$WORKSPACE_DIR"
    clawdbot setup --non-interactive 2>/dev/null || true
fi

# Start background sync to persistent volume
(
    while true; do
        sleep 300  # Sync every 5 minutes
        echo "[sync] Syncing to persistent volume..."
        mkdir -p "$DATA_DIR/config" "$DATA_DIR/workspace"
        rsync -a --delete "$CONFIG_DIR/" "$DATA_DIR/config/" 2>/dev/null || true
        rsync -a --delete "$WORKSPACE_DIR/" "$DATA_DIR/workspace/" 2>/dev/null || true
    done
) &

# Export Anthropic API key for Clawdbot
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

# Start the gateway
echo "[startup] Starting Clawdbot gateway..."
exec clawdbot gateway
