# Chat Implementation Notes

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    automna.ai (Vercel)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Next.js Frontend                        │   │
│  │  ┌─────────────┐    ┌────────────────────────────┐  │   │
│  │  │  /chat page │───▶│  AutomnaChat Component     │  │   │
│  │  └─────────────┘    │  - useClawdbotRuntime()    │  │   │
│  │                     │  - WebSocket connection    │  │   │
│  │                     │  - Message rendering       │  │   │
│  │                     └────────────┬───────────────┘  │   │
│  └──────────────────────────────────┼──────────────────┘   │
└─────────────────────────────────────┼───────────────────────┘
                                      │ WSS
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 test.automna.ai (Hetzner VPS)               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Clawdbot Gateway (Docker)                  │   │
│  │  - WebSocket server (port 443 via Cloudflare)       │   │
│  │  - Token-based auth                                  │   │
│  │  - Session management                                │   │
│  │  - Claude API integration                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Current Implementation

### Frontend Components

1. **AutomnaChat** (`/components/AutomnaChat.tsx`)
   - Main chat UI component
   - Handles message display, input, streaming
   - Uses Tailwind for styling

2. **useClawdbotRuntime** (`/lib/clawdbot-runtime.ts`)
   - Custom React hook for WebSocket connection
   - Handles Clawdbot protocol (challenge/auth flow)
   - Manages message state, streaming, history

### Connection Flow

1. User loads `/chat?token=xxx`
2. Component mounts, calls `useClawdbotRuntime()`
3. Hook opens WebSocket to `wss://test.automna.ai`
4. Gateway sends `connect.challenge`
5. Client responds with `connect` request including auth token
6. Gateway validates token, sends `hello-ok`
7. Client requests `chat.history` to load previous messages
8. User can now send/receive messages

### Authentication

Currently using **static token auth**:
- Token passed via URL query param: `?token=test123`
- Gateway validates against configured `web.controlUI.token`
- Simple but not scalable for multi-user

## Scaling Implications

### Current Setup: Single Gateway Instance

```
All users ──▶ test.automna.ai ──▶ One Clawdbot instance
```

**Problems:**
- Single point of failure
- One Claude API key for all users
- Shared session namespace
- No user isolation

### Target Architecture: Per-User Containers

```
User A ──▶ a.automna.ai ──▶ Container A (user's own Clawdbot)
User B ──▶ b.automna.ai ──▶ Container B (user's own Clawdbot)
User C ──▶ c.automna.ai ──▶ Container C (user's own Clawdbot)
```

**Requirements for scaling:**

1. **Dynamic Gateway URL**
   - Frontend must connect to user-specific subdomain
   - URL determined after Clerk auth + user lookup

2. **Per-User Token Generation**
   - Each container has its own `web.controlUI.token`
   - Token stored in user's DB record after container creation
   - Frontend retrieves token from API after login

3. **Container Orchestration**
   - Kubernetes or Docker Swarm for container management
   - Traefik/nginx for dynamic subdomain routing
   - Persistent storage for user workspaces

4. **Connection Flow Changes**
   ```
   1. User signs in via Clerk
   2. Frontend calls /api/user/gateway to get:
      - gatewayUrl: wss://abc123.automna.ai
      - authToken: user's unique token
   3. Frontend connects to user's specific gateway
   ```

### Code Changes Needed

**Current (hardcoded):**
```tsx
<AutomnaChat
  gatewayUrl="wss://test.automna.ai"  // hardcoded
  authToken={token}                    // from URL param
  sessionKey="main"
/>
```

**Scaled (dynamic):**
```tsx
// After Clerk auth, fetch user's gateway info
const { gatewayUrl, authToken } = await fetch('/api/user/gateway').then(r => r.json());

<AutomnaChat
  gatewayUrl={gatewayUrl}   // user-specific: wss://abc123.automna.ai
  authToken={authToken}      // user-specific token
  sessionKey="main"
/>
```

### Database Schema Addition

```prisma
model User {
  id            String   @id @default(cuid())
  clerkId       String   @unique
  
  // Container info
  containerId   String?  // Docker container ID
  subdomain     String?  @unique  // abc123 for abc123.automna.ai
  gatewayToken  String?  // Token for WebSocket auth
  containerStatus String? // running, stopped, provisioning
  
  // ...existing fields
}
```

### Container Provisioning Flow

1. User signs up → Clerk webhook fires
2. Backend creates DB record with `containerStatus: 'provisioning'`
3. Background job:
   - Generates unique subdomain (e.g., `u-abc123`)
   - Generates random gateway token
   - Spins up Docker container with config
   - Configures Traefik/DNS routing
   - Updates DB with `containerStatus: 'running'`
4. User's dashboard shows "Agent Ready" when container is up

## Cost Implications

| Component | Per-User Cost | Notes |
|-----------|---------------|-------|
| Container (idle) | ~$2-5/mo | 256MB RAM, minimal CPU |
| Container (active) | ~$5-15/mo | Depends on usage |
| Storage | ~$0.10/GB/mo | User workspace files |
| Bandwidth | ~$0.01/GB | WebSocket traffic |
| Claude API | Variable | User provides own key OR metered billing |

## Security Considerations

1. **Token Security**
   - Tokens should be long random strings (32+ chars)
   - Stored encrypted in database
   - Rotatable by user

2. **Container Isolation**
   - Each container runs as non-root user
   - Network isolation between containers
   - Resource limits (CPU, memory, disk)

3. **WebSocket Security**
   - TLS required (wss://)
   - Token validated on every connection
   - Rate limiting on connection attempts

## Next Steps

1. [ ] Implement `/api/user/gateway` endpoint
2. [ ] Add container fields to Prisma schema
3. [ ] Build container provisioning service
4. [ ] Set up Traefik for dynamic routing
5. [ ] Update AutomnaChat to use dynamic gateway URL
6. [ ] Add container status to dashboard
