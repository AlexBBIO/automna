# Provisioning Flow

> Last updated: 2026-02-11

## Overview

When a new user signs up and lands on the dashboard, they're automatically provisioned a dedicated Fly.io app with an OpenClaw instance.

## Flow

```
1. User signs up (Clerk)
2. Redirected to /dashboard
3. Dashboard calls GET /api/user/gateway
4. No machine found in Turso → calls POST /api/user/provision
5. Provision creates:
   a. Fly app: automna-u-{shortId}
   b. 1GB encrypted volume
   c. Fly machine (2GB RAM, 1 vCPU)
   d. Browserbase context (persistent browser)
   e. Agentmail inbox ({adjective}{noun}@mail.automna.ai)
   f. Phone number (Pro/Business plans only, via Stripe webhook)
6. Records everything in Turso (machines table)
7. Dashboard polls GET /api/user/health until gateway responds
8. ChatSkeleton shows warming tips + timer
9. Gateway ready → chat loads
```

## Plan Detection (Race Condition Fix)

When `publicMetadata.plan` is "starter" but user has a `stripeCustomerId`, the provision endpoint checks Stripe directly for active subscription. Maps price ID → plan name. Also fixes Clerk metadata in-flight.

**Commit:** `dfb3b04`

## Machine Config

See `../infrastructure/FLY-MACHINES.md` for the full machine configuration passed to the Fly Machines API.

## Docker Image

Image: `registry.fly.io/automna-openclaw-image:latest`

See `DOCKER.md` for entrypoint, workspace initialization, and migration system.

## Timing

- App + volume creation: ~10-15s
- Machine start + OpenClaw boot: ~45-60s
- Total cold provision: ~60-90s
- Subsequent loads (machine already running): instant
