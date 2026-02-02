#!/bin/bash
# init-session.sh - Initialize OpenClaw session with correct key structure
#
# This script fixes the session key mismatch bug in OpenClaw where:
# - Sessions created via webchat are stored with key "main"
# - chat.history looks up with canonical key "agent:main:main"
#
# By pre-creating the session structure with the canonical key,
# we ensure history loading works correctly from the first message.

set -e

OPENCLAW_DIR="${OPENCLAW_HOME:-/home/node/.openclaw}"
SESSIONS_DIR="$OPENCLAW_DIR/agents/main/sessions"
CANONICAL_KEY="agent:main:main"
SESSIONS_FILE="$SESSIONS_DIR/sessions.json"
HISTORY_DIR="$SESSIONS_DIR/$CANONICAL_KEY"

echo "[init-session] Checking session structure..."

# Create directories if they don't exist
mkdir -p "$SESSIONS_DIR"
mkdir -p "$HISTORY_DIR"

# Check if sessions.json exists
if [ -f "$SESSIONS_FILE" ]; then
    echo "[init-session] sessions.json exists, checking keys..."
    
    # Check if it has the wrong key ("main" instead of canonical)
    if grep -q '"main"' "$SESSIONS_FILE" && ! grep -q '"agent:main:main"' "$SESSIONS_FILE"; then
        echo "[init-session] Found session with key 'main', renaming to canonical key..."
        
        # Backup original
        cp "$SESSIONS_FILE" "$SESSIONS_FILE.bak"
        
        # Rename key from "main" to "agent:main:main"
        sed -i 's/"main"/"agent:main:main"/g' "$SESSIONS_FILE"
        
        # Also rename the session directory if it exists
        if [ -d "$SESSIONS_DIR/main" ] && [ ! -d "$HISTORY_DIR" ]; then
            echo "[init-session] Renaming session directory..."
            mv "$SESSIONS_DIR/main" "$HISTORY_DIR"
        fi
        
        echo "[init-session] Session key fixed!"
    else
        echo "[init-session] Session keys look correct"
    fi
else
    echo "[init-session] No sessions.json yet, creating with canonical key..."
    
    # Create empty sessions.json with canonical key
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    cat > "$SESSIONS_FILE" << EOF
{
  "$CANONICAL_KEY": {
    "created": "$TIMESTAMP",
    "lastActive": "$TIMESTAMP",
    "messageCount": 0
  }
}
EOF
    
    # Create empty history file
    touch "$HISTORY_DIR/history.jsonl"
    
    echo "[init-session] Session structure initialized!"
fi

# Ensure correct ownership (node user in Docker)
if [ "$(id -u)" = "0" ]; then
    chown -R node:node "$OPENCLAW_DIR" 2>/dev/null || true
fi

echo "[init-session] Done"
