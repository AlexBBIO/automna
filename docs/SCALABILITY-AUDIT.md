# Scalability Audit Report

**Date:** 2026-01-31
**Auditor:** Joi
**Status:** ⚠️ Some concerns identified

## Current Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| max_instances | 10 | Max concurrent containers |
| instance_type | standard-4 | 4GB RAM per container |
| Cron interval | */5 minutes | Syncs shared sandbox only |
| Background sync | 30 seconds | Per-container sync to R2 |
| Current DOs | 5 | 2 users + shared + test |

## Scaling Capacity

### Containers
- **Current limit:** 10 concurrent containers
- **At 10 users:** Each user gets 1 container = maxed out
- **Recommendation:** Increase to 50-100 for production
- **Cost impact:** ~$0.005/container-second when active

### Storage (R2)
- **Structure:** `/data/moltbot/users/{userId}/`
- **Per-user size:** ~10-50MB (config + workspace + history)
- **At 1000 users:** ~10-50GB total
- **Cost:** ~$0.015/GB/month = $0.15-$0.75/month for 1000 users
- **✅ Scales well**

### Durable Objects
- **Created on demand:** One per user + shared
- **No hard limit:** Cloudflare scales automatically
- **Cost:** 400K GB-sec free, then $0.0000125/GB-sec
- **✅ Scales well**

## Identified Issues

### 🔴 Issue 1: Cron Only Syncs Shared Sandbox

**Problem:** The cron job (`scheduled` function) only syncs the "shared" sandbox, not per-user sandboxes.

```typescript
// Current code - ONLY syncs shared
const sandbox = getSandbox(env.Sandbox, 'shared', options);
await syncToR2(sandbox, env);
```

**Impact:** 
- User data relies ONLY on in-container background sync (every 30s)
- If container dies unexpectedly, up to 30s of data could be lost
- No external backup mechanism for user data

**Recommendation:**
- Option A: Accept risk (container sync is usually sufficient)
- Option B: Add per-user cron sync (expensive - would need to iterate all users)
- Option C: Implement sync-on-disconnect webhook

**Current Mitigation:** Background sync in container runs every 30s, which is adequate for most cases.

### 🟡 Issue 2: Cold Start Latency

**Problem:** First connection after container sleeps takes 30-90 seconds.

**Breakdown:**
- Container start: 5-10s
- R2 mount: 2-5s
- Config restore: 5-10s
- Clawdbot boot: 15-30s
- Port ready: 5-10s

**Impact:** Poor UX for first message after idle period.

**Recommendations:**
- Set `SANDBOX_SLEEP_AFTER=never` for VIP users (keeps container warm)
- Or accept cold starts as serverless tradeoff
- Consider pre-warming on login (hit /api/status when user signs in)

### 🟡 Issue 3: Deploy Disruption

**Problem:** Every deploy resets all Durable Objects, causing ~60s of errors.

**Impact:**
- Active WebSocket connections drop
- In-flight requests fail
- Users see "Connection lost" errors

**Recommendations:**
- Production: Use staging/prod separation, deploy to prod sparingly
- Add client-side reconnect with exponential backoff
- Consider blue-green deployment pattern (advanced)

### 🟢 Issue 4: HTTP History Fallback Auth

**Problem:** `/ws/api/history` endpoint returns 401 because signed URL params aren't passed.

**Impact:** Chat history doesn't load on reconnect (minor - new messages work fine).

**Recommendation:** Fix frontend to pass signed URL params to HTTP requests.

## Scaling Recommendations

### For 10-50 Users (Current)
- ✅ Current config is adequate
- Consider increasing `max_instances` to 20 for headroom

### For 50-200 Users
- Increase `max_instances` to 50
- Monitor container memory usage
- Consider `instance_type: standard-8` if OOM issues

### For 200-1000 Users
- Increase `max_instances` to 100+
- Implement user data cleanup (delete inactive users' R2 data)
- Add monitoring/alerting for DO count and container failures
- Consider rate limiting per user

### For 1000+ Users
- Contact Cloudflare about enterprise limits
- Consider sharding (multiple workers for different user ranges)
- Implement proper observability (Logpush, metrics export)

## Cost Projections

### At 100 Active Users
| Resource | Estimate |
|----------|----------|
| Containers | ~$50-100/month |
| R2 Storage | ~$1-5/month |
| R2 Operations | ~$1/month |
| DOs | Free tier |
| **Total** | ~$55-110/month |

### At 1000 Active Users
| Resource | Estimate |
|----------|----------|
| Containers | ~$500-1000/month |
| R2 Storage | ~$10-50/month |
| R2 Operations | ~$5-10/month |
| DOs | ~$10-20/month |
| **Total** | ~$525-1080/month |

## Action Items

1. [ ] **Increase max_instances to 20** (immediate)
2. [ ] **Fix HTTP history auth** (minor UX improvement)
3. [ ] **Add pre-warm on login** (reduces cold start perception)
4. [ ] **Set up monitoring** (track DO count, container failures)
5. [ ] **Plan staging/prod separation** (before going live with customers)
6. [ ] **Document backup/recovery** (what happens if R2 data is lost?)

## Conclusion

The current architecture **will scale** to hundreds of users without major changes. The main concerns are:

1. **Cold starts** - Acceptable for MVP, optimize later
2. **Deploy disruption** - Solve with staging/prod split
3. **Data backup** - In-container sync is adequate, but consider additional safeguards

**Verdict:** ✅ Ready for MVP with 10-50 users. Minor config changes needed for 100+ users.
