#!/bin/sh
# Automna Entrypoint Script
# Fixes OpenClaw session key mismatch with background monitor
#
# The bug: OpenClaw stores webchat sessions with key "main", "work", etc.
# but looks them up with canonical key "agent:main:main", "agent:main:work", etc.
# This script runs a background fixer that monitors and corrects keys.

OPENCLAW_DIR="${OPENCLAW_HOME:-/home/node/.openclaw}"
SESSIONS_DIR="$OPENCLAW_DIR/agents/main/sessions"
SESSIONS_FILE="$SESSIONS_DIR/sessions.json"

# Function to fix session keys
fix_session_keys() {
    [ ! -f "$SESSIONS_FILE" ] && return
    
    # Check if any non-canonical keys exist (keys without "agent:main:" prefix that have data)
    # We look for keys like "main", "work" etc. that should be "agent:main:main", "agent:main:work"
    if grep -qE '"[^"]+":.*"sessionId"' "$SESSIONS_FILE" 2>/dev/null; then
        # Use node to properly fix the JSON (more reliable than sed for complex JSON)
        node -e "
            const fs = require('fs');
            const file = '$SESSIONS_FILE';
            try {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                let changed = false;
                const fixed = {};
                
                for (const [key, value] of Object.entries(data)) {
                    // Skip already canonical keys
                    if (key.startsWith('agent:main:')) {
                        fixed[key] = value;
                        continue;
                    }
                    
                    // Skip empty sessions (our pre-created ones)
                    if (!value.sessionId) {
                        continue;
                    }
                    
                    // Convert to canonical form
                    const canonicalKey = 'agent:main:' + key;
                    
                    // Only fix if canonical key doesn't already exist with data
                    if (!fixed[canonicalKey] || !fixed[canonicalKey].sessionId) {
                        fixed[canonicalKey] = value;
                        changed = true;
                        console.log('[automna] Fixed key: ' + key + ' -> ' + canonicalKey);
                    }
                }
                
                if (changed) {
                    fs.writeFileSync(file, JSON.stringify(fixed, null, 2));
                }
            } catch (e) {
                // Ignore errors (file might be being written)
            }
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

# Initial fix
echo "[automna] Initial session key check..."
fix_session_keys

# Start background fixer
run_fixer &
FIXER_PID=$!

echo "[automna] Session fixer running (PID: $FIXER_PID), starting gateway..."

# Execute the gateway (pass through all args)
exec node /app/dist/index.js "$@"
