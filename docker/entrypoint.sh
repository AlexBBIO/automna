#!/bin/sh
# Automna Entrypoint Script
# 
# Architecture:
#   Caddy (:18789) → /files/* → File Server (:8080)
#                  → /*       → OpenClaw Gateway (:18788)
#
# Components:
#   1. Caddy reverse proxy (main entry point)
#   2. OpenClaw gateway (internal)
#   3. File server (internal)
#   4. Session key fixer (background)

OPENCLAW_DIR="${OPENCLAW_HOME:-/home/node/.openclaw}"
SESSIONS_DIR="$OPENCLAW_DIR/agents/main/sessions"
SESSIONS_FILE="$SESSIONS_DIR/sessions.json"

# Internal ports (Caddy is the only external-facing service)
GATEWAY_INTERNAL_PORT=18788
FILE_SERVER_PORT=8080

# Function to fix session keys (OpenClaw bug workaround) - used for initial one-shot fix
fix_session_keys() {
    [ ! -f "$SESSIONS_FILE" ] && return
    
    if grep -qE '"[^"]+":.*"sessionId"' "$SESSIONS_FILE" 2>/dev/null; then
        node -e "
            const fs = require('fs');
            const file = '$SESSIONS_FILE';
            try {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                let changed = false;
                const fixed = {};
                
                for (const [key, value] of Object.entries(data)) {
                    if (key.startsWith('agent:main:')) {
                        fixed[key] = value;
                        continue;
                    }
                    if (!value.sessionId) continue;
                    
                    const canonicalKey = 'agent:main:' + key;
                    if (!fixed[canonicalKey] || !fixed[canonicalKey].sessionId) {
                        fixed[canonicalKey] = value;
                        changed = true;
                        console.log('[automna] Fixed key: ' + key + ' -> ' + canonicalKey);
                    }
                }
                
                if (changed) {
                    fs.writeFileSync(file, JSON.stringify(fixed, null, 2));
                }
            } catch (e) {}
        " 2>/dev/null
    fi
}

# Background fixer loop - using a single long-running node process instead of
# spawning a new node process every 3 seconds (saves ~30-50MB RAM)
run_fixer() {
    echo "[automna] Starting session key fixer (background)"
    node -e "
        const fs = require('fs');
        const file = '$SESSIONS_FILE';
        
        function fixKeys() {
            try {
                if (!fs.existsSync(file)) return;
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                let changed = false;
                const fixed = {};
                
                for (const [key, value] of Object.entries(data)) {
                    if (key.startsWith('agent:main:')) {
                        fixed[key] = value;
                        continue;
                    }
                    if (!value.sessionId) continue;
                    
                    const canonicalKey = 'agent:main:' + key;
                    if (!fixed[canonicalKey] || !fixed[canonicalKey].sessionId) {
                        fixed[canonicalKey] = value;
                        changed = true;
                        console.log('[automna] Fixed key: ' + key + ' -> ' + canonicalKey);
                    }
                }
                
                if (changed) {
                    fs.writeFileSync(file, JSON.stringify(fixed, null, 2));
                }
            } catch (e) {}
        }
        
        setInterval(fixKeys, 3000);
    " &
}

# Create directories
mkdir -p "$SESSIONS_DIR"
mkdir -p "$OPENCLAW_DIR/workspace"
mkdir -p "$OPENCLAW_DIR/workspace/memory"
mkdir -p "$OPENCLAW_DIR/workspace/uploads"

