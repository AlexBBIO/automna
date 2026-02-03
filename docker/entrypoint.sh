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

# Function to fix session keys (OpenClaw bug workaround)
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

# Background fixer loop
run_fixer() {
    echo "[automna] Starting session key fixer (background)"
    while true; do
        sleep 3
        fix_session_keys
    done
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

# Create config file if it doesn't exist
CONFIG_FILE="$OPENCLAW_DIR/clawdbot.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "[automna] Creating default config..."
    cat > "$CONFIG_FILE" << 'EOF'
{
  "heartbeat": {
    "enabled": true,
    "intervalMs": 1800000,
    "prompt": "Read HEARTBEAT.md and follow instructions. If nothing needs attention, reply HEARTBEAT_OK."
  },
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace",
      "model": {
        "primary": "anthropic/claude-opus-4-5"
      },
      "userTimezone": "America/Los_Angeles",
      "memorySearch": {
        "enabled": true,
        "sources": ["memory", "sessions"],
        "provider": "gemini",
        "model": "gemini-embedding-001",
        "experimental": {
          "sessionMemory": true
        },
        "store": {
          "vector": {
            "enabled": true
          }
        },
        "sync": {
          "watch": true
        },
        "query": {
          "hybrid": {
            "enabled": true,
            "vectorWeight": 0.7,
            "textWeight": 0.3
          }
        },
        "cache": {
          "enabled": true
        }
      },
      "contextPruning": {
        "mode": "cache-ttl",
        "ttl": "1h"
      },
      "compaction": {
        "mode": "safeguard"
      }
    }
  }
}
EOF
    echo "[automna] Config created"
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

# Extract gateway token from args (we need to pass it to gateway on internal port)
# Args come in as: gateway --allow-unconfigured --bind lan --auth token --token <TOKEN>
# We need to change the port to 18788
GATEWAY_TOKEN=""
for arg in "$@"; do
    if [ "$prev_was_token" = "1" ]; then
        GATEWAY_TOKEN="$arg"
        break
    fi
    if [ "$arg" = "--token" ]; then
        prev_was_token=1
    fi
done

echo "[automna] Starting OpenClaw gateway on port $GATEWAY_INTERNAL_PORT (internal)..."

# Start gateway on internal port
# Override the default port by setting environment variable and passing args
exec node /app/dist/entry.js gateway \
    --allow-unconfigured \
    --bind lan \
    --port $GATEWAY_INTERNAL_PORT \
    --auth token \
    --token "$GATEWAY_TOKEN"
