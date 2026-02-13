# BYOK Production Plan

**Date:** 2026-02-13  
**Status:** In progress

---

## The Core Problem

BYOK means users bring their own Anthropic key. When they paste it in the dashboard, it needs to end up on their Fly machine in a way that OpenClaw actually uses it. Right now:

1. **Docker image is stale** — the image on production machines doesn't have BYOK entrypoint logic at all (0 matches for "BYOK")
2. **Config stays in legacy mode** — even with `BYOK_MODE=true` env var, the old entrypoint ignores it
3. **auth-profiles.json gets pushed but nothing uses it** — gateway config still routes through `automna` proxy provider
4. **Dashboard crashes** — UsageBanner hits `.limit` on undefined for BYOK users
5. **User flow is broken** — no redirect to setup after plan switch, no gate on dashboard

---

## How OpenClaw Auth Actually Works (verified from source)

Resolution order when OpenClaw needs an API key for `anthropic`:

1. **Auth profiles** — reads `auth-profiles.json`, iterates `order.anthropic` array, returns first valid credential
2. **Environment variable** — falls back to `ANTHROPIC_API_KEY` env var
3. **Custom provider config** — falls back to provider `apiKey` in clawdbot.json (e.g. the `automna` provider)

So if `auth-profiles.json` exists with a valid credential, it wins. The `automna` provider in config is a fallback only.

**Auth-profiles.json format** (verified against my working instance):
```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "sk-ant-oat01-..."
    }
  },
  "order": { "anthropic": ["anthropic:default"] },
  "lastGood": { "anthropic": "anthropic:default" }
}
```

For API keys, use `{ "type": "api_key", "provider": "anthropic", "key": "sk-ant-api..." }`.

**Key insight:** We do NOT need to remove the `automna` provider from config. We just need:
- `auth-profiles.json` with the user's credential (takes priority)
- No `ANTHROPIC_BASE_URL` env var (so direct-to-Anthropic, not proxy)
- The `automna` provider stays in config as dormant fallback (future: overages)

---

## Execution Plan

### Step 1: Update Docker Entrypoint (30 min)

**File:** `projects/automna/docker/entrypoint.sh`

**Changes to BYOK mode logic:**

Current behavior (wrong):
- Removes `automna` provider entirely
- Rewrites model refs from `automna/` to `anthropic/`

