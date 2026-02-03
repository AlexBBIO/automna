# API Proxy System - Detailed Plan

> **Goal:** Proxy all LLM API calls through Vercel to secure keys and enable usage tracking/limiting.

## Problem Statement

Currently, API keys are passed as environment variables to user Fly machines:
- Users can access them via `env` command or `os.environ`
- No usage tracking or limiting
- Security risk: keys could be exfiltrated

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT (INSECURE)                              │
│                                                                              │
│  User Machine                                                                │
│  ┌─────────────────┐       ┌─────────────────┐                              │
│  │   OpenClaw      │──────►│  Anthropic API  │                              │
│  │                 │       │                 │                              │
│  │ ANTHROPIC_KEY   │       └─────────────────┘                              │
│  │ (exposed!)      │                                                        │
│  └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              PROPOSED (SECURE)                               │
│                                                                              │
│  User Machine              Vercel Proxy              External APIs           │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐      │
│  │   OpenClaw      │─────►│ /api/llm/chat   │─────►│  Anthropic API  │      │
│  │                 │      │                 │      └─────────────────┘      │
│  │ Gateway token   │      │ - Auth user     │      ┌─────────────────┐      │
│  │ (identifies     │      │ - Check limits  │─────►│  Gemini API     │      │
│  │  user only)     │      │ - Log usage     │      │  (embeddings)   │      │
│  │                 │      │ - Add API key   │      └─────────────────┘      │
│  │ NO API KEYS!    │      │ - Stream back   │                               │
│  └─────────────────┘      └─────────────────┘                               │
│                                  │                                          │
│                                  ▼                                          │
│                           ┌─────────────────┐                               │
│                           │   Turso DB      │                               │
│                           │ - Usage logs    │                               │
│                           │ - Plan limits   │                               │
│                           └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Chat Completions Proxy
**Endpoint:** `POST /api/llm/chat`

**Request:**
```json
{
  "model": "claude-sonnet-4-20250514",
  "messages": [...],
  "max_tokens": 4096,
  "stream": true
}
```

**Auth:** `Authorization: Bearer <gateway_token>`

**Flow:**
1. Validate gateway token → get user_id from Turso
2. Check user's plan and usage limits
3. If over limit → return 429 with details
4. Forward to Anthropic with our API key
5. Stream response back to user
6. Count tokens from response
7. Log usage to Turso (async, non-blocking)

### 2. Embeddings Proxy
**Endpoint:** `POST /api/llm/embed`

**Request:**
```json
{
  "model": "gemini-embedding-001",
  "content": "text to embed"
}
```

**Flow:** Same auth + logging, forward to Gemini.

## Database Schema

### New Table: `llm_usage`

```sql
CREATE TABLE llm_usage (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  
  -- Request details
  provider TEXT NOT NULL,        -- 'anthropic' | 'gemini'
  model TEXT NOT NULL,           -- 'claude-sonnet-4-20250514' etc.
  endpoint TEXT NOT NULL,        -- 'chat' | 'embed'
  
  -- Token counts
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  
  -- Cost tracking (in millicents, i.e. $0.01 = 1000)
  cost_millicents INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  session_key TEXT,              -- Which conversation
  
  FOREIGN KEY (user_id) REFERENCES machines(user_id)
);

CREATE INDEX idx_llm_usage_user_timestamp ON llm_usage(user_id, timestamp);
CREATE INDEX idx_llm_usage_user_month ON llm_usage(user_id, timestamp / 2592000);
```

### New Table: `plan_limits`

```sql
CREATE TABLE plan_limits (
  plan TEXT PRIMARY KEY,         -- 'starter' | 'pro' | 'business'
  monthly_tokens INTEGER,        -- Token limit per month
  monthly_cost_cents INTEGER,    -- Cost limit in cents (alternative)
  rate_limit_rpm INTEGER,        -- Requests per minute
  rate_limit_tpm INTEGER         -- Tokens per minute
);

INSERT INTO plan_limits VALUES
  ('starter', 1000000, 1000, 20, 40000),      -- 1M tokens, $10 cap, 20 rpm
  ('pro', 5000000, 5000, 60, 100000),         -- 5M tokens, $50 cap, 60 rpm
  ('business', 20000000, 20000, 120, 200000); -- 20M tokens, $200 cap, 120 rpm
```

## OpenClaw Configuration

OpenClaw needs to be configured to use our proxy instead of Anthropic directly.

**Investigation Results:**
- OpenClaw uses `@mariozechner/pi-ai` which has `baseUrl` in model definitions
- Config schema has `agents.defaults.memorySearch.remote.baseUrl` for embeddings
- No obvious top-level `providers.anthropic.baseUrl` setting found
- Direct Anthropic SDK supports `ANTHROPIC_BASE_URL` env var (need to verify if pi-ai uses it)

**Option A: Environment Variable Override (Try First)**
```bash
# Set in Fly machine env
ANTHROPIC_BASE_URL=https://automna.ai/api/llm/anthropic
ANTHROPIC_API_KEY=${GATEWAY_TOKEN}  # Used as auth token
```

The Anthropic SDK checks for `ANTHROPIC_BASE_URL` env var. If pi-ai passes this through, it should work.

**Option B: OpenRouter-Style Routing (Fallback)**

