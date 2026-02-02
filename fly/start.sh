#!/bin/bash
# Automna Gateway startup script for Fly.io

set -e

CONFIG_DIR="/root/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
WORKSPACE_DIR="/root/clawd"
DATA_DIR="/data"

echo "[startup] Starting Automna Gateway..."

# Restore from persistent volume if available
if [ -d "$DATA_DIR/config" ] && [ -f "$DATA_DIR/config/openclaw.json" ]; then
    echo "[startup] Restoring config from volume..."
    cp -a "$DATA_DIR/config/." "$CONFIG_DIR/"
fi

if [ -d "$DATA_DIR/workspace" ]; then
    echo "[startup] Restoring workspace from volume..."
    cp -a "$DATA_DIR/workspace/." "$WORKSPACE_DIR/"
fi

# Always recreate config from template to ensure clean state
echo "[startup] Creating config from template..."
mkdir -p "$CONFIG_DIR"
if [ -f "$CONFIG_FILE" ]; then
    echo "[startup] Removing old config..."
    rm -f "$CONFIG_FILE"
fi
if true; then
    
    if [ -f "$CONFIG_DIR/openclaw.json.template" ]; then
        cp "$CONFIG_DIR/openclaw.json.template" "$CONFIG_FILE"
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

const configPath = '/root/.openclaw/openclaw.json';
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

// Use token auth
if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.gateway.auth = {
        mode: 'token',
        token: process.env.OPENCLAW_GATEWAY_TOKEN
    };
    console.log('Gateway token configured');
}

// Auto-pair webchat client by creating a pre-approved device entry
const devicesDir = '/root/.openclaw/devices';
const pairedPath = devicesDir + '/paired.json';
const webchatDeviceId = 'webchat-automna';

// Ensure devices directory exists
const fss = require('fs');
if (!fss.existsSync(devicesDir)) {
    fss.mkdirSync(devicesDir, { recursive: true });
}

// Create or update paired devices with webchat pre-approved
let paired = {};
if (fss.existsSync(pairedPath)) {
    try { paired = JSON.parse(fss.readFileSync(pairedPath, 'utf8')); } catch (e) {}
}

// Add webchat as a pre-paired device
paired[webchatDeviceId] = {
    deviceId: webchatDeviceId,
    name: 'Automna WebChat',
    platform: 'web',
    role: 'operator',
    pairedAt: Date.now(),
    token: process.env.OPENCLAW_GATEWAY_TOKEN || 'webchat'
};

fss.writeFileSync(pairedPath, JSON.stringify(paired, null, 2));
console.log('Webchat device pre-paired');

// Allow insecure auth for web chat (no device pairing required)
config.gateway.controlUi = config.gateway.controlUi || {};
config.gateway.controlUi.allowInsecureAuth = true;

// Trust Fly proxy for proper client detection
config.gateway.trustedProxies = ['172.16.0.0/12', '10.0.0.0/8'];

// Write updated config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Config updated successfully');
EOFNODE

# Initialize workspace if needed
if [ ! -f "$WORKSPACE_DIR/AGENTS.md" ]; then
    echo "[startup] Initializing workspace..."
    cd "$WORKSPACE_DIR"
    openclaw setup --non-interactive 2>/dev/null || true
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

# Export Anthropic API key for OpenClaw
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

# Start the gateway
echo "[startup] Starting OpenClaw gateway..."
exec openclaw gateway
