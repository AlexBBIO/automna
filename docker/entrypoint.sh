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

# Persist tool auth across restarts
# These dirs live on the ephemeral root FS by default, so they get wiped on restart.
# Symlinking them to the persistent volume means gh auth, git config, SSH keys, etc. survive.
# Note: using POSIX sh (not bash), so no arrays or <<<.

persist_link() {
    vol_path="$1"
    sys_path="$2"
    mkdir -p "$vol_path"
    # Remove existing dir/file if it's not already our symlink
    if [ -e "$sys_path" ] && [ ! -L "$sys_path" ]; then
        cp -rn "$sys_path/"* "$vol_path/" 2>/dev/null || true
        rm -rf "$sys_path"
    fi
    mkdir -p "$(dirname "$sys_path")"
    ln -sf "$vol_path" "$sys_path"
}

persist_link "$OPENCLAW_DIR/config/gh"  "/home/node/.config/gh"
persist_link "$OPENCLAW_DIR/config/ssh" "/home/node/.ssh"
persist_link "$OPENCLAW_DIR/config/npm" "/home/node/.config/npm"

# Special case: .gitconfig is a file, not a dir
mkdir -p "$OPENCLAW_DIR/config/git"
if [ ! -f "$OPENCLAW_DIR/config/git/.gitconfig" ]; then
    # Copy existing .gitconfig to volume if present
    if [ -f /home/node/.gitconfig ] && [ ! -L /home/node/.gitconfig ]; then
        cp /home/node/.gitconfig "$OPENCLAW_DIR/config/git/.gitconfig"
    else
        touch "$OPENCLAW_DIR/config/git/.gitconfig"
    fi
fi
ln -sf "$OPENCLAW_DIR/config/git/.gitconfig" /home/node/.gitconfig

# Fix SSH permissions (required by ssh client)
chmod 700 "$OPENCLAW_DIR/config/ssh" 2>/dev/null || true
chmod 600 "$OPENCLAW_DIR/config/ssh/"* 2>/dev/null || true

echo "[automna] Tool auth persistence configured (gh, git, ssh, npm)"

