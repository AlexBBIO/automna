# LLM Proxy - Implementation Guide

> **Status:** ✅ Live in Production  
> **Deployed:** 2026-02-03  
> **Endpoints:** 
> - `/api/llm/v1/messages` - Anthropic Messages API (for ANTHROPIC_BASE_URL)
> - `/api/llm/chat` - Chat endpoint (legacy)
> - `/api/llm/embed` - Gemini embeddings
> - `/api/llm/usage` - Usage stats

## Overview

The LLM Proxy sits between user agents (Clawdbot instances on Fly.io) and the Anthropic API. It provides:

1. **Centralized API key management** - Users never see or handle API keys
2. **Usage tracking** - Every request logged with token counts and costs
3. **Rate limiting** - Per-minute and monthly caps by plan tier
4. **Cost control** - Monthly spend limits prevent runaway costs

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  User's Agent   │────▶│   LLM Proxy     │────▶│  Anthropic API  │
│  (Fly Machine)  │     │  (Vercel Edge)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │ Gateway Token         │ Usage Logged
        │ (Bearer Auth)         ▼
        │               ┌─────────────────┐
        └──────────────▶│  Turso Database │
                        │  (llm_usage)    │
                        └─────────────────┘
```

## Endpoints

### POST `/api/llm/chat`

Proxies chat completions to Anthropic's Messages API.

**Authentication:**
```
Authorization: Bearer <gateway_token>
```

**Request Body:** Standard Anthropic messages format
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello!"}
  ]
}
```

**Response:** Anthropic API response (passthrough)
```json
{
  "id": "msg_01XYZ...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello! How can I help?"}],
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 12
  }
}
```

**Streaming:** Supported. Set `"stream": true` in the request body.

### POST `/api/llm/embed`

