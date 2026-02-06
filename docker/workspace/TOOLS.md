# TOOLS.md - Local Notes

*Document integrations, credentials locations, and technical setup here.*

## API Access

All external APIs route through Automna's proxy. Your gateway token (`OPENCLAW_GATEWAY_TOKEN`) authenticates everything.

**Never expose real API keys** - they're managed server-side.

### Web Search (Brave)

Use the `web_search` tool to search the web:

```
web_search(query="your search query")
```

**Options:**
- `query` - Search query (required)
- `count` - Number of results (1-10, default 5)
- `country` - 2-letter country code (default "US")
- `freshness` - Filter by time: `pd` (past day), `pw` (past week), `pm` (past month)

**Example:**
```
web_search(query="latest AI news", count=5, freshness="pw")
```

### Browser Automation (Browserbase + Playwright)

Use Playwright to connect to Browserbase for web automation with a real Chrome browser:

```python
import os
import requests
from playwright.sync_api import sync_playwright

# Create a Browserbase session
session = requests.post(
    f"{os.environ['BROWSERBASE_API_URL']}/v1/sessions",
    headers={"X-BB-API-Key": os.environ["BROWSERBASE_API_KEY"], "Content-Type": "application/json"},
    json={"projectId": os.environ["BROWSERBASE_PROJECT_ID"]}
).json()

# Connect and browse
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(session["connectUrl"])
    page = browser.contexts[0].pages[0]
    page.goto("https://example.com")
    content = page.content()
    browser.close()
```

**Your browser context persists** - logins and cookies survive between sessions.

See `BROWSERBASE.md` for full documentation and examples.

**Environment variables:**
- `BROWSERBASE_API_URL` - Proxy endpoint (auto-configured)
- `BROWSERBASE_API_KEY` - Your gateway token
- `BROWSERBASE_PROJECT_ID` - Shared project
- `BROWSERBASE_CONTEXT_ID` - Your persistent context (for login persistence)

### Email (Agentmail)

See `AGENTMAIL.md` for full documentation.

**Quick send:**
```python
import os, requests
requests.post(
    "https://automna.ai/api/user/email/send",
    headers={"Authorization": f"Bearer {os.environ['OPENCLAW_GATEWAY_TOKEN']}"},
    json={"to": "user@example.com", "subject": "Hello", "text": "Message body"}
)
```

### LLM (Anthropic Claude)

Your LLM requests route through Automna's proxy automatically. The default model is Claude Opus 4.5.

You can use the Anthropic SDK normally - the proxy is transparent:
```python
import anthropic
client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var (your gateway token)
response = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Voice Calling (Twilio + Bland.ai)

Make and receive phone calls through your dedicated phone number.

**Make an outbound call:**
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

**After the call:**
- Transcript is automatically saved to `calls/YYYY-MM-DD_HHMM_outbound_+1234.md`
- You'll receive a notification with the summary and transcript location

**Check usage:**
```bash
curl -s "https://automna.ai/api/user/call/usage" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
```

**Inbound calls:** Your phone number answers automatically using your configured voice and prompt. Transcripts are saved the same way.

**Tips:**
- Be specific in the `task` - include names, context, and what success looks like
- The call AI is a separate model, not you. Pack context into the task prompt.
- US numbers only for now
- Call transcripts are in the `calls/` directory

## Integrations

| Service | Status | Notes |
|---------|--------|-------|
| Web Chat | ✅ Active | Default |
| Web Search | ✅ Active | Brave Search via `web_search` tool |
| Browser | ✅ Active | Browserbase via Playwright (see BROWSERBASE.md) |
| Email | ✅ Active | See AGENTMAIL.md |
| Voice Calling | ✅ Active | Outbound + Inbound via phone number |
| Discord | ❌ Not connected | Ask user for bot token |
| Telegram | ❌ Not connected | Ask user for bot token |

## Credentials & Paths

*(Note where things are stored - never write actual secrets here)*

- Config: `/home/node/.openclaw/clawdbot.json`
- Workspace: `/home/node/.openclaw/workspace/`
- Uploads: `/home/node/.openclaw/workspace/uploads/`
- Memory: `/home/node/.openclaw/workspace/memory/`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCLAW_GATEWAY_TOKEN` | Auth token for all APIs |
| `AGENTMAIL_INBOX_ID` | Your email address |
| `BROWSERBASE_PROJECT_ID` | Browser project ID |
| `BROWSERBASE_CONTEXT_ID` | Your persistent browser context |
| `BRAVE_API_URL` | Web search endpoint (auto-configured) |

## Skills Learned

*(Document capabilities you've picked up)*

## Technical Notes

*(Anything useful to remember about this environment)*

- Running on Fly.io (cloud container)
- Persistent storage survives restarts
- Can install packages with npm/apt
- Can modify own config via `gateway` tool
- All API keys are proxied - you have gateway token, not real keys

---

*Keep this updated as you learn the environment.*
