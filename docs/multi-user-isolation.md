# Multi-User Isolation Specification

## Overview

Enable multiple users to have fully isolated Clawdbot instances on automna.ai, with automatic provisioning on signup.

## Current State

- Single Moltworker at `moltbot-sandbox.alex-0bb.workers.dev`
- Single R2 bucket `moltbot-data`
- All users share one container
- Test user hardcoded to gateway credentials

## Target State

- Each user gets isolated Cloudflare Sandbox container
- Each user's data stored in separate R2 prefix
- Automatic provisioning on signup
- No manual setup required

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         automna.ai                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User signs up ──► Clerk ──► Webhook ──► Create DB record      │
│                                                                  │
│   User visits dashboard                                          │
│         │                                                        │
│         ▼                                                        │
│   /api/user/gateway                                              │
│         │                                                        │
│         ▼                                                        │
│   Returns: wss://moltbot-sandbox.../ws?userId={clerkId}&token=X │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Moltworker                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Receives WebSocket with userId                                 │
│         │                                                        │
│         ▼                                                        │
│   getSandbox(env, userId)  ◄── Durable Object keyed by userId   │
│         │                                                        │
│         ▼                                                        │
│   Isolated container for this user                               │
│         │                                                        │
│         ▼                                                        │
│   R2 storage: /users/{userId}/clawdbot/...                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Moltworker Changes

**File: `moltworker/src/index.ts`**

1. Accept `userId` query parameter on WebSocket endpoint
2. Pass userId to `getSandbox(env, userId)` instead of hardcoded ID
3. Validate userId is present (reject connections without it)

**File: `moltworker/src/gateway/sync.ts`**

1. Prefix R2 paths with userId: `/users/{userId}/...`
2. Each user's state fully isolated in R2

**File: `moltworker/src/routes/api.ts`**

1. `/api/history` endpoint needs userId param
2. Read from user-specific R2 path

### Phase 2: Backend API Changes

**File: `landing/src/app/api/user/gateway/route.ts`**

Current: Returns hardcoded gateway URL for test user
New: Generate URL with user's Clerk ID

```typescript
// Current
return { gatewayUrl: 'wss://moltbot-sandbox.../ws?token=X' }

// New
const userId = auth().userId;
const token = process.env.MOLTBOT_GATEWAY_TOKEN;
return { 
  gatewayUrl: `wss://moltbot-sandbox.alex-0bb.workers.dev/ws?userId=${userId}&token=${token}`,
  sessionKey: 'main'
}
```

**File: `landing/src/app/api/user/sync/route.ts`**

1. Remove hardcoded gateway credentials
2. All users use same Moltworker URL, differentiated by userId

### Phase 3: Frontend Changes

**File: `landing/src/lib/clawdbot-runtime.ts`**

1. URL already constructed from backend response - no changes needed
2. HTTP history fallback needs userId param added

**File: `landing/src/components/AutomnaChat.tsx`**

1. No changes needed - gets config from parent

### Phase 4: Database Changes

**File: `landing/prisma/schema.prisma`**

Remove per-user gateway fields (no longer needed):
```prisma
model User {
  id            String   @id @default(cuid())
  clerkId       String   @unique
  email         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // Remove: gatewayUrl, gatewayToken - now derived from clerkId
}
```

Or keep them for future flexibility (custom gateway URLs).

## Security Considerations

1. **userId validation**: Moltworker should validate userId format (Clerk IDs are `user_*`)
2. **Token per user**: Currently shared token. Consider per-user tokens later.
3. **Rate limiting**: Prevent abuse by limiting container creation rate
4. **R2 isolation**: Ensure users can't access each other's R2 paths

## Token Strategy

**Option A: Shared token (simpler, for MVP)**
- All users use same `MOLTBOT_GATEWAY_TOKEN`
- Isolation via userId parameter
- Risk: Token leak exposes all users

**Option B: Per-user tokens (more secure)**
- Generate unique token per user on signup
- Store in database
- Moltworker validates token + userId pair
- More complex but more secure

**Recommendation:** Start with Option A for MVP, migrate to B later.

## Testing Plan

1. Create test user account (not Alex's)
2. Sign in as test user
3. Verify:
   - Gets isolated container (different from Alex's)
   - Can chat independently
   - History persists for test user only
   - Alex's history unchanged
4. Test concurrent usage (both users chatting)

## Rollback Plan

If issues arise:
1. Revert Moltworker to single-user mode
2. Revert backend to hardcoded credentials
3. Users fall back to shared instance

## Estimated Effort

| Task | Time |
|------|------|
| Moltworker userId routing | 30 min |
| Moltworker R2 path prefixing | 30 min |
| Backend API changes | 20 min |
| Frontend history URL fix | 10 min |
| Testing | 30 min |
| **Total** | ~2 hours |

## Open Questions

1. Should we keep per-user gateway fields in DB for future flexibility?
2. Do we need per-user tokens for MVP or is shared token OK?
3. What's the cold start experience for new users? (First container boot is slow)
4. Should we pre-warm containers on signup?
