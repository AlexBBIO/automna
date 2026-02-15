# BYOK (Bring Your Own Key) Architecture

## Overview

BYOK lets users provide their own Anthropic credentials (API key or OAuth setup token) so LLM calls go directly to Anthropic instead of through the Automna proxy. This eliminates per-token costs for Automna while giving users full control.

## How BYOK Routing Works

```
User message → OpenClaw Gateway → Model resolution
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                     BYOK Mode               Legacy Mode
                          │                       │
                   model.primary =          model.primary =
                   "anthropic/..."          "automna/..."
                          │                       │
                   auth-profiles.json      automna provider
                   (user's own key)        (proxy → our key)
                          │                       │
                   api.anthropic.com       automna.ai/api/llm
```

### Key mechanism: model prefix routing

OpenClaw resolves models by matching the prefix to a provider:
- `anthropic/claude-opus-4-5` → looks for `anthropic` provider → finds credentials in `auth-profiles.json`
- `automna/claude-opus-4-5` → matches `automna` provider's model list → routes to proxy

**Critical detail:** In BYOK mode, the `automna` provider's `models` array is set to `[]` (empty). This prevents OpenClaw from matching `anthropic/` prefixed model names to the automna provider. Without this, OpenClaw would route BYOK calls through the proxy.

## Entrypoint BYOK Logic

The entrypoint (`docker/entrypoint.sh`) runs on every machine boot and generates `clawdbot.json`:

**When `BYOK_MODE=true`:**
1. Sets `model.primary` = `anthropic/claude-opus-4-5`
2. Sets `automna.models` = `[]` (empty array — provider exists but matches nothing)
3. Does NOT set `ANTHROPIC_BASE_URL` (defaults to `api.anthropic.com`)
4. The `automna` provider remains configured as a fallback for potential future proxy credit purchases

**When `BYOK_MODE=false` (legacy):**
1. Sets `model.primary` = `automna/claude-opus-4-5`
2. Sets `automna.models` with full model list (claude-opus-4-5, claude-sonnet-4)
3. Sets `ANTHROPIC_BASE_URL` = proxy URL
4. All LLM calls route through Automna proxy

## The Automna Provider Fallback Design

Even in BYOK mode, the `automna` provider block stays in config:
```json
{
  "models": {
    "providers": {
      "automna": {
        "baseUrl": "https://automna.ai/api/llm",
        "apiKey": "<gateway_token>",
        "api": "anthropic-messages",
        "models": []
      }
    }
  }
}
```

The empty `models: []` means it never auto-matches. But the provider exists so that if we later add prepaid credits or overflow routing, we can populate the models array without a full config rewrite.

## Where Credentials Live

| What | Where | Persistence |
|------|-------|-------------|
| Encrypted credential | Turso `secrets` table (AES-256-GCM, keyed by userId) | Database |
| `auth-profiles.json` | `/home/node/.openclaw/agents/main/agent/auth-profiles.json` | Fly volume (survives restarts) |
| BYOK provider choice | Clerk user `publicMetadata.byokChoice` | Clerk |
| Machine BYOK flag | Turso `machines.byokEnabled` + `machines.byokProvider` | Database |
| Gateway token | Fly machine env `OPENCLAW_GATEWAY_TOKEN` + Turso `machines` | Both |

### auth-profiles.json format

```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "api_key",          // or "token" for setup tokens
      "provider": "anthropic",
      "key": "sk-ant-api..."      // or "token": "sk-ant-oat..." for setup tokens
    }
  },
  "order": { "anthropic": ["anthropic:default"] },
  "lastGood": { "anthropic": "anthropic:default" }
}
```

## Full BYOK Flow

### User setup flow:
```
1. User enters credential on dashboard (/setup/connect)
      │
2. POST /api/user/byok
      │
3. Detect type: sk-ant-oat (setup token) or sk-ant-api (API key)
      │
4. Validate credential
   - API keys: test call to Anthropic /v1/messages (claude-3-haiku)
   - Setup tokens: format validation only (can't call API directly)
      │
5. Encrypt & store in Turso secrets table
      │
6. Update Clerk metadata (byokChoice) + machines table (byokProvider, byokEnabled)
      │
7. Ensure machine is in BYOK mode (ensureMachineByokMode):
   - GET full machine config from Fly API
   - Set BYOK_MODE=true env var
   - Remove ANTHROPIC_BASE_URL env var
   - Clear init.cmd (so entrypoint regenerates config)
   - Update image to :latest
   - POST full config back → triggers restart
   - Wait up to 90s for machine to reach "started" state
      │
8. Push auth-profiles.json to machine (pushCredentialToMachine):
   - Base64-encode the auth-profiles.json
   - Fly exec: decode and write to volume path
   - Signal gateway restart (kill -USR1)
      │
9. Return success to dashboard
```

### On machine restart:
```
1. Entrypoint runs
2. Checks BYOK_MODE env var
3. Generates clawdbot.json:
   - model.primary = anthropic/claude-opus-4-5
   - automna.models = []
   - hooks.token from OPENCLAW_GATEWAY_TOKEN
4. Does NOT set ANTHROPIC_BASE_URL
5. Gateway starts, reads clawdbot.json + auth-profiles.json
6. LLM calls go directly to api.anthropic.com with user's key
```

### Credential removal (DELETE /api/user/byok):
```
1. Delete secret from Turso
2. Set Clerk byokChoice = "proxy"
3. Set machines.byokProvider = "proxy", byokEnabled = 0
4. Revert machine:
   - Remove BYOK_MODE env
   - Set ANTHROPIC_BASE_URL back to proxy
   - Delete auth-profiles.json from volume
   - Update image + restart
5. Machine restarts in legacy mode
```
