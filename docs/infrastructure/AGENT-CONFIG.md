# Automna Agent Configuration System

**Date:** 2026-02-08 (rewritten)
**Status:** Production
**Priority:** Critical Documentation

---

## Overview

Each Automna user gets a dedicated OpenClaw instance running on Fly.io. The agent's behavior is controlled by `clawdbot.json` on the user's persistent volume.

## Architecture

```
User's Fly Machine
├── /home/node/.openclaw/           # OpenClaw data directory (mounted volume)
│   ├── clawdbot.json               # ← AGENT CONFIG (this doc)
│   ├── clawdbot.json.bak           # Backup from OpenClaw's own config patches
│   ├── workspace/                  # Agent's working directory
│   │   ├── AGENTS.md               # Agent behavior instructions
│   │   ├── SOUL.md                 # Agent personality
│   │   ├── USER.md                 # Info about the user
│   │   ├── BOOTSTRAP.md            # First-run setup (delete after)
│   │   ├── IDENTITY.md             # Agent's name, emoji, vibe
│   │   ├── TOOLS.md                # Local notes and tool config
│   │   ├── HEARTBEAT.md            # Background polling instructions
│   │   └── memory/                 # Daily session notes
│   ├── agents/main/sessions/       # Conversation history
│   └── config/                     # Runtime config files
```

---

## Config Merge System (2026-02-08)

### Problem Solved

Previously, the Docker entrypoint **overwrote** `clawdbot.json` on every boot. This meant any user changes (Discord tokens, Telegram bots, WhatsApp configs) were wiped on every machine restart or image update. Three users lost their channel configs before we caught it.

### How It Works Now

The entrypoint uses a **merge strategy** with three categories of config keys:

#### 1. Managed Keys (always overwritten)
These are updated on every boot, regardless of what the user has set:

```json
{
  "gateway": {
    "trustedProxies": ["127.0.0.1", "::1", "10.0.0.0/8", ...]
  },
  "models": {
    "providers": {
      "automna": {
        "baseUrl": "<AUTOMNA_PROXY_URL>/api/llm",
        "apiKey": "<GATEWAY_TOKEN>",
        "api": "anthropic-messages",
        "models": [...]
      }
    }
  },
  "hooks": {
    "enabled": true,
    "token": "<GATEWAY_TOKEN>",
    "path": "/hooks"
  }
}
```

**Why managed:** These must match our infrastructure. If we change the proxy URL or rotate tokens, every machine needs the update automatically.

#### 2. Default Keys (set only if missing)
These are written on first boot but never overwritten after:

```json
{
  "plugins": {
    "entries": {
      "voice-call": { "enabled": false }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace",
      "model": { "primary": "automna/claude-opus-4-5" },
      "verboseDefault": "on",
      "userTimezone": "America/Los_Angeles",
      "heartbeat": { "every": "30m", ... },
      "contextPruning": { "mode": "cache-ttl", "ttl": "1h" },
      "compaction": { "mode": "safeguard", ... }
    }
  }
}
```

**Why defaults:** Users or their agents might customize these (timezone, heartbeat frequency, compaction settings). We set sane defaults but respect their changes.

#### 3. User Keys (never touched)
These are completely owned by the user/agent:

- `channels.*` (Discord, Telegram, WhatsApp, etc.)
- User-added `plugins.entries.*` (discord, telegram, whatsapp)
- `messages.*` (ack reactions, etc.)
- `commands.*`
- Any other keys the user or OpenClaw adds

**Why untouched:** These contain secrets (bot tokens), user preferences, and runtime state that we should never modify.

### The Merge Algorithm

```
1. Load existing clawdbot.json (or start with {})
2. Deep-merge managed keys (overwrites nested values)
3. Set defaults (only fills in missing keys, never overwrites)
4. Ensure voice-call plugin is disabled (managed)
5. Fix stale model references (anthropic/* → automna/*)
6. Clean up deprecated keys (meta, top-level heartbeat)
7. Write back to clawdbot.json
```

If the merge script fails (corrupt JSON, node error), it falls back to writing a minimal config.

### Entrypoint Location

`projects/automna/docker/entrypoint.sh`

The merge logic is a single inline `node -e` script in the config section.

---

## Targeted Config Changes

The merge system enables targeted updates without rebuilding the Docker image:

### Changing Proxy URL
Update the `AUTOMNA_PROXY_URL` env var on machines. The entrypoint reads this on every boot and writes it to the managed `models.providers.automna.baseUrl` key.

```bash
# The proxy URL comes from the machine's env var, not hardcoded
AUTOMNA_PROXY_URL="${AUTOMNA_PROXY_URL:-https://automna.ai}"
```

### Rotating Gateway Tokens
The token comes from the `--token` CLI arg (set in the Fly machine config). On restart, it's merged into both `models.providers.automna.apiKey` and `hooks.token`.

### Adding New Defaults
Add the key to the `defaults` object in the entrypoint. Existing users won't be affected (key already exists), new users get the new default.

### Pushing a Change to ALL Users
Add the key to the `managed` object. Next restart overwrites it everywhere.

### Removing a Deprecated Key
Add explicit `delete config.someKey` in the merge script's cleanup section.

---

## Limitations & Tradeoffs

### ⚠️ Can't Push New Defaults to Existing Users
If we change a default (e.g., heartbeat from 30m to 15m), existing users won't get it because `setDefaults` skips keys that already exist. This is by design - we respect user customizations.

**Workaround:** If you need to force-update a default for all users, temporarily move it to the `managed` section, deploy, then move it back to `defaults`.

### ⚠️ Can't Remove User-Added Keys
The merge only adds/updates. If a user's config has a stale key, it stays. This is fine for now but could accumulate cruft over time.