# Copy default workspace files on first run
if [ -d "/app/default-workspace" ] && [ ! -f "$OPENCLAW_DIR/workspace/.initialized" ]; then
    echo "[automna] Initializing workspace with defaults..."
    cp -rn /app/default-workspace/* "$OPENCLAW_DIR/workspace/" 2>/dev/null || true
    touch "$OPENCLAW_DIR/workspace/.initialized"
    echo "[automna] Workspace initialized"
fi

# Extract gateway token from args first (needed for config)
# Args come in as: gateway --allow-unconfigured --bind lan --auth token --token <TOKEN>
GATEWAY_TOKEN=""
prev_was_token=""
for arg in "$@"; do
    if [ "$prev_was_token" = "1" ]; then
        GATEWAY_TOKEN="$arg"
        break
    fi
    if [ "$arg" = "--token" ]; then
        prev_was_token=1
    fi
done

# Create/migrate config file
CONFIG_FILE="$OPENCLAW_DIR/clawdbot.json"

# Migration: Remove unsupported 'heartbeat' key if present
if [ -f "$CONFIG_FILE" ] && grep -q '"heartbeat"' "$CONFIG_FILE" 2>/dev/null; then
    echo "[automna] Migrating config: removing unsupported 'heartbeat' key..."
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        delete config.heartbeat;
        fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        console.log('[automna] Config migrated successfully');
    " 2>/dev/null || echo "[automna] Warning: Config migration failed"
fi

# Write config with custom 'automna' provider that routes through our proxy
# The built-in 'anthropic' provider ignores ANTHROPIC_BASE_URL, so we must
# configure a custom provider with explicit baseUrl
echo "[automna] Writing config with automna proxy provider..."
cat > "$CONFIG_FILE" << EOFCONFIG
{
  "gateway": {
    "trustedProxies": ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fd00::/8"]
  },
  "models": {
    "providers": {
      "automna": {
        "baseUrl": "https://automna.ai/api/llm",
        "apiKey": "$GATEWAY_TOKEN",
        "api": "anthropic-messages",
        "models": [
          {"id": "claude-opus-4-5", "name": "Claude Opus 4.5"},
          {"id": "claude-sonnet-4", "name": "Claude Sonnet 4"}
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace",
      "model": {
        "primary": "automna/claude-opus-4-5"
      },
      "verboseDefault": "on",
      "userTimezone": "America/Los_Angeles",
      "contextPruning": {
        "mode": "cache-ttl",
        "ttl": "1h"
      },
      "compaction": {
        "mode": "safeguard",
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 80000,
          "prompt": "Summarize this conversation for continuity: current project state, key decisions made, user preferences, and any pending tasks or next steps."
        }
      }
    }
  }
}
EOFCONFIG
echo "[automna] Config created with automna provider (baseUrl: https://automna.ai/api/llm)"

# Migration: Add trustedProxies if missing
if [ -f "$CONFIG_FILE" ] && ! grep -q '"trustedProxies"' "$CONFIG_FILE" 2>/dev/null; then
    echo "[automna] Migrating config: adding trustedProxies..."
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        if (!config.gateway) config.gateway = {};
        if (!config.gateway.trustedProxies) {
            config.gateway.trustedProxies = ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fd00::/8'];
        }
        fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        console.log('[automna] trustedProxies added');
    " 2>/dev/null || echo "[automna] Warning: trustedProxies migration failed"
fi

# Migration: Fix model name to use automna provider with Opus 4.5
if [ -f "$CONFIG_FILE" ] && grep -qE 'anthropic/claude|claude-sonnet-4|claude-3-5-sonnet' "$CONFIG_FILE" 2>/dev/null; then
    echo "[automna] Migrating config: switching to automna provider..."
    sed -i 's|anthropic/claude-opus-4-5|automna/claude-opus-4-5|g; s|anthropic/claude-sonnet-4|automna/claude-opus-4-5|g; s/claude-sonnet-4/claude-opus-4-5/g; s/claude-3-5-sonnet-[0-9]*/claude-opus-4-5/g' "$CONFIG_FILE"
    echo "[automna] Model set to automna/claude-opus-4-5"
fi

# Initial session key fix
echo "[automna] Initial session key check..."
fix_session_keys

# Start background fixer
run_fixer &
FIXER_PID=$!
echo "[automna] Session fixer running (PID: $FIXER_PID)"

# Start file server (internal only)
if [ -f "/app/file-server.cjs" ]; then
    echo "[automna] Starting file server on port $FILE_SERVER_PORT (internal)..."
    FILE_SERVER_PORT=$FILE_SERVER_PORT node /app/file-server.cjs &
    FILE_SERVER_PID=$!
    echo "[automna] File server running (PID: $FILE_SERVER_PID)"
fi

# Start Caddy reverse proxy (main entry point)
echo "[automna] Starting Caddy reverse proxy on port 18789..."
caddy run --config /etc/caddy/Caddyfile &
CADDY_PID=$!
echo "[automna] Caddy running (PID: $CADDY_PID)"

# Wait for Caddy to be ready
sleep 1

echo "[automna] Starting OpenClaw gateway on port $GATEWAY_INTERNAL_PORT (internal)..."

# Route LLM calls through Automna proxy
# The config uses automna provider, but we also set this as fallback for built-in anthropic provider
export ANTHROPIC_BASE_URL="https://automna.ai/api/llm"

# Cap Node.js heap to 1536MB (out of 2048MB total)
# Leaves ~512MB for Caddy, file server, fixer, and OS overhead
# Without this, Node grows unbounded until the OOM killer strikes
export NODE_OPTIONS="--max-old-space-size=1536"

# Start gateway on internal port
# Override the default port by setting environment variable and passing args
exec node /app/dist/entry.js gateway \
    --allow-unconfigured \
    --bind lan \
    --port $GATEWAY_INTERNAL_PORT \
    --auth token \
    --token "$GATEWAY_TOKEN"
