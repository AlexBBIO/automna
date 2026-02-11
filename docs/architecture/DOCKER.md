# Docker Image & Entrypoint

> Last updated: 2026-02-11

## Image

- **Registry:** `registry.fly.io/automna-openclaw-image:latest`
- **Base:** `ghcr.io/phioranex/openclaw-docker:latest`
- **Source:** `/docker/Dockerfile` + `/docker/entrypoint.sh`
- **Includes:** OpenClaw, Caddy, file server, default workspace

## Rebuild & Deploy

```bash
cd projects/automna/docker
docker build -t registry.fly.io/automna-openclaw-image:latest .
docker push registry.fly.io/automna-openclaw-image:latest

# Update a single machine:
fly machines update <id> -a automna-u-xxx --image registry.fly.io/automna-openclaw-image:latest --yes
```

⚠️ **NEVER batch-update all machines at once.** Test on ONE machine first.

## Entrypoint Architecture

```
entrypoint.sh
├── 1. Fix session keys (one-shot)
├── 2. Start background session key fixer (every 3s)
├── 3. Create directories
├── 4. Persist tool auth (gh, git, ssh, npm → volume symlinks)
├── 5. Copy default workspace (first run only)
├── 6. Run workspace migrations (version-gated patches)
├── 7. Generate OpenClaw config (clawdbot.json)
├── 8. Write Caddyfile
├── 9. Start file server (background, :8080)
├── 10. Start Caddy (background, :18789)
└── 11. Start OpenClaw gateway (foreground, :18788)
```

## Workspace Migrations

Each migration checks `.workspace-version` and applies patches to existing users' TOOLS.md / AGENTS.md. Current version: **8**.

Migrations add documentation for new features (voice calling, email, etc.) to users who provisioned before those features existed.

## Generated OpenClaw Config

The entrypoint generates `clawdbot.json` with:
- Model: `anthropic/claude-opus-4-5`
- Base URL: `https://automna-proxy.fly.dev/api/llm` (proxied, no direct key)
- Workspace: `/home/node/.openclaw/workspace`
- Memory: Gemini embeddings, hybrid search, session memory
- Heartbeat: 30-min interval
- Verbose mode: on (enables tool events for streaming)
