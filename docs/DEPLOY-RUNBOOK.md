# Automna Deploy Runbook

## Quick Reference

| Action | Command |
|--------|---------|
| Build & push | `./scripts/build-and-push.sh` |
| Deploy staging | `./scripts/deploy-machines.sh --app automna-u-test` |
| Deploy all | `./scripts/deploy-machines.sh` |
| Deploy specific tag | `./scripts/deploy-machines.sh abc1234` |
| Dry run | `./scripts/deploy-machines.sh --dry-run` |
| Test entrypoint | `bash docker/test-entrypoint.sh` |

## 1. Build and Push a New Image

```bash
cd /root/clawd/projects/automna

# Run entrypoint tests + build + push
./scripts/build-and-push.sh

# Build without pushing (local test)
./scripts/build-and-push.sh --no-push

# Skip tests
./scripts/build-and-push.sh --no-test
```

This tags the image with both `:latest` and `:<git-sha>` and logs to `deploy-log.jsonl`.

## 2. Deploy to Staging First

**Always deploy to the test machine first:**

```bash
./scripts/deploy-machines.sh --app automna-u-test
```

Verify:
- Machine starts without crash loops
- Gateway responds: `curl -s https://automna-u-test.fly.dev/api/v1/sessions -H "Authorization: Bearer $TOKEN"`
- Check logs: `FLY_API_TOKEN=$TOKEN fly logs -a automna-u-test --no-tail`

## 3. Deploy to All Machines

```bash
# Dry run first — shows what would happen
./scripts/deploy-machines.sh --dry-run

# Deploy latest
./scripts/deploy-machines.sh

# Deploy specific version
./scripts/deploy-machines.sh abc1234
```

The script:
- Fetches full machine config (never partial updates!)
- Updates image, clears `init.cmd` (so entrypoint runs)
- Preserves all env vars, mounts, services
- Waits for startup + health check per machine
- 10s delay between machines

## 4. Rollback

```bash
# Check deploy-log.jsonl for previous SHA
tail -5 deploy-log.jsonl

# Deploy the previous version
./scripts/deploy-machines.sh <previous-sha>
```

## 5. Debug a Broken Machine

```bash
export FLY_TOKEN=$(jq -r .token config/fly.json)
APP=automna-u-XXXXX

# Check machine state
curl -s "https://api.machines.dev/v1/apps/$APP/machines" \
  -H "Authorization: Bearer $FLY_TOKEN" | jq '.[0] | {state, config: {image: .config.image, env_keys: (.config.env | keys)}}'

# View logs
FLY_API_TOKEN=$FLY_TOKEN /root/.fly/bin/flyctl logs -a $APP --no-tail

# SSH in
FLY_API_TOKEN=$FLY_TOKEN /root/.fly/bin/flyctl ssh console -a $APP

# Inside the machine — check key things:
cat /home/node/.openclaw/clawdbot.json | jq '.agents.defaults.model'
cat /home/node/.openclaw/clawdbot.json | jq '.models.providers.automna.models'
cat /home/node/.openclaw/clawdbot.json | jq '.hooks'
ls -la /home/node/.openclaw/agents/main/agent/auth-profiles.json
ps aux | grep -E 'node|caddy'
curl -s localhost:18788/api/v1/sessions  # internal gateway port
curl -s localhost:18789/api/v1/sessions  # caddy proxy port
```

### Common Checks
- **Gateway not starting?** Check `hooks.token` is not empty in config
- **BYOK not routing?** Check `auth-profiles.json` exists and `automna.models` is `[]`
- **init.cmd set?** Means entrypoint was bypassed — clear it and restart
- **Wrong image?** Check `.config.image` — should match expected tag

## 6. Onboard a New BYOK User Manually

If the dashboard BYOK flow fails, do it manually:

```bash
APP=automna-u-XXXXX
MACHINE_ID=<machine_id>

# 1. Ensure BYOK_MODE=true in env
# Get current config, add BYOK_MODE=true, remove ANTHROPIC_BASE_URL
# (use the deploy script or Fly API directly — always full config!)

# 2. Write auth-profiles.json
B64=$(echo -n '{"version":1,"profiles":{"anthropic:default":{"type":"api_key","provider":"anthropic","key":"sk-ant-api..."}},"order":{"anthropic":["anthropic:default"]},"lastGood":{"anthropic":"anthropic:default"}}' | base64 -w0)

FLY_API_TOKEN=$FLY_TOKEN /root/.fly/bin/flyctl ssh console -a $APP -C "sh -c 'mkdir -p /home/node/.openclaw/agents/main/agent && echo $B64 | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json'"

# 3. Restart machine to pick up BYOK config
curl -sf -X POST "https://api.machines.dev/v1/apps/$APP/machines/$MACHINE_ID/stop" \
  -H "Authorization: Bearer $FLY_TOKEN" -d '{}'
# Machine auto-starts on next request, or start it manually
```

## 7. Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Gateway crash loop: `hooks.enabled requires hooks.token` | Empty gateway token | Ensure `OPENCLAW_GATEWAY_TOKEN` env var is set |
| BYOK user gets proxy errors | `automna.models` not empty `[]` | Rebuild image with BYOK entrypoint fix, redeploy |
| Config wiped (no env/mounts) | Partial config update via API | GET full config first, modify, PUT back. If already broken: delete machine, recreate from Turso |
| Machine stuck in `created` state | Image pull failure or OOM | Check Fly logs, try `fly machines start` |
| `auth-profiles.json` missing | BYOK push failed or file deleted | Re-push via Fly exec (see step 6) |
| Old image deployed | Forgot to build/push | Run `build-and-push.sh`, then deploy |

## Safety Rules

1. **NEVER partial-update** machine config via the Fly API — always GET full config, modify, POST back
2. **NEVER batch-update** all machines without testing on staging first
3. **Always preserve env vars** — the deploy script does this automatically
4. **Always clear `init.cmd`** on updates so the entrypoint runs fresh
5. **Check `deploy-log.jsonl`** for history of what was deployed where
