# Automna Infrastructure Comparison

**Date:** 2026-02-02  
**Purpose:** Evaluate hosting providers for always-on AI agent workloads

---

## Executive Summary

For Automna's "always-on agent" value proposition, we need infrastructure that:
1. Runs 24/7 without hibernation
2. Costs < $10/user/month at scale
3. Supports per-user isolation
4. Has API for programmatic provisioning
5. Handles WebSocket connections (Discord, Telegram, web)

**Recommendation:** Hetzner Cloud VMs with Coolify for management, or Fly.io for simpler ops.

---

## Provider Comparison

### Cost Summary (Always-On, ~2GB RAM equivalent)

| Provider | Monthly Cost | Always-On? | Ops Complexity | Notes |
|----------|-------------|------------|----------------|-------|
| **Hetzner CX22** | **~$4-5** | ✅ Yes | Medium | Best price/performance |
| **DigitalOcean** | ~$6 | ✅ Yes | Medium | Good API, more expensive |
| **Fly.io (shared)** | ~$7-9 | ✅ Yes | Low | Easy deploy, good DX |
| **Koyeb** | ~$5-7 | ✅ Yes | Low | Newer platform |
| **Render** | ~$25 | ✅ Yes | Low | Expensive for what you get |
| **Railway** | ~$30-50 | ✅ Yes | Low | Per-second billing adds up |
| **AWS Fargate** | ~$15-20 | ✅ Yes | High | Complex, expensive |
| **Google Cloud Run** | ~$76 | ✅ Yes | Medium | Very expensive always-on |
| **Cloudflare Sandbox** | ~$26+ | ⚠️ Hibernates | Low | Wrong model for always-on |

---

## Detailed Provider Analysis

### 1. Hetzner Cloud ⭐ RECOMMENDED (Cost)

**Pricing (EU, ex VAT):**
| Plan | vCPU | RAM | Storage | Monthly |
|------|------|-----|---------|---------|
| CX22 | 2 shared | 4 GB | 40 GB NVMe | €3.79 (~$4.50) |
| CX32 | 4 shared | 8 GB | 80 GB NVMe | €6.80 (~$8) |
| CX42 | 8 shared | 16 GB | 160 GB NVMe | €14.40 (~$17) |

**Pros:**
- Cheapest option by far
- Excellent performance (NVMe, 20TB traffic included)
- Full API for provisioning (`POST /v1/servers`)
- EU + US data centers
- Hourly billing with monthly cap
- IPv6 included, IPv4 optional (-€0.50)

**Cons:**
- More ops work (need to manage VMs ourselves)
- No built-in container orchestration
- Need to handle SSH key management, updates, etc.

**Architecture:**
```
User signs up → API creates Hetzner VM → Install Docker + Clawdbot → User connects
```

**Ops Options:**
- **Manual:** Docker Compose per VM, SSH for management
- **Coolify:** Self-hosted PaaS on a management VM, handles deploys
- **Ansible/Terraform:** Infrastructure as code for provisioning

---

### 2. Fly.io ⭐ RECOMMENDED (Ease of Use)

**Pricing:**
| Config | vCPU | RAM | Monthly (always-on) |
|--------|------|-----|---------------------|
| shared-cpu-1x | 1 shared | 256 MB | ~$2 |
| shared-cpu-1x | 1 shared | 1 GB | ~$5 |
| shared-cpu-1x | 1 shared | 2 GB | ~$9 |
| shared-cpu-2x | 2 shared | 2 GB | ~$14 |
| performance-1x | 1 dedicated | 2 GB | ~$35 |

**Pros:**
- `fly launch` deploys from Dockerfile
- `min_machines_running = 1` keeps it always-on
- Global edge network (low latency)
- Easy scaling per user
- Good CLI and API
- Free tier: 3 shared-cpu-1x 256MB VMs

**Cons:**
- More expensive than Hetzner (~2x)
- Shared CPU can be noisy neighbor
- Egress costs ($0.02/GB after 100GB free)

**Architecture:**
```
User signs up → Fly API creates Machine → Clawdbot runs → User connects
```

**Key Config:**
```toml
# fly.toml
[http_service]
  min_machines_running = 1  # Always on!
  
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 2048
```

---

### 3. DigitalOcean

**Pricing:**
| Plan | vCPU | RAM | Monthly |
|------|------|-----|---------|
| Basic | 1 | 512 MB | $4 |
| Basic | 1 | 1 GB | $6 |
| Basic | 1 | 2 GB | $12 |
| Basic | 2 | 2 GB | $18 |

**Pros:**
- Reliable, well-known
- Good API and CLI
- App Platform for easier deploys
- Managed databases available

**Cons:**
- ~50% more expensive than Hetzner
- App Platform is pricier than raw Droplets
- Less EU presence

---

### 4. Railway

**Pricing:** Per-second billing
- CPU: $0.000008/vCPU-second (~$20/vCPU-month)
- Memory: $0.000004/GB-second (~$10/GB-month)

