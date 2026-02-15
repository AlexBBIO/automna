# Automna Signup Routes — Security & Reliability Audit
**Date:** 2026-02-15 | **Audited by:** Joi (sub-agent)

## Summary
Audited 15+ route files across signup/provisioning/billing/BYOK flows. Found **5 critical**, **6 high**, **8 medium**, and **4 low** severity issues.

### Fix Status (2026-02-15)
- ✅ Critical #1 — Gateway token moved to Authorization header (`f94108b`)
- ✅ Critical #2/3 — Dead legacy routes deleted (`f94108b`)
- ✅ Critical #4 — Credit deduction race condition fixed with atomic SQL (`62c9a8a`)
- ✅ Critical #5 — Setup token format validation added (`bfa6152`)
- ✅ High #6/7 — Rate limiting added to provision + BYOK (`048548c`)
- ⬚ Critical #5b — Stripe webhook metadata mismatch (outstanding)
- ⬚ High #9-11 — Cleanup, dual DB, plan validation (outstanding)
- ⬚ Medium/Low — See below (outstanding)

---

## CRITICAL

### 1. ✅ FIXED — Gateway token leaked in provision status health check URL
**File:** `src/app/api/user/provision/status/route.ts` — line ~40
**Fix:** Moved token from URL query param to `Authorization: Bearer` header.

### 2/3. ✅ FIXED — `/api/setup/deploy` dead legacy route deleted
**Fix:** Deleted route, validate-key route, and old setup wizard page. 592 lines removed.

### 4. ✅ FIXED — Race condition in credit deduction (non-atomic)
**File:** `src/app/api/user/credits/deduct/route.ts`
**Fix:** Replaced read-then-write with atomic `UPDATE ... SET balance = MAX(0, balance - amount)` with `.returning()`.

### 5. ⬚ OUTSTANDING — Stripe webhook uses customer metadata for Clerk user ID — may be missing
**File:** `src/app/api/webhooks/stripe/route.ts` — line ~180
**Issue:** `clerkUserId` from customer metadata may not exist for customers created outside `/api/checkout`. Subscription changes silently skip.

---

## HIGH

### 6/7. ✅ FIXED — No rate limiting on provision + BYOK
**Fix:** Added shared rate-limit utility. Provision: 1/5min. BYOK: 5/min. Returns 429.

### 8. ✅ FIXED — Setup token (sk-ant-oat) validation skipped entirely
**Fix:** Added format validation: min 50 chars, alphanumeric/hyphens/underscores only after prefix.

### 9. Clerk webhook `user.deleted` doesn't clean up Fly/Turso/Browserbase/Agentmail
**Risk:** Orphaned Fly machines keep running and costing money.

### 10. Dual database inconsistency (Prisma + Turso)
**Issue:** Clerk webhook writes to Prisma, rest of app reads from Turso. User can exist in one but not the other.

### 11. Provision endpoint doesn't validate `plan` value
**Issue:** `userPlan` from Clerk metadata accepted without validation. Unknown plans cause undefined behavior.

---

## MEDIUM

### 12. Waitlist endpoint has no email validation
### 13. `/api/checkout` doesn't validate `plan` against `priceId` — user could get power features at starter price
### 14. Provision status has no timeout for stale provisions — infinite spinner
### 15. Proxy mode bonus credits logic is fragile
### 16. Upgrade endpoint reads query params on POST
### 17. Auto-refill doesn't check if refill already in-flight — duplicate Stripe charges possible
### 18. Clerk webhook takes unverified email
### 19. `shortUserId` collision risk — last 12 chars of Clerk ID

---

## LOW

### 20. Error messages leak internal Fly API details
### 21. `setup/validate-key` redundant with BYOK route
### 22. Frontend connect pages redirect to `/dashboard` not `/setup/provision`
### 23. Stripe webhook returns 500 on errors — causes retries for non-idempotent operations

---

## Architecture Notes (Not Issues)
- Dual DB (Prisma + Turso) is a migration artifact — needs cleanup
- Provision is properly idempotent for existing machines ✓
- Encryption module (crypto.ts) is solid — AES-256-GCM with PBKDF2 ✓
- Fly machine updates correctly read full config before updating ✓
