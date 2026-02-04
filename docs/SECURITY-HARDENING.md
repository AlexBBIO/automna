# Security Hardening Plan

**Created:** 2026-02-04
**Status:** Phases 1 & 3 complete, deployed
**Risk Level:** Low-Medium (defensive improvements, not fixing active vulnerabilities)

---

## Overview

Four improvements to move from "works fine" to "properly hardened":

1. Input validation with Zod schemas
2. Await rate limit database writes
3. Path traversal protection on file API
4. Structured logging cleanup

---

## 1. Input Validation (Zod Schemas)

**Problem:** API routes accept JSON without validating structure/types.

**Risk of change:** Medium - overly strict validation could reject valid requests.

### Plan

**Phase 1: Add Zod, validate non-critical routes first**
```bash
cd landing && pnpm add zod
```

Start with low-traffic routes to catch any issues:
- `/api/waitlist` - simple email validation
- `/api/admin/settings` - admin-only, low risk

**Phase 2: Add to LLM proxy routes**

Create shared schemas in `/src/app/api/llm/_lib/schemas.ts`:
```ts
import { z } from 'zod';

export const messagesRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.union([z.string(), z.array(z.any())]),
  })),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
  // ... other Anthropic params
}).passthrough(); // Allow extra fields we don't validate
```

**Key:** Use `.passthrough()` so we don't break requests with fields we forgot to include.

**Phase 3: Files API validation**
```ts
const filePathSchema = z.string()
  .min(1)
  .refine(p => p.startsWith('/home/node/'), 'Invalid path prefix');
```

### Rollback
Validation is additive. If something breaks, remove the `.parse()` call and the route works as before.

### Verification
- Run existing integration tests
- Manual test: dashboard file browser, chat, admin panel
- Monitor error rates for 24h after deploy

---

## 2. Await Rate Limit Writes

**Problem:** Rate limit counter updates are fire-and-forget. Could allow slight overages.

**Risk of change:** Low - adds ~5-10ms latency per request.

### Current Code
```ts
// Fire and forget - don't await
db.update(llmRateLimits)
  .set({ requestsThisMinute: sql`requests_this_minute + 1` })
  .where(eq(llmRateLimits.userId, user.userId))
  .catch(err => console.error('[rate-limit] Failed to increment:', err));
```

### Updated Code
```ts
try {
  await db.update(llmRateLimits)
    .set({ requestsThisMinute: sql`requests_this_minute + 1` })
    .where(eq(llmRateLimits.userId, user.userId));
} catch (err) {
  // Log but don't block the request - fail open for better UX
  console.error('[rate-limit] Failed to increment:', err);
}
```

### Why "fail open"?
If the DB write fails, we let the request through anyway. The alternative (blocking the request) would mean DB issues = total outage. Rate limiting is about preventing abuse, not perfect accounting.

### Verification
- Load test: 50 rapid requests, verify counter is accurate
- Check p99 latency before/after

---

## 3. Path Traversal Protection

**Problem:** File paths from users go straight to the file server without validation.

**Risk of change:** Medium - legitimate paths might get rejected if validation is too strict.

### Current Flow
```
User: GET /api/files/read?path=/home/node/../../../etc/passwd
  → We pass it to file server
  → File server (hopefully) rejects it
```

### Updated Flow
```
User: GET /api/files/read?path=/home/node/../../../etc/passwd
  → validateFilePath() rejects it immediately
  → 400 Bad Request
```

### Implementation

Add to `/src/app/api/files/_lib/validation.ts`:
```ts
import path from 'path';

const ALLOWED_ROOTS = [
  '/home/node/.openclaw',
  '/home/node/workspace',
];

export function validateFilePath(inputPath: string): { valid: boolean; normalized?: string; error?: string } {
  // Normalize to resolve ../ and ./
  const normalized = path.normalize(inputPath);
  
  // Check for null bytes (classic attack vector)
  if (inputPath.includes('\0')) {
    return { valid: false, error: 'Invalid characters in path' };
  }
  
  // Must start with an allowed root
  const allowed = ALLOWED_ROOTS.some(root => normalized.startsWith(root));
  if (!allowed) {
    return { valid: false, error: 'Path outside allowed directories' };
  }
  
  return { valid: true, normalized };
}
```

Use in route handlers:
```ts
const validation = validateFilePath(filePath);
if (!validation.valid) {
  return NextResponse.json({ error: validation.error }, { status: 400 });
}
// Use validation.normalized for the actual request
```

### Testing
Create test cases:
```ts
// Should pass
'/home/node/.openclaw/workspace/file.txt' ✓
'/home/node/.openclaw/sessions/abc/history.jsonl' ✓

// Should fail
'/etc/passwd' ✗
'/home/node/../etc/passwd' ✗
'/home/node/.openclaw/../../etc/passwd' ✗
'../../../etc/passwd' ✗
'/home/node/.openclaw/file\0.txt' ✗
```

### Rollback
Remove the validation check. Routes work as before (relying on file server).

---

## 4. Structured Logging

**Problem:** `console.log` everywhere with inconsistent formats.

**Risk of change:** Very low - logging changes don't affect functionality.

### Plan

**Option A: Simple cleanup (recommended for now)**
- Remove verbose debug logs
- Keep error logs and important events
- Standardize format: `[module] action: details`

**Option B: Proper logging library (future)**
- Add `pino` or similar
- Structured JSON logs
- Log levels (debug/info/warn/error)
- Automatic redaction of sensitive fields

### Immediate Actions
1. Remove all `console.log` that just say "success"
2. Keep logs for: errors, rate limiting, auth failures, file operations
3. Redact any user data being logged

### Files to Update
- `/api/files/[...path]/route.ts` - 10+ console.logs
- `/api/llm/chat/route.ts` - verbose request logging
- `/api/webhooks/*.ts` - user email logging

---

## Implementation Order

| Phase | Item | Risk | Time | Status |
|-------|------|------|------|--------|
| 1 | Logging cleanup | Very Low | 30min | ✅ Done |
| 2 | Rate limit await | Low | 15min | Pending |
| 3 | Path validation | Medium | 1hr | ✅ Done |
| 4 | Zod schemas | Medium | 2hr | Pending |

**Total estimated time:** ~4 hours

### Deploy Strategy
- Each phase is a separate PR/commit
- Deploy to production after each phase
- Monitor for 24h before next phase
- Keep phases small so rollback is easy

---

## Verification Checklist

After all changes:
- [ ] Dashboard loads and displays files
- [ ] Chat works (streaming and non-streaming)
- [ ] File upload/download works
- [ ] Admin panel accessible
- [ ] Rate limiting still triggers at limits
- [ ] No increase in error rates (check Vercel logs)
- [ ] No increase in latency (check Vercel analytics)

---

## Not Doing (Yet)

These are nice-to-haves for later:
- CSRF tokens (Clerk handles auth, low risk)
- Request signing (would require SDK changes)
- WAF/DDoS protection (Vercel/Cloudflare handles this)
- Dependency vulnerability scanning (should add to CI)
