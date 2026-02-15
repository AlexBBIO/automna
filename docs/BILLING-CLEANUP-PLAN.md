# Billing & User Type Cleanup Plan

**Created:** 2026-02-15
**Status:** Proposed
**Triggered by:** Bobby Smithy BYOK bug — model resolution routed through proxy instead of user's own key, frontend locked chat input based on stale credit check

---

## The Problem

We have 3 user types (BYOK, proxy, legacy) checked inconsistently across ~8 code paths. The type detection logic (`byokProvider === 'anthropic_oauth' || byokProvider === 'anthropic_api_key'`) is copy-pasted everywhere. Adding a new provider or changing billing logic requires updating 6+ files, and missing one causes silent failures (like Bobby being locked out for a week).

### Current Architecture

```
User sends message
    → Dashboard checks /api/llm/usage → locks chat input if over limit
    → OpenClaw resolves model name → picks provider based on config
        → BYOK: auth-profiles.json → Anthropic direct
        → Legacy/Proxy: automna provider → our proxy → rate-limit check → Anthropic
    → Dashboard also checks /api/user/usage → shows usage banner
```

**Files that check user type:**
1. `landing/src/app/api/llm/_lib/rate-limit.ts` — backend credit/RPM check
2. `landing/src/app/api/llm/usage/route.ts` — usage stats for frontend (chat lock)
3. `landing/src/app/api/user/usage/route.ts` — usage stats for dashboard banner
4. `landing/src/hooks/useUsageStatus.ts` — frontend over-limit detection
5. `landing/src/components/UsageBanner.tsx` — dashboard banner
6. `landing/src/components/AutomnaChat.tsx` — chat input lock
7. `docker/entrypoint.sh` — config generation (model list, provider setup)
8. `landing/src/app/api/user/byok/route.ts` — credential management

---

## Phase 1: Consolidate User Type Logic (1-2 hours)

**Goal:** Single source of truth for "what kind of user is this?"

### 1a. Create `lib/user-type.ts`

```typescript
export type UserBillingType = 'byok' | 'proxy' | 'legacy';

export function getUserBillingType(byokProvider: string | null): UserBillingType {
  if (byokProvider === 'anthropic_oauth' || byokProvider === 'anthropic_api_key') return 'byok';
  if (byokProvider === 'proxy') return 'proxy';
  return 'legacy';
}

export function isByokUser(byokProvider: string | null): boolean {
  return getUserBillingType(byokProvider) === 'byok';
}

export function shouldCheckCredits(byokProvider: string | null): boolean {
  const type = getUserBillingType(byokProvider);
  // BYOK: no credit check (they use their own key)
  // Proxy: check prepaid balance
  // Legacy: check monthly allowance
  return type !== 'byok';
}

export function shouldLockChat(byokProvider: string | null, percentUsed: number): boolean {
  if (isByokUser(byokProvider)) return false; // BYOK never locked
  return percentUsed >= 100;
}
```

### 1b. Replace all inline checks

Update every file that checks `byokProvider` to import from `lib/user-type.ts`. This means future provider types (e.g., `openai_api_key`) only need updating in one place.

**Files to update:**
- `rate-limit.ts` → `if (isByokUser(user.byokProvider)) skip credit check`
- `llm/usage/route.ts` → `percentUsed = shouldCheckCredits(…) ? calculated : 0`
- `user/usage/route.ts` → same pattern
- `useUsageStatus.ts` → `setIsOverLimit(shouldLockChat(data.byokProvider, maxPercent))`
- `UsageBanner.tsx` → use `getUserBillingType()` for banner logic

### 1c. Merge usage endpoints

Consolidate `/api/llm/usage` and `/api/user/usage` into a single `/api/user/usage` endpoint that returns everything both consumers need. Delete `/api/llm/usage`. Update `useUsageStatus.ts` to call the unified endpoint.

**Current duplication:**
- Both query `usage_events` table with nearly identical logic
- Both determine plan limits independently
- They return different response shapes for no good reason

---

## Phase 2: Kill Legacy User Type (1 hour)

**Goal:** Every user is either BYOK or proxy. No more `null` byokProvider.

### 2a. Auto-migrate legacy users to proxy

