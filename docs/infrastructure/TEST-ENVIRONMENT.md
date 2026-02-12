# Test Environment

> Last updated: 2026-02-12

## Quick Reference

| Component | Name / URL | Status |
|---|---|---|
| **Test machine** | `automna-u-test` / `automna-u-test.fly.dev` | ✅ Running (sjc, 2GB) |
| **Test proxy** | `automna-proxy-test` / `automna-proxy-test.fly.dev` | ⚠️ Stopped (needs start) |
| **Test DB** | `automna-test` / `libsql://automna-test-alexbbio.aws-us-west-2.turso.io` | ✅ Exists |
| **Test Docker image** | `registry.fly.io/automna-openclaw-image:test` | ✅ Exists |
| **Vercel staging** | No `staging` branch yet | ❌ Not set up |
| **Clerk dev** | Unknown | ❌ Not verified |

### Configs
- **Test DB credentials:** `config/turso-test.json`
- **Fly API token:** `config/fly.json`
- **Test gateway token:** `172b058a-5fe8-41f0-9...` (same token used for all proxied services)

---

## Architecture

```
PRODUCTION                              TEST
──────────                              ────
automna.ai (Vercel)                     (no staging frontend yet)
  │                                       │
  ├── Turso: automna                      ├── Turso: automna-test
  │                                       │
  ├── automna-proxy.fly.dev (2 machines)  ├── automna-proxy-test.fly.dev (1 machine, STOPPED)
  │                                       │
  └── automna-u-{id}.fly.dev             └── automna-u-test.fly.dev
      (13+ user machines)                     (1 test machine)
```

---

## Test Machine Details

**App:** `automna-u-test`
**Machine ID:** `68340eef773498`
**Region:** sjc
**Specs:** shared-cpu-1x, 2GB RAM, 1GB volume
**Image:** `registry.fly.io/automna-openclaw-image:test`
**Gateway URL:** `https://automna-u-test.fly.dev`
**Gateway token:** `172b058a-5fe8-41f0-9...` (see full value in Fly machine env)

**Environment variables:**
```
AGENTMAIL_INBOX_ID=testbot@mail.automna.ai
ANTHROPIC_API_KEY=<gateway-token>           # Routes through test proxy
AUTOMNA_PROXY_URL=https://automna-proxy-test.fly.dev
BRAVE_API_KEY=<gateway-token>
BRAVE_API_URL=https://automna-proxy-test.fly.dev/api/brave
BROWSERBASE_API_KEY=<gateway-token>
BROWSERBASE_API_URL=https://automna-proxy-test.fly.dev/api/browserbase
BROWSERBASE_PROJECT_ID=d28a2a1f-b953-4fa6-96c8-37e52a0c0520
GEMINI_API_KEY=<gateway-token>
GOOGLE_API_BASE_URL=https://automna-proxy-test.fly.dev/api/gemini
GOOGLE_API_KEY=<gateway-token>
OPENCLAW_GATEWAY_TOKEN=<gateway-token>
```

All API keys are the same gateway token — the test proxy authenticates via this token and routes to real API providers.

---

## Common Operations

### Prerequisites

All Fly commands need the API token. Either:
```bash
export FLY_API_TOKEN=$(jq -r .token /root/clawd/projects/automna/config/fly.json)
```
Or use curl directly against `https://api.machines.dev/v1/`.

Note: `fly` CLI is not logged in on this server. Use the API token from `config/fly.json` with `--access-token` flag or `FLY_API_TOKEN` env var.

### Start/Stop Test Proxy

```bash
FLY_TOKEN=$(jq -r .token config/fly.json)

# Start
curl -s -X POST "https://api.machines.dev/v1/apps/automna-proxy-test/machines/d8929e9c626128/start" \
  -H "Authorization: Bearer $FLY_TOKEN"

# Stop
curl -s -X POST "https://api.machines.dev/v1/apps/automna-proxy-test/machines/d8929e9c626128/stop" \
  -H "Authorization: Bearer $FLY_TOKEN"
```

### Build & Push Test Docker Image

