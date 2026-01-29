# Automna Agent Deployment Prototype

**Goal:** Deploy a working Clawdbot instance accessible at `test.automna.ai` with chat interface on dashboard.

**Server:** Current Hetzner server (100.96.168.114) — 15GB RAM, 4 CPU, Docker installed

---

## Prerequisites

- [x] Docker installed and running
- [x] Server has available resources (12GB RAM free)
- [x] Cloudflare API token with tunnel permissions
- [ ] Test Anthropic API key

---

## Progress Log

### 2026-01-29 03:56 UTC — Cloudflare Tunnel Created
- Token tested: `tTbZgPEiICYzZd3vL9cJqgNkiWV49NG8kswERoEg`
- Account ID: `0bb27f91691935c953044c143a47fbc3`
- Zone ID: `ffab696c2ee55b8d42fe24641de465af`
- **Tunnel created:** `automna-agents` (ID: `f14be931-d3a9-4d01-a883-d22bb8aecfa9`)
- Tunnel credentials saved to `/root/.cloudflared/`

### 2026-01-29 03:56 UTC — DNS Record Created
- CNAME: `test.automna.ai` → `f14be931-d3a9-4d01-a883-d22bb8aecfa9.cfargotunnel.com`
- Proxied through Cloudflare ✓

### 2026-01-29 03:57 UTC — cloudflared Installed
- Version: 2026.1.2
- Location: `/usr/local/bin/cloudflared`

### 2026-01-29 03:57 UTC — Tunnel Config Created
- Config file: `/root/.cloudflared/config.yml`
- Credentials file: `/root/.cloudflared/f14be931-d3a9-4d01-a883-d22bb8aecfa9.json`
- Ingress: `test.automna.ai` → `http://localhost:3001`

### 2026-01-29 03:57 UTC — Tunnel Running
- Started: `cloudflared tunnel run automna-agents`
- 4 edge connections established (PDX, SEA)
- **Verified:** `curl https://test.automna.ai` returns 200 ✓

### 2026-01-29 03:58-04:05 UTC — Docker Image Built
- First attempt failed: missing `git` package
- Fixed Dockerfile to include `git`
- Build time: ~2.5 minutes (npm install clawdbot)
- Export time: ~100 seconds
- **Image:** `automna/clawdbot:latest` (1.09GB compressed, 3.38GB uncompressed)
- Volume created: `agent_test_data`

### 2026-01-29 04:05 UTC — Container Debugging
- First attempts failed due to:
  - Wrong CMD: `--foreground` flag not supported, use `gateway run`
  - Gateway needs `mode: local` in config
  - Config file is JSON not YAML (`clawdbot.json`)
  - Gateway needs auth token for LAN binding
  - Default gateway port is 18789, not 3000

### 2026-01-29 04:09 UTC — SUCCESS! 🎉
- **Container running:** `agent_test` (ID: b41154f192eb)
- **Port mapping:** Host 3001 → Container 18789
- **Gateway listening:** ws://0.0.0.0:18789
- **Local test:** `curl http://127.0.0.1:3001` ✅
- **Tunnel test:** `curl https://test.automna.ai` ✅

### Key Learnings
1. **Config is JSON**: `/root/.clawdbot/clawdbot.json` (not YAML)
2. **Gateway port**: Default is 18789, not 3000
3. **LAN binding requires auth**: Set `gateway.auth.token` in config
4. **CMD**: Use `clawdbot gateway run --bind lan --allow-unconfigured`

---

## Step 1: Install cloudflared

```bash
# Download cloudflared binary
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Verify installation
cloudflared --version
```

---

## Step 2: Authenticate with Cloudflare

**Option A: Browser login (interactive)**
```bash
cloudflared tunnel login
# Opens browser, authenticate with Cloudflare account
# Creates ~/.cloudflared/cert.pem
```

**Option B: API token (non-interactive)**
```bash
# Create token at: https://dash.cloudflare.com/profile/api-tokens
# Permissions needed: Zone:DNS:Edit, Account:Cloudflare Tunnel:Edit
export CLOUDFLARE_API_TOKEN="your-token-here"
```

---

## Step 3: Create Cloudflare Tunnel

```bash
# Create the tunnel
cloudflared tunnel create automna-agents

# This outputs:
# - Tunnel ID (UUID)
# - Credentials file path (~/.cloudflared/<tunnel-id>.json)

# Route DNS to tunnel (creates CNAME record)
cloudflared tunnel route dns automna-agents test.automna.ai

# For wildcard (all user subdomains):
cloudflared tunnel route dns automna-agents "*.automna.ai"
```

**Save tunnel credentials:**
```bash
# Note the tunnel ID for config
TUNNEL_ID=$(cloudflared tunnel list | grep automna-agents | awk '{print $1}')
echo "Tunnel ID: $TUNNEL_ID"
```

---

## Step 4: Create Clawdbot Docker Image

**Create directory structure:**
```bash
mkdir -p /root/clawd/projects/automna/docker
cd /root/clawd/projects/automna/docker
```

**Dockerfile:**
```dockerfile
# /root/clawd/projects/automna/docker/Dockerfile
FROM node:22-slim

# Install dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install Clawdbot globally
RUN npm install -g clawdbot

# Create workspace
WORKDIR /root/clawd

# Create default directories
RUN mkdir -p /root/.clawdbot

# Expose web interface port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:3000/health || exit 1

# Start gateway in foreground
CMD ["clawdbot", "gateway", "start", "--foreground"]
```

