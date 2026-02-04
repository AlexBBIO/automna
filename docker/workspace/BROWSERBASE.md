# Browserbase - Browser Automation

You have access to a real Chrome browser through Browserbase for web automation.

**Your browser context persists** - logins, cookies, and session data survive between uses.

## Using the Browser Tool

The easiest way is via the built-in `browser` tool:

```
browser(action="open", targetUrl="https://example.com")
browser(action="snapshot")  # Get page content as text
browser(action="screenshot")  # Get visual screenshot
browser(action="act", request={"kind": "click", "ref": "button#submit"})
```

## Common Actions

### Navigate and Read
```
browser(action="open", targetUrl="https://news.ycombinator.com")
browser(action="snapshot")  # Returns page content
```

### Click Elements
```
browser(action="act", request={"kind": "click", "ref": "link:Login"})
browser(action="act", request={"kind": "click", "ref": "button:Submit"})
```

### Type Text
```
browser(action="act", request={"kind": "type", "ref": "input#email", "text": "user@example.com"})
browser(action="act", request={"kind": "type", "ref": "input#password", "text": "secret123"})
```

### Fill Forms
```
browser(action="act", request={
    "kind": "fill",
    "fields": [
        {"ref": "input#name", "text": "John Doe"},
        {"ref": "input#email", "text": "john@example.com"},
        {"ref": "textarea#message", "text": "Hello!"}
    ]
})
```

### Screenshots
```
browser(action="screenshot")  # Current viewport
browser(action="screenshot", fullPage=True)  # Entire page
```

## Using Playwright Directly

For complex automation, use Playwright with your Browserbase session:

```python
import os
import requests
from playwright.sync_api import sync_playwright

# Create a Browserbase session via our proxy
response = requests.post(
    "https://automna.ai/api/browserbase/v1/sessions",
    headers={
        "X-BB-API-Key": os.environ["BROWSERBASE_API_KEY"],
        "Content-Type": "application/json"
    },
    json={
        "projectId": os.environ["BROWSERBASE_PROJECT_ID"],
        "browserSettings": {"context": {"id": os.environ.get("BROWSERBASE_CONTEXT_ID")}}
    }
)
session = response.json()

# Connect with Playwright
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(session["connectUrl"])
    page = browser.contexts[0].pages[0]
    
    page.goto("https://example.com")
    page.fill("input#search", "query")
    page.click("button[type=submit]")
    
    # Get content
    content = page.content()
    
    browser.close()
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `BROWSERBASE_API_KEY` | Your gateway token (proxy auth) |
| `BROWSERBASE_API_URL` | `https://automna.ai/api/browserbase` |
| `BROWSERBASE_PROJECT_ID` | Shared Browserbase project |
| `BROWSERBASE_CONTEXT_ID` | Your persistent browser context |

## Persistent Context

Your `BROWSERBASE_CONTEXT_ID` gives you a persistent browser profile:
- **Cookies persist** - stay logged in to sites
- **LocalStorage persists** - app data survives
- **Extensions** - any installed extensions remain

When you log into a website once, you'll stay logged in for future sessions.

## Tips

1. **Use snapshot first** - understand the page structure before acting
2. **Reference elements by role** - `button:Submit` is clearer than `#btn-123`
3. **Wait for navigation** - after clicks that navigate, take a new snapshot
4. **Check for errors** - some sites block automation, try different approaches

## Notes

- Browser sessions have a timeout (usually 5-15 min of inactivity)
- For long-running tasks, periodically interact to keep session alive
- All usage is logged through Automna's proxy
