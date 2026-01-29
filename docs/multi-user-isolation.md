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

### Phase 1: Moltworker Changes (45 min)

**File: `moltworker/src/index.ts`**

1. Add signed URL validation middleware
2. Extract and validate: userId, exp, sig
3. Pass validated userId to `getSandbox(env, userId)`
4. Reject invalid/expired signatures with 401

**File: `moltworker/src/gateway/sync.ts`**

1. Prefix R2 paths with userId: `/users/{userId}/...`
2. Each user's state fully isolated in R2

**File: `moltworker/src/routes/api.ts`**

1. `/api/history` endpoint needs signed URL validation
2. Read from user-specific R2 path

**New file: `moltworker/src/auth/signed-url.ts`**

```typescript
export function validateSignedUrl(url: URL, secret: string): ValidationResult {
  const userId = url.searchParams.get('userId');
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  
  if (!userId || !exp || !sig) return { valid: false, error: 'missing params' };
  if (parseInt(exp) < Date.now() / 1000) return { valid: false, error: 'expired' };
  if (!userId.startsWith('user_')) return { valid: false, error: 'invalid userId' };
  
  const payload = `${userId}.${exp}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  
  const valid = crypto.timingSafeEqual(
    Buffer.from(sig), 
    Buffer.from(expectedSig)
  );
  
  return valid ? { valid: true, userId } : { valid: false, error: 'bad signature' };
}
```

**New secret: `MOLTBOT_SIGNING_SECRET`**
- Generate: `openssl rand -base64 32`
- Add to Cloudflare Worker secrets

### Phase 2: Backend API Changes (20 min)

**File: `landing/src/app/api/user/gateway/route.ts`**

Replace hardcoded URL with signed URL generation:

```typescript
import crypto from 'crypto';
import { auth } from '@clerk/nextjs';

export async function GET() {
  const { userId } = auth();
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 });
  
  const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const payload = `${userId}.${exp}`;
  const sig = crypto
    .createHmac('sha256', process.env.MOLTBOT_SIGNING_SECRET!)
    .update(payload)
    .digest('base64url');
  
  return Response.json({
    gatewayUrl: `wss://moltbot-sandbox.alex-0bb.workers.dev/ws?userId=${userId}&exp=${exp}&sig=${sig}`,
    sessionKey: 'main'
  });
}
```

**New env var: `MOLTBOT_SIGNING_SECRET`**
- Same value as Moltworker secret
- Add to Vercel environment variables

**File: `landing/src/app/api/user/sync/route.ts`**

1. Remove hardcoded gateway credentials
2. User record just needs clerkId (no gateway fields)

### Phase 3: Frontend Changes (15 min)

**File: `landing/src/lib/clawdbot-runtime.ts`**

1. URL already constructed from backend response - no changes needed
2. HTTP history fallback: extract userId from gateway URL, pass to API

### Phase 4: Database Changes (10 min)

**File: `landing/prisma/schema.prisma`**

Simplify User model:
```prisma
model User {
  id            String   @id @default(cuid())
  clerkId       String   @unique
  email         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // Removed: gatewayUrl, gatewayToken - now derived from signed URLs
}
```

Run migration: `npx prisma migrate dev`

## Security: Signed URLs ✅

**Problem:** Shared token in WebSocket URL is visible in browser. Malicious user could extract token and connect with different userId.

**Solution:** HMAC-signed URLs (industry best practice)

### How It Works

```
1. User visits dashboard
2. Frontend calls /api/user/gateway
3. Backend generates signed URL:
   - payload = { userId, exp: now + 1 hour }
   - signature = HMAC-SHA256(payload, SECRET)
   - URL = wss://moltbot.../ws?userId=X&exp=Y&sig=Z

4. User connects to Moltworker
5. Moltworker validates:
   - Signature matches
   - Not expired
   - userId format valid (Clerk IDs are `user_*`)

6. If valid → getSandbox(env, userId)
   If invalid → 401 Unauthorized
```

### Implementation

**Backend (Next.js API route):**
```typescript
import crypto from 'crypto';

export async function GET() {
  const { userId } = auth(); // Clerk
  const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const payload = `${userId}.${exp}`;
  const sig = crypto
    .createHmac('sha256', process.env.MOLTBOT_SIGNING_SECRET!)
    .update(payload)
    .digest('base64url');
  
  return Response.json({
    gatewayUrl: `wss://moltbot-sandbox.alex-0bb.workers.dev/ws?userId=${userId}&exp=${exp}&sig=${sig}`,
    sessionKey: 'main'
  });
}
```

**Moltworker validation:**
```typescript
function validateSignedUrl(url: URL, secret: string): { valid: boolean; userId?: string } {
  const userId = url.searchParams.get('userId');
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  
  if (!userId || !exp || !sig) return { valid: false };
  if (parseInt(exp) < Date.now() / 1000) return { valid: false }; // Expired
  if (!userId.startsWith('user_')) return { valid: false }; // Invalid format
  
  const payload = `${userId}.${exp}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  
  // Timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { valid: false };
  }
  
  return { valid: true, userId };
}
```

### Security Properties

- ✅ **No shared token exposure** - Signature is user-specific
- ✅ **Time-limited** - 1 hour expiry prevents replay attacks
- ✅ **Tamper-proof** - Can't modify userId without valid signature
- ✅ **Stateless** - No database lookup needed for validation

## Additional Security

1. **Rate limiting**: Limit connection attempts per IP
2. **R2 isolation**: Paths prefixed with userId, no cross-access possible
3. **Origin validation**: Check Origin header matches automna.ai

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
| Moltworker: Signed URL validation | 30 min |
| Moltworker: userId routing + R2 prefixing | 30 min |
| Backend: Signed URL generation | 20 min |
| Frontend: Extract userId for history API | 15 min |
| Database: Simplify schema | 10 min |
| Secrets: Generate and deploy | 10 min |
| Testing | 30 min |
| **Total** | ~2.5 hours |

## Pricing Analysis

### Cloudflare Containers Pricing

**Included in $5/mo Workers Paid plan:**
- 25 GiB-hours memory
- 375 vCPU-minutes  
- 200 GB-hours disk
- 1 TB egress (NA/EU)

**Overage rates:**
| Resource | Rate |
|----------|------|
| Memory | $0.0000025 per GiB-second |
| CPU | $0.000020 per vCPU-second |
| Disk | $0.00000007 per GB-second |
| Egress | $0.025 per GB |

### Cost Scenarios (standard-4: 4 vCPU, 12 GiB, 20 GB disk)

| Scenario | 10 Users | 100 Users |
|----------|----------|-----------|
| **On-Demand** (sleep after idle) | ~$5-10/mo | ~$50-100/mo |
| **Always-On** (24/7) | ~$777/mo | ~$7,700/mo |
| **Hybrid** (8h warm/day) | ~$259/mo | ~$2,590/mo |

### Decision: On-Demand ✅

Always-on is 70x more expensive. The 10s warm start is acceptable UX.

**UX mitigation:**
- Show "Connecting to your agent..." spinner
- First boot (1-2 min): "Setting up your agent for the first time..."
- Subsequent (10s): Brief loading state

## Decisions Summary

| Question | Decision |
|----------|----------|
| Per-user gateway fields in DB? | **No** - derive from Clerk ID |
| Authentication method? | **Signed URLs** (HMAC) |
| Container lifecycle? | **On-demand** (sleep after idle) |
| Cold start handling? | **Loading UX** (no pre-warming) |
| Tokens? | **Signed per-request** (no stored tokens) |