**Build image:**
```bash
docker build -t automna/clawdbot:latest .
```

---

## Step 5: Create Clawdbot Configuration

**Minimal config for web chat:**
```yaml
# /root/clawd/projects/automna/docker/config/clawdbot.yaml

# Model configuration
anthropic:
  apiKey: ${ANTHROPIC_API_KEY}
  model: claude-sonnet-4-20250514

# Gateway settings
gateway:
  # Web interface
  web:
    enabled: true
    port: 3000
    # Allow connections from any origin (for iframe embedding)
    cors:
      origin: "*"
  
  # Disable other channels for now
  discord:
    enabled: false
  telegram:
    enabled: false
  signal:
    enabled: false

# Agent settings
agent:
  name: "Automna Agent"
  workspace: /root/clawd
```

---

## Step 6: Run Test Container

```bash
# Create named volume for persistence
docker volume create agent_test_data

# Run container
docker run -d \
  --name agent_test \
  --restart unless-stopped \
  -e ANTHROPIC_API_KEY="sk-ant-api03-YOUR-KEY-HERE" \
  -v agent_test_data:/root/clawd \
  -v /root/clawd/projects/automna/docker/config/clawdbot.yaml:/root/.clawdbot/clawdbot.yaml:ro \
  -p 3001:3000 \
  automna/clawdbot:latest

# Check logs
docker logs -f agent_test

# Verify it's running
curl http://localhost:3001/health
```

---

## Step 7: Configure Cloudflare Tunnel Ingress

**Create tunnel config:**
```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Test instance
  - hostname: test.automna.ai
    service: http://localhost:3001
  
  # Future: wildcard routing
  # - hostname: "*.automna.ai"
  #   service: http://traefik:80
  
  # Catch-all (required)
  - service: http_status:404
```

**Start tunnel:**
```bash
# Test run (foreground)
cloudflared tunnel run automna-agents

# Or run as service
cloudflared service install
systemctl start cloudflared
systemctl enable cloudflared
```

---

## Step 8: Test Direct Access

```bash
# Test from server
curl -I https://test.automna.ai

# Should return 200 OK and Clawdbot web interface
```

**Browser test:**
- Navigate to https://test.automna.ai
- Should see Clawdbot web chat interface
- Test sending a message

---

## Step 9: Add Chat Interface to Dashboard

**Update dashboard page:**
```tsx
// /root/clawd/projects/automna/landing/src/app/dashboard/page.tsx

'use client';

import { useUser } from '@clerk/nextjs';

export default function DashboardPage() {
  const { user } = useUser();
  
  // For prototype, hardcode test instance
  const agentUrl = 'https://test.automna.ai';
  
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-xl font-bold">Automna Dashboard</h1>
          <span className="text-gray-400">{user?.emailAddresses[0]?.emailAddress}</span>
        </div>
      </header>
      
      {/* Chat Interface */}
      <main className="max-w-7xl mx-auto p-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">Agent Online</span>
            </div>
            <span className="text-xs text-gray-500">test.automna.ai</span>
          </div>
          
          {/* Iframe embedding Clawdbot web UI */}
          <iframe
            src={agentUrl}
            className="w-full h-[calc(100vh-200px)] border-0"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </main>
    </div>
  );
}
```

**Deploy to Vercel:**
```bash
cd /root/clawd/projects/automna
git add -A
git commit -m "Add chat iframe to dashboard"
git push
# Vercel auto-deploys
```

---

## Step 10: End-to-End Test

1. Go to https://automna.ai
2. Sign in with Clerk
3. Navigate to /dashboard
4. See embedded chat interface
5. Send a message
6. Verify response from Clawdbot instance

---

## Success Criteria

- [ ] cloudflared installed and authenticated
- [ ] Tunnel created and DNS routed
- [ ] Docker image built
- [ ] Container running and healthy
- [ ] https://test.automna.ai loads Clawdbot UI
- [ ] Can send/receive messages directly
- [ ] Dashboard iframe loads the chat
- [ ] End-to-end flow works (login → dashboard → chat)

---

## Troubleshooting

**Container won't start:**
```bash
docker logs agent_test
# Check for config errors, missing API key, etc.
```

**Tunnel not connecting:**
```bash
cloudflared tunnel info automna-agents
# Check tunnel status

journalctl -u cloudflared -f
# Check service logs
```

**CORS issues with iframe:**
- Clawdbot config needs `cors.origin: "*"`
- Or use proxy approach instead of iframe

**502 Bad Gateway:**
- Container not running or not healthy
- Wrong port mapping
- Check `docker ps` and `curl localhost:3001/health`

---

## Next Steps (After Prototype Works)

1. **Traefik integration** — Route multiple users via labels
2. **Provisioner API** — Automate container creation
3. **Dynamic config** — Generate per-user clawdbot.yaml
4. **Dedicated VMs** — Hetzner API for Business/Max tiers
5. **Custom chat UI** — Replace iframe with proper integration
6. **Credit tracking** — Proxy requests through our backend

---

## Files Created

```
/root/clawd/projects/automna/
├── PROTOTYPE.md              # This file
├── docker/
│   ├── Dockerfile            # Clawdbot container image
│   └── config/
│       └── clawdbot.yaml     # Minimal config template
└── landing/
    └── src/app/dashboard/
        └── page.tsx          # Updated with chat iframe
```

---

*Last updated: 2026-01-29*
