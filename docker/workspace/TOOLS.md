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
```bash
curl -s -X POST "https://automna-proxy.fly.dev/api/user/email/send" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "user@example.com", "subject": "Hello", "text": "Message body"}'
```

**Send with attachments:**
```bash
# First base64-encode the file
FILE_B64=$(base64 -w0 /path/to/file.png)

curl -s -X POST "https://automna-proxy.fly.dev/api/user/email/send" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"user@example.com\",
    \"subject\": \"Photo attached\",
    \"text\": \"See the attached image.\",
    \"attachments\": [{
      \"filename\": \"photo.png\",
      \"content_type\": \"image/png\",
      \"content\": \"$FILE_B64\"
    }]
  }"
```

**Attachment format:** Each attachment needs `filename`, `content_type`, and either `content` (base64) or `url`.

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

### Voice Calling (Pro & Business plans)

Make and receive phone calls through your dedicated phone number.
**This feature requires a Pro or Business subscription.** If the user is on Starter, let them know they can upgrade at https://automna.ai/pricing to unlock voice calling.

**Make an outbound call:**
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

**After making a call:** You'll receive an automatic notification when the call completes with the summary, transcript, and status. No need to poll. Just let the user know the call is in progress and you'll update them when it's done.

**⚠️ Do NOT run any polling loops or sleep commands to wait for call results.** Long-running exec commands will block your entire session and prevent you from responding to ANY messages.

**If you need to manually check a call status (rare):**
```bash
curl -s "https://automna-proxy.fly.dev/api/user/call/status?call_id=<CALL_ID>" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" | jq '{completed, status, summary, duration_seconds}'
```

**Response fields when complete:**
- `status` - "completed", "failed", "no_answer", "voicemail"
- `summary` - AI-generated summary of the call
- `transcript` - Full conversation transcript
- `duration_seconds` - Call length

**Check usage:**
```bash
curl -s "https://automna-proxy.fly.dev/api/user/call/usage" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
```

**Tips:**
- Be specific in the `task` - include names, context, and what success looks like
- The call AI is a separate model, not you. Pack context into the task prompt.
- US numbers only for now

## Integrations

| Service | Status | Notes |
|---------|--------|-------|
| Web Chat | ✅ Active | Default |
| Web Search | ✅ Active | Brave Search via `web_search` tool |
| Browser | ✅ Active | Browserbase via Playwright (see BROWSERBASE.md) |
| Email | ✅ Active | See AGENTMAIL.md |
| Voice Calling | ✅ Pro/Business | Outbound calls via `/api/user/call` proxy |
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
