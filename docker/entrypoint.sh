#!/bin/sh
# Automna Entrypoint Script
# Fixes OpenClaw session key mismatch, then starts gateway
#
# The bug: OpenClaw stores webchat sessions with key "main"
# but looks them up with canonical key "agent:main:main"
# This script normalizes the keys on every boot.

set -e

OPENCLAW_DIR="${OPENCLAW_HOME:-/home/node/.openclaw}"
SESSIONS_DIR="$OPENCLAW_DIR/agents/main/sessions"
CANONICAL_KEY="agent:main:main"
SESSIONS_FILE="$SESSIONS_DIR/sessions.json"

echo "[automna] Checking session structure..."

# Create directories if they don't exist
mkdir -p "$SESSIONS_DIR/$CANONICAL_KEY"

# If sessions.json doesn't exist, create it with canonical key
if [ ! -f "$SESSIONS_FILE" ]; then
    echo "[automna] Creating sessions.json with canonical key"
    echo "{\"$CANONICAL_KEY\":{}}" > "$SESSIONS_FILE"
fi

# If sessions.json has "main" key but not canonical key, fix it
if grep -q '"main"' "$SESSIONS_FILE" 2>/dev/null && ! grep -q "\"$CANONICAL_KEY\"" "$SESSIONS_FILE" 2>/dev/null; then
    echo "[automna] Fixing session key: main -> $CANONICAL_KEY"
    sed -i "s/\"main\"/\"$CANONICAL_KEY\"/g" "$SESSIONS_FILE"
    
    # Also move the session directory if it exists with wrong name
    if [ -d "$SESSIONS_DIR/main" ] && [ ! -d "$SESSIONS_DIR/$CANONICAL_KEY" ]; then
        echo "[automna] Moving session directory"
        mv "$SESSIONS_DIR/main" "$SESSIONS_DIR/$CANONICAL_KEY"
    fi
fi

# Create empty history file if it doesn't exist
if [ ! -f "$SESSIONS_DIR/$CANONICAL_KEY/history.jsonl" ]; then
    touch "$SESSIONS_DIR/$CANONICAL_KEY/history.jsonl"
fi

echo "[automna] Session structure ready, starting gateway..."

# Execute the original command (gateway with all args passed to this script)
exec node /app/dist/index.js "$@"
