# Automna Agent Configuration System

**Date:** 2026-02-02  
**Status:** Production  
**Priority:** Critical Documentation

---

## Overview

Each Automna user gets a dedicated OpenClaw instance running on Fly.io. The agent's behavior is controlled by a configuration file (`clawdbot.json`) that lives on the user's persistent volume.

## Architecture

```
User's Fly Machine
├── /home/node/.openclaw/           # OpenClaw data directory (mounted volume)
│   ├── clawdbot.json               # ← AGENT CONFIG (this doc)
│   ├── workspace/                  # Agent's working directory
│   │   ├── AGENTS.md               # Agent behavior instructions
│   │   ├── SOUL.md                 # Agent personality
│   │   ├── USER.md                 # Info about the user
│   │   ├── BOOTSTRAP.md            # First-run setup (delete after)
│   │   ├── IDENTITY.md             # Agent's name, emoji, vibe
│   │   ├── TOOLS.md                # Local notes and tool config
│   │   └── memory/                 # Daily session notes
│   ├── agents/main/sessions/       # Conversation history
│   └── ...
```

## Configuration File: `clawdbot.json`

Location: `/home/node/.openclaw/clawdbot.json`

### Current Default Configuration

```json
{
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace",
      "model": {
        "primary": "anthropic/claude-opus-4-5"
      },
      "userTimezone": "America/Los_Angeles"
    }
  }
}
```

### How It's Created

The config is created by our custom Docker entrypoint (`docker/entrypoint.sh`) when the machine first starts. If `clawdbot.json` doesn't exist, the entrypoint creates it with defaults.

**Entrypoint location:** `projects/automna/docker/entrypoint.sh`

---

## Configuration Options Reference

### `agents.defaults.workspace`
**Type:** String (absolute path)  
**Default:** `/home/node/.openclaw/workspace`  
**Purpose:** Directory containing agent context files (AGENTS.md, SOUL.md, etc.)

The gateway injects files from this directory into the system prompt. This is how the agent "knows" its personality, instructions, and user info.

**Files that get injected:**
- `AGENTS.md` - Core behavior instructions
- `SOUL.md` - Personality definition
- `USER.md` - User information
- `IDENTITY.md` - Agent's name and identity
- `TOOLS.md` - Local notes about tools/infrastructure
- `HEARTBEAT.md` - Background polling instructions
- `BOOTSTRAP.md` - First-run setup (temporary)
- `memory/YYYY-MM-DD.md` - Recent session notes

### `agents.defaults.model.primary`
**Type:** String (model identifier)  
**Default:** `anthropic/claude-opus-4-5`  
**Purpose:** Which Claude model to use

**Available models:**
| Model ID | Description | Cost |
|----------|-------------|------|
| `anthropic/claude-opus-4-5` | Most capable, best reasoning | $$$ |
| `anthropic/claude-sonnet-4-20250514` | Balanced speed/capability | $$ |
| `anthropic/claude-haiku-3-5-20241022` | Fast, cheap, less capable | $ |

**⚠️ IMPORTANT:** Always default to Opus 4.5. Only use Sonnet/Haiku if explicitly requested by user.

### `agents.defaults.userTimezone`
**Type:** String (IANA timezone)  
**Default:** `America/Los_Angeles`  
**Purpose:** Timezone for the user (affects time displays, scheduling)

**Examples:**
- `America/Los_Angeles` (Pacific)
- `America/New_York` (Eastern)
- `Europe/London`
- `Asia/Tokyo`

---

## Extended Configuration Options

These are additional options that can be added to the config:

### Memory/Context Options

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "enabled": true,
        "sources": ["memory", "sessions"],
        "provider": "gemini",
        "model": "gemini-embedding-001"
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
```

### Heartbeat/Proactive Options

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "activeHours": {
          "start": "08:00",
          "end": "23:00",
          "timezone": "America/Los_Angeles"
        },
        "target": "last"
      }
    }
  }
}
```

