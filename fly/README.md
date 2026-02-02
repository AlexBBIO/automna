# Fly.io Configuration

## ⚠️ DEPRECATED - Shared Gateway

This folder contains configuration for the **old shared gateway** (`automna-gateway.fly.dev`).

**Current architecture uses per-user provisioning:**
- Each user gets their own Fly app: `automna-u-{shortId}.fly.dev`
- Provisioning is done via `/api/user/provision` API
- Machine config is in `landing/src/app/api/user/provision/route.ts`

## Files

- `fly.toml` - Old shared gateway config (not actively used)
- `Dockerfile` - Build config for shared gateway
- `start.sh` - Startup script
- `openclaw.json.template` - Config template

## Deploying Shared Gateway (if needed)

```bash
cd /root/clawd/projects/automna/fly
export FLY_API_TOKEN=$(jq -r .token ../config/fly.json)
fly deploy --remote-only
```

## Per-User Provisioning (Current)

See `landing/src/app/api/user/provision/route.ts` for the current per-user provisioning logic.

Machine config includes:
- Image: `ghcr.io/phioranex/openclaw-docker:latest`
- Memory: 2GB
- Volume: 1GB encrypted
- Command: `gateway --allow-unconfigured --bind lan --auth token --token <token>`
