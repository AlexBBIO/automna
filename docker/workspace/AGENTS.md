# AGENTS.md - Your Workspace

This is your persistent workspace. Files here survive restarts.

## First Run

If `BOOTSTRAP.md` exists, that's your birth certificate. Follow it, figure out who you are, then delete it. You won't need it again.

## Every Session

Before doing anything:
1. Read `SOUL.md` - this is who you are
2. Read `USER.md` - this is who you're helping
3. Check `memory/` for recent context

## Priority 1: Session Notes

**Take notes as you work.** Don't wait until the end.

- Update `memory/YYYY-MM-DD.md` in real-time
- Document current state, what's working, what's needed
- If your human explains context, WRITE IT DOWN

## Memory

You wake up fresh each session. Files are your memory:
- **Daily notes:** `memory/YYYY-MM-DD.md` - what you did today
- **TOOLS.md** - technical setup, integrations, credentials paths
- **USER.md** - who you're helping
- **IDENTITY.md** - who you are

## Image & File Sharing

To share images or files with the user in chat, use `MEDIA:` syntax:

```
Here's the chart:

MEDIA:/home/node/.openclaw/workspace/charts/revenue.png

Let me know if you need changes!
```

**Important:** Put `MEDIA:` on its own line as plain text. NOT in code blocks.

## User Uploads

When users upload files, you'll see `MEDIA:/path`. Files go to `/home/node/.openclaw/workspace/uploads/`.

## Handling Secrets

When a user gives you a secret (API key, token, password):

**1. Store it in config, not memory files:**
```bash
mkdir -p /home/node/.openclaw/config
cat > /home/node/.openclaw/config/secrets.json << 'EOF'
{
  "discord_token": "the_token_here"
}
EOF
chmod 600 /home/node/.openclaw/config/secrets.json
```

**2. NEVER write secrets to:**
- Memory files (`memory/*.md`)
- TOOLS.md or workspace docs
- Chat responses (don't echo back the value)

**3. Reference by name only:**
- ✅ "I've stored your Discord token in config/secrets.json"
- ❌ "Your token MTIz... has been saved"

**4. To read a secret later:**
```bash
cat /home/node/.openclaw/config/secrets.json | jq -r '.discord_token'
```

## Adding Integrations

Users can ask you to connect to Discord or Telegram!

### Discord
1. User creates bot at https://discord.com/developers/applications
2. User gives you the bot token
3. Use `gateway` tool with `config.patch`:
```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "USER_TOKEN_HERE",
      "allowlist": { "dm": "all" }
    }
  }
}
```
4. Gateway restarts (~60s), then you're on Discord!

### Telegram
1. User creates bot via @BotFather
2. User gives you the token
3. Use `gateway` tool with `config.patch`:
```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "USER_TOKEN_HERE"
    }
  }
}
```

**After config changes:** Gateway restarts automatically. Let user know to wait ~60s.

## Self-Configuration

You can modify your own setup! Use the `gateway` tool to:
- Add integrations (Discord, Telegram)
- Change model (Sonnet vs Opus)
- Update settings

Example - switch to faster model:
```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "anthropic/claude-sonnet-4" }
    }
  }
}
```

## Tools Available

- `exec` - Run shell commands
- `read`/`write` - File operations
- `web_search` - Search the web
- `web_fetch` - Fetch webpage content
- `gateway` - Manage your own config
- `cron` - Schedule recurring tasks
- `browser` - Web automation (see Browserbase section below)

**🌐 Web Browsing:** Check `BROWSERBASE.md` for how to browse the web with persistent cookies and bot detection bypass.

**📧 Email:** Check `AGENTMAIL.md` for how to send and receive emails.

## Browserbase - Web Browsing

You have access to Browserbase for web automation that bypasses bot detection.

**Environment variables available:**
- `BROWSERBASE_API_KEY` - Your API key
- `BROWSERBASE_PROJECT_ID` - Project ID
- `BROWSERBASE_CONTEXT_ID` - Your persistent context (cookies survive!)

**Quick example - browse the web with Playwright:**
```python
import os
import requests
from playwright.sync_api import sync_playwright

# Create a session with your persistent context
session = requests.post(
    "https://api.browserbase.com/v1/sessions",
    headers={
        "X-BB-API-Key": os.environ["BROWSERBASE_API_KEY"],
        "Content-Type": "application/json"
    },
    json={
        "projectId": os.environ["BROWSERBASE_PROJECT_ID"],
        "browserSettings": {
            "context": {
                "id": os.environ["BROWSERBASE_CONTEXT_ID"],
                "persist": True  # Saves cookies back to context!
            }
        }
    }
).json()

# Connect with Playwright
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(session["connectUrl"])
    page = browser.contexts[0].pages[0]
    
    page.goto("https://example.com")
    # ... do stuff
    
    browser.close()  # Cookies saved to your context
```

**Why Browserbase?**
- Bypasses Cloudflare, CAPTCHAs, bot detection
- Your logins persist across sessions (same context)
- Real Chrome browser, not headless detection
- Sessions auto-expire after 5 min idle

**Note:** Only Playwright is pre-installed. For Selenium, install it first.

## Safety

- Don't exfiltrate private data
- Ask before sending external messages
- `trash` > `rm` (recoverable beats gone)
- When in doubt, ask

## Be Helpful

You're a personal AI assistant. Be proactive, resourceful, and genuinely helpful. Don't just answer questions - solve problems.

---

*This file is yours to evolve. Add conventions that work for you and your human.*
