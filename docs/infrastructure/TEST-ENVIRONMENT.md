# Test Environment Specification

> Status: Draft — 2026-02-11

## Overview

A staging environment that mirrors production, allowing us to test changes end-to-end before they hit real users. Every deployable component gets a test counterpart.

## Why

Right now, all deploys go straight to production. This means:
- Docker image changes hit real user machines
- Vercel deploys hit the live dashboard
- Proxy deploys could break LLM routing for everyone
- No safe way to test multi-component changes together

## Architecture

```
PRODUCTION                              TEST
──────────────────                      ──────────────────
automna.ai (Vercel)                     test.automna.ai (Vercel preview)
  │                                       │
  ├── Turso DB (automna)                  ├── Turso DB (automna-test)
  │                                       │
  ├── automna-proxy.fly.dev               ├── automna-proxy-test.fly.dev
  │   (2 machines, sjc)                   │   (1 machine, sjc)
  │                                       │
  └── automna-u-{id}.fly.dev             └── automna-test-u-{id}.fly.dev
      (per-user machines)                     (1 test machine)
```

## Components

### 1. Vercel (Dashboard + API)

**Approach:** Vercel preview deployments with a stable test URL.

| | Production | Test |
|---|---|---|
| URL | `automna.ai` | `test.automna.ai` (or Vercel preview branch URL) |
| Branch | `main` | `staging` |
| Clerk | Production instance | Development instance (free) |
| Turso | `automna` DB | `automna-test` DB |
| Proxy URL env | `automna-proxy.fly.dev` | `automna-proxy-test.fly.dev` |

**Setup steps:**
1. Create `staging` branch in the automna repo
2. Add Vercel preview environment variables pointing to test infra
3. Optionally configure `test.automna.ai` domain on the preview branch
4. Create a separate Clerk "Development" instance (free tier, no extra cost)

**Deploy:** Push to `staging` branch → Vercel auto-deploys preview

### 2. Turso Database

**Approach:** Separate database for test. Same schema, isolated data.

| | Production | Test |
|---|---|---|
| DB name | `automna` | `automna-test` |
| URL | `libsql://automna-alexbbio...` | `libsql://automna-test-alexbbio...` |

**Setup steps:**
1. `turso db create automna-test --group default`
2. Apply schema from `landing/src/lib/db/schema.ts`
3. Create auth token: `turso db tokens create automna-test`
4. Seed with 1-2 test users

**Cost:** Free (Turso free tier allows multiple DBs)

### 3. API Proxy

**Approach:** Separate Fly app for the test proxy.

| | Production | Test |
|---|---|---|
| App | `automna-proxy` | `automna-proxy-test` |
| URL | `automna-proxy.fly.dev` | `automna-proxy-test.fly.dev` |
| Machines | 2 (HA) | 1 (cost saving) |
| Region | sjc | sjc |

**Setup steps:**
1. `cd fly-proxy && fly apps create automna-proxy-test`
2. Copy secrets from prod: Anthropic key, Brave key, Agentmail key, etc.
3. Set `AUTOMNA_PROXY_URL` to `https://automna-proxy-test.fly.dev`
4. Set `TURSO_URL` + `TURSO_TOKEN` to test DB
5. `fly deploy --remote-only -a automna-proxy-test`

**Cost:** ~$3-5/month (1 shared-cpu machine)

### 4. Docker Image

**Approach:** Separate image tag for test.

| | Production | Test |
|---|---|---|
| Tag | `registry.fly.io/automna-openclaw-image:latest` | `registry.fly.io/automna-openclaw-image:test` |

**Workflow:**
```bash
# Build and push test image
cd docker
docker build -t registry.fly.io/automna-openclaw-image:test .
docker push registry.fly.io/automna-openclaw-image:test

# Only after testing:
docker tag registry.fly.io/automna-openclaw-image:test registry.fly.io/automna-openclaw-image:latest
docker push registry.fly.io/automna-openclaw-image:latest
```

**Cost:** Free (Fly registry)

### 5. Test User Machine

**Approach:** One persistent Fly machine for testing, using the test image tag.

| | Production | Test |
|---|---|---|
| App pattern | `automna-u-{shortId}` | `automna-test-u-1` |
| Image | `:latest` | `:test` |
| Count | 1 per user | 1 total |

**Setup steps:**
1. `fly apps create automna-test-u-1`
2. `fly volumes create openclaw_data -a automna-test-u-1 -s 1 -r sjc`
3. Create machine with test image + test proxy URL
4. Register in test Turso DB

**Cost:** ~$7/month (2GB machine + 1GB volume)

## Environment Variables Mapping

Each test component points to its test counterpart:

```
# Vercel (test preview)
TURSO_URL=libsql://automna-test-alexbbio...
TURSO_TOKEN=<test-token>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<dev-clerk-key>
CLERK_SECRET_KEY=<dev-clerk-secret>
AUTOMNA_PROXY_URL=https://automna-proxy-test.fly.dev
FLY_APP_PREFIX=automna-test-u

# Proxy (test)
TURSO_URL=libsql://automna-test-alexbbio...
TURSO_TOKEN=<test-token>
ANTHROPIC_API_KEY=<same as prod - it's just proxying>
AUTOMNA_PROXY_URL=https://automna-proxy-test.fly.dev

# User machine (test)
AUTOMNA_PROXY_URL=https://automna-proxy-test.fly.dev
OPENCLAW_GATEWAY_TOKEN=<test-token>
```

## Deployment Workflow

```
1. Make changes in code
2. Build + push Docker image with :test tag
3. Push to staging branch → Vercel auto-deploys
4. Deploy test proxy if proxy changes: fly deploy -a automna-proxy-test
5. Update test machine if Docker changes: fly machines update ... --image ...:test
6. Test everything end-to-end on test.automna.ai
7. If good:
   a. Merge staging → main (Vercel prod auto-deploys)
   b. Tag Docker image as :latest and push
   c. Deploy prod proxy: fly deploy -a automna-proxy
   d. Roll out to user machines one by one
```

## Total Additional Cost

| Component | Monthly Cost |
|-----------|-------------|
| Vercel preview | Free |
| Turso test DB | Free |
| Test proxy (1 machine) | ~$3-5 |
| Test user machine | ~$7 |
| Docker registry | Free |
| Clerk dev instance | Free |
| **Total** | **~$10-12/month** |

## What This Enables

- **Docker image testing** — Push `:test`, validate on test machine, then promote to `:latest`
- **Dashboard testing** — Full auth flow with dev Clerk, real chat with test machine
- **Proxy testing** — Route changes, new endpoints, rate limit tweaks
- **Schema migrations** — Run against test DB first
- **Multi-component changes** — Test dashboard + proxy + image changes together before any hits prod
- **Safe experimentation** — Try new OpenClaw versions, config changes, etc.

## What This Doesn't Cover (Yet)

- **Automated tests / CI** — This is manual testing infra only. Automated E2E tests (Playwright, etc.) would be a separate effort.
- **Load testing** — Single test machine, not for performance testing
- **Multiple test users** — One test machine. If we need multi-user testing, provision more.
- **Separate Stripe** — Uses Stripe test mode (already built into Clerk dev). No separate Stripe account needed.
