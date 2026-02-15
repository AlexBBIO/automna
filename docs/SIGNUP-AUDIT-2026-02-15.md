# Automna Signup Routes — Security & Reliability Audit
**Date:** 2026-02-15 | **Audited by:** Joi (sub-agent)

## Summary
Audited 15+ route files across signup/provisioning/billing/BYOK flows. Found **5 critical**, **6 high**, **8 medium**, and **4 low** severity issues.

---

## CRITICAL

### 1. Gateway token leaked in provision status health check URL
**File:** `src/app/api/user/provision/status/route.ts` — line ~40
**Issue:** Gateway token passed as query parameter in GET request — tokens in URLs get logged by proxies, CDNs, Fly.io load balancers.

### 2. `/api/setup/deploy` uses hardcoded salt and weak encryption
**File:** `src/app/api/setup/deploy/route.ts` — lines 8-14
**Issue:** Static salt `'salt'` and default key `'automna-default-key-change-me!!'`. Trivially decryptable if `ENCRYPTION_KEY` unset.

### 3. `/api/setup/deploy` is a dead legacy route with Prisma dependency
**Issue:** Uses Prisma (PostgreSQL) while app uses Turso/Drizzle. Creates orphaned DB records. Should be deleted.

### 4. Race condition in credit deduction (non-atomic)
**File:** `src/app/api/user/credits/deduct/route.ts` — lines 34-43
**Issue:** Read-then-write pattern allows concurrent requests to double-deduct. Needs atomic SQL update.

### 5. Stripe webhook uses customer metadata for Clerk user ID — may be missing
**File:** `src/app/api/webhooks/stripe/route.ts` — line ~180
**Issue:** `clerkUserId` from customer metadata may not exist for customers created outside `/api/checkout`. Subscription changes silently skip.

---

## HIGH

### 6. No rate limiting on `/api/user/provision` POST
**Risk:** Spam creates Fly apps, volumes, Twilio numbers ($1/mo each).

### 7. No rate limiting on `/api/user/byok` POST
**Risk:** Machine restart spam, API key oracle.

### 8. Setup token (sk-ant-oat) validation skipped entirely
**File:** `src/app/api/user/byok/route.ts` — line ~200
**Issue:** Any string starting with `sk-ant-oat` accepted and stored. User won't know it's invalid until agent fails.

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