Route through OpenRouter or our own OpenAI-compatible endpoint:
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/anthropic/claude-opus-4-5"
      }
    }
  }
}
```

Then intercept at the OpenRouter level (we'd set up `OPENROUTER_API_KEY` to point to our proxy).

**Option C: Fork pi-ai (Last Resort)**

If neither works, we'd need to add explicit baseUrl support. Probably overkill.

**Recommended Approach:** 
1. Test Option A first with `ANTHROPIC_BASE_URL`
2. If that fails, use Option B with a custom "provider" that looks like OpenRouter

## Implementation Steps

### Phase 1: Core Proxy (Day 1)
1. [ ] Create `/api/llm/chat` endpoint
2. [ ] Implement gateway token auth
3. [ ] Forward requests to Anthropic
4. [ ] Handle streaming responses
5. [ ] Basic error handling

### Phase 2: Usage Tracking (Day 1-2)
1. [ ] Create `llm_usage` table in Turso
2. [ ] Extract token counts from Anthropic response
3. [ ] Log usage async (don't block response)
4. [ ] Create `/api/user/usage` endpoint to check quota

### Phase 3: Rate Limiting (Day 2)
1. [ ] Create `plan_limits` table
2. [ ] Check monthly usage before proxying
3. [ ] Implement rate limiting (requests/min)
4. [ ] Return clear error messages with limits

### Phase 4: OpenClaw Integration (Day 2-3)
1. [ ] Update Docker image config
2. [ ] Remove direct API keys from env
3. [ ] Test full flow
4. [ ] Update provisioning to use new config

### Phase 5: Gemini Proxy (Day 3)
1. [ ] Create `/api/llm/embed` endpoint
2. [ ] Same auth + logging flow
3. [ ] Update OpenClaw memory config

### Phase 6: Dashboard UI (Day 3-4)
1. [ ] Usage dashboard component
2. [ ] Show tokens used / remaining
3. [ ] Show cost estimate
4. [ ] Upgrade prompts when near limit

## Streaming Implementation

Anthropic uses Server-Sent Events (SSE). The proxy must:

```typescript
// /api/llm/chat/route.ts
export async function POST(request: Request) {
  // 1. Auth + limit check
  const user = await authenticateGatewayToken(request);
  if (!user) return unauthorized();
  
  const withinLimits = await checkUsageLimits(user.id);
  if (!withinLimits) return rateLimited();
  
  // 2. Forward to Anthropic
  const body = await request.json();
  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  // 3. Stream response back
  if (body.stream) {
    const reader = anthropicResponse.body?.getReader();
    const encoder = new TextEncoder();
    
    let inputTokens = 0;
    let outputTokens = 0;
    
    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // Log usage async
          logUsage(user.id, body.model, inputTokens, outputTokens);
          controller.close();
          return;
        }
        
        // Parse SSE to count tokens
        const text = new TextDecoder().decode(value);
        // ... extract token counts from message_start/message_delta events
        
        controller.enqueue(value);
      }
    });
    
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
    });
  }
  
  // 4. Non-streaming: simpler
  const data = await anthropicResponse.json();
  logUsage(user.id, body.model, data.usage.input_tokens, data.usage.output_tokens);
  return Response.json(data);
}
```

## Token Counting from SSE

Anthropic SSE format:
```
event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":25}}}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"text":"Hello"}}

event: message_delta
data: {"type":"message_delta","usage":{"output_tokens":15}}
```

Extract `input_tokens` from `message_start`, `output_tokens` from final `message_delta`.

## Pricing Reference (Jan 2026)

| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| Claude Opus 4 | $15.00 | $75.00 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Haiku | $0.25 | $1.25 |
| Gemini Embedding | ~$0.01 | N/A |

**Cost calculation:**
```typescript
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = {
    'claude-opus-4-5': { input: 15, output: 75 },
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-3-5-haiku-latest': { input: 0.25, output: 1.25 },
  };
  const p = pricing[model] || pricing['claude-sonnet-4-20250514'];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
```

## Security Considerations

1. **Gateway token validation**: Always verify token against Turso before proxying
2. **No API key exposure**: Keys only exist in Vercel env vars
3. **Request validation**: Validate model names, prevent injection
4. **Rate limiting**: Prevent abuse even within limits
5. **Logging**: Log suspicious activity (too many 401s, unusual patterns)

## Alternative: Environment Scrubbing (Quick Fix)

If the full proxy approach takes too long for launch, here's a quick security fix:

**Scrub env vars after the gateway reads them:**

```bash
# In entrypoint.sh, after starting the gateway:

# Save keys to files with restricted permissions
echo "$ANTHROPIC_API_KEY" > /tmp/.anthropic_key
chmod 400 /tmp/.anthropic_key

# Scrub from environment (won't affect already-running processes)
unset ANTHROPIC_API_KEY
unset GEMINI_API_KEY
unset BROWSERBASE_API_KEY

# The gateway already loaded the keys, so it works
# But `env` command won't show them
# And child processes (agent exec) won't inherit them
```

**Limitations:**
- Keys still in gateway process memory (can be dumped with gdb if user has root)
- No usage tracking
- No rate limiting
- Only stops casual "run `env`" attacks

**Verdict:** Good enough for private beta, not for public launch.

## Rollout Plan

1. **Test with single user first** (Alex's test account)
2. **Monitor Vercel function performance** (cold starts, latency)
3. **Gradual migration** - Keep old direct-key flow as fallback
4. **Full rollout** - Remove API keys from Fly machines

## Open Questions

1. **Vercel function limits?** - Check timeout (default 10s, can extend)
2. **OpenClaw base URL support?** - Need to verify configuration options
3. **Fallback strategy?** - What if proxy is down?
4. **Caching?** - Any responses we can cache? (probably not for chat)

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Core Proxy | 4-6 hours |
| Usage Tracking | 2-3 hours |
| Rate Limiting | 2-3 hours |
| OpenClaw Integration | 2-4 hours |
| Gemini Proxy | 1-2 hours |
| Dashboard UI | 3-4 hours |
| Testing + Polish | 2-3 hours |
| **Total** | **16-25 hours** |

Could be done in 2-3 focused days.
