# Automna.ai — Product Specification

> **Note:** Original name was "Automna" but changed to "Automna" (K spelling) to avoid trademark conflict with Agent IQ (USPTO #99399937). Domain automna.ai confirmed available 2026-01-28.

**Version:** 0.6  
**Date:** 2026-02-03  
**Status:** MVP Core Complete (LLM Proxy + Security Hardening Done)

---

## Current Status (2026-02-03)

### ✅ Working
| Component | Status | Notes |
|-----------|--------|-------|
| Landing page | ✅ Live | automna.ai on Vercel |
| Clerk auth | ✅ Working | Sign up/sign in functional |
| Stripe billing | ✅ Working | Checkout, webhooks, portal all functional |
| **Fly.io Gateway** | ✅ Working | Per-user apps: `automna-u-{shortId}.fly.dev` |
| **Per-user provisioning** | ✅ Working | `/api/user/provision` creates isolated apps |
| WebSocket chat | ✅ Working | Token auth, canonical session keys |
| Chat history | ✅ Working | Via WS only (OpenClaw has no HTTP API) |
| **Multi-conversation** | ✅ Working | localStorage-based, history per conversation |
| **Turso database** | ✅ Set up | `automna` - users/machines/events tables + llm_usage |
| **Drizzle ORM** | ✅ Set up | `src/lib/db/` in landing project |
| **LLM Proxy** | ✅ Working | Centralized API via `/api/llm/*`, usage tracking, rate limits |
| Optimistic UI | ✅ Working | Chat skeleton, animated loading |
| **Media rendering** | ✅ Working | Inline images via WS re-fetch (see Known Issues) |
| **Heartbeat system** | ✅ Working | 30-min periodic checks, email awareness |
| **Files API** | ✅ Working | Caddy reverse proxy → internal file server |
| **Agent Config** | ✅ Working | Workspace injection, memory enabled |
| **Security Hardening** | ✅ Complete | No API keys on user machines |
| **Voice Calling** | ✅ Working | Twilio + Bland.ai BYOT, outbound + inbound |

### 🔧 In Progress
| Component | Status | Notes |
|-----------|--------|-------|
| Per-user volumes | ✅ Working | 1GB encrypted volume per user |
| OpenClaw migration | ✅ Done | Migrated from Clawdbot to OpenClaw |
| File Browser UI | 🔧 Testing | UI exists, needs testing |
| Discord Integration | 📝 Planned | Next priority — see NEXT-STEPS |
| Telegram Integration | 📝 Planned | After Discord |

### ❌ Deprecated
| Component | Status | Notes |
|-----------|--------|-------|
| Cloudflare Moltworker | ❌ Removed | Fully migrated to Fly.io |
| R2 as primary storage | ❌ Removed | Using Fly Volumes |
| `clawdbot` npm package | ❌ Deprecated | Use `openclaw` instead |
| `mkbehr/clawdbot` image | ❌ Deprecated | Use custom Automna image |
| `ghcr.io/phioranex/openclaw-docker` | ❌ Deprecated | Use custom Automna image |

### 📝 Recent Changes (2026-02-03)

**🔧 Provisioning Loading Screen Fix (2026-02-08):**

Fixed new-user provisioning loading screen exiting prematurely:

1. **Problem:** `waitForGatewayReady()` had no real failure path — every branch (HTTP timeout, WS test failure) proceeded to show chat UI anyway, resulting in users seeing WebSocket errors
2. **Root cause:** Redundant WebSocket test (separate from the real WS in `useClawdbotRuntime`) would fail 5 times, give up, and loading screen would disappear
3. **Fix:** Removed `testWebSocketConnection()` and `waitForGatewayReady()` entirely. Replaced with `waitForNewProvisionReady()` — only runs for fresh provisions, only does HTTP health polling, shows error + retry button on timeout
4. **Existing users:** Skip warmup entirely, go straight to chat (faster than before)
5. **ChatSkeleton:** Warming phase now shows tips + timer instead of fake "Creating your agent..." text
6. **Result:** -48 lines, simpler flow, no silent failures

**📞 Voice Calling (2026-02-06):**

Added AI-powered phone calling via Twilio + Bland.ai:

1. **Architecture:** Twilio provides phone numbers, Bland.ai handles AI voice conversations via BYOT (Bring Your Own Twilio)
2. **Outbound calls:** Agent uses `POST /api/user/call` with task prompt → proxy validates auth + plan limits → Bland makes the call → webhook delivers transcript
3. **Inbound calls:** Calls to user's number → Twilio routes to Bland → AI answers with user's configured prompt/voice → webhook delivers transcript
4. **Transcript delivery:** Dual approach - (a) direct file write to `calls/` directory on user's Fly volume, (b) message injected into agent session for follow-up actions
5. **Auto-provisioning:** Stripe webhook provisions a phone number when user upgrades to Pro/Business
6. **Default voice:** Alexandra (young chirpy American female, ID: `6277266e-01eb-44c6-b965-438566ef7076`)
7. **Security:** No Twilio/Bland credentials on user machines. All calls proxied through `automna.ai/api/user/call`. Gateway token is the only auth needed.
8. **Cost:** Twilio $1.15/mo per number + Bland $0.12/min. Pro tier (60 min cap) worst case ~$8.20/mo at $49 price.
9. **Plan limits:** Free/Starter: 0 min, Pro: 60 min/mo, Business: 300 min/mo

**DB tables:** `phone_numbers` (user → number mapping, voice/identity config), `call_usage` (call tracking, transcripts, cost)

**API endpoints:**
- `POST /api/user/call` - make outbound call
- `POST /api/webhooks/bland/status` - call completion webhook
- `GET /api/user/call/usage` - usage stats + call history

**Libraries:** `src/lib/twilio.ts` (number provisioning), `src/lib/bland.ts` (BYOT import, inbound config)

**Full spec:** `docs/VOICE-CALLING.md`

---

**🔒 Security Hardening Complete (18:15 UTC):**

Final deployment completed with full security hardening:

1. **No API Keys on User Machines**
   - `ANTHROPIC_API_KEY` is NEVER passed to Fly machines
   - All LLM traffic routed through `ANTHROPIC_BASE_URL=https://automna.ai/api/llm`
   - Proxy authenticates via gateway token
   - Prevents users from bypassing rate limits or direct API access

2. **Provisioning Updates**
   - Removed `ANTHROPIC_API_KEY` from Fly machine env vars
   - Added `ANTHROPIC_BASE_URL` pointing to our proxy
   - Fixed env var newline bug that was breaking Browserbase/Agentmail setup

3. **Files API Fix**
   - Added DELETE handler at `/api/files` base route
   - Supports both `?path=` and `?file=` query params for consistency

**Test Accounts Updated:**
- `alex@wilkinson.app` → `automna-u-wvps9xttsuka`
  - Email: `quietmoon@mail.automna.ai` (manually configured)
  - Browserbase context: manually created
  - LLM Proxy: working ✅

**🤖 LLM Proxy (05:17 UTC):**

Implemented centralized LLM API proxy at `https://automna.ai/api/llm/*`:

1. **Endpoints**
   - `POST /api/llm/chat` - Anthropic Messages API proxy
   - `POST /api/llm/embed` - Embedding API (placeholder)
   - `GET /api/llm/usage` - Usage statistics

2. **Features**
   - **Gateway token auth** - Same tokens used for Clawdbot access
   - **Usage tracking** - Every request logged with tokens/cost to `llm_usage` table
   - **Rate limiting** - Per-minute (5-60 RPM) and monthly (100K-5M tokens) by plan
   - **Streaming support** - Full SSE passthrough with token counting
   - **Cost calculation** - Microdollar precision, per-model pricing

3. **Plan Limits**
   | Plan | Monthly Tokens | Monthly Cap | RPM |
   |------|----------------|-------------|-----|
   | Free | 100K | $1 | 5 |
   | Starter | 500K | $5 | 20 |
   | Pro | 5M | $50 | 60 |

4. **Database Tables**
   - `llm_usage` - Request logs with tokens, cost, duration
   - `llm_rate_limits` - Per-minute counters

See [`docs/LLM-PROXY.md`](docs/LLM-PROXY.md) for full implementation guide.

**🔀 Caddy Reverse Proxy Architecture (04:32 UTC):**

Implemented single-port architecture with Caddy as reverse proxy:

1. **Architecture**
   ```
   Internet → HTTPS :443 → Fly.io
                              ↓
                    Caddy (port 18789)
                         ↓         ↓
              /files/*   →   File Server (:8080)
              /*         →   OpenClaw Gateway (:18788)
   ```

2. **Why This Matters**
   - Single entry point (industry standard)
   - No exposed internal ports
   - Supports large file uploads (100MB)
   - Same security model as AWS/GCP/mainstream services

3. **Key Files**
   - `docker/Caddyfile` - Routing configuration
   - `docker/entrypoint.sh` - Starts Caddy + services
   - Uses `handle_path` to strip `/files` prefix

4. **Docker Image Updated**
   - Includes Caddy (~40MB addition)
   - Image: `registry.fly.io/automna-openclaw-image:latest`

See [`docs/REVERSE-PROXY-ARCHITECTURE.md`](docs/REVERSE-PROXY-ARCHITECTURE.md) for full details.

**💓 Heartbeat System (04:10 UTC):**

Agents now have periodic heartbeats for proactive awareness:

1. **Configuration**
   - 30-minute interval
   - Opus 4.5 model (same as default)
   - Enabled by default for all new users

2. **How It Works**
   - Every 30 min, gateway sends heartbeat poll to agent
   - Agent reads `HEARTBEAT.md` for tasks (check email, etc.)
   - Agent updates `heartbeat-state.json` with what it's seen
   - On next user chat, agent mentions new emails naturally

3. **Files Added to Workspace**
   - `HEARTBEAT.md` - Instructions for periodic tasks
   - `heartbeat-state.json` - State tracking

4. **Docker Image Updated**
   - Config includes heartbeat settings
   - Workspace files copied on first boot
   - Image: `registry.fly.io/automna-openclaw-image:latest`

5. **Documentation**
   - Created `docs/HEARTBEAT-IMPLEMENTATION.md`
   - Updated `docker/workspace/AGENTS.md`

**🖼️ Inline Media Rendering (00:15 UTC):**

Full implementation of image/file sharing in webchat. See [`docs/MEDIA-RENDERING.md`](docs/MEDIA-RENDERING.md) for details.

1. **User Uploads**
   - 📎 button to attach files
   - Uploads to `/home/node/.openclaw/workspace/uploads/`
   - Images render inline in chat
   - Uses `MEDIA:/path` format (OpenClaw native)

2. **Agent Image Sharing**
   - Agent outputs `MEDIA:/path/to/image.png` as plain text
   - MessageContent parses and renders inline
   - ⚠️ Must NOT be in code blocks (parser skips fenced code)

3. **Parser Updates**
   - Supports `MEDIA:/path`, `[[image:/path]]`, `[[file:/path]]`
   - Works for both user and agent messages
   - Images render inline, files show download button

4. **Docker Image Update**
   - Added `AGENTS.md` with MEDIA: usage instructions
   - Workspace initialized on first run
   - Image: `registry.fly.io/automna-openclaw-image:latest`

5. **Important Fix: HTTPS Required**
   - Vercel blocks HTTP to external services
   - File server must use HTTPS for uploads to work

---

### 📝 Recent Changes (2026-02-02)

**🔌 Sessions API & WebSocket Protocol Fix (22:30 UTC):**

Fixed sessions not loading in sidebar. Multiple protocol issues discovered:

1. **Docker Entrypoint Fix**
   - Was calling `node /app/dist/index.js` (wrong path)
   - Fixed to `node /app/dist/entry.js`
   - Gateway now starts properly

2. **OpenClaw WebSocket Protocol** (NOT JSON-RPC!)
   - Uses `type: 'req'` not `jsonrpc: '2.0'`
   - Uses `params` not `payload` for request parameters
   - Uses `msg.payload` not `msg.result` for response data
   - Client ID must be from allowlist (`gateway-client`, `webchat`, etc.)
   - Full handshake required: challenge → connect → hello-ok → RPC

3. **Sessions API Created**
   - `GET /api/user/sessions` - Fetches from OpenClaw via WebSocket RPC
   - `PATCH /api/user/sessions` - Updates session label
   - `DELETE /api/user/sessions?key=xxx` - Deletes session
   - Dashboard now shows real conversations from gateway (not localStorage)

4. **Documentation**
   - Created `docs/OPENCLAW-WEBSOCKET-PROTOCOL.md` - Full protocol reference
   - Updated SPEC.md with Sessions API section

**⚙️ Agent Configuration & Memory (22:00 UTC):**

1. **Default Config Creation**
   - Docker entrypoint creates `clawdbot.json` if missing
   - Sets workspace to `/home/node/.openclaw/workspace`
   - Enables full memory stack by default
   - Model: `anthropic/claude-opus-4-5`

2. **Memory System Enabled**
   - `memorySearch` with Gemini embeddings
   - `sessionMemory` indexes conversation history
   - Hybrid search (vector 0.7 + text 0.3)
   - Context pruning and compaction enabled
   - GEMINI_API_KEY added to all user machines

3. **Files API Implemented**
   - `/api/files/list` - List directory via Fly exec
   - `/api/files/read` - Read file content
   - `/api/files/write` - Write/create files
   - `/api/files/mkdir` - Create directories
   - `/api/files/move` - Move/rename files
   - `/api/files/download` - Download binary files
   - `/api/files/upload` - Upload files (multipart)
   - `DELETE /api/files` - Delete files
   - Uses Fly Machines exec API for shell commands
   - Per-user gateway lookup from Turso

4. **Documentation**
   - Created `docs/AGENT-CONFIG-SYSTEM.md` - Full config reference
   - Created `docs/FILE-BROWSER-SPEC.md` - Files feature spec
   - Updated `docs/PER-USER-SETUP.md`

**💬 Chat System Overhaul (17:00-18:00 UTC):**
Complete fix of multi-conversation chat system:

1. **Session Key Canonicalization**
   - UI uses simple keys: `main`, `test`, `work`
   - Gateway stores canonical keys: `agent:main:main`, `agent:main:test`
   - All WebSocket messages now canonicalize: `chat.send`, `chat.history`, `chat.abort`
   - History proxy (`/api/ws/history`) canonicalizes session keys

2. **Conversation Sidebar**
   - Conversations stored in localStorage (OpenClaw has no session list API)
   - Current conversation persisted to localStorage
   - Survives page refresh and logout/login

3. **Race Condition Fixes**
   - Added `currentSessionRef` to track active session
   - History handlers check session before setting messages
   - Prevents "message contamination" when switching quickly
   - 100ms debounce on WebSocket connections

4. **Loading Screen Polish**
   - Animated progress bar during provisioning (10% → 90% over 80s)
   - Step-through messages: Creating → Storage → Workspace → Capabilities → Services
   - Proper phase mapping to ChatSkeleton component

5. **Performance Optimizations**
   - Parallel sync + gateway fetch (don't wait for sync)
   - Health poll interval: 1 second
   - Messages clear immediately on conversation switch

**🐳 Custom Docker Image (16:50 UTC):**
Built and deployed custom Docker image with production-ready session key fix:
- **Image:** `registry.fly.io/automna-openclaw-image:latest`
- **Source:** `docker/Dockerfile` + `docker/entrypoint.sh`
- **Fix:** Background process monitors and fixes session keys every 3 seconds
- **Works for:** All conversations (main, work, research, etc.)
- See [`docs/PER-USER-SETUP.md`](docs/PER-USER-SETUP.md) for rebuild instructions

**📚 Per-User Setup Documentation (16:00 UTC):**
- Created comprehensive setup guide: [`docs/PER-USER-SETUP.md`](docs/PER-USER-SETUP.md)
- Documents: provisioning flow, session key issue, configuration, troubleshooting
- Ensures repeatability for all user instances

**Chat History & Session Fixes (06:57 UTC):**
Fixed multiple issues with chat functionality:

1. **Gateway readiness** - Dashboard now waits for gateway to respond before showing chat
   - New `/api/user/health` endpoint polls gateway until ready
   - Loading screen shows "Starting your agent..." during warmup

2. **History loading** - Fixed WebSocket history not loading
   - HTTP history endpoint doesn't exist on OpenClaw (returns control UI)
   - Fixed runtime to not block WS history when HTTP returns empty

3. **Session key mismatch** - OpenClaw bug (✅ FIXED with custom Docker image)
   - **Root cause:** OpenClaw stores sessions with key `main` but looks up with `agent:main:main`
   - **Solution:** Custom Docker image with background fixer
   - **How it works:** Entrypoint runs background process that monitors and fixes keys every 3s
   - Sessions are automatically converted to canonical form

4. **Conversations sidebar** - Now fetches from gateway instead of localStorage
   - Old localStorage data was showing stale conversations
   - New `/api/user/sessions` endpoint fetches real sessions

**Per-User Provisioning WORKING (06:30 UTC):**
Full end-to-end provisioning now working:
- User visits dashboard → auto-provisions Fly app if needed
- Each user gets `automna-u-{shortId}.fly.dev` with 1GB encrypted volume
- WebSocket chat working, Claude Opus responses working
- Tracked in Turso database

**Issues Fixed Tonight:**
1. **Token mismatch** - DB token wasn't matching gateway token (fixed sync)
2. **WS proxy wrong gateway** - `/api/ws/*` was using old shared gateway (fixed to lookup per-user)
3. **ANTHROPIC_API_KEY missing** - Added to Vercel env vars
4. **Fly secrets vs env vars** - Machines API doesn't use `fly secrets`, pass in config.env

**Known Issues:**
- Gateway startup takes ~60 seconds (needs better loading UI)
- Claude Opus responses are slow (10-20s, consider Sonnet default)
- File browser not integrated yet

**TODO - Loading Screen Improvements:**
- Show step-by-step progress during provisioning:
  - "Creating your agent..." (app creation)
  - "Setting up storage..." (volume)
  - "Starting services..." (machine)
  - "Almost ready..." (health check)
- Animate progress bar so it doesn't look frozen
- Show estimated time remaining (~60s)

**Gateway CLI flags:**
```bash
gateway --allow-unconfigured --bind lan --auth token --token <gateway_token>
```

**OpenClaw Migration (05:30 UTC):**
The upstream Clawdbot project rebranded to **OpenClaw**. We migrated all infrastructure:

| Component | Old | New |
|-----------|-----|-----|
| npm package | `clawdbot@2026.1.24-3` | `openclaw@2026.1.30` (pinned) |
| Docker image | `mkbehr/clawdbot:latest` | `ghcr.io/phioranex/openclaw-docker:latest` |
| Config directory | `/root/.clawdbot` | `/home/node/.openclaw` |
| CLI command | `clawdbot` | `openclaw` |
| Env vars | `CLAWDBOT_*`, `MOLTBOT_*` | `OPENCLAW_*` |

**Per-User Provisioning:**
- Each user gets isolated Fly app: `automna-u-{shortId}.fly.dev`
- 1GB encrypted volume mounted at `/home/node/.openclaw`
- Machine config includes `init.cmd: ["gateway", "start", "--foreground"]`
- Tracked in Turso database (`machines` table)

**Fly.io Migration (earlier):**
- Created single-machine MVP on Fly.io (`automna-gateway`)
- Fixed WebSocket auth (token extraction from URL)
- Fixed session key mismatch (`main` vs `agent:main:main`)
- Added proxy routes to avoid CORS (`/api/gateway/*`, `/api/ws/*`, `/api/files/*`)
- Removed forced loading screen (prewarm in background)

**Turso Database:**
- Created database: `libsql://automna-alexbbio.aws-us-west-2.turso.io`
- Schema: `users`, `machines`, `machine_events` tables
- Drizzle ORM set up in `src/lib/db/`
- Vercel env vars configured

### 📝 Previous Changes (2026-02-01)

**Load Time & History:**
- Fixed WebSocket client ID (must be 'webchat' not custom)
- Fixed history race condition (WS empty → HTTP fallback)
- Added R2 fast path for history loading (see Architecture section)
- Added security hardening (session key validation, path traversal prevention)
- Added message limit (default 50, max 200) for scalability
- Added container timeout (30s) to prevent indefinite hang
- R2 sync on: keepalive ping (4 min), WebSocket disconnect, first history load

**Chat UI:**
- Added MessageContent component with code block parsing
- Syntax highlighting via react-syntax-highlighter (Prism + oneDark theme)
- Copy button on code blocks with "Copied!" feedback
- Inline code styling (`code`)
- Typing indicator (bouncing dots) while agent responds
- Keyboard shortcuts: Enter (send), Shift+Enter (newline), Esc (cancel)

**Multiple Channels:**
- ChannelSidebar component with expand/collapse
- Create new channels (stored in localStorage)
- Switch between channels (each = different Clawdbot sessionKey)
- Collapsed view shows just emoji icons
- State persisted in localStorage

**Infrastructure:**
- Forked moltworker to `AlexBBIO/automna-moltworker` for full control
- Added test suite (30+ unit tests for runtime + signed-url)
- Added GitHub Actions CI (tests run on every push)
- ChatSkeleton component for optimistic loading
- Progressive loading phases (syncing → connecting → warming)
- Prewarming on gateway URL fetch

### 🏗️ History Loading Architecture

> **⚠️ [DEPRECATED 2026-02-02]** The R2 caching architecture below is deprecated.
> With Fly.io, history loads directly from persistent volumes via WebSocket.
> See "Chat System Architecture" section for current flow.

**Current Architecture (Fly.io):**
- History stored in JSONL files at `/home/node/.openclaw/agents/main/sessions/`
- Loaded via WebSocket `chat.history` method
- No R2 sync needed - data persists on Fly volumes
- Cold start: ~60s (machine boot), then instant

<details>
<summary>~~Old R2 Caching Architecture (DEPRECATED)~~</summary>

**Problem:** Cold start takes 8-30s because loading history requires booting the container.

**Solution:** Two-path architecture with R2 caching.

```
┌─────────────────────────────────────────────────────────────────┐
│                    History Load Request                          │
│                   /ws/api/history?sessionKey=main                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   1. Try R2 Fast Path         │
              │   (No container boot needed)   │
              │   ~100-500ms                   │
              └───────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
    ┌───────────────┐                  ┌───────────────┐
    │  R2 HIT ✅    │                  │  R2 MISS ❌   │
    │  Return fast  │                  │  (First load) │
    │  source: 'r2' │                  │               │
    └───────────────┘                  └───────────────┘
                                               │
                                               ▼
                              ┌───────────────────────────────┐
                              │   2. Container Slow Path      │
                              │   Boot container + read file  │
                              │   ~8-30s (cold) / ~2s (warm)  │
                              └───────────────────────────────┘
                                               │
                                               ▼
                              ┌───────────────────────────────┐
                              │   3. Background R2 Sync       │
                              │   Copy data to R2 for next    │
                              │   time (async, non-blocking)  │
                              └───────────────────────────────┘
```

**R2 Path Structure:**
```
moltbot-data/
└── users/
    └── {userId}/
        └── clawdbot/
            └── agents/main/sessions/
                ├── sessions.json
                └── main/
                    └── history.jsonl
```

**Security Measures:**
- Session key sanitization (alphanumeric + dash/underscore only)
- Path traversal prevention (validates paths stay within user directory)
- Signed URL validation (userId from HMAC-signed token)
- Max file size check (5MB) to prevent OOM

**Scalability Measures:**
- Message limit (default 50, configurable via `?limit=N`, max 200)
- Returns only most recent messages when over limit
- Background sync is non-blocking (uses `waitUntil`)

**When R2 Data Gets Synced:**
1. After first history load from container (background sync)
2. On every keepalive ping (every 4 minutes while user is active)
3. On WebSocket disconnect (when user leaves/logs out)
4. NOT synced by cron (cron only syncs shared/admin sandbox)

**Container Fallback Timeout:**
- 30 second timeout on container startup to prevent indefinite hang
- If timeout hits, returns error instead of hanging forever

</details>

### 💬 Chat UI Architecture

**Components:**
```
Dashboard (page.tsx)
├── ChannelSidebar
│   ├── Channel list (from localStorage)
│   ├── Create channel form
│   └── Collapse/expand toggle
└── AutomnaChat
    ├── ConnectionStatus
    ├── Message list
    │   └── MessageContent (per message)
    │       ├── Code blocks (with copy)
    │       ├── Inline code
    │       └── Plain text
    ├── TypingIndicator
    └── Input form
```

**MessageContent Parsing:**
1. Split text on ` ```language\ncode``` ` for code blocks
2. Split remaining text on `` `code` `` for inline code
3. Render code blocks with Prism syntax highlighting
4. Render inline code with monospace styling

**Multiple Channels:**
- Each channel = different Clawdbot `sessionKey`
- Channels stored in `localStorage('automna-channels')`
- Default channel: `main` (key) / "General" (name)
- New channels: slugified name as key, original as display name
- Sidebar collapse state in `localStorage('automna-sidebar-collapsed')`

**Keyboard Shortcuts:**
- `Enter` → Send message
- `Shift+Enter` → New line
- `Escape` → Cancel generation (stop streaming)

### 🎯 MVP Features (2026-01-31)

**See [`docs/MVP-STEPS.md`](docs/MVP-STEPS.md) for full implementation details.**

| Feature | Priority | Effort | Status |
|---------|----------|--------|--------|
| **Load Time Optimization** | P0 | 11h | ✅ Mostly Done |
| └─ Keep-alive pings | P0 | 2h | ✅ Done |
| └─ Optimistic UI loading | P0 | 1h | ✅ Done |
| └─ Progressive loading states | P0 | 4h | ✅ Done |
| └─ Prewarming on login | P1 | 4h | ✅ Done |
| **History Performance** | P0 | 11h | ✅ Mostly Done |
| └─ Parallel HTTP fetch | P0 | 2h | ✅ Done |
| └─ Lazy load old messages | P1 | 3h | Planned |
| └─ ~~R2 cache for history~~ | ~~P1~~ | ~~6h~~ | N/A (using Fly volumes) |
| **File Management** | P0 | 16h | ✅ Done |
| └─ File tree API + UI | P0 | 6h | ✅ Done (Fly exec API) |
| └─ Markdown viewer/editor | P0 | 4h | ✅ Done (FileBrowser) |
| └─ Upload/download files | P0 | 4h | ✅ Done |
| └─ Agent memory viewer | P1 | 2h | ✅ Done (via Files tab) |
| **Chat UI Improvements** | P0 | 12h | ✅ Mostly Done |
| └─ Visual polish | P0 | 3h | ✅ Done |
| └─ Typing indicator | P0 | 1h | ✅ Done |
| └─ Code blocks + copy | P0 | 2h | ✅ Done |
| └─ Better input + actions | P1 | 4h | Planned |
| └─ Keyboard shortcuts | P2 | 2h | ✅ Done (Enter/Shift+Enter/Esc) |
| **Multiple Channels** | P1 | 9h | ✅ Done |
| └─ Channels API | P1 | 3h | ✅ Done (localStorage) |
| └─ Channel sidebar UI | P1 | 4h | ✅ Done |
| └─ Create/delete/switch | P1 | 2h | ✅ Done (create/switch) |

**Total MVP Effort: ~59 hours (2 weeks)**

**Target Metrics:**
- Cold start: <15s (with progress indicator)
- Warm load: <2s
- History load: <1s
- File tree load: <500ms

### 💬 Chat System Architecture (2026-02-02)

**Data Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ ConversationSidebar│  │   AutomnaChat   │  │ clawdbot-runtime│  │
│  │ (localStorage)  │  │   (UI component)│  │   (WebSocket)   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼─────────────────────┼─────────────────────┼─────────┘
            │                     │                     │
            │ conversations       │ sessionKey          │ messages
            │ currentConversation │ (e.g., "test")      │ (canonical keys)
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel (automna.ai)                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ /api/user/gateway│  │ /api/ws/history │  │ WebSocket proxy │  │
│  │ (Turso lookup)  │  │ (canonicalize)  │  │ (pass-through)  │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼─────────────────────┼─────────────────────┼─────────┘
            │ gatewayUrl          │ agent:main:test     │
            │ gatewayToken        │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              Fly.io (automna-u-{shortId}.fly.dev)                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    OpenClaw Gateway                          ││
│  │  Sessions stored at: /home/node/.openclaw/agents/main/sessions/│
│  │  Key format: agent:main:{conversationKey}                    ││
│  │  Files: sessions.json + {key}/history.jsonl                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Session Key Handling:**

| Component | Key Format | Example |
|-----------|------------|---------|
| UI (sidebar, props) | Simple | `test` |
| Runtime (WebSocket) | Canonical | `agent:main:test` |
| History proxy | Canonical | `agent:main:test` |
| Gateway storage | Canonical | `agent:main:test` |

**Canonicalization function:**
```typescript
function canonicalizeSessionKey(key: string): string {
  if (key.startsWith('agent:main:')) return key;
  return `agent:main:${key}`;
}
```

**Race Condition Prevention:**
```typescript
// Track current session to prevent stale responses
const currentSessionRef = useRef(sessionKey);
currentSessionRef.current = sessionKey;

// In history handlers:
if (currentSessionRef.current !== sessionKey) {
  console.log('History arrived for old session, ignoring');
  return;
}
```

**Key Files:**
- `landing/src/lib/clawdbot-runtime.ts` - WebSocket client, history loading
- `landing/src/app/dashboard/page.tsx` - Conversation state, sidebar
- `landing/src/components/ConversationSidebar.tsx` - Sidebar UI
- `landing/src/components/AutomnaChat.tsx` - Chat UI
- `landing/src/app/api/ws/[...path]/route.ts` - History proxy
- `docker/entrypoint.sh` - Session key fixer

**Known Limitations:**
- ~~No server-side session list (OpenClaw doesn't have API)~~ **FIXED 2026-02-02**
- ~~Conversations are localStorage-only~~ **FIXED 2026-02-02**
- Deleting conversations deletes server-side data via `sessions.delete`

### 🔌 Sessions API (2026-02-02)

> **⚠️ IMPORTANT:** The sessions API uses the OpenClaw WebSocket protocol, NOT JSON-RPC 2.0.
> See [`docs/OPENCLAW-WEBSOCKET-PROTOCOL.md`](docs/OPENCLAW-WEBSOCKET-PROTOCOL.md) for full protocol reference.

**API Routes:**
- `GET /api/user/sessions` - Fetch all conversations from OpenClaw
- `PATCH /api/user/sessions` - Update conversation label
- `DELETE /api/user/sessions?key=xxx` - Delete a conversation

**How It Works:**
1. Dashboard calls `/api/user/sessions` on load
2. API looks up user's Fly app from Turso database
3. Opens WebSocket to user's gateway (`wss://automna-u-xxx.fly.dev/ws`)
4. Performs connect handshake (challenge → connect → hello-ok)
5. Sends `sessions.list` RPC request
6. Returns sessions to dashboard

**Critical Protocol Details:**

| Wrong | Correct |
|-------|---------|
| `jsonrpc: '2.0'` | `type: 'req'` |
| `payload: {...}` in request | `params: {...}` |
| `msg.result` in response | `msg.payload` |
| `client.id: 'custom'` | `client.id: 'gateway-client'` (from allowlist) |

**Valid Client IDs:** `webchat`, `webchat-ui`, `gateway-client`, `cli`, `node-host`, `test`

**Key Files:**
- `landing/src/app/api/user/sessions/route.ts` - Sessions API
- `docs/OPENCLAW-WEBSOCKET-PROTOCOL.md` - Full protocol reference

### 💳 Stripe Integration (Configured)

**Products & Pricing:**

| Plan | Price | Price ID | Features |
|------|-------|----------|----------|
| Starter | $79/mo | `price_1Sukg0LgmKPRkIsH6PMVR7BR` | 1 agent, web chat, 1 integration, 30-day memory |
| Pro | $149/mo | `price_1SukgALgmKPRkIsHmfwtzyl6` | All integrations, browser, email inbox, unlimited memory |
| Business | $299/mo | `price_1SukgBLgmKPRkIsHBcNE7azu` | 3 agents, team workspace, API access, analytics |

**Webhook Events Handled:**
- `checkout.session.completed` → Creates/updates user subscription
- `customer.subscription.updated` → Updates plan in Clerk metadata
- `customer.subscription.deleted` → Downgrades user to free

**Routes:**
- `/api/checkout` → Creates Stripe checkout session
- `/api/billing/portal` → Redirects to Stripe billing portal
- `/api/webhooks/stripe` → Handles Stripe events

**Environment Variables (Vercel):**
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_STARTER=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS=price_...
```

### 🔑 Secrets Configured (moltbot-sandbox)
- `ANTHROPIC_API_KEY` ✅
- `MOLTBOT_GATEWAY_TOKEN` ✅
- `CF_ACCOUNT_ID` ✅
- `R2_ACCESS_KEY_ID` ✅
- `R2_SECRET_ACCESS_KEY` ✅
- `CF_ACCESS_TEAM_DOMAIN` ✅ (placeholder)
- `CF_ACCESS_AUD` ✅ (placeholder)

### 📁 Key Files
- Worker source: `/root/clawd/projects/automna/moltworker/`
- Landing/Dashboard: `/root/clawd/projects/automna/landing/`
- Secrets: `/root/clawd/projects/automna/config/secrets.json`
- Setup docs: `/root/clawd/projects/automna/docs/MOLTBOT-SANDBOX-SETUP.md`

---

## Executive Summary

Automna.ai is a hosted platform for fully agentic AI assistants powered by Clawdbot. Unlike ChatGPT or Claude Pro (which are just chat interfaces), Automna provides AI agents that **actually execute tasks**: browse the web, manage files, control integrations, automate workflows, and even build and deploy apps.

**Value Proposition:** "Your own, private, fully autonomous AI agent. Working in 60s."

**Alternative taglines:**
- "The AI assistant that actually does things."
- "Hire Claude. $79/month."
- "Not just chat. Execute."

**Business Model:** Premium SaaS subscription ($79-299/month) + BYOK (Bring Your Own Key) for Anthropic API costs.

**Key Differentiator:** We offer MORE than Claude Max ($100-200/mo) because we include:
- Fully managed cloud hosting (always on)
- Pre-configured integrations (Discord, Telegram, WhatsApp, web)
- Zero setup required
- User app hosting (agents can build and deploy web apps)

---

## Market Opportunity

### Problem
- Setting up Clawdbot requires: Node.js, CLI familiarity, server access, Docker (optional), API key configuration, integration setup
- Most potential users (creators, professionals, small businesses) don't have these skills
- Existing "AI assistant" products are either too simple (ChatGPT) or too complex (self-hosted agents)
- **ChatGPT/Claude Pro are just chat** — they don't execute tasks, manage files, or integrate with real tools

### Solution
- One-click deployment with guided setup
- Web-based dashboard for configuration
- Pre-configured integrations
- Managed infrastructure with automatic updates
- **Full agentic capabilities** — not just conversation, but execution

### What "Agentic" Means (Our Core Value)

This is NOT a chatbot. Users will have their agents:
- Schedule and post to Twitter/social media
- Monitor websites, scrape data, compile reports
- Manage files, organize projects, maintain codebases
- Control smart home devices, IoT integrations
- Research topics and synthesize information
- Automate repetitive workflows
- Send messages across platforms (Discord, Telegram, email)
- Run code, deploy applications
- Build and host simple web apps

**Positioning:** "Hire Claude. $79/month."

### Target Users
1. **Creators/Influencers** — Want AI to manage DMs, schedule content, research
2. **Solopreneurs** — Need an assistant but can't afford/manage human VA
3. **Developers** — Want Clawdbot but don't want to maintain infrastructure
4. **Small Teams** — Shared AI workspace for research, support, automation

### Market Size
- Claude API has millions of users
- r/ClaudeAI: 100k+ members
- Growing demand for "agentic" AI (not just chat)
- Competitor landscape is nascent

---

## Product Requirements

### Phase 1: MVP (Week 3-5)

#### User Stories
1. As a user, I can sign up and pay for a subscription
2. As a user, I can enter my Anthropic API key
3. As a user, I can deploy an agent with one click
4. As a user, I can chat with my agent via web interface
5. As a user, I can connect my agent to Discord
6. As a user, I can see my agent's status (online/offline)

#### Features
| Feature | Priority | Notes |
|---------|----------|-------|
| Landing page with waitlist | P0 | Validate demand |
| Stripe checkout | P0 | $29/mo starter plan |
| User authentication | P0 | Email + password, magic link |
| API key input | P0 | Encrypted storage |
| One-click deploy | P0 | Provisions container, starts Clawdbot |
| Web chat interface | P0 | Clawdbot built-in web UI |
| Discord integration setup | P1 | Guide user through bot token |
| Agent status dashboard | P1 | Online/offline, last active |
| ~~Subdomain per user~~ | ~~P2~~ | Removed — using path-based routing instead |

#### Non-Goals (MVP)
- Multiple agents per account
- Usage metering/limits
- Telegram/WhatsApp integrations
- Custom skills/tools
- Team features

### Phase 2: Production (Week 6-10)

#### Additional Features
| Feature | Priority | Notes |
|---------|----------|-------|
| Telegram integration | P0 | Bot token setup flow |
| WhatsApp integration | P1 | QR code linking |
| Admin dashboard | P0 | All instances, support access |
| User dashboard | P0 | Manage agent, update config |
| Usage monitoring | P1 | API calls, uptime |
| Automatic backups | P1 | Daily workspace snapshots |
| Multiple pricing tiers | P0 | Starter/Pro/Team |

### Phase 3: Growth (Month 3+)

#### Additional Features
| Feature | Priority | Notes |
|---------|----------|-------|
| Agent templates | P1 | Pre-configured for use cases |
| Skill marketplace | P2 | Community tools/integrations |
| White-label option | P2 | Agencies resell under their brand |
| Enterprise tier | P2 | Dedicated infra, SSO, audit logs |
| Mobile app | P3 | iOS/Android for push notifications |
| API access | P2 | Programmatic agent control |

---

## Known Issues & Workarounds

### Plan Race Condition in Provisioning (2026-02-08) — ✅ FIXED

**Issue:** Users who subscribe to Pro/Business plans could be provisioned as Starter. The provisioning endpoint reads `user.publicMetadata.plan` from Clerk, but the Stripe `checkout.session.completed` webhook that updates Clerk metadata may not have fired yet when the user lands on the dashboard and triggers provisioning.

**Root Cause:** Race condition between Stripe webhook → Clerk metadata update → provision endpoint reading the plan. Even though Bobby's checkout completed 11 minutes before provisioning, Clerk metadata hadn't been updated yet.

**Fix:** When `publicMetadata.plan` is `"starter"` but the user has a `stripeCustomerId`, the provision endpoint now checks Stripe directly via `subscriptions.list()` for their active subscription. Maps the Stripe price ID to plan name. Also fixes Clerk metadata in-flight so subsequent requests are correct. Additionally, the `plan` field is now written to the `machines` table during initial provisioning (was previously only set by the Stripe webhook).

**Commit:** `dfb3b04`

---

### OpenClaw Streaming Truncates MEDIA Paths (2026-02-05) — ✅ FIXED 2026-02-06

**Issue:** OpenClaw truncates `MEDIA:/path/to/file` strings during streaming. The streaming `chat` events arrive with truncated text, but the stored message in history is complete.

**Root Cause (discovered 2026-02-06):** Server-side `parseReplyDirectives()` strips `MEDIA:` lines from assistant text and puts URLs in a `data.mediaUrls` field on agent events. The runtime never read `mediaUrls`, so images were lost during streaming.

**Fix (Phase 2E):** Three changes:
1. **Enabled `verboseDefault: "on"`** in Docker entrypoint config — unlocks `stream: "tool"` events through gateway WebSocket (were silently filtered by default)
2. **Tool boundary bubble splitting** — replaced broken `lifecycle:start` hack with `stream: "tool"` phase `"start"` events for splitting assistant responses into separate bubbles
3. **Media URL injection** — runtime now reads `data.mediaUrls` from agent events and re-injects them as `MEDIA:` lines so `MessageContent` renders them as images

**History re-fetch kept** as fallback for base64 image content parts (which only appear in stored messages, never streaming).

See [`docs/STREAMING-SPEC.md`](docs/STREAMING-SPEC.md) Phase 2E for full technical details.

**Notes:**
- OpenClaw has **no HTTP API** for history - only WebSocket
- The `/ws/api/history` path returns the OpenClaw control panel HTML, not JSON
- Must use the existing WebSocket connection with `chat.history` command

---

## Architecture Principles

> **⚠️ [DEPRECATED 2026-02-02]** These principles were for the Cloudflare Moltworker architecture.
> We migrated to **Fly.io** with persistent volumes. See `docs/AGENT-CONFIG-SYSTEM.md` for current architecture.

~~### R2-First Design~~
~~All persistent data goes to R2 from the start. Don't design for local filesystem then retrofit R2 later.~~

**[SUPERSEDED]** We now use **Fly.io volumes** mounted at `/home/node/.openclaw`. Data persists on encrypted volumes, no R2 sync needed.

~~### User Isolation by Default~~

**[STILL VALID]** Each user gets:
- Dedicated Fly app: `automna-u-{shortId}.fly.dev`
- Isolated 1GB encrypted volume
- Own gateway token
- Tracked in Turso database

### Fail Gracefully
**[STILL VALID]** Containers can sleep. Design for degradation.

**Rules:**
- Always have timeout on container operations
- Show loading states, not spinners-forever
- Cache aggressively, invalidate carefully
- Prefer stale data over no data (where safe)

---

## Technical Architecture

### Infrastructure Decision: Fly.io ✅

> **Decision made 2026-02-02:** We chose **Fly.io** for per-user infrastructure.

**Why Fly.io:**
- Per-user Fly apps provide true isolation
- Persistent encrypted volumes (no R2 sync needed)
- Simple Machines API for provisioning
- Predictable pricing (~$9/user/month)
- Good cold start times (~60s)
- No Cloudflare Sandbox SDK beta issues

**Current Architecture:**
```
automna.ai (Vercel)
    └── Dashboard + API routes
            └── Turso DB (user/machine tracking)
                    └── Per-user Fly apps
                            └── automna-u-{shortId}.fly.dev
                                    └── OpenClaw on 2GB machine + 1GB volume
```

**Full details:** [`docs/PER-USER-SETUP.md`](docs/PER-USER-SETUP.md)

---

<details>
<summary>~~Previous Options Evaluated (DEPRECATED)~~</summary>

#### Option A: Self-Managed Docker
- Docker containers on Hetzner servers
- We manage orchestration, scaling, updates
- **Not chosen:** Too much ops overhead

#### Option B: Cloudflare Moltworker
- Cloudflare Sandbox SDK (managed containers)
- **Not chosen:** Cold start issues, R2 sync complexity, beta instability

</details>

---

### Multi-User Isolation (Current Implementation)

> **⚠️ [DEPRECATED 2026-02-02]** The Cloudflare Sandbox SDK architecture below is deprecated.
> We migrated to **Fly.io** on 2026-02-02. See current architecture below.

---

**✅ CURRENT ARCHITECTURE (Fly.io)**

Each user gets a dedicated Fly.io app:

```
User A (Clerk) ──► Dashboard (automna.ai)
                       │
                       ▼
                  Turso DB lookup (machines table)
                       │
                       ▼
                  User's Fly App: automna-u-abc123.fly.dev
                       │
                       ▼
                  OpenClaw Gateway (2GB RAM, 1GB volume)
                       │
                       ▼
                  Persistent storage at /home/node/.openclaw/
```

**Key Points:**
- Each user gets dedicated Fly app + machine + volume
- Provisioned on first login via `/api/user/provision`
- Tracked in Turso database (`machines` table)
- Token-based auth per user
- Data persists on encrypted Fly volumes
- Cold start: ~60s (machine boot + gateway start)
- Warm: instant

**Current Resources (per user):**
- 2GB RAM, 1 shared vCPU
- 1GB encrypted volume
- Custom Docker image with session key fix

**📚 Full documentation:** [`docs/PER-USER-SETUP.md`](docs/PER-USER-SETUP.md), [`docs/AGENT-CONFIG-SYSTEM.md`](docs/AGENT-CONFIG-SYSTEM.md)

---

<details>
<summary>~~Old Cloudflare Architecture (DEPRECATED)~~</summary>

Each user gets fully isolated resources via Cloudflare's Sandbox SDK:

```
User A (Clerk) ──► Signed URL (userId + exp + sig)
                       │
                       ▼
                  Worker validates signature
                       │
                       ▼
                  getSandbox(env, "user-user_abc")
                       │
                       ▼
                  Isolated DO → Container → R2 at /data/moltbot/users/user_abc/
```

This architecture was used from 2026-01-29 to 2026-02-01 but had issues with cold starts and R2 sync reliability.

</details>

---

### Infrastructure (Self-Managed Approach - DEPRECATED)

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare                              │
│              (DNS, SSL, DDoS, Tunnel to main server)         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│              Main Server (automna.ai)                        │
│                  (Hetzner CX52 - 32GB)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────────────────┐  │
│  │  Dashboard  │ │   Proxy     │ │     Provisioner        │  │
│  │  (Next.js)  │ │   Layer     │ │  (Docker + Hetzner API)│  │
│  │  + Clerk    │ │             │ │                        │  │
│  └─────────────┘ └─────────────┘ └────────────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐                             │
│  │  Postgres   │ │   Redis     │                             │
│  │  (Neon)     │ │  (optional) │                             │
│  └─────────────┘ └─────────────┘                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Shared Containers (Starter/Pro)             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │   │
│  │  │ User A   │ │ User B   │ │ User C   │  ...        │   │
│  │  │ 2.5-4GB  │ │ 2.5-4GB  │ │ 2.5-4GB  │             │   │
│  │  └──────────┘ └──────────┘ └──────────┘             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
            Internal Network (Tailscale / Hetzner Private)
                          │
┌─────────────────────────▼───────────────────────────────────┐
│             Dedicated VMs (Business/Max)                     │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  User X         │  │  User Y         │                   │
│  │  CX32 (8GB)     │  │  CX42 (16GB)    │                   │
│  │  Full isolation │  │  Full isolation │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

**Key Points:**
- All traffic goes through main server (automna.ai)
- Auth is same-origin (Clerk cookie)
- Proxy routes to local containers OR remote VMs
- Users don't see infrastructure differences

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Landing/Marketing | Next.js + **Cloudflare Pages** | Free, fast, same ecosystem as tunnels |
| Dashboard Frontend | Next.js | Same stack, shared components |
| API Backend | FastAPI (Python) | Fast, async, good Docker SDK |
| Database | PostgreSQL | Reliable, Hetzner managed option |
| Cache/Queue | Redis | Session management, job queue |
| Container Orchestration | Docker Swarm | Simpler than K8s for this scale |
| Infrastructure | Hetzner Cloud | Best price/performance, EU+US |
| CDN/Security/Tunnels | **Cloudflare** | DNS, SSL, DDoS, Tunnels for user apps |
| Payments | Stripe | Industry standard |
| Auth | Clerk or Auth.js | Don't roll our own |
| Monitoring | Uptime Kuma + Grafana | Self-hosted, low cost |

**Why Cloudflare ecosystem:**
1. Landing page → Cloudflare Pages (free, fast)
2. Agent hosting → Hetzner + Cloudflare Tunnels
3. User app hosting → Cloudflare Tunnels expose apps from agent containers
4. DNS/SSL/DDoS → All unified in Cloudflare

### User App Hosting (Phase 3+ Feature)

Agents can build and deploy web apps for users. Architecture:

```
User: "Build me a dashboard for my sales data"
Agent: *builds app, saves to /apps/sales-dashboard*
System: Auto-exposes via Cloudflare Tunnel
Result: Live at automna.ai/apps/{userId}/sales-dashboard
```

**Implementation:**
- Each user container has an `/apps` directory
- Cloudflare Tunnel daemon runs in container
- Apps auto-exposed at `{app-name}.{username}.automna.ai`
- No separate hosting needed — runs in same container as agent

**This is a killer feature:** "Your agent can build AND deploy apps."

### Container Specification

Each user agent runs in an isolated Docker container:

```yaml
# docker-compose template per user
version: '3.8'
services:
  clawdbot:
    image: automna/clawdbot:latest
    container_name: agent_${USER_ID}
    restart: unless-stopped
    mem_limit: 512m
    cpus: 0.5
    environment:
      - ANTHROPIC_API_KEY=${ENCRYPTED_KEY}
      - CLAWDBOT_WEB_PORT=18789
      - CLAWDBOT_CONFIG=/config/clawdbot.json
    volumes:
      - agent_${USER_ID}_data:/root/clawd
      - agent_${USER_ID}_config:/config
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.agent_${USER_ID}.rule=PathPrefix(`/a/${USER_ID}`)"
      - "traefik.http.middlewares.agent_${USER_ID}_strip.stripprefix.prefixes=/a/${USER_ID}"
    networks:
      - agent_network
```

### Browser Service (Browserbase)

Agents need real browser capabilities for web automation, OAuth logins, and sites that require JavaScript. Rather than running full browsers in each container (heavy, expensive), we use **Browserbase** — a cloud browser service.

**Why Browserbase:**
- Persistent contexts (sessions) per customer
- Customers log into Gmail/Twitter/etc once, stays logged in
- Stealth mode + auto captcha solving included
- Isolated per customer — no credential cross-contamination
- Pay-per-use, no heavy browser in each container

**Pricing (Jan 2026):**
| Plan | Cost | Browser Hours | Concurrent Sessions |
|------|------|---------------|---------------------|
| Free | $0/mo | 1 hour | 1 |
| Developer | $20/mo | 100 hours | 25 |
| Startup | $99/mo | 500 hours | 100 |
| Scale | Custom | Usage-based | 250+ |

Overage: ~$0.10-0.12/browser hour

**Architecture:**
```
User signs up → Create Browserbase context (contextId)
First browser task → Start session with contextId, user logs in
Future tasks → Load contextId, already authenticated
```

**Implementation:**
- Store `contextId` per customer in our database
- Agent calls Browserbase API when browser needed
- Sessions persist cookies, localStorage, auth tokens
- Contexts live indefinitely until deleted

**Cost per customer:** Minimal — most users need <1 hour/month of browser time. Heavy users (lots of scraping) might use 5-10 hours. At $0.10/hour, this is $0.10-$1/month per user.

**Integration with Clawdbot:**
- Create Clawdbot skill or tool that wraps Browserbase SDK
- Agent can: `browser_open(url)`, `browser_login(site)`, `browser_screenshot()`, etc.
- Transparent to end user — "browse to X" just works

**Security:**
- Each customer gets isolated browser context
- Credentials stored in Browserbase (not our database)
- API key scoped per project
- Can delete context on customer churn

**Links:**
- Docs: https://docs.browserbase.com
- Contexts: https://docs.browserbase.com/features/contexts
- Pricing: https://www.browserbase.com/pricing

### Security Model

| Layer | Implementation |
|-------|----------------|
| **LLM API Keys** | **Never on user machines** - proxied via `/api/llm/v1/messages` |
| User Isolation | Separate Fly.io apps, no shared filesystems |
| Browser Sessions | Browserbase contexts, isolated per customer |
| Email | Proxied via `/api/user/email/send` with rate limits |
| Network | Fly.io private networking, exposed via public URL |
| Auth | Gateway token per user, Clerk for dashboard |
| Backups | Fly.io volumes with automatic snapshots |

### LLM Proxy Security (Updated 2026-02-03)

User agents **cannot** access Anthropic directly:

1. `ANTHROPIC_API_KEY` is NOT passed to Fly machines
2. `ANTHROPIC_BASE_URL` routes all traffic through `https://automna.ai/api/llm`
3. Proxy authenticates via gateway token (per-user)
4. All usage logged to Turso for billing

This prevents users from:
- Bypassing rate limits
- Using our API key directly
- Avoiding usage tracking

### Gateway Authentication (Same-Origin Cookie + Proxy)

All requests go through `automna.ai` (main server). Auth is same-origin cookies, then proxy to the right backend.

**URL Structure:**
```
automna.ai/                     # Landing page
automna.ai/dashboard            # User dashboard  
automna.ai/a/{userId}/chat      # Agent chat UI (proxied to backend)
automna.ai/a/{userId}/ws        # Agent WebSocket (proxied to backend)
```

**Multi-Server Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Main Server (automna.ai)                 │
│  ┌─────────────┐  ┌─────────────────────────────────────┐  │
│  │  Dashboard  │  │            Proxy Layer              │  │
│  │  (Next.js)  │  │  /a/user1/* → localhost:3001        │  │
│  │             │  │  /a/user2/* → localhost:3002        │  │
│  │  Clerk Auth │  │  /a/user3/* → 10.0.1.5:18789 (VM)   │  │
│  └─────────────┘  │  /a/user4/* → 10.0.1.6:18789 (VM)   │  │
│                   └─────────────────────────────────────┘  │
│  ┌──────────┐ ┌──────────┐                                 │
│  │ Shared   │ │ Shared   │  ← Starter/Pro containers      │
│  │ user1    │ │ user2    │    (same server)               │
│  └──────────┘ └──────────┘                                 │
└─────────────────────────────────────────────────────────────┘
         │ Internal network (Tailscale or private Hetzner network)
         │
┌────────┴────────┐  ┌─────────────────┐
│  Dedicated VM   │  │  Dedicated VM   │  ← Business/Max VMs
│  user3 (CX32)   │  │  user4 (CX42)   │    (separate servers)
│  Clawdbot       │  │  Clawdbot       │
└─────────────────┘  └─────────────────┘
```

**Auth Flow:**
```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Browser       │      │   Main Server    │      │  User Backend   │
│                 │      │   (automna.ai)   │      │ (local or remote)│
└────────┬────────┘      └────────┬─────────┘      └────────┬────────┘
         │                        │                         │
         │ 1. Login via Clerk     │                         │
         │ ──────────────────────►│                         │
         │                        │                         │
         │ 2. Clerk session cookie│                         │
         │ ◄──────────────────────│                         │
         │                        │                         │
         │ 3. Visit /a/{userId}/  │                         │
         │ ──────────────────────►│                         │
         │                        │                         │
         │                        │ 4. Verify Clerk session │
         │                        │    Look up user's backend│
         │                        │                         │
         │                        │ 5. Proxy request        │
         │                        │ ───────────────────────►│
         │                        │   (internal auth)       │
         │                        │                         │
         │ 6. Response            │                         │
         │ ◄──────────────────────────────────────────────────
```

**Backend Lookup:**
```typescript
// Database stores where each user's agent runs
interface UserAgent {
  userId: string;
  tier: 'starter' | 'pro' | 'business' | 'max';
  backendType: 'local' | 'remote';
  // For local (shared containers):
  containerPort?: number;  // e.g., 3001
  // For remote (dedicated VMs):
  vmIp?: string;           // e.g., "10.0.1.5"
  vmPort?: number;         // e.g., 18789
}
```

**How It Works:**
1. User logs in via Clerk → gets session cookie on `automna.ai`
2. User visits `/a/{userId}/chat`
3. Middleware verifies Clerk session + user owns the agent
4. Look up user's backend location (local container or remote VM)
5. Proxy request to correct backend with internal auth header
6. User doesn't know/care if they're on shared or dedicated infra

**Two-Layer Auth (User vs Service-to-Service):**
```
Browser                    Main Server              Backend (any server)
   │                      (automna.ai)              (local or remote)
   │                           │                           │
   │  1. Request + Clerk       │                           │
   │     session cookie        │                           │
   │ ─────────────────────────►│                           │
   │                           │                           │
   │                      2. Validate Clerk                │
   │                         session cookie                │
   │                           │                           │
   │                      3. Look up backend               │
   │                         from database                 │
   │                           │                           │
   │                           │  4. Forward with          │
   │                           │     internal auth         │
   │                           │ ─────────────────────────►│
   │                           │     X-Automna-Internal    │
   │                           │                           │
   │                           │  5. Backend validates     │
   │                           │     internal token        │
   │                           │                           │
   │                           │  6. Response              │
   │                           │ ◄─────────────────────────│
   │  7. Response              │                           │
   │ ◄─────────────────────────│                           │
```

**What Each Component Validates:**

| Component | Validates | Trusts |
|-----------|-----------|--------|
| Main server (proxy) | Clerk session cookie, user owns agent | Nothing - it's the auth source |
| Backend (container/VM) | Internal auth header only | Requests from main server |

**Why This Works Across Servers:**
- Backend doesn't need to know about Clerk
- Backend only validates the internal `X-Automna-Internal` header
- Same internal token works for all backends
- Only the main server proxy knows the internal token
- Works whether backend is localhost, same datacenter, or another region

**Implementation:**

1. **Middleware** (auth check):
```typescript
// middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname;
  
  // Agent routes require auth
  if (path.startsWith('/a/')) {
    const { userId } = await auth();
    if (!userId) {
      return Response.redirect(new URL('/sign-in', req.url));
    }
    
    // Extract userId from path: /a/{userId}/...
    const pathUserId = path.split('/')[2];
    
    // Verify user can only access their own agent
    const user = await getUser(userId);
    if (user.id !== pathUserId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
});
```

2. **Proxy Route** (forwards to correct backend):
```typescript
// app/a/[userId]/[...path]/route.ts
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request, { params }) {
  const { userId } = await auth();
  const user = await db.user.findUnique({ where: { clerkId: userId } });
  
  // Look up where this user's agent runs
  const agent = await db.agent.findUnique({ where: { userId: user.id } });
  
  // Build backend URL based on type
  let backendUrl: string;
  if (agent.backendType === 'local') {
    // Shared container on this server
    backendUrl = `http://localhost:${agent.containerPort}`;
  } else {
    // Dedicated VM on another server
    backendUrl = `http://${agent.vmIp}:${agent.vmPort}`;
  }
  
  // Forward request with internal auth header
  const proxyRes = await fetch(`${backendUrl}/${params.path.join('/')}`, {
    headers: {
      'X-Automna-Internal': process.env.INTERNAL_PROXY_SECRET,
      'X-Automna-User': user.id,
    }
  });
  
  return proxyRes;
}
```

3. **WebSocket Proxy** (for chat streaming):
```typescript
// app/a/[userId]/ws/route.ts
import { auth } from '@clerk/nextjs/server';
import { WebSocketServer } from 'ws';

export async function UPGRADE(req: Request, { params }) {
  const { userId } = await auth();
  const agent = await getAgentBackend(userId);
  
  // Accept client connection
  const clientWs = await acceptWebSocket(req);
  
  // Connect to backend with internal auth
  const backendWs = new WebSocket(
    agent.backendType === 'local' 
      ? `ws://localhost:${agent.containerPort}`
      : `ws://${agent.vmIp}:${agent.vmPort}`,
    {
      headers: {
        'X-Automna-Internal': process.env.INTERNAL_PROXY_SECRET,
      }
    }
  );
  
  // Relay messages both directions
  clientWs.on('message', (data) => backendWs.send(data));
  backendWs.on('message', (data) => clientWs.send(data));
  
  // Handle disconnects
  clientWs.on('close', () => backendWs.close());
  backendWs.on('close', () => clientWs.close());
}
```

4. **Backend Config** (same for all backends):
```json
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "${INTERNAL_PROXY_SECRET}"
    },
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "100.64.0.0/10"]
  }
}
```

**Note on trustedProxies:**
- `10.0.0.0/8` - Hetzner private network
- `172.16.0.0/12` - Docker networks
- `100.64.0.0/10` - Tailscale CGNAT range (if using Tailscale mesh)

All backends use the same `INTERNAL_PROXY_SECRET`. This token is:
- Generated once, stored in our secrets manager
- Never exposed to users
- Used only for service-to-service auth between proxy and backends

**Security Properties:**
- ✅ Same-origin: Clerk cookie works automatically
- ✅ User isolation: Middleware verifies userId match
- ✅ Internal auth: Containers only accept requests from proxy
- ✅ No tokens in URLs: Auth is cookie-based
- ✅ HttpOnly cookies: Clerk handles this
- ✅ Simple: No exchange tokens, no cross-origin dance

**Benefits of Path-Based:**
- Simpler auth (same-origin cookies)
- Easier debugging (one domain)
- No wildcard SSL certs needed
- No DNS complexity
- Faster time to market

**Future: Custom Domains (if needed)**
Can add subdomain/custom domain support later as a premium feature. The proxy layer makes this possible without changing container architecture.

### Custom Chat UI

We build a custom chat interface using **assistant-ui** (open source, MIT) instead of embedding Clawdbot's Control UI.

**Why:**
- Clean, branded experience
- Only show chat (hide config/cron/nodes)
- Full control over UX
- File/image support built-in
- Future: artifact previews like Claude

**Architecture:**
- assistant-ui components handle UI (streaming, auto-scroll, attachments)
- Custom ClawdbotRuntimeAdapter translates to Clawdbot WebSocket API
- WebSocket proxied through our backend for auth

**Full spec:** See `CHAT-UI-SPEC.md`

### Scaling Strategy

| Users | Infrastructure | Monthly Cost |
|-------|---------------|--------------|
| 1-20 | Single CX32 (8GB) | ~$15 |
| 20-50 | CX42 (16GB) | ~$30 |
| 50-100 | 2x CX32 | ~$30 |
| 100-500 | Docker Swarm cluster (3-5 nodes) | ~$100-200 |
| 500+ | Kubernetes migration | Variable |

---

## Business Model

### Pricing Tiers

| Tier | Price | Resources | API Model | Credits |
|------|-------|-----------|-----------|---------|
| **Starter** | $29/mo | 2.5GB shared | BYOK | 500/mo* |
| **Pro** | $79/mo | 4GB shared | BYOK | 2,000/mo* |
| **Business** | $129/mo | 8GB dedicated VM | Credits | 15,000/mo |
| **Max** | $249/mo | 16GB dedicated VM | Credits | 40,000/mo |
| **Enterprise** | Contact us | Custom | Custom | Custom |

*BYOK tiers: Credits cover browser automation, storage, extras only. AI usage is on user's Anthropic key.

**Shared vs Dedicated:**
- **Shared (Starter/Pro):** Container on multi-tenant server. Cost-efficient, still isolated.
- **Dedicated VM (Business/Max):** Own Hetzner VM. Full isolation, guaranteed resources.

**Comparison to alternatives:**
- Human VA: $15-25/hr = $2,400-4,000/mo
- ChatGPT/Claude Pro: $20/mo but chat-only, no execution
- Automna: $29-249/mo for full agentic capabilities

### Automna Credits System

Credits are a universal resource covering all platform usage:

| Resource | Credits |
|----------|---------|
| 1 AI message (Sonnet) | 1 |
| 1 AI message (Opus / extended thinking) | 5 |
| 1 minute browser automation | 2 |
| 100MB storage (monthly) | 10 |
| 1 scheduled task run | 1 |
| 1 email sent | 1 |

**Overage pricing:** $10 per 1,000 credits ($0.01/credit)

**Why credits:**
- Simple UX: "You have 8,432 credits remaining"
- Covers multiple cost centers (API, browser, storage) in one number
- Decouples from Anthropic pricing changes
- Enables promos, bonuses, add-on packs

### Cost Structure (Per User)

| Tier | Price | Infra Cost | Credit Cost* | Total Cost | Margin |
|------|-------|------------|--------------|------------|--------|
| Starter $29 | $29 | ~$5 | — (BYOK) | ~$5 | 83% |
| Pro $79 | $79 | ~$9 | — (BYOK) | ~$9 | 89% |
| Business $129 | $129 | ~$14 | ~$15 | ~$29 | 78% |
| Max $249 | $249 | ~$27 | ~$40 | ~$67 | 73% |

*Credit cost assumes average usage. Heavy users generate overage revenue.

**Infrastructure costs:**
- Shared (Starter/Pro): Containers on CX52 (32GB) — €49/mo ÷ users
- Business 8GB VM: CX32 — €13/mo
- Max 16GB VM: CX42 — €25/mo

### Revenue Projections

| Month | Users | Avg Price | MRR | Costs | Profit |
|-------|-------|-----------|-----|-------|--------|
| 3 | 50 | $80 | $4,000 | $500 | $3,500 |
| 6 | 150 | $90 | $13,500 | $1,500 | $12,000 |
| 12 | 400 | $100 | $40,000 | $5,000 | $35,000 |

At $100 average (mix of tiers):
- 100 users = $10,000 MRR
- 500 users = $50,000 MRR
- 1,000 users = $100,000 MRR

**Overage upside:** Business/Max users who exceed credits add incremental revenue at high margin.

### API Key Model (BYOK)

Users bring their own Anthropic API key because:
1. No margin risk on heavy users
2. Clear value separation (we = hosting, they = AI usage)
3. Users get Anthropic's free tier to start
4. Avoids reseller complexity

Future option: "Credits included" tier at premium price once we have volume for reseller terms.

### ⚠️ Claude Max Subscription — NOT VIABLE

**Researched 2026-01-28:** We considered allowing users to connect their Claude Max ($100-200/mo) subscription instead of API keys, since Max offers unlimited Claude Code usage.

**Finding:** This violates Anthropic's Terms of Service.

> "The Max plan updates apply exclusively to Claude Free, Pro, and Max consumer accounts. If you use Claude Max to power third-party agents or services, this violates the terms of service."
> — Anthropic Consumer ToS Updates (October 2025)

**Implications:**
- ❌ Cannot offer "Connect your Max account" feature
- ❌ OAuth-based Claude authentication for hosted agents = ToS violation
- ✅ API keys (BYOK) remain the only compliant option
- ✅ Could negotiate reseller/commercial terms with Anthropic later for bundled credits

**API Pricing Reference (Jan 2026):**

| Model | Input/MTok | Output/MTok | Typical Use Case |
|-------|------------|-------------|------------------|
| Haiku 3.5 | $0.80 | $4 | High-volume, simple tasks |
| Sonnet 3.7/4.5 | $3 | $15 | Balanced (default) |
| Opus 4.1 | $15 | $75 | Complex reasoning |

**Estimated User API Costs:**
- Light user (10 convos/day): ~$5-15/month
- Moderate user (30 convos/day): ~$15-50/month  
- Heavy user (50+ convos/day): ~$50-150/month

This reinforces our BYOK model — users pay Anthropic directly for usage, we charge for hosting/convenience.

---

## User Experience

### Onboarding Flow

```
1. Landing Page
   └── "Get Started" CTA
   
2. Sign Up
   └── Email + Password (or Google OAuth)
   
3. Choose Plan
   └── Starter / Pro / Team
   └── Stripe Checkout
   
4. Setup Wizard
   ├── Step 1: Enter Anthropic API Key
   │   └── Link to get key + validation
   ├── Step 2: Name Your Agent
   │   └── Personality prompt (optional)
   ├── Step 3: Choose Integrations
   │   └── Discord / Telegram / Web only
   └── Step 4: Deploy
       └── Progress bar → "Your agent is live!"
       
5. Dashboard
   └── Chat interface + settings
```

### Dashboard Features

**Main View:**
- Chat interface (primary)
- Agent status indicator
- Quick settings

**Settings Panel:**
- API key management
- Integration connections
- Personality/system prompt
- Memory management (view/clear)

**Integrations Page:**
- Discord: Bot token input, server selector
- Telegram: Bot token input, test message
- WhatsApp: QR code linking flow
- Web: Embed code for websites

### Error States

| Scenario | User Message | Action |
|----------|--------------|--------|
| Invalid API key | "API key invalid. Please check and try again." | Re-enter key |
| API key expired | "Your Anthropic API key has expired or hit limits." | Link to Anthropic billing |
| Container failed | "Agent temporarily unavailable. We're on it." | Auto-restart + alert us |
| Payment failed | "Payment failed. Update your card to keep your agent running." | Stripe billing portal |

---

## Go-to-Market Strategy

### Phase 1: Validation (Week 1-2)

**Channels:**
- Reddit: r/ClaudeAI, r/LocalLLaMA, r/selfhosted, r/SideProject
- Hacker News: "Show HN: One-click AI agent hosting"
- Twitter/X: AI community, indie hackers, solopreneurs
- Clawdbot Discord: Community announcement (with maintainer approval)
- Product Hunt: Save for launch day

**Landing Page Messaging:**

> **Your AI agent, deployed in 60 seconds.**
> 
> Skip the server setup. Skip the Docker commands. Skip the config files.
> 
> Automna gives you a personal AI assistant that lives in your Discord, 
> Telegram, or browser — with memory, tools, and real capabilities.
> 
> Just bring your Claude API key. We handle everything else.
>
> [Join Waitlist]

**Waitlist Goal:** 200+ signups = proceed to MVP

### Phase 2: Beta Launch (Week 5)

- Email waitlist with beta access
- Limited to first 50 users
- $19/mo beta pricing (locked in for 12 months)
- Feedback form + Discord community

### Phase 3: Public Launch (Week 8)

- Product Hunt launch
- Full pricing tiers
- Referral program ($10 credit per referral)
- Content marketing (tutorials, use cases)

### Messaging by Audience

| Audience | Pain Point | Message |
|----------|------------|---------|
| Developers | "I want Clawdbot but don't want to maintain it" | "Clawdbot hosting done right. We keep it updated, you use it." |
| Creators | "I need help managing DMs and content" | "An AI assistant that lives in your Discord 24/7" |
| Solopreneurs | "I can't afford a VA but need help" | "Your $29/mo assistant that actually does things" |
| Small Teams | "We need shared AI workspace" | "One agent, whole team access, persistent memory" |

---

## Competitive Analysis

| Competitor | Price | Model | Pros | Cons |
|------------|-------|-------|------|------|
| **ChatGPT Plus** | $20/mo | Chat only | Brand recognition, simple | No execution, no integrations, limited memory |
| **Claude Pro** | $20/mo | Chat only | Great model | Same limitations as ChatGPT |
| **Claude Max** | $100-200/mo | Claude Code (local) | Unlimited usage, full agent | YOU set up everything, no integrations, not always-on |
| **Poe** | $20/mo | Multi-model chat | Many models | Chat only, no agent capabilities |
| **Character.ai** | Free/Premium | Chat personas | Fun, engaging | Entertainment only, no productivity |
| **Self-hosted Clawdbot** | DIY | Full agent | Full control, free | Requires technical skills, maintenance burden |
| **Automna** | $79-299/mo | Full managed agent | Always-on, integrations, app hosting, zero setup | Newer, smaller |

**Our Differentiators:**
1. **Full execution** — Not chat, actual task completion
2. **Always-on cloud hosting** — Your agent works while you sleep
3. **Pre-configured integrations** — Discord, Telegram, WhatsApp, web
4. **Persistent memory** — Remembers everything across sessions
5. **App hosting** — Agents can build and deploy web apps
6. **Zero maintenance** — We handle updates, security, uptime
7. **More than Claude Max** — Same capabilities + managed + integrated

**Why we win:**
- vs ChatGPT/Claude Pro: We execute, they just chat
- vs Claude Max: We're fully managed, they're DIY
- vs Self-hosted: We're zero-effort, they require expertise
- vs Human VA: We're 10-50x cheaper

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Anthropic API changes | Medium | High | Abstract API layer, multi-model support later |
| Clawdbot breaking changes | Medium | High | Pin versions, maintain fork if needed |
| Low demand | Medium | High | Validate with waitlist before building |
| Security breach | Low | Critical | Encryption, isolation, audits, insurance |
| Hetzner outage | Low | High | Multi-region, automated failover |
| Competition | High | Medium | Move fast, focus on UX, build community |

---

## Success Metrics

### North Star
**Monthly Recurring Revenue (MRR)**

### Leading Indicators
| Metric | Target (Month 3) | Target (Month 6) |
|--------|------------------|------------------|
| Waitlist signups | 500 | N/A |
| Paying users | 50 | 200 |
| MRR | $1,500 | $6,000 |
| Churn rate | <10% | <8% |
| NPS | >40 | >50 |

### Operational Metrics
- Uptime: >99.5%
- Deploy time: <2 minutes
- Support response: <4 hours
- Container density: 15+ per GB RAM

---

## Timeline

### Week 1-2: Validation
- [x] Register domain (automna.ai) ✓ 2026-01-28
- [ ] Build landing page
- [ ] Set up waitlist (email capture)
- [ ] Post to Reddit, HN, Twitter
- [ ] Reach 200 signups

### Week 3-4: Foundation
- [ ] Set up Hetzner infrastructure
- [ ] Build Docker container image
- [ ] Create provisioning API
- [ ] Stripe integration
- [ ] Basic auth system

### Week 5: MVP Launch
- [ ] User dashboard (minimal)
- [ ] One-click deploy flow
- [ ] Discord integration guide
- [ ] Beta invite to waitlist
- [ ] Onboard first 20 users

### Week 6-8: Iteration
- [ ] User feedback integration
- [ ] Telegram support
- [ ] Improved dashboard
- [ ] Monitoring/alerting
- [ ] Documentation

### Week 9-10: Public Launch
- [ ] Product Hunt submission
- [ ] Full pricing tiers
- [ ] Referral program
- [ ] Content marketing

---

## Current Status (2026-01-29)

### ✅ Completed
- Domain registered: automna.ai
- Browserbase account created + API integrated (contexts for per-customer browser sessions)
- Agentmail set up: automnajoi@agentmail.to (transactional email for notifications)
- Discord bot created: Automna#4978 (App ID: 1466131766015332382)
- Initial product spec drafted
- Landing page + auth deployed to automna.ai (Vercel + Clerk)
- Trial container running (agent_test on port 3001 → test.automna.ai)

### 🔬 Under Investigation
- **Cloudflare Moltworker** — Potential replacement for self-managed Docker
  - Released 2026-01-29 by Cloudflare
  - Runs Clawdbot on their managed Sandbox SDK
  - Could eliminate all container orchestration work
  - Test plan: `docs/moltworker-test-plan.md`
  - Decision pending after 4-day validation

### 🔧 Infrastructure Ready
| Service | Status | Notes |
|---------|--------|-------|
| Domain | ✅ Ready | automna.ai registered |
| Browser Service | ✅ Ready | Browserbase free tier (1hr/mo) |
| Email | ✅ Ready | Agentmail transactional |
| Discord Bot | ✅ Created | Token stored, needs features |
| Hetzner Server | ✅ Existing | Current server can host MVP |

### 🎯 Next Steps (Priority Order)
1. **Landing page** — Simple page with waitlist capture on Cloudflare Pages
2. **Bot functionality** — Basic Clawdbot features in Discord bot
3. **Waitlist validation** — Post to Reddit/HN, gauge demand before building full platform

---

## Open Questions

1. **Naming:** Automna.ai confirmed? Check trademark conflicts?
2. **Founding team:** Solo or bring in co-founder for dev work?
3. **Legal:** Terms of service, privacy policy, liability for user agents
4. **Support:** Email only? Discord community? Live chat?
5. **Clawdbot relationship:** Reach out to maintainer for endorsement/partnership?

---

## Future Feature: BYOT/BYOK Tier (Claude Max Integration)

**Research Date:** 2026-02-02

### Overview
Allow users to bring their Claude Max subscription tokens instead of paying for API usage. This provides a cheaper option for users who already have Max subscriptions.

### Two Options

**BYOK (Bring Your Own Key)** — API Keys
- User brings their Anthropic API key (`sk-ant-api...`)
- Standard pay-per-token billing on their account
- Fully legitimate, no ToS concerns
- Primary recommended path

**BYOT (Bring Your Own Token)** — Max Subscription Tokens
- User brings OAuth tokens from their Claude Max subscription
- Tokens: `sk-ant-oat01-...` (access) + `sk-ant-ort01-...` (refresh)
- Uses their flat subscription instead of per-token API billing
- ⚠️ Gray area — see ToS Analysis below

### BYOT Technical Flow

1. **User obtains tokens legitimately:**
   - Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
   - Run: `claude setup-token`
   - Browser opens → user authenticates with Anthropic
   - Tokens stored in `~/.claude/.credentials.json`

2. **User provides tokens to Automna:**
   - Copy from `~/.claude/.credentials.json`:
     ```json
     {
       "claudeAiOauth": {
         "accessToken": "sk-ant-oat01-...",
         "refreshToken": "sk-ant-ort01-...",
         "expiresAt": 1234567890
       }
     }
     ```
   - Paste into Automna dashboard (encrypted storage)

3. **Automna uses tokens:**
   - API calls with `Authorization: Bearer <accessToken>`
   - Access tokens expire after 8 hours
   - Refresh using:
     ```bash
     curl -X POST https://console.anthropic.com/api/oauth/token \
       -H "Content-Type: application/json" \
       -d '{
         "grant_type": "refresh_token",
         "refresh_token": "sk-ant-ort01-...",
         "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
       }'
     ```

### ToS Analysis

**Consumer Terms say:** Max is for "personal, non-commercial use through designated tools."

**What Anthropic blocked (2026):**
- Third-party tools initiating their own OAuth flow (Cline, RooCode, OpenCode)
- Using `CLAUDE_CODE_OAUTH_TOKEN` env var in unauthorized apps
- "Subscription arbitrage" (one Max → many users)

**What still works:**
- Reading tokens from `~/.claude/.credentials.json` (this is how Clawdbot/OpenClaw works)
- Making API calls with legitimately-obtained tokens

**Arguments for BYOT being acceptable:**
- Tokens obtained through official Claude Code CLI ✅
- One user = one subscription (no sharing) ✅
- User is using their own subscription for their own agent ✅
- Automna is just infrastructure/hosting ✅

**Arguments against:**
- Automna is a paid commercial product
- User is accessing their subscription through non-"designated tool"

**Risk level:** Medium. Could break if Anthropic tightens enforcement.

### Implementation Plan

1. **Phase 1:** Offer as "beta/experimental" feature
2. **Add disclaimers:**
   - "Uses your Claude Max subscription"
   - "Anthropic's consumer terms apply"
   - "May stop working if Anthropic changes policies"
3. **Keep API key BYOK as primary** recommended option
4. **Monitor:** If Anthropic blocks, gracefully degrade to API-only
5. **Long-term:** Consider reaching out to Anthropic for official partnership/blessing

### Dashboard UI (Draft)

```
Authentication Method:
○ Anthropic API Key (Recommended)
  - Pay-per-token on your Anthropic account
  - Most reliable option
  
○ Claude Max Tokens (Beta)
  - Use your existing Max subscription
  - Requires Claude Code CLI setup
  - ⚠️ Experimental — may stop working
```

### References
- Claude Code OAuth client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
- Token refresh endpoint: `https://console.anthropic.com/api/oauth/token`
- Credentials file: `~/.claude/.credentials.json`
- LiteLLM integration: https://docs.litellm.ai/docs/tutorials/claude_code_max_subscription

---

## Appendix

### A. Landing Page Copy (Draft)

**Headline:** The AI assistant that actually does things.

**Subhead:** Not just chat. Execute. Your personal Claude agent that browses the web, manages files, automates workflows, and deploys apps — always on, always ready.

**Alternative Headlines:**
- "Hire Claude. $79/month."
- "Your digital employee, deployed in 60 seconds."
- "Claude that works, not just talks."

**Features:**
- ⚡ **Execute, don't just chat** — Automate tasks, manage files, control integrations
- 🌐 **Always on** — Lives in the cloud, available 24/7
- 💬 **Multi-platform** — Discord, Telegram, WhatsApp, Web
- 🧠 **Persistent memory** — Remembers everything across sessions
- 🚀 **Build & deploy** — Your agent can create and host web apps
- 🔒 **Your data** — Your API key, your control, encrypted

**CTA:** Join the Waitlist →

**Social Proof:** (Add after beta) "Finally, an AI that does my actual work." — Beta User

**Comparison Section:**
| Feature | ChatGPT/Claude | Automna |
|---------|---------------|-----------|
| Chat | ✅ | ✅ |
| Execute tasks | ❌ | ✅ |
| File management | ❌ | ✅ |
| Integrations | ❌ | ✅ |
| Always on | ❌ | ✅ |
| Build apps | ❌ | ✅ |
| Memory | Limited | ✅ Persistent |

### B. Competitor Pricing Reference

- ChatGPT Plus: $20/mo (chat only)
- Claude Pro: $20/mo (chat only)
- Claude Max: $100-200/mo (Claude Code on YOUR machine, no integrations)
- Human VA: $2,400-4,000/mo

**Our positioning:** Premium tier ($79-299/mo) but fraction of human VA cost, more capable than Claude Max (fully managed + integrations + app hosting).

### C. Clawdbot License

MIT License — allows commercial use, modification, distribution. Requires copyright notice in copies.

---

*Document maintained by Nova. Last updated: 2026-01-28*
