# Browserbase - Browser Automation

You have access to a real Chrome browser through Browserbase for web automation.

**Key benefits:**
- **Bypasses bot detection** - Cloudflare, CAPTCHAs, etc.
- **Persistent context** - logins and cookies survive between sessions
- **Real Chrome** - not headless, full browser features

## Quick Start

Use Playwright to connect to Browserbase:

```python
import os
import requests
from playwright.sync_api import sync_playwright

# Create a Browserbase session
session = requests.post(
    f"{os.environ['BROWSERBASE_API_URL']}/v1/sessions",
    headers={
        "X-BB-API-Key": os.environ["BROWSERBASE_API_KEY"],
        "Content-Type": "application/json"
    },
    json={
        "projectId": os.environ["BROWSERBASE_PROJECT_ID"]
    }
).json()

# Connect with Playwright
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(session["connectUrl"])
    page = browser.contexts[0].pages[0]
    
    page.goto("https://example.com")
    print(page.title())
    
    browser.close()
```

## Common Operations

### Navigate and Read Content

```python
page.goto("https://news.ycombinator.com")
content = page.content()  # Full HTML
text = page.inner_text("body")  # Text only
title = page.title()
```

### Click Elements

```python
page.click("text=Login")  # By text
page.click("button#submit")  # By selector
page.click("a[href='/about']")  # By attribute
```

### Type Text

```python
page.fill("input#email", "user@example.com")
page.fill("input#password", "secret123")
page.press("input#password", "Enter")  # Submit
```

### Wait for Elements

```python
page.wait_for_selector("div.results")
page.wait_for_load_state("networkidle")
```

### Screenshots

```python
page.screenshot(path="/tmp/screenshot.png")
page.screenshot(path="/tmp/full.png", full_page=True)
```

### Extract Data

```python
# Get all links
links = page.query_selector_all("a")
for link in links:
    print(link.get_attribute("href"))

# Get table data
rows = page.query_selector_all("table tr")
for row in rows:
    cells = row.query_selector_all("td")
    print([cell.inner_text() for cell in cells])
```

## Persistent Login (Context)

To keep logins across sessions, include your context ID:

```python
session = requests.post(
    f"{os.environ['BROWSERBASE_API_URL']}/v1/sessions",
    headers={
        "X-BB-API-Key": os.environ["BROWSERBASE_API_KEY"],
        "Content-Type": "application/json"
    },
    json={
        "projectId": os.environ["BROWSERBASE_PROJECT_ID"],
        "browserSettings": {
            "context": {
                "id": os.environ.get("BROWSERBASE_CONTEXT_ID"),
                "persist": True  # Save cookies back to context
            }
        }
    }
).json()
```

With `persist: True`, any logins you do will be saved. Next time you create a session with the same context, you'll still be logged in.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `BROWSERBASE_API_URL` | `https://automna.ai/api/browserbase` (proxy) |
| `BROWSERBASE_API_KEY` | Your gateway token |
| `BROWSERBASE_PROJECT_ID` | Browserbase project ID |
| `BROWSERBASE_CONTEXT_ID` | Your persistent context (optional) |

## Full Example: Scrape with Login

```python
import os
import requests
from playwright.sync_api import sync_playwright

def browse(url, actions=None):
    """Helper function for quick browsing tasks."""
    
    # Create session with persistent context
    session = requests.post(
        f"{os.environ['BROWSERBASE_API_URL']}/v1/sessions",
        headers={
            "X-BB-API-Key": os.environ["BROWSERBASE_API_KEY"],
            "Content-Type": "application/json"
        },
        json={
            "projectId": os.environ["BROWSERBASE_PROJECT_ID"],
            "browserSettings": {
                "context": {
                    "id": os.environ.get("BROWSERBASE_CONTEXT_ID"),
                    "persist": True
                }
            }
        }
    ).json()
    
    result = None
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(session["connectUrl"])
        page = browser.contexts[0].pages[0]
        
        page.goto(url)
        
        if actions:
            for action in actions:
                if action["type"] == "click":
                    page.click(action["selector"])
                elif action["type"] == "fill":
                    page.fill(action["selector"], action["value"])
                elif action["type"] == "wait":
                    page.wait_for_selector(action["selector"])
        
        result = {
            "title": page.title(),
            "url": page.url,
            "content": page.inner_text("body")[:5000]  # First 5000 chars
        }
        
        browser.close()
    
    return result

# Example usage
result = browse("https://news.ycombinator.com")
print(f"Title: {result['title']}")
print(f"Content preview: {result['content'][:500]}")
```

## Tips

1. **Always close the browser** - Use `with` statement or explicit `browser.close()`
2. **Wait for elements** - Don't assume page is loaded, use `wait_for_selector`
3. **Handle errors** - Wrap in try/except for network issues
4. **Session timeout** - Sessions expire after ~5 min idle, create new one if needed
5. **Check BROWSERBASE_CONTEXT_ID** - If not set, skip the context config

## Troubleshooting

**"Session expired"** - Create a new session, they timeout after inactivity

**"Element not found"** - Page might not be fully loaded, add `wait_for_selector`

**"Connection refused"** - Check that `BROWSERBASE_API_URL` is set correctly

**Login not persisting** - Make sure you're using `persist: True` and the same `BROWSERBASE_CONTEXT_ID`
