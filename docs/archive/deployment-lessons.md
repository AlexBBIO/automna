# Deployment Lessons Learned

## 2026-01-29: The Great Vercel Confusion

### What Happened
Spent 45+ minutes debugging a React error that turned out to be a deployment issue.

### Root Causes

1. **Wrong Vercel Project Link**
   - Running `vercel` in `landing/` created a NEW project called "landing"
   - The real project "automna" is linked from the REPO ROOT (`automna/`)
   - The `automna` project has `rootDirectory: landing` set in Vercel settings

2. **Cache Issues**
   - Vercel edge cache was serving old code for 30+ minutes
   - `x-vercel-cache: HIT` with high `age:` = stale content
   - Data cache purge doesn't clear edge cache

3. **Rate Limiting**
   - Free tier: 100 deploys/day limit
   - Hit it after rapid iteration
   - Upgraded to Pro to continue

### Correct Deployment

```bash
# ALWAYS deploy from repo root, not landing/
cd /root/clawd/projects/automna
vercel --prod --yes --token $(jq -r .token config/vercel.json)
```

### Verification

```bash
# Check which project is linked
cat .vercel/project.json

# Should show: "projectName":"automna"
# NOT: "projectName":"landing"
```

### If Things Go Wrong

1. **Wrong project?** Delete `.vercel/` and re-link:
   ```bash
   rm -rf .vercel
   vercel link --project automna --yes --token $TOKEN
   ```

2. **Cache stale?** Check age and wait, or trigger manual redeploy from dashboard

3. **Rate limited?** Wait or upgrade plan

### Testing with Browserbase

Always use Browserbase for web testing - it's in `config/browserbase.json`.

```python
import requests
from playwright.sync_api import sync_playwright

API_KEY = "bb_live_..."
PROJECT_ID = "c17e..."

session = requests.post(
    "https://api.browserbase.com/v1/sessions",
    headers={"X-BB-API-Key": API_KEY, "Content-Type": "application/json"},
    json={"projectId": PROJECT_ID}
).json()

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(session["connectUrl"])
    page = browser.contexts[0].pages[0]
    # ... test
```