New behavior:
- **Keep `automna` provider** in config (for future overage billing)
- **Always add automna provider** regardless of BYOK mode (it's the fallback)
- **Set default model to `anthropic/claude-opus-4-5`** in BYOK mode (so OpenClaw tries anthropic first, which hits auth-profiles.json)
- **Don't set `ANTHROPIC_BASE_URL`** in BYOK mode (so anthropic provider goes direct to api.anthropic.com)
- The `automna` provider in config still has `baseUrl` pointing to proxy — it only gets used if auth-profiles fails

Specific code changes:
```javascript
// ALWAYS add automna provider (both modes) — it's the fallback
managed.models = {
  providers: {
    automna: {
      baseUrl: proxyUrl + '/api/llm',
      apiKey: gatewayToken,
      api: 'anthropic-messages',
      models: [
        { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
        { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }
      ]
    }
  }
};

// Default model: BYOK uses anthropic directly, legacy uses automna proxy
const defaultModel = byokMode ? 'anthropic/claude-opus-4-5' : 'automna/claude-opus-4-5';

// Remove the "delete automna provider in BYOK" block entirely
// Remove the model ref rewriting (no longer needed — model is set correctly at boot)
```

For the env var section at bottom of entrypoint:
```bash
if [ "${BYOK_MODE}" = "true" ]; then
    echo "[automna] BYOK mode: LLM calls go direct to Anthropic"
    # Don't set ANTHROPIC_BASE_URL — defaults to api.anthropic.com
    # Auth-profiles.json has user's credential (pushed from dashboard)
    # automna provider stays as fallback in config
else
    echo "[automna] Legacy mode: LLM calls route through Automna proxy"
    export ANTHROPIC_BASE_URL="$AUTOMNA_PROXY_URL/api/llm"
fi
```

### Step 2: Rebuild and Push Docker Image (10 min)

```bash
cd projects/automna/docker
docker build -t registry.fly.io/automna-openclaw-image:latest .
docker push registry.fly.io/automna-openclaw-image:latest
```

### Step 3: Test on Test Machine (15 min)

**Test machine:** `automna-u-ltokvu12rcdk` (machine `2876954b9227d8`)
- Already has `BYOK_MODE=true` env var
- Has gateway token `9295b6b4-ef50-46ec-9fd3-6a61e352568e`

1. Update machine to new image: `fly machines update 2876954b9227d8 -a automna-u-ltokvu12rcdk --image registry.fly.io/automna-openclaw-image:latest --yes`
2. Wait for machine to restart
3. Verify new entrypoint ran: check logs for `[automna] BYOK mode`
4. Verify config: `cat clawdbot.json` should show automna provider AND default model as `anthropic/claude-opus-4-5`
5. Push a test auth-profiles.json via exec (using Alex's setup token or a test key)
6. SIGUSR1 to restart gateway
7. Try sending a message through the gateway — does it authenticate with Anthropic using the credential from auth-profiles.json?

**This is the critical verification.** If the gateway picks up the credential and makes a successful API call, BYOK works.

### Step 4: Update BYOK API Route for Existing Machines (20 min)

**File:** `landing/src/app/api/user/byok/route.ts`

For existing machines that are still in legacy mode (no `BYOK_MODE` env var), the credential push needs to also flip the machine:

1. **Get full machine config** (GET `/machines/{id}`)
2. **Add `BYOK_MODE: "true"` to env**, remove `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`
3. **Update machine with full config** (PUT, complete config — never partial)
4. **Stop machine** (POST `/machines/{id}/stop`)
5. **Start machine** (POST `/machines/{id}/start`)
6. Wait for machine to be in `started` state
7. **Push auth-profiles.json** via exec
8. **SIGUSR1** to restart gateway

The machine restart is needed because env var changes require a full restart (entrypoint re-runs), and the new image needs to be pulled.

### Step 5: Fix Dashboard Crashes (10 min)

**File:** `landing/src/components/UsageBanner.tsx`

Already done locally:
- Null safety: `.filter(s => s && s.limit > 0)`
- Only show "Connect Claude" when user is on BYOK plan AND has no credential

### Step 6: Fix User Flow Routing (20 min)

**Files:**
- `landing/src/app/pricing/page.tsx` line 328: After upgrade, redirect to `/setup/connect` not `/dashboard`
- `landing/src/app/dashboard/page.tsx`: If user is on BYOK plan but no credential, redirect to `/setup/connect`

### Step 7: Fix Upgrade Route for Legacy Migration (15 min)

**File:** `landing/src/app/api/upgrade/route.ts`

Legacy→BYOK is currently treated as downgrade (scheduled for period end, no proration). Change:
- Detect legacy→BYOK migration (old plan names → new plan names)
- Make it immediate with `proration_behavior: 'create_prorations'`
- Stripe automatically handles promo codes, coupons, credits in the proration math

### Step 8: Update Landing Page Pricing (30 min)

**File:** `landing/src/app/page.tsx`

Replace old 4-tier pricing section ($20/$79/$149/$299) with new 3-tier BYOK ($20/$30/$40).

### Step 9: Deploy and Test Full Flow (20 min)

1. Commit all changes
2. `vercel --prod`
3. Test new user flow: sign up → checkout → setup/connect → paste key → dashboard works
4. Test existing user flow: dashboard → migration prompt → pricing → upgrade → setup/connect → paste key → machine restarts in BYOK mode → dashboard works

---

## Order of Operations

1. **Steps 1-3 first** — Get BYOK actually working on a machine. Nothing else matters if this doesn't work.
2. **Step 4** — Make the dashboard→machine push work for existing machines.
3. **Steps 5-7** — Dashboard/flow fixes (can be done in parallel with Step 4).
4. **Step 8** — Landing page (lowest priority, just cosmetic).
5. **Step 9** — Full deployment and testing.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Auth-profiles.json format wrong | Verified format against working instance. `resolveApiKeyFromProfiles` reads `cred.token` for `type: "token"` |
| Machine restart downtime | ~30-60s per user, only happens once during migration. Acceptable. |
| Fly machine update wipes config | Always GET full config first, modify, PUT full config back |
| Setup tokens don't work for /v1/messages | Already confirmed: setup tokens DO work as API keys for messages — they just don't work for some admin endpoints |
| Existing machines on old image | Step 4 triggers image update + restart when user connects key |

---

## Open Questions

1. ~~Remove "keep my plan, just connect Claude" option?~~ (keeping automna provider handles this — they can BYOK on any plan)
2. Do we want to force-update ALL existing machine images proactively, or only update when user connects their key?
3. Grace period for legacy users who haven't migrated yet?