**Example (1 vCPU, 2GB always-on):** ~$40-50/month

**Pros:**
- Very easy deployment (GitHub integration)
- Nice UI/UX
- Good for small projects

**Cons:**
- Expensive for always-on workloads
- Per-second billing punishes 24/7 usage
- Better suited for scale-to-zero

---

### 5. Render

**Pricing:**
| Plan | vCPU | RAM | Monthly |
|------|------|-----|---------|
| Starter | 0.5 | 512 MB | $7 |
| Standard | 1 | 2 GB | $25 |
| Pro | 4 | 8 GB | $85 |

**Pros:**
- Easy deploys
- Free SSL, CDN
- Background workers supported

**Cons:**
- Expensive ($25/mo minimum for decent specs)
- No real cost advantage over VMs

---

### 6. Koyeb

**Pricing:**
- Nano: ~$5/month
- Micro: ~$11/month
- Small: ~$22/month

**Pros:**
- Global edge deployment
- Per-second billing
- Docker support

**Cons:**
- Newer platform (less proven)
- Limited documentation

---

### 7. AWS Fargate

**Pricing (0.25 vCPU, 0.5GB):** ~$9/month
**Pricing (0.5 vCPU, 1GB):** ~$18/month

**Pros:**
- AWS ecosystem integration
- Spot instances for savings
- Enterprise features

**Cons:**
- Complex to set up
- More expensive than alternatives
- Overkill for our use case

---

### 8. Google Cloud Run

**Pricing (1 vCPU, 1GB always-on):** ~$76/month

**Not recommended.** Designed for scale-to-zero, very expensive for always-on.

---

### 9. Cloudflare Sandbox (Current)

**Pricing (4GB, always-on estimate):** ~$26/month

**Problems:**
- Designed for scale-to-zero, hibernates after ~5 min
- Fighting the platform's core design
- Cold starts of 10-20s
- Not truly "always-on"

**Verdict:** Wrong tool for the job.

---

## Recommended Architecture

### Option A: Hetzner + Coolify (Cheapest)

```
┌─────────────────────────────────────────────────────────────┐
│                    Hetzner Cloud                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Management  │  │   User A    │  │   User B    │  ...    │
│  │   VM        │  │    VM       │  │    VM       │         │
│  │  (Coolify)  │  │ (Clawdbot)  │  │ (Clawdbot)  │         │
│  │   CX22      │  │   CX22      │  │   CX22      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare (DNS, CDN, R2)                       │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Vercel (Dashboard)                           │
└─────────────────────────────────────────────────────────────┘
```

**Cost per user:** ~$4-5/month
**Ops work:** Medium (Coolify helps, but still managing VMs)

---

### Option B: Fly.io (Easiest)

```
┌─────────────────────────────────────────────────────────────┐
│                      Fly.io                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   User A    │  │   User B    │  │   User C    │  ...    │
│  │  Machine    │  │  Machine    │  │  Machine    │         │
│  │ (Clawdbot)  │  │ (Clawdbot)  │  │ (Clawdbot)  │         │
│  │ shared-1x   │  │ shared-1x   │  │ shared-1x   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare (DNS, CDN, R2)                       │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Vercel (Dashboard)                           │
└─────────────────────────────────────────────────────────────┘
```

**Cost per user:** ~$7-9/month
**Ops work:** Low (Fly handles most things)

---

## Migration Path

### From Cloudflare Sandbox to New Provider

**What we keep:**
- Vercel frontend (no change)
- Cloudflare DNS/CDN (no change)
- R2 storage (or migrate to S3)
- Auth logic (signed URLs → JWT or similar)
- 80% of API code (routing, WebSocket proxy)

**What we change:**
- Container orchestration (Sandbox SDK → Fly API or Hetzner API)
- Provisioning flow (Durable Objects → database tracking)
- Health checks / monitoring

**Estimated effort:** 2-3 days for basic Fly.io port, 4-5 days for Hetzner + Coolify

---

## Recommendation

**For MVP (launch fast):** Fly.io
- ~$7-9/user/month is acceptable for MVP pricing
- Very fast to implement
- Good developer experience
- Can migrate to Hetzner later for cost optimization

**For Production (cost optimize):** Hetzner + Coolify
- ~$4-5/user/month at scale
- More control
- Better margins on $29-79/month plans

**Suggested approach:**
1. Build Fly.io implementation first (1-2 days)
2. Launch MVP on Fly.io
3. If successful, migrate to Hetzner for cost savings
4. Keep Fly.io as backup/overflow

---

## Next Steps

1. [ ] Decide: Fly.io (fast) or Hetzner (cheap)?
2. [ ] Create Fly.io account and test basic deployment
3. [ ] Port container startup logic
4. [ ] Update dashboard to provision via new API
5. [ ] Test WebSocket connections through new infra
6. [ ] Migrate storage (R2 → keep or move to S3)
7. [ ] Update DNS/routing
8. [ ] Test full flow with test user