Legacy users (byokProvider = null) are on the old system where we subsidize their LLM costs. There are 11 of them. They should be proxy users — same behavior, just explicitly categorized.

```sql
-- Migration
UPDATE machines SET byok_provider = 'proxy', updated_at = strftime('%s', 'now')
WHERE byok_provider IS NULL;
```

Also update Clerk metadata for each user so the dashboard reflects it.

### 2b. Remove legacy code paths

Once all users are BYOK or proxy:
- Remove `legacy` from `UserBillingType`
- Remove `LEGACY_PLAN_LIMITS` references (or rename to `PROXY_PLAN_LIMITS`)
- Simplify rate-limit: only two paths (byok = skip, proxy = check balance)

### 2c. Force choice on signup

New users MUST choose BYOK or proxy during onboarding. No more defaulting to legacy/null. The `/setup/connect` flow already handles this — just ensure the provision route won't create a machine without a choice.

---

## Phase 3: Simplify Entrypoint Config (2-3 hours)

**Goal:** Entrypoint starts services. Config is managed by the dashboard.

### 3a. Move config generation to dashboard API

Instead of the entrypoint regenerating `clawdbot.json` from env vars on every boot:

1. Dashboard generates the full config when:
   - User provisions a machine
   - User changes BYOK credentials
   - User changes plan
   - Admin pushes an update

2. Config is written to the persistent volume via Fly exec

3. Entrypoint just reads the existing config and starts the gateway

### 3b. Slim down entrypoint.sh

Remove from entrypoint:
- The entire `node -e` config merge block (~100 lines of JS in a shell script)
- Model name rewriting logic
- BYOK mode detection and config branching

Keep in entrypoint:
- Directory creation
- Workspace migrations (these are fine, they're one-time patches)
- Service startup (Caddy, file server, gateway)
- Session key fixer (until OpenClaw fixes the bug upstream)

### 3c. Config versioning

Add a `configVersion` field to the machine's Turso record. When we need to push config changes to all machines, bump the version and have a migration script that updates each machine's config via the dashboard API. No more "rebuild Docker image to change a config default."

---

## Phase 4: Proxy-First Architecture (future, bigger change)

**Goal:** Single LLM routing path for all users.

This is option B from the earlier discussion. ALL LLM traffic goes through our proxy:

```
User message → OpenClaw → automna provider (always) → Automna Proxy
    → Proxy checks: does this user have BYOK credentials?
        → Yes: forward request using THEIR key, log usage (informational only)
        → No: forward using OUR key, deduct credits
        → BYOK key fails? Fall back to our key, deduct credits, notify user
```

**Benefits:**
- No more auth-profiles.json management on Fly machines
- No more entrypoint config branching
- Automatic fallback when user's key expires
- Single place for all billing logic
- Can show users "X calls on your key, Y calls on credits" in dashboard

**Trade-offs:**
- Extra hop adds ~50-100ms latency
- Proxy becomes a harder single point of failure
- Need to store/retrieve user credentials in proxy (already in Turso encrypted)

**This is the right long-term architecture** but it's a bigger refactor. Phases 1-3 clean up the current mess so we can ship Phase 4 without rushing.

---

## Priority Order

| Phase | Effort | Risk | Impact |
|-------|--------|------|--------|
| **Phase 1: Consolidate** | 1-2 hrs | Low | Prevents next Bobby-type bug |
| **Phase 2: Kill Legacy** | 1 hr | Low | Simplifies all billing logic |
| **Phase 3: Entrypoint** | 2-3 hrs | Medium | Eliminates fragile config generation |
| **Phase 4: Proxy-first** | 1-2 days | Medium | Clean architecture, automatic fallback |

**Recommendation:** Do Phase 1 + 2 this week (quick wins, low risk). Phase 3 next week. Phase 4 when we have a quiet window.

---

## Appendix: Current User Breakdown

| byokProvider | Count | Plan(s) | Status |
|-------------|-------|---------|--------|
| `anthropic_oauth` | 4 | starter, pro, power | Active, fixed today |
| `null` (legacy) | 11 | starter, lite, pro | Costing us money, need migration |
| `proxy` | 1 | starter | Working correctly |
