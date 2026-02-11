# Deployment Guide

> Last updated: 2026-02-11

## Vercel (Landing + Dashboard + API)

```bash
cd /root/clawd/projects/automna
vercel --prod --yes --token $(jq -r .token config/vercel.json)
```

Deploy from `automna/` root, NOT `automna/landing/`. The project is linked with `rootDirectory: landing`.

## Docker Image (User Machines)

```bash
cd projects/automna/docker
docker build -t registry.fly.io/automna-openclaw-image:latest .
docker push registry.fly.io/automna-openclaw-image:latest
```

Then update individual machines:
```bash
fly machines update <id> -a automna-u-xxx --image registry.fly.io/automna-openclaw-image:latest --yes
```

⚠️ Test on ONE machine first. Verify. Then do the rest one by one.

## API Proxy (Fly.io)

```bash
cd projects/automna/fly-proxy
fly deploy --remote-only
```

Runs on 2 machines in sjc for HA.

## ⚠️ No Staging Environment

All deploys go straight to production. This is a known risk (see WISHLIST.md #4).
Vercel preview deployments exist for PRs but there's no staging Fly infrastructure.
