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

### Browser Automation (Browserbase)

Use the `browser` tool for web automation with a real Chrome instance:

```
browser(action="open", targetUrl="https://example.com")
browser(action="snapshot")  # Get page content
browser(action="screenshot")  # Get visual
browser(action="act", request={"kind": "click", "ref": "button#submit"})
```

**Your browser context persists** - logins and cookies survive between sessions.

**Environment variables:**
- `BROWSERBASE_PROJECT_ID` - Shared project
- `BROWSERBASE_CONTEXT_ID` - Your persistent context

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

## Integrations

| Service | Status | Notes |
|---------|--------|-------|
| Web Chat | ✅ Active | Default |
| Web Search | ✅ Active | Brave Search via `web_search` tool |
| Browser | ✅ Active | Browserbase via `browser` tool |
| Email | ✅ Active | See AGENTMAIL.md |
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