**Workaround:** Add explicit `delete` statements in the cleanup section for known stale keys.

### ⚠️ No Per-User Targeting
The merge runs the same logic on every machine. We can't say "only update Bobby's config" through the entrypoint.

**Workaround:** Use SSH for targeted one-off changes:
```bash
fly ssh console -a automna-u-xxx -C "sh -c 'node -e \"...\"'"
```

### ⚠️ Merge Depends on Node.js
The merge script is inline JavaScript. If node crashes before the merge runs, config might be stale. The fallback writes a minimal config, but it won't have user channels.

### ✅ What It Does Well
- **Safe infrastructure updates:** Proxy URL, tokens, hooks always current
- **Preserves user work:** Channel configs, bot tokens, customizations survive restarts
- **Self-healing:** Fixes stale model references, removes deprecated keys
- **Graceful fallback:** Minimal config if merge fails (agent still works, just no channels)

---

## Workspace Migrations

Separate from config merging, the entrypoint also runs **workspace migrations** for files in the workspace directory (AGENTS.md, TOOLS.md, HEARTBEAT.md).

These use a version number stored in `.workspace-version`:

```bash
WORKSPACE_VERSION=$(cat "$OPENCLAW_DIR/workspace/.workspace-version" 2>/dev/null || echo "0")
```

Each migration:
1. Checks if version is below the target
2. Patches workspace files (add new docs, remove outdated content)
3. Bumps the version number

**Current version:** 8

| Version | Change |
|---------|--------|
| 1→2 | Added voice calling docs to TOOLS.md and AGENTS.md |
| 2→3 | Added polling script + scheduling docs |
| 3→4 | Removed polling loop (caused session blocking) |
| 4→5 | Force-removed all remaining polling instructions |
| 5→6 | Added Notifications channel to HEARTBEAT.md |
| 6→7 | Strengthened memory instructions, reset HEARTBEAT.md |
| 7→8 | Added email attachment docs to TOOLS.md |

---

## Docker Image Updates

### Full Update Flow

1. **Edit entrypoint:** `projects/automna/docker/entrypoint.sh`
2. **Rebuild image:**
   ```bash
   cd projects/automna/docker
   docker build -t automna-openclaw:latest .
   docker tag automna-openclaw:latest registry.fly.io/automna-openclaw-image:latest
   ```
3. **Push to registry:**
   ```bash
   export FLY_API_TOKEN=$(jq -r .token ../config/fly.json)
   export PATH="$PATH:/root/.fly/bin"
   fly auth docker
   docker push registry.fly.io/automna-openclaw-image:latest
   ```
4. **Update machines:**
   ```bash
   fly machines update <machine-id> -a automna-u-xxx \
     --image registry.fly.io/automna-openclaw-image:latest --yes
   ```

### What Happens on Update
1. Machine pulls new image
2. Entrypoint runs
3. Workspace migrations apply (if version < current)
4. Config merge runs (managed keys updated, user keys preserved)
5. Session key fixer starts
6. File server + Caddy + OpenClaw gateway start

---

## Configuration Reference

### Full Default Config (what new users get)

```json
{
  "gateway": {
    "trustedProxies": ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fd00::/8"]
  },
  "models": {
    "providers": {
      "automna": {
        "baseUrl": "https://automna-proxy.fly.dev/api/llm",
        "apiKey": "<per-user-gateway-token>",
        "api": "anthropic-messages",
        "models": [
          { "id": "claude-opus-4-5", "name": "Claude Opus 4.5" },
          { "id": "claude-sonnet-4", "name": "Claude Sonnet 4" }
        ]
      }
    }
  },
  "hooks": {
    "enabled": true,
    "token": "<per-user-gateway-token>",
    "path": "/hooks"
  },
  "plugins": {
    "entries": {
      "voice-call": { "enabled": false }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace",
      "model": { "primary": "automna/claude-opus-4-5" },
      "verboseDefault": "on",
      "userTimezone": "America/Los_Angeles",
      "heartbeat": {
        "every": "30m",
        "activeHours": { "start": "08:00", "end": "23:00" },
        "target": "last"
      },
      "contextPruning": { "mode": "cache-ttl", "ttl": "1h" },
      "compaction": {
        "mode": "safeguard",
        "memoryFlush": { "enabled": true, "softThresholdTokens": 80000 }
      }
    }
  }
}
```

### User-Added Config Examples

**Discord channel:**
```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "BOT_TOKEN_HERE",
      "groupPolicy": "open",
      "dm": { "enabled": true, "policy": "open", "allowFrom": ["*"] }
    }
  },
  "plugins": {
    "entries": {
      "discord": { "enabled": true }
    }
  }
}
```

**Telegram channel:**
```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "BOT_TOKEN_HERE",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "streamMode": "partial"
    }
  },
  "plugins": {
    "entries": {
      "telegram": { "enabled": true }
    }
  }
}
```

---

## Troubleshooting

### User's channel config disappeared
1. Check if machine restarted recently: `fly logs -a automna-u-xxx`
2. Look for backup: `cat /home/node/.openclaw/clawdbot.json.bak`
3. Restore from backup using merge script (see entrypoint pattern)
4. If no backup, user needs to re-add their bot token

### Config merge failed
Check logs for `[automna] WARNING: Config merge failed`. The fallback minimal config will be in use. Fix the merge script and redeploy.

### Agent using wrong model
1. Check `agents.defaults.model.primary` - should be `automna/claude-opus-4-5`
2. The merge fixes stale `anthropic/*` references automatically
3. User might have a per-session override active

### Changes not taking effect after image update
1. Verify the machine actually pulled the new image: `fly machines status -a automna-u-xxx`
2. Check entrypoint logs for merge output
3. Config is read at gateway startup - the restart from the update should reload it