```bash
cd /root/clawd/projects/automna/docker

# Build
docker build -t registry.fly.io/automna-openclaw-image:test .

# Push
docker push registry.fly.io/automna-openclaw-image:test

# Update test machine to use new image
FLY_TOKEN=$(jq -r .token ../config/fly.json)

# IMPORTANT: GET full config first, then update (Fly does full replacement!)
FULL_CONFIG=$(curl -s "https://api.machines.dev/v1/apps/automna-u-test/machines/68340eef773498" \
  -H "Authorization: Bearer $FLY_TOKEN" | python3 -c "
import sys,json
m=json.load(sys.stdin)
c=m['config']
c['image']='registry.fly.io/automna-openclaw-image:test'
print(json.dumps({'config':c}))
")

curl -s -X POST "https://api.machines.dev/v1/apps/automna-u-test/machines/68340eef773498" \
  -H "Authorization: Bearer $FLY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$FULL_CONFIG"
```

### Promote Test Image to Production

Only after testing passes:
```bash
docker tag registry.fly.io/automna-openclaw-image:test registry.fly.io/automna-openclaw-image:latest
docker push registry.fly.io/automna-openclaw-image:latest
```

### SSH into Test Machine

```bash
FLY_TOKEN=$(jq -r .token config/fly.json)

# Execute a command
curl -s -X POST "https://api.machines.dev/v1/apps/automna-u-test/machines/68340eef773498/exec" \
  -H "Authorization: Bearer $FLY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": ["cat", "/home/node/.openclaw/agents/main/agent/auth-profiles.json"]}'
```

Or if `fly` CLI is authenticated:
```bash
fly ssh console -a automna-u-test -C "cat /home/node/.openclaw/agents/main/agent/auth-profiles.json"
```

### Check Test Machine Logs

```bash
fly logs -a automna-u-test --no-tail
```

### Query Test Database

```bash
# Using turso CLI (need to be logged in)
turso db shell automna-test

# Or via libsql URL from config/turso-test.json
```

---

## Testing the BYOK Pivot

### What to Test

1. **New onboarding flow:**
   - Create test user in test Clerk + test DB
   - Go through Stripe checkout (test mode)
   - Connect credentials (setup-token or API key)
   - Verify machine provisions and connects to Anthropic directly

2. **Credential push:**
   - Write auth-profiles.json to test machine
   - Restart gateway
   - Verify LLM calls go direct to Anthropic (not through proxy)

3. **Feature gating:**
   - Starter: no phone, no cron, 1 channel, sleeps idle
   - Pro: phone works, cron works, 3 channels, always-on
   - Power: API access, unlimited channels

4. **Migration:**
   - Simulate plan change on test user
   - Verify Stripe subscription updates correctly
   - Verify grace period logic

### Quick Smoke Test (BYOK on Test Machine)

```bash
# 1. Write a test auth profile with a real setup-token or API key
FLY_TOKEN=$(jq -r .token config/fly.json)

# 2. SSH in and write auth-profiles.json
fly ssh console -a automna-u-test -C "sh -c 'cat > /home/node/.openclaw/agents/main/agent/auth-profiles.json << EOF
{
  \"version\": 1,
  \"profiles\": {
    \"anthropic:default\": {
      \"type\": \"token\",
      \"provider\": \"anthropic\",
      \"token\": \"sk-ant-api03-YOUR-TEST-KEY-HERE\"
    }
  },
  \"order\": { \"anthropic\": [\"anthropic:default\"] },
  \"lastGood\": { \"anthropic\": \"anthropic:default\" }
}
EOF'"

# 3. Update entrypoint to skip proxy for LLM (set BYOK_MODE)
# This requires a new Docker image build with the BYOK entrypoint changes

# 4. Restart the machine
curl -s -X POST "https://api.machines.dev/v1/apps/automna-u-test/machines/68340eef773498/restart" \
  -H "Authorization: Bearer $FLY_TOKEN"

# 5. Check logs to verify direct Anthropic connection
fly logs -a automna-u-test --no-tail | tail -30
```

---

## What's Missing (TODO)

| Component | Status | Effort |
|---|---|---|
| Vercel staging branch | Not created | ~1h (create branch, set env vars) |
| Clerk dev instance | Not verified | ~30m (create or verify) |
| Test proxy env vars | May need update for BYOK | ~15m |
| Automated E2E tests | Not started | Future effort |

---

## Cost

| Component | Monthly |
|---|---|
| Test machine (2GB, always-on) | ~$7 |
| Test proxy (1 machine, start/stop as needed) | ~$1-3 |
| Test DB (Turso) | Free |
| Docker registry | Free |
| **Total** | **~$8-10/mo** |
