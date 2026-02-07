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
    echo "2" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace initialized"
fi

# Workspace migrations for existing users
# Each migration checks a version number and applies patches
WORKSPACE_VERSION=$(cat "$OPENCLAW_DIR/workspace/.workspace-version" 2>/dev/null || echo "0")

# Migration 1→2: Add phone call proxy docs
if [ "$WORKSPACE_VERSION" -lt 2 ] 2>/dev/null; then
    echo "[automna] Workspace migration: adding phone call docs..."

    # Patch TOOLS.md - add Voice Calling section if missing
    if [ -f "$OPENCLAW_DIR/workspace/TOOLS.md" ] && ! grep -q "Voice Calling" "$OPENCLAW_DIR/workspace/TOOLS.md" 2>/dev/null; then
        cat >> "$OPENCLAW_DIR/workspace/TOOLS.md" << 'TOOLSEOF'

### Voice Calling (Pro & Business plans)

Make and receive phone calls through your dedicated phone number.
**This feature requires a Pro or Business subscription.** If the user is on Starter, let them know they can upgrade at https://automna.ai/pricing to unlock voice calling.

**⚠️ Do NOT use the built-in voice-call plugin or look for a `call_phone` tool. It is intentionally disabled.**

**Make an outbound call using exec + curl:**
```bash
curl -s -X POST "https://automna.ai/api/user/call" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+12025551234",
    "task": "Call this person and ask about scheduling a meeting for next week.",
    "first_sentence": "Hi! I am calling on behalf of my user to schedule a meeting.",
    "max_duration": 5
  }'
```

**Parameters:**
- `to` (required) - Phone number (E.164 or common formats: +12025551234, (202) 555-1234, 202-555-1234)
- `task` (required) - Instructions for what the AI should accomplish on the call
- `first_sentence` (optional) - Specific opening line when the call connects
- `max_duration` (optional) - Max call length in minutes (default: 5)
- `voice_id` (optional) - Override the default voice
- `voicemail_action` (optional) - What to do on voicemail: "hangup" (default), "leave_message", or "ignore"
- `voicemail_message` (optional) - Message to leave on voicemail

**Response:**
```json
{
  "success": true,
  "call_id": "uuid",
  "from": "+17254339890",
  "to": "+12025551234",
  "status": "initiated",
  "remaining_minutes": 55
}
```

**After making a call, poll for completion:**
```bash
curl -s "https://automna.ai/api/user/call/status?call_id=CALL_ID_HERE" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
```
Poll every 30 seconds until `completed` is `true`. The response includes:
- `status` - "completed", "failed", "no_answer", "voicemail"
- `summary` - AI-generated summary of the call
- `transcript` - Full conversation transcript
- `duration_seconds` - Call length

**After getting the completed status**, save the transcript locally:
```bash
mkdir -p /home/node/.openclaw/workspace/calls
# Write transcript to a dated file
```
Then tell the user what happened (summary, key points from transcript).

**Check usage:**
```bash
curl -s "https://automna.ai/api/user/call/usage" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
```

**Tips:**
- Be specific in the `task` - include names, context, and what success looks like
- The call AI is a separate model, not you. Pack context into the task prompt.
- US numbers only for now
- Always poll for completion after making a call - don't just fire and forget
TOOLSEOF
        echo "[automna] TOOLS.md patched with Voice Calling docs"
    fi

    # Patch AGENTS.md - add phone call section if missing
    if [ -f "$OPENCLAW_DIR/workspace/AGENTS.md" ] && ! grep -q "Phone Calls" "$OPENCLAW_DIR/workspace/AGENTS.md" 2>/dev/null; then
        cat >> "$OPENCLAW_DIR/workspace/AGENTS.md" << 'AGENTSEOF'

## Phone Calls - Voice Calling (Pro & Business)

You can make outbound phone calls through the Automna voice API. **This feature requires a Pro or Business plan** — if the user is on Starter, let them know they can upgrade at https://automna.ai/pricing.

**Do NOT use any built-in voice-call plugin or `call_phone` tool** — use `exec` with `curl` to call the proxy API.

**Make a call:**
```bash
curl -s -X POST "https://automna.ai/api/user/call" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+12025551234",
    "task": "Your instructions for the call AI",
    "first_sentence": "Opening line when call connects",
    "max_duration": 5
  }'
```

**After making a call, you MUST poll for completion:**
```bash
curl -s "https://automna.ai/api/user/call/status?call_id=CALL_ID" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
```
Poll every 30 seconds until `completed` is `true`. Then save the transcript locally and report back to the user.

**Important:** The call is handled by a separate AI model, not you. Pack ALL context into the `task` field — the call AI can't read your conversation history.

See `TOOLS.md` for full documentation and parameters.
AGENTSEOF
        echo "[automna] AGENTS.md patched with Phone Calls docs"
    fi

    echo "2" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 2"
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
  "plugins": {
    "entries": {
      "voice-call": {
        "enabled": false
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

# Migration: Disable built-in voice-call plugin (we use Automna proxy instead)
if [ -f "$CONFIG_FILE" ] && ! grep -q '"voice-call"' "$CONFIG_FILE" 2>/dev/null; then
    echo "[automna] Migrating config: disabling built-in voice-call plugin..."
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        if (!config.plugins) config.plugins = {};
        if (!config.plugins.entries) config.plugins.entries = {};
        if (!config.plugins.entries['voice-call']) {
            config.plugins.entries['voice-call'] = { enabled: false };
        }
        fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        console.log('[automna] voice-call plugin disabled');
    " 2>/dev/null || echo "[automna] Warning: voice-call migration failed"
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