Proxies embedding requests (placeholder - Anthropic doesn't have embeddings, would route to OpenAI/Voyage).

### GET `/api/llm/usage`

Returns usage statistics for the authenticated user.

**Response:**
```json
{
  "current_month": {
    "total_tokens": 125000,
    "total_cost_cents": 45,
    "request_count": 342
  },
  "limits": {
    "monthly_tokens": 500000,
    "monthly_cost_cents": 500,
    "requests_per_minute": 20
  },
  "usage_percent": 25
}
```

## Authentication

The proxy uses **gateway tokens** for authentication - the same tokens used for Clawdbot gateway access.

### Flow:
1. Request arrives with `Authorization: Bearer <token>`
2. Proxy looks up token in `machines` table
3. If found, extracts `user_id` for usage tracking
4. If not found, returns 401

### Implementation (`_lib/auth.ts`):
```typescript
export async function authenticateGatewayToken(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.slice(7);
  
  const machine = await db.query.machines.findFirst({
    where: eq(machines.gatewayToken, token),
    columns: { userId: true, appName: true },
  });
  
  return machine ? { userId: machine.userId, appName: machine.appName } : null;
}
```

## Rate Limiting

Two levels of rate limiting protect against abuse:

### 1. Per-Minute Limits
- Prevents burst abuse
- Tracked in `llm_rate_limits` table
- Resets every minute

### 2. Monthly Limits
- Prevents cost overruns
- Calculated from `llm_usage` table
- Resets on 1st of each month

### Plan Tiers (`_lib/rate-limit.ts`):
```typescript
const PLAN_LIMITS = {
  free: {
    monthlyTokens: 100_000,        // 100K tokens
    monthlyCostCents: 100,         // $1 cap
    requestsPerMinute: 5,
    tokensPerMinute: 10_000,
  },
  starter: {
    monthlyTokens: 500_000,        // 500K tokens
    monthlyCostCents: 500,         // $5 cap
    requestsPerMinute: 20,
    tokensPerMinute: 50_000,
  },
  pro: {
    monthlyTokens: 5_000_000,      // 5M tokens
    monthlyCostCents: 5000,        // $50 cap
    requestsPerMinute: 60,
    tokensPerMinute: 200_000,
  },
};
```

### Rate Limit Response (429):
```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded: 5 requests per minute"
  }
}
```

## Usage Tracking

Every request is logged to `llm_usage` table:

### Schema:
```sql
CREATE TABLE llm_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  
  -- Request details
  provider TEXT NOT NULL,      -- 'anthropic'
  model TEXT NOT NULL,         -- 'claude-sonnet-4-20250514'
  endpoint TEXT NOT NULL,      -- 'chat'
  
  -- Token counts
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  
  -- Cost in microdollars (1 USD = 1,000,000)
  cost_microdollars INTEGER DEFAULT 0,
  
  -- Metadata
  session_key TEXT,            -- Which conversation
  request_id TEXT,             -- For debugging
  duration_ms INTEGER,         -- Latency
  error TEXT                   -- Error message if failed
);
```

### Cost Calculation (`_lib/pricing.ts`):
```typescript
const PRICING = {
  'claude-sonnet-4-20250514': {
    inputPerMillion: 3.00,   // $3/M input tokens
    outputPerMillion: 15.00, // $15/M output tokens
  },
  'claude-opus-4-20250514': {
    inputPerMillion: 15.00,
    outputPerMillion: 75.00,
  },
  // ... other models
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] ?? PRICING['claude-sonnet-4-20250514'];
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Math.round((inputCost + outputCost) * 1_000_000); // microdollars
}
```

## Streaming Support

The proxy fully supports streaming responses:

### Implementation (`_lib/stream.ts`):
```typescript
export function createTokenCountingStream(
  response: Response,
  onComplete: (tokens: { input: number; output: number }) => void
): ReadableStream {
  const reader = response.body!.getReader();
  let inputTokens = 0;
  let outputTokens = 0;
  
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      
      if (done) {
        controller.close();
        onComplete({ input: inputTokens, output: outputTokens });
        return;
      }
      
      // Parse SSE events to extract usage
      const text = new TextDecoder().decode(value);
      const usageMatch = text.match(/"usage":\s*{[^}]+}/);
      if (usageMatch) {
        const usage = JSON.parse(usageMatch[0].slice(8));
        inputTokens = usage.input_tokens ?? inputTokens;
        outputTokens = usage.output_tokens ?? outputTokens;
      }
      
      controller.enqueue(value);
    }
  });
}
```

## Error Handling

The proxy returns Anthropic-compatible error responses:

| Status | Type | Cause |
|--------|------|-------|
| 400 | `invalid_request_error` | Malformed JSON, missing fields |
| 401 | `authentication_error` | Missing/invalid gateway token |
| 429 | `rate_limit_error` | Per-minute or monthly limit hit |
| 500 | `api_error` | Upstream Anthropic error |
| 502 | `api_error` | Network error to Anthropic |

## Database Tables

### `llm_usage`
Stores every API request for billing and analytics.

### `llm_rate_limits`
Tracks per-minute request counts (sliding window).

```sql
CREATE TABLE llm_rate_limits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  current_minute INTEGER DEFAULT 0,
  requests_this_minute INTEGER DEFAULT 0,
  tokens_this_minute INTEGER DEFAULT 0,
  last_reset INTEGER NOT NULL
);
```

## Configuration

### Environment Variables (Vercel):
```
ANTHROPIC_API_KEY=sk-ant-...     # Master API key
TURSO_DATABASE_URL=libsql://...  # Database connection
TURSO_AUTH_TOKEN=...             # Database auth
```

### Fly Machine Configuration:
The Docker entrypoint sets:

```bash
export ANTHROPIC_BASE_URL="https://automna.ai/api/llm"
```

This works because the Anthropic SDK respects `ANTHROPIC_BASE_URL` environment variable.
The agent uses its gateway token as the API key, and our proxy handles authentication.

### How It Works:
1. Agent calls Anthropic SDK with `ANTHROPIC_BASE_URL=https://automna.ai/api/llm`
2. SDK sends request to `https://automna.ai/api/llm/v1/messages`
3. Our proxy authenticates via the gateway token in the `Authorization: Bearer <token>` header
4. Proxy forwards to real Anthropic API
5. Proxy logs usage to Turso database
6. Response returned to agent

## Security

The LLM proxy is designed to prevent users from bypassing rate limits or accessing the Anthropic API directly.

### Key Principles:

1. **No API keys on user machines** - `ANTHROPIC_API_KEY` is NEVER passed to Fly machines. Only the proxy (on Vercel) has the real key.

2. **Gateway token auth** - Agents authenticate to the proxy using their unique gateway token. This token is tied to their user account for usage tracking.

3. **Forced routing** - The Docker entrypoint sets `ANTHROPIC_BASE_URL` to route all LLM traffic through the proxy. Agents cannot call Anthropic directly.

4. **Rate limiting** - The proxy enforces per-minute and monthly limits based on the user's plan tier.

### What's Protected:

| Resource | Protected? | How |
|----------|------------|-----|
| Anthropic API | ✅ Yes | Key only on Vercel, traffic routed through proxy |
| Agentmail | ✅ Yes | Key only on Vercel, agents use `/api/user/email/send` |
| Browserbase | ⚠️ Partial | Key on machines for browser automation |
| Gemini | ⚠️ Partial | Key on machines for embeddings |

### Future Work:
- Proxy Browserbase through our API for full control
- Proxy Gemini embeddings for usage tracking

## Testing

### Manual Test:
```bash
# Should return 401
curl -X POST https://automna.ai/api/llm/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","messages":[{"role":"user","content":"hi"}]}'

# Should work (replace with real token)
curl -X POST https://automna.ai/api/llm/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <gateway_token>" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":50,"messages":[{"role":"user","content":"Say hi"}]}'
```

### Unit Tests:
```bash
cd /root/clawd/projects/automna/landing
npm test
```

## File Structure

```
src/app/api/llm/
├── _lib/
│   ├── auth.ts       # Gateway token authentication
│   ├── pricing.ts    # Token cost calculation
│   ├── rate-limit.ts # Rate limiting logic
│   ├── stream.ts     # Streaming response handling
│   └── usage.ts      # Usage logging to database
├── chat/
│   └── route.ts      # POST /api/llm/chat
├── embed/
│   └── route.ts      # POST /api/llm/embed (placeholder)
└── usage/
    └── route.ts      # GET /api/llm/usage
```

## Next Steps

1. **Wire up to Clawdbot** - Configure agent instances to use the proxy
2. **Dashboard UI** - Show usage stats on automna.ai dashboard
3. **Billing integration** - Charge for usage beyond free tier
4. **Add more providers** - OpenAI, Gemini support

## Troubleshooting

### "Invalid or missing gateway token"
- Check `Authorization: Bearer <token>` header format
- Verify token exists in `machines` table
- Token is the `gateway_token` column, not the machine ID

### "Rate limit exceeded"
- Wait 60 seconds for per-minute reset
- Check monthly usage at `/api/llm/usage`
- Upgrade plan for higher limits

### No usage logged
- Check Turso connection (env vars set?)
- Look for errors in Vercel function logs
- Verify `llm_usage` table exists (run `drizzle-kit push`)
