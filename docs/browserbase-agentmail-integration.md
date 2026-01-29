# Browserbase + Agentmail Integration

## Overview

Adding real browser and email capabilities to the Automna demo instance (test.automna.ai).

## Current State

- **Gateway:** Running at test.automna.ai (Docker on Hetzner)
- **Browser:** Not configured (no browser capabilities)
- **Email:** Not configured (no email capabilities)
- **User:** grandathrawn@gmail.com connected via automna.ai dashboard

## Goal

Enable the demo agent to:
1. Browse the web (via Browserbase cloud browser)
2. Send/receive email (via Agentmail API)

---

## Browserbase Integration

### How It Works

Browserbase provides cloud Chrome instances accessible via CDP (Chrome DevTools Protocol). Clawdbot's browser tool supports remote CDP connections.

```
Agent wants to browse
        ↓
Clawdbot browser tool
        ↓
CDP WebSocket connection
        ↓
wss://connect.browserbase.com?apiKey=xxx
        ↓
Browserbase spins up Chrome instance
        ↓
Agent controls the browser
```

### Configuration

Add to gateway config (`docker/config/clawdbot.json`):

```json
{
  "browser": {
    "enabled": true,
    "defaultProfile": "browserbase",
    "remoteCdpTimeoutMs": 5000,
    "remoteCdpHandshakeTimeoutMs": 10000,
    "profiles": {
      "browserbase": {
        "cdpUrl": "wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}"
      }
    }
  }
}
```

Environment variables needed:
- `BROWSERBASE_API_KEY` - API key from browserbase.com
- `BROWSERBASE_PROJECT_ID` - Project ID from browserbase.com

### Per-User Scaling Implications

**Option A: Shared Project (simpler)**
- All users share one Browserbase project
- Usage metered/billed at Automna level
- Risk: abuse, cost overruns

**Option B: Per-User Projects (more complex)**
- Each user creates their own Browserbase account
- User enters API key during onboarding
- Stored encrypted in database
- Gateway config uses user's credentials

**Recommendation for MVP:** Option A (shared). Add usage limits later.

---

## Agentmail Integration

### How It Works

Agentmail is a REST API for programmatic email. Unlike browser (which is a Clawdbot tool), email requires custom integration.

**Options:**

1. **Python script via exec** - Agent runs Python with agentmail library
2. **Custom Clawdbot skill** - Wrapper skill with send/check commands
3. **Direct API calls** - Agent uses curl/fetch

### Recommended Approach: Skill

Create an `agentmail` skill that the agent can use naturally:

```
Agent wants to send email
        ↓
Reads agentmail skill SKILL.md
        ↓
Runs skill script: send-email.py
        ↓
Script uses agentmail API
        ↓
Email sent from agent's inbox
```

### Skill Structure

```
/root/clawd/skills/agentmail/
├── SKILL.md           # Instructions for agent
├── send-email.py      # Send email script
├── check-inbox.py     # Check inbox script
└── config.json        # API key (gitignored)
```

### Configuration

The skill reads credentials from:
- `config/agentmail.json` (already exists at `/root/clawd/config/agentmail.json`)

```json
{
  "api_key": "am_...",
  "inbox_id": "automnajoi@agentmail.to"
}
```

### Per-User Scaling Implications

**Option A: Shared Inbox with Routing**
- All users share `automnajoi@agentmail.to`
- Subject/body includes user identifier
- Replies route back to correct user session

**Option B: Per-User Inboxes**
- Each user gets `user123@agentmail.to`
- Created during onboarding via Agentmail API
- Stored in user's database record

**Recommendation for MVP:** Option A (shared inbox). User emails include their ID.

---

## Implementation Plan

### Step 1: Browserbase Config
1. Update `docker/config/clawdbot.json` with browser profile
2. Add environment variables to Docker container
3. Restart container
4. Test: `clawdbot browser status` from inside container

### Step 2: Agentmail Skill
1. Create `/root/clawd/skills/agentmail/` directory
2. Write SKILL.md with usage instructions
3. Write send-email.py and check-inbox.py scripts
4. Test from agent conversation

### Step 3: Verification
1. Sign in as grandathrawn@gmail.com
2. Ask agent to browse a website
3. Ask agent to send an email
4. Confirm both work

### Step 4: Document for Scaling
1. Note what config values are per-user vs shared
2. Document onboarding flow requirements
3. Update SPEC.md with findings

---

## Testing Commands

### Browser Test
```
"Can you go to news.ycombinator.com and tell me the top 3 stories?"
```

### Email Test
```
"Send an email to alex@beyondbaseline.io with subject 'Test from Automna' saying hello"
```

---

---

## Deployment Steps

### On the Server (100.96.168.114)

1. **Pull latest code:**
```bash
cd /path/to/automna
git pull
```

2. **Update gateway config** (`docker/config/clawdbot.json`):
```json
{
  "browser": {
    "enabled": true,
    "defaultProfile": "browserbase",
    "remoteCdpTimeoutMs": 5000,
    "remoteCdpHandshakeTimeoutMs": 10000,
    "profiles": {
      "browserbase": {
        "cdpUrl": "wss://connect.browserbase.com?apiKey=<BROWSERBASE_API_KEY>&projectId=<BROWSERBASE_PROJECT_ID>",
        "color": "#00AA00"
      }
    }
  }
}
```

3. **Add Agentmail config** (`docker/workspace/config/agentmail.json`):
```json
{
  "api_key": "<AGENTMAIL_API_KEY>",
  "inbox_id": "automnajoi@agentmail.to"
}
```

4. **Rebuild and restart Docker:**
```bash
docker build -t automna-gateway docker/
docker stop automna-gateway
docker rm automna-gateway
docker run -d \
  --name automna-gateway \
  -p 3000:3000 \
  -v $(pwd)/docker/config:/root/.clawdbot \
  -v $(pwd)/docker/workspace:/root/clawd \
  automna-gateway
```

5. **Verify:**
```bash
docker logs automna-gateway
curl http://localhost:3000/
```

---

## Security Notes

- Browserbase API key is sensitive - don't commit to repo
- Agentmail API key is sensitive - don't commit to repo
- Both should use environment variables or encrypted storage
- For production: keys should be per-user in encrypted DB fields