### Model Aliases

```json
{
  "agents": {
    "defaults": {
      "models": {
        "anthropic/claude-opus-4-5": {
          "alias": "opus"
        }
      }
    }
  }
}
```

### Concurrency Limits

```json
{
  "agents": {
    "defaults": {
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    }
  }
}
```

---

## Modifying Configuration

### Method 1: Via Files Tab (Future)
Users will be able to edit `clawdbot.json` directly through the Files tab in the dashboard.

### Method 2: Via Agent Command (Future)
The agent could modify its own config via exec commands, then restart.

### Method 3: Via Dashboard Settings (Future)
We'll add a Settings page that provides a nice UI for common options:
- Model selection dropdown
- Timezone picker
- Memory settings toggles

### Method 4: Direct Fly Exec (Admin)
```bash
export FLY_API_TOKEN=...
curl -X POST "https://api.machines.dev/v1/apps/automna-u-xxx/machines/xxx/exec" \
  -H "Authorization: Bearer $FLY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": ["/bin/sh", "-c", "cat > /home/node/.openclaw/clawdbot.json << EOF\n{...}\nEOF"]}'
```

---

## Workspace Files

### AGENTS.md
Core behavior instructions. Tells the agent:
- How to use workspace files
- Memory system (daily notes, MEMORY.md)
- Safety guidelines
- External vs internal actions
- Group chat behavior

### SOUL.md
Personality definition:
- Core values
- Communication style
- Boundaries
- Continuity instructions

### USER.md
User information:
- Name, pronouns
- Timezone, location
- Work info
- Communication preferences
- Interests

### BOOTSTRAP.md
First-run setup instructions. Agent should:
1. Have identity conversation with user
2. Learn name, personality, preferences
3. Update IDENTITY.md, USER.md, SOUL.md
4. Delete BOOTSTRAP.md when done

### IDENTITY.md
Agent's identity:
- Name
- Creature type
- Vibe/personality
- Signature emoji
- Avatar (optional)

### TOOLS.md
Local notes about:
- Infrastructure details
- API keys locations
- Credentials paths
- Tool-specific notes

---

## Docker Image Updates

When changing the default config, update:

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
   fly auth docker
   docker push registry.fly.io/automna-openclaw-image:latest
   ```
4. **Update existing machines:**
   ```bash
   fly machines update <machine-id> -a automna-u-xxx \
     --image registry.fly.io/automna-openclaw-image:latest --yes
   ```

**Note:** Existing machines won't get new config defaults unless their config is deleted first. The entrypoint only creates config if it doesn't exist.

---

## Future Dashboard Features

### Settings Page Mockup

```
┌─────────────────────────────────────────────────────────┐
│ Agent Settings                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Model                                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Claude Opus 4.5 (Most capable)              ▼      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Timezone                                                │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ America/Los_Angeles (Pacific)               ▼      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Memory                                                  │
│ ☑ Enable memory search                                 │
│ ☑ Include session history                              │
│                                                         │
│ Proactive Mode                                          │
│ ☑ Enable heartbeat polling                             │
│   Every: [30] minutes                                   │
│   Active hours: [08:00] to [23:00]                     │
│                                                         │
│ Advanced                                                │
│ [Edit config.json directly]                            │
│                                                         │
│                              [Save Changes]             │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Agent doesn't see workspace files
1. Check config exists: `cat /home/node/.openclaw/clawdbot.json`
2. Verify workspace path is correct
3. Restart machine to reload config

### Agent using wrong model
1. Check `agents.defaults.model.primary` in config
2. User might have per-session override active

### Config not being created
1. Check entrypoint logs: `fly logs -a automna-u-xxx`
2. Verify entrypoint.sh has config creation code
3. Check volume is mounted correctly

### Changes not taking effect
1. Config is read at gateway startup
2. Must restart machine for changes to apply
3. Or use gateway restart command if available