# Copy default workspace files on first run
if [ -d "/app/default-workspace" ] && [ ! -f "$OPENCLAW_DIR/workspace/.initialized" ]; then
    echo "[automna] Initializing workspace with defaults..."
    cp -rn /app/default-workspace/* "$OPENCLAW_DIR/workspace/" 2>/dev/null || true
    touch "$OPENCLAW_DIR/workspace/.initialized"
    echo "8" > "$OPENCLAW_DIR/workspace/.workspace-version"
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
curl -s -X POST "https://automna-proxy.fly.dev/api/user/call" \
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

**After making a call, IMMEDIATELY run this polling script:**
```bash
CALL_ID="<the call_id from the response>"
for i in $(seq 1 12); do
  sleep 30
  RESULT=$(curl -s "https://automna-proxy.fly.dev/api/user/call/status?call_id=$CALL_ID" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN")
  COMPLETED=$(echo "$RESULT" | jq -r '.completed')
  if [ "$COMPLETED" = "true" ]; then
    echo "$RESULT" | jq .
    mkdir -p /home/node/.openclaw/workspace/calls
    echo "$RESULT" | jq -r '"# Call Summary\n\n**Status:** \(.status)\n**Duration:** \(.duration_seconds)s\n\n## Summary\n\(.summary)\n\n## Transcript\n\(.transcript)"' > "/home/node/.openclaw/workspace/calls/$(date +%Y-%m-%d_%H%M)_outbound.md"
    break
  fi
  echo "Poll $i: still in progress..."
done
```
Run this right after making the call. Do NOT wait for the user to ask. Report the summary when complete.

**Check usage:**
```bash
curl -s "https://automna-proxy.fly.dev/api/user/call/usage" \
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
curl -s -X POST "https://automna-proxy.fly.dev/api/user/call" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+12025551234",
    "task": "Your instructions for the call AI",
    "first_sentence": "Opening line when call connects",
    "max_duration": 5
  }'
```

**After making a call, you MUST immediately run this polling script:**
```bash
CALL_ID="<call_id from response>"
for i in $(seq 1 12); do
  sleep 30
  RESULT=$(curl -s "https://automna-proxy.fly.dev/api/user/call/status?call_id=$CALL_ID" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN")
  if [ "$(echo "$RESULT" | jq -r '.completed')" = "true" ]; then
    echo "$RESULT" | jq .
    break
  fi
  echo "Poll $i: still in progress..."
done
```
Run this RIGHT AFTER the call. Do not wait for the user to ask. When complete, save the transcript and tell the user the summary.

**Important:** The call is handled by a separate AI model, not you. Pack ALL context into the `task` field.

See `TOOLS.md` for full documentation and parameters.
AGENTSEOF
        echo "[automna] AGENTS.md patched with Phone Calls docs"
    fi

    echo "2" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 2"
fi

# Migration 2→3: Add polling script to phone call docs + scheduling section
if [ "$WORKSPACE_VERSION" -lt 3 ] 2>/dev/null; then
    echo "[automna] Workspace migration v3: adding polling script + scheduling docs..."

    # Patch TOOLS.md - add polling script if missing
    if [ -f "$OPENCLAW_DIR/workspace/TOOLS.md" ] && ! grep -q "call/status" "$OPENCLAW_DIR/workspace/TOOLS.md" 2>/dev/null; then
        # Find the Voice Calling section and append polling instructions
        node -e "
            const fs = require('fs');
            const file = '$OPENCLAW_DIR/workspace/TOOLS.md';
            let content = fs.readFileSync(file, 'utf8');
            
            const polling = \`

**After making a call, IMMEDIATELY run this polling script:**
\\\`\\\`\\\`bash
CALL_ID=\"<the call_id from the make-call response>\"
for i in \\\$(seq 1 12); do
  sleep 30
  RESULT=\\\$(curl -s \"https://automna-proxy.fly.dev/api/user/call/status?call_id=\\\$CALL_ID\" \\\\
    -H \"Authorization: Bearer \\\$OPENCLAW_GATEWAY_TOKEN\")
  COMPLETED=\\\$(echo \"\\\$RESULT\" | jq -r '.completed')
  if [ \"\\\$COMPLETED\" = \"true\" ]; then
    STATUS=\\\$(echo \"\\\$RESULT\" | jq -r '.status')
    SUMMARY=\\\$(echo \"\\\$RESULT\" | jq -r '.summary')
    TRANSCRIPT=\\\$(echo \"\\\$RESULT\" | jq -r '.transcript')
    DURATION=\\\$(echo \"\\\$RESULT\" | jq -r '.duration_seconds')
    mkdir -p /home/node/.openclaw/workspace/calls
    FILENAME=\"calls/\\\$(date +%Y-%m-%d_%H%M)_outbound.md\"
    echo -e \"# Call Summary\\\\n\\\\n**Status:** \\\$STATUS\\\\n**Duration:** \\\${DURATION}s\\\\n\\\\n## Summary\\\\n\\\$SUMMARY\\\\n\\\\n## Transcript\\\\n\\\$TRANSCRIPT\" > \"/home/node/.openclaw/workspace/\\\$FILENAME\"
    echo \"Call complete! Transcript saved to \\\$FILENAME\"
    echo \"Summary: \\\$SUMMARY\"
    break
  fi
  echo \"Poll \\\$i: call still in progress...\"
done
\\\`\\\`\\\`
Run this **immediately** after making the call. Do not wait for the user to ask. Report the summary when done.\`;

            // Insert after the Response JSON block
            const insertPoint = content.indexOf('**Tips:**');
            if (insertPoint > 0 && content.indexOf('call/status') === -1) {
                content = content.slice(0, insertPoint) + polling + '\\n\\n' + content.slice(insertPoint);
                fs.writeFileSync(file, content);
                console.log('[automna] TOOLS.md patched with polling script');
            }
        " 2>/dev/null || echo "[automna] Warning: TOOLS.md polling patch failed"
    fi

    # Patch AGENTS.md - add polling script if missing
    if [ -f "$OPENCLAW_DIR/workspace/AGENTS.md" ] && ! grep -q "call/status" "$OPENCLAW_DIR/workspace/AGENTS.md" 2>/dev/null; then
        node -e "
            const fs = require('fs');
            const file = '$OPENCLAW_DIR/workspace/AGENTS.md';
            let content = fs.readFileSync(file, 'utf8');
            
            const polling = \`
**After making a call, you MUST immediately run this polling script:**
\\\`\\\`\\\`bash
CALL_ID=\"<call_id from response>\"
for i in \\\$(seq 1 12); do
  sleep 30
  RESULT=\\\$(curl -s \"https://automna-proxy.fly.dev/api/user/call/status?call_id=\\\$CALL_ID\" -H \"Authorization: Bearer \\\$OPENCLAW_GATEWAY_TOKEN\")
  if [ \"\\\$(echo \"\\\$RESULT\" | jq -r '.completed')\" = \"true\" ]; then
    echo \"\\\$RESULT\" | jq .
    break
  fi
  echo \"Poll \\\$i: still in progress...\"
done
\\\`\\\`\\\`
Run this RIGHT AFTER the call. Do not wait for the user to ask. When complete, save the transcript and tell the user the summary.
\`;

            // Insert before the 'Important:' line in the phone call section
            const insertPoint = content.indexOf('**Important:** The call is handled');
            if (insertPoint > 0 && content.indexOf('call/status') === -1) {
                content = content.slice(0, insertPoint) + polling + '\\n' + content.slice(insertPoint);
                fs.writeFileSync(file, content);
                console.log('[automna] AGENTS.md patched with polling script');
            }
        " 2>/dev/null || echo "[automna] Warning: AGENTS.md polling patch failed"
    fi

    # Add Scheduling section to AGENTS.md if missing
    if [ -f "$OPENCLAW_DIR/workspace/AGENTS.md" ] && ! grep -q "Scheduling" "$OPENCLAW_DIR/workspace/AGENTS.md" 2>/dev/null; then
        cat >> "$OPENCLAW_DIR/workspace/AGENTS.md" << 'SCHEDEOF'

## Scheduling - Reminders & Recurring Tasks

When a user asks you to do something later or on a schedule, use the `cron` tool.

**One-time reminder:**
```
cron(action: "add", job: {
  text: "Remind Alex to call Bob",
  payload: { kind: "systemEvent", text: "Reminder: Call Bob! Alex asked you to remind him." },
  schedule: "2026-02-08T09:00:00",
  once: true
})
```

**Recurring task:**
```
cron(action: "add", job: {
  text: "Daily email summary",
  payload: { kind: "systemEvent", text: "Time to check email and send Alex a summary of anything new." },
  schedule: "0 17 * * *"
})
```

**Manage jobs:**
- `cron(action: "list")` — see all scheduled jobs
- `cron(action: "remove", jobId: "xxx")` — cancel a job
- `cron(action: "runs", jobId: "xxx")` — see recent runs

**Tips:**
- Use `once: true` for one-time reminders
- Use cron syntax for recurring: `"0 9 * * 1-5"` = weekdays at 9am
- Write the `text` so it reads as an instruction when it fires
- Include context: "Reminder: Alex asked you to follow up with Dana about dinner plans"
SCHEDEOF
        echo "[automna] AGENTS.md patched with Scheduling docs"
    fi

    # Add Scheduling section to TOOLS.md if missing
    if [ -f "$OPENCLAW_DIR/workspace/TOOLS.md" ] && ! grep -q "Scheduling" "$OPENCLAW_DIR/workspace/TOOLS.md" 2>/dev/null; then
        cat >> "$OPENCLAW_DIR/workspace/TOOLS.md" << 'SCHEDTOOLSEOF'

### Scheduling (Reminders & Recurring Tasks)

Use the `cron` tool to schedule reminders and recurring tasks.

**Examples:**
- "Remind me at 3pm" → `cron(action: "add", job: {text: "3pm reminder", payload: {kind: "systemEvent", text: "Reminder: ..."}, schedule: "2026-02-07T15:00:00", once: true})`
- "Check email every morning" → `cron(action: "add", job: {text: "Morning email check", payload: {kind: "systemEvent", text: "Check email and summarize"}, schedule: "0 9 * * *"})`
- "Cancel that" → `cron(action: "remove", jobId: "xxx")`

**Cron syntax quick reference:**
- `0 9 * * *` = daily at 9am
- `0 9 * * 1-5` = weekdays at 9am
- `*/30 * * * *` = every 30 minutes
- `0 9,17 * * *` = 9am and 5pm daily
SCHEDTOOLSEOF
        echo "[automna] TOOLS.md patched with Scheduling docs"
    fi

    echo "3" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 3"
fi

# Migration 3→4: Remove polling loop from phone call docs (causes session blocking)
if [ "$WORKSPACE_VERSION" -lt 4 ] 2>/dev/null; then
    echo "[automna] Workspace migration v4: removing polling loop from phone docs..."

    # Patch TOOLS.md - replace polling loop with webhook notification
    if [ -f "$OPENCLAW_DIR/workspace/TOOLS.md" ]; then
        node -e "
            const fs = require('fs');
            const file = '$OPENCLAW_DIR/workspace/TOOLS.md';
            let content = fs.readFileSync(file, 'utf8');

            // Remove old polling script block
            content = content.replace(/\*\*After making a call, IMMEDIATELY (?:run this )?polling.*?(?=\*\*(?:Response fields|Tips|Check usage))/s,
                \`**After making a call:** You'll receive an automatic notification when the call completes with the summary, transcript, and status. No need to poll. Just let the user know the call is in progress and you'll update them when it's done.

**⚠️ Do NOT run any polling loops or sleep commands to wait for call results.** Long-running exec commands will block your entire session and prevent you from responding to ANY messages.

**If you need to manually check a call status (rare):**
\\\`\\\`\\\`bash
curl -s \"https://automna-proxy.fly.dev/api/user/call/status?call_id=<CALL_ID>\" \\\\
  -H \"Authorization: Bearer \\\$OPENCLAW_GATEWAY_TOKEN\" | jq '{completed, status, summary, duration_seconds}'
\\\`\\\`\\\`

\`);

            // Also clean up old 'Always poll' tip
            content = content.replace(/- Always poll for completion after making a call[^\n]*\n?/, '');

            fs.writeFileSync(file, content);
            console.log('[automna] TOOLS.md polling loop removed');
        " 2>/dev/null || echo "[automna] Warning: TOOLS.md patch failed"
    fi

    # Patch AGENTS.md - replace polling loop with webhook notification
    if [ -f "$OPENCLAW_DIR/workspace/AGENTS.md" ]; then
        node -e "
            const fs = require('fs');
            const file = '$OPENCLAW_DIR/workspace/AGENTS.md';
            let content = fs.readFileSync(file, 'utf8');

            // Remove old polling script block
            content = content.replace(/\*\*After making a call, you MUST (?:immediately )?(?:run this )?poll.*?(?=\*\*Important:\*\*)/s,
                \`**After making a call:** You'll receive an automatic notification when the call completes with the summary, transcript, and status. No need to poll. Just let the user know the call is in progress and you'll update them when it's done.

**⚠️ Do NOT run any polling loops or sleep commands to wait for call results.** Long-running exec commands will block your entire session and prevent you from responding to messages.

\`);

            fs.writeFileSync(file, content);
            console.log('[automna] AGENTS.md polling loop removed');
        " 2>/dev/null || echo "[automna] Warning: AGENTS.md patch failed"
    fi

    echo "4" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 4"
fi

# Migration 4→5: Force-remove ALL polling instructions from phone docs
# Previous migration v4 used regex that may not match all variants
if [ "$WORKSPACE_VERSION" -lt 5 ] 2>/dev/null; then
    echo "[automna] Workspace migration v5: force-removing all polling instructions..."

    for DOC_FILE in "$OPENCLAW_DIR/workspace/TOOLS.md" "$OPENCLAW_DIR/workspace/AGENTS.md"; do
        if [ -f "$DOC_FILE" ]; then
            node -e "
                const fs = require('fs');
                let content = fs.readFileSync('$DOC_FILE', 'utf8');
                const before = content.length;

                // Remove any line containing 'sleep 30' or polling loop patterns
                content = content.replace(/^.*sleep 30.*$/gm, '');
                content = content.replace(/^.*seq 1 12.*$/gm, '');
                content = content.replace(/^.*Poll.*still in progress.*$/gm, '');
                content = content.replace(/^.*IMMEDIATELY run this polling.*$/gm, '');
                content = content.replace(/^.*MUST immediately run this polling.*$/gm, '');
                content = content.replace(/^.*Always poll for completion.*$/gm, '');
                content = content.replace(/^.*don't just fire and forget.*$/gm, '');

                // Replace any remaining 'After making a call' blocks that mention polling
                content = content.replace(/\*\*After making a call[^*]*poll[^*]*\*\*/gi,
                    '**After making a call:** You will receive an automatic notification when the call completes with the summary, transcript, and status. No need to poll.');

                // Clean up excessive blank lines left by removals
                content = content.replace(/\n{4,}/g, '\n\n\n');

                if (content.length !== before) {
                    fs.writeFileSync('$DOC_FILE', content);
                    console.log('[automna] Cleaned polling from $DOC_FILE (' + (before - content.length) + ' chars removed)');
                } else {
                    console.log('[automna] No polling found in $DOC_FILE');
                }
            " 2>/dev/null || echo "[automna] Warning: $DOC_FILE patch failed"
        fi
    done

    echo "5" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 5"
fi

# Migration 5→6: Update HEARTBEAT.md to use Notifications channel
if [ "$WORKSPACE_VERSION" -lt 6 ] 2>/dev/null; then
    echo "[automna] Workspace migration v6: updating HEARTBEAT.md with Notifications channel..."

    if [ -f "$OPENCLAW_DIR/workspace/HEARTBEAT.md" ]; then
        cat > "$OPENCLAW_DIR/workspace/HEARTBEAT.md" << 'HEARTBEATEOF'
# Heartbeat Tasks

Check these periodically (every 30 minutes):

## Email Check
1. Check your inbox for new messages using Agentmail
2. Note any new unread messages since last check
3. Update heartbeat-state.json with timestamp and count

## Notifications Channel

When you find something worth reporting (new emails, completed tasks, alerts):

1. Send a summary to the **Notifications** conversation:
   ```
   sessions_send(label: "notifications", message: "📧 2 new emails: ...")
   ```
2. Keep notifications concise and scannable
3. Group multiple items into one message when possible

**Examples:**
- "📧 New email from GitHub: PR review requested on repo-name"
- "📧 3 new emails since last check (2 from newsletters, 1 from dana@example.com about dinner plans)"
- "✅ Reminder: You asked me to remind you about the 3pm meeting"

## Rules
- If nothing new: reply HEARTBEAT_OK
- Use the Notifications conversation for all periodic findings
- Update heartbeat-state.json to track what you've seen
- Keep it scannable — no walls of text
HEARTBEATEOF
        echo "[automna] HEARTBEAT.md updated with Notifications channel"
    fi

    echo "6" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 6"
fi

# Migration 6→7: Strengthen AGENTS.md memory instructions + reset HEARTBEAT.md
if [ "$WORKSPACE_VERSION" -lt 7 ] 2>/dev/null; then
    echo "[automna] Workspace migration v7: strengthening memory instructions..."

    # Reset HEARTBEAT.md to empty (heartbeats disabled by default to save tokens)
    cat > "$OPENCLAW_DIR/workspace/HEARTBEAT.md" << 'HEARTBEATEOF'
# Heartbeat Tasks

# Keep this file empty to skip heartbeat work.
# Add tasks below when you want the agent to check something periodically.
HEARTBEATEOF

    # Patch AGENTS.md memory section - replace passive wording with stronger instructions
    if [ -f "$OPENCLAW_DIR/workspace/AGENTS.md" ] && grep -q "Take notes as you work" "$OPENCLAW_DIR/workspace/AGENTS.md" 2>/dev/null; then
        node -e "
            const fs = require('fs');
            const file = '$OPENCLAW_DIR/workspace/AGENTS.md';
            let content = fs.readFileSync(file, 'utf8');

            const oldSection = \`## Priority 1: Session Notes

**Take notes as you work.** Don't wait until the end.

- Update \\\`memory/YYYY-MM-DD.md\\\` in real-time
- Document current state, what's working, what's needed
- If your human explains context, WRITE IT DOWN\`;

            const newSection = \`## Session Notes

You wake up fresh each session. \\\`memory/YYYY-MM-DD.md\\\` files are how you maintain continuity.

**When to write:**
- After finishing a meaningful task or multi-step project
- When the user shares important context (preferences, project details, decisions)
- When you receive a pre-compaction memory flush (the system will prompt you)

**What to write** (keep it concise):
\\\`\\\`\\\`markdown
# 2026-02-08

## Tasks
- Set up Discord bot integration
- Researched competitor pricing

## Context
- User prefers minimal/clean design
- Working on a SaaS landing page

## Pending
- Waiting for Discord bot token
\\\`\\\`\\\`

Don't write notes for trivial exchanges. Focus on things that would be useful to know next session.\`;

            if (content.includes('Take notes as you work')) {
                content = content.replace(oldSection, newSection);
                fs.writeFileSync(file, content);
                console.log('[automna] AGENTS.md memory section updated');
            }
        " 2>/dev/null || echo "[automna] Warning: AGENTS.md patch failed (non-critical)"
    fi

    echo "7" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 7"
fi

# Migration 7→8: Add email attachment docs to TOOLS.md
if [ "$WORKSPACE_VERSION" -lt 8 ] 2>/dev/null; then
    echo "[automna] Workspace migration v8: adding email attachment docs..."

    if [ -f "$OPENCLAW_DIR/workspace/TOOLS.md" ] && ! grep -q "attachments" "$OPENCLAW_DIR/workspace/TOOLS.md" 2>/dev/null; then
        node -e "
            const fs = require('fs');
            const file = '$OPENCLAW_DIR/workspace/TOOLS.md';
            let content = fs.readFileSync(file, 'utf8');

            const oldEmail = 'See \`AGENTMAIL.md\` for full documentation.';
            const newEmail = \`See \\\`AGENTMAIL.md\\\` for full documentation.

**Quick send:**
\\\`\\\`\\\`bash
curl -s -X POST \"https://automna-proxy.fly.dev/api/user/email/send\" \\\\
  -H \"Authorization: Bearer \\\$OPENCLAW_GATEWAY_TOKEN\" \\\\
  -H \"Content-Type: application/json\" \\\\
  -d '{\"to\": \"user@example.com\", \"subject\": \"Hello\", \"text\": \"Message body\"}'
\\\`\\\`\\\`

**Send with attachments:**
\\\`\\\`\\\`bash
# First base64-encode the file
FILE_B64=\\\$(base64 -w0 /path/to/file.png)

curl -s -X POST \"https://automna-proxy.fly.dev/api/user/email/send\" \\\\
  -H \"Authorization: Bearer \\\$OPENCLAW_GATEWAY_TOKEN\" \\\\
  -H \"Content-Type: application/json\" \\\\
  -d \"{
    \\\\\"to\\\\\": \\\\\"user@example.com\\\\\",
    \\\\\"subject\\\\\": \\\\\"Photo attached\\\\\",
    \\\\\"text\\\\\": \\\\\"See the attached image.\\\\\",
    \\\\\"attachments\\\\\": [{
      \\\\\"filename\\\\\": \\\\\"photo.png\\\\\",
      \\\\\"content_type\\\\\": \\\\\"image/png\\\\\",
      \\\\\"content\\\\\": \\\\\"\\\$FILE_B64\\\\\"
    }]
  }\"
\\\`\\\`\\\`

**Attachment format:** Each attachment needs \\\`filename\\\`, \\\`content_type\\\`, and either \\\`content\\\` (base64) or \\\`url\\\`.\`;

            // Replace old quick-send block if it exists, or just add after the AGENTMAIL.md reference
            if (content.includes('Quick send:')) {
                // Has old quick send, replace everything from 'See AGENTMAIL' to the next ### section
                const emailStart = content.indexOf('### Email (Agentmail)');
                const nextSection = content.indexOf('###', emailStart + 1);
                if (emailStart >= 0 && nextSection >= 0) {
                    content = content.slice(0, emailStart) + '### Email (Agentmail)\\n\\n' + newEmail + '\\n\\n' + content.slice(nextSection);
                }
            } else if (content.includes(oldEmail)) {
                content = content.replace(oldEmail, newEmail);
            }

            fs.writeFileSync(file, content);
            console.log('[automna] TOOLS.md patched with email attachment docs');
        " 2>/dev/null || echo "[automna] Warning: email attachment patch failed"
    fi

    echo "8" > "$OPENCLAW_DIR/workspace/.workspace-version"
    echo "[automna] Workspace migrated to version 8"
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

# Merge config: update Automna-managed keys, preserve user changes (channels, plugins, etc.)
# On first boot: write full default config
# On subsequent boots: deep-merge managed keys into existing config
AUTOMNA_PROXY_URL="${AUTOMNA_PROXY_URL:-https://automna.ai}"
echo "[automna] Merging config (proxy: $AUTOMNA_PROXY_URL)..."

BYOK_MODE_FLAG="${BYOK_MODE:-false}"

node -e "
const fs = require('fs');
const configFile = '$CONFIG_FILE';
const proxyUrl = '$AUTOMNA_PROXY_URL';
const gatewayToken = '$GATEWAY_TOKEN';
const byokMode = '$BYOK_MODE_FLAG' === 'true';

// Managed keys - these get overwritten on every boot
const managed = {
  gateway: {
    trustedProxies: ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fd00::/8']
  },
  hooks: {
    enabled: true,
    token: gatewayToken,
    path: '/hooks'
  }
};

// In BYOK mode, don't add automna LLM provider — use anthropic directly
// In legacy mode, add the proxy provider
if (!byokMode) {
  managed.models = {
    providers: {
      automna: {
        baseUrl: proxyUrl + '/api/llm',
        apiKey: gatewayToken,
        api: 'anthropic-messages',
        models: [
          { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
          { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }
        ]
      }
    }
  };
}

// Default model depends on mode
const defaultModel = byokMode ? 'anthropic/claude-opus-4-5' : 'automna/claude-opus-4-5';

// Defaults - only set if not already present in existing config
const defaults = {
  plugins: {
    entries: {
      'voice-call': { enabled: false }
    }
  },
  agents: {
    defaults: {
      workspace: '/home/node/.openclaw/workspace',
      model: { primary: defaultModel },
      imageModel: { primary: defaultModel },
      verboseDefault: 'on',
      userTimezone: 'America/Los_Angeles',
      timeoutSeconds: 3600,
      heartbeat: {
        every: '30m',
        activeHours: { start: '08:00', end: '23:00' },
        target: 'last'
      },
      contextPruning: { mode: 'cache-ttl', ttl: '1h' },
      compaction: {
        mode: 'safeguard',
        memoryFlush: { enabled: true, softThresholdTokens: 80000 }
      }
    }
  }
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Set defaults only if key doesn't exist
function setDefaults(target, source) {
  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      target[key] = source[key];
    } else if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
               && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      setDefaults(target[key], source[key]);
    }
  }
  return target;
}

let config = {};

// Load existing config if present
if (fs.existsSync(configFile)) {
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    console.log('[automna] Existing config loaded, merging managed keys...');
    console.log('[automna] Preserved user keys: channels=' + JSON.stringify(Object.keys(config.channels || {})) +
                ' plugins=' + JSON.stringify(Object.keys((config.plugins || {}).entries || {})));
  } catch (e) {
    console.log('[automna] Existing config corrupt, starting fresh');
    config = {};
  }
} else {
  console.log('[automna] First boot, creating config...');
}

// Always overwrite managed keys
deepMerge(config, managed);

// Set defaults (won't overwrite existing user values)
setDefaults(config, defaults);

// Ensure voice-call is always disabled (managed)
if (!config.plugins) config.plugins = {};
if (!config.plugins.entries) config.plugins.entries = {};
config.plugins.entries['voice-call'] = { enabled: false };

// In BYOK mode, remove the automna LLM provider (we go direct to Anthropic)
if (byokMode && config.models && config.models.providers && config.models.providers.automna) {
  delete config.models.providers.automna;
  console.log('[automna] BYOK mode: removed automna LLM provider');
}

// Fix any stale model references
let configStr = JSON.stringify(config);
if (!byokMode) {
  // Legacy mode: rewrite anthropic → automna provider
  configStr = configStr
    .replace(/\"anthropic\/claude-opus-4-5\"/g, '\"automna/claude-opus-4-5\"')
    .replace(/\"anthropic\/claude-sonnet-4\"/g, '\"automna/claude-opus-4-5\"')
    .replace(/\"claude-3-5-sonnet-[0-9]+\"/g, '\"claude-opus-4-5\"');
} else {
  // BYOK mode: rewrite automna → anthropic provider (direct)
  configStr = configStr
    .replace(/\"automna\/claude-opus-4-5\"/g, '\"anthropic/claude-opus-4-5\"')
    .replace(/\"automna\/claude-sonnet-4\"/g, '\"anthropic/claude-sonnet-4\"');
}
const fixed = configStr;

// Remove unsupported top-level 'heartbeat' key (moved to agents.defaults.heartbeat)
const finalConfig = JSON.parse(fixed);
delete finalConfig.heartbeat;
delete finalConfig.meta;

fs.writeFileSync(configFile, JSON.stringify(finalConfig, null, 2));
console.log('[automna] Config written (baseUrl: ' + proxyUrl + '/api/llm)');
" 2>/dev/null || {
  echo "[automna] WARNING: Config merge failed, writing minimal config..."
  cat > "$CONFIG_FILE" << EOFCONFIG
{
  "gateway": {
    "trustedProxies": ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fd00::/8"]
  },
  "models": {
    "providers": {
      "automna": {
        "baseUrl": "$AUTOMNA_PROXY_URL/api/llm",
        "apiKey": "$GATEWAY_TOKEN",
        "api": "anthropic-messages",
        "models": [
          {"id": "claude-opus-4-5", "name": "Claude Opus 4.5"},
          {"id": "claude-sonnet-4", "name": "Claude Sonnet 4"}
        ]
      }
    }
  },
  "hooks": {"enabled": true, "token": "$GATEWAY_TOKEN", "path": "/hooks"},
  "plugins": {"entries": {"voice-call": {"enabled": false}}},
  "agents": {"defaults": {"workspace": "/home/node/.openclaw/workspace", "model": {"primary": "automna/claude-opus-4-5"}, "verboseDefault": "on"}}
}
EOFCONFIG
}

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

# BYOK Mode: LLM calls go direct to Anthropic (user's own key)
# Legacy Mode: LLM calls route through Automna proxy (our key)
if [ "${BYOK_MODE}" = "true" ]; then
    echo "[automna] BYOK mode: LLM calls go direct to Anthropic"
    # Don't set ANTHROPIC_BASE_URL — defaults to api.anthropic.com
    # User's credentials are in auth-profiles.json (written by dashboard)
else
    echo "[automna] Legacy mode: LLM calls route through Automna proxy"
    export ANTHROPIC_BASE_URL="$AUTOMNA_PROXY_URL/api/llm"
fi

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
