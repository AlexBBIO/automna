# Voice Calling Feature Spec

**Status:** Planning
**Target Tiers:** Mid, Pro (not Starter)

## Overview

Add voice calling capabilities to Automna agents via Twilio + Bland.ai integration.

## Architecture

```
User's OpenClaw Agent
        │
        ▼ (make_call tool)
automna.ai/api/user/call
        │
        ▼ (validate token, check limits, log)
Bland.ai API
        │
        ▼
Phone Network
```

### Inbound Flow
```
Caller → Twilio Number
             │
             ▼ (webhook)
automna.ai/api/webhooks/bland/inbound
             │
             ▼ (lookup number → user mapping)
Bland.ai handles call with user's agent config
```

## Components

### 1. Twilio Number Provisioning

**When:** During user upgrade to Mid/Pro tier (Stripe webhook)

**Process:**
1. `POST /api/webhooks/stripe` receives `customer.subscription.updated`
2. If upgrading to Mid/Pro and no number exists:
   - Call Twilio API to provision local number
   - Store in `phone_numbers` table
   - Import to Bland.ai via `/v1/inbound/insert`
   - Configure Bland inbound webhook

**Cost:** $1/mo per user (absorbed into tier pricing)

### 2. Database Schema

```sql
-- Phone numbers assigned to users
CREATE TABLE phone_numbers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  phone_number TEXT NOT NULL UNIQUE,  -- E.164 format
  twilio_sid TEXT NOT NULL,
  bland_imported BOOLEAN DEFAULT FALSE,
  created_at INTEGER DEFAULT (unixepoch()),
  
  UNIQUE(user_id)  -- one number per user
);

-- Call usage tracking
CREATE TABLE call_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  call_id TEXT NOT NULL,  -- Bland call ID
  direction TEXT NOT NULL,  -- 'inbound' | 'outbound'
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  duration_seconds INTEGER,  -- filled after call ends
  status TEXT NOT NULL,  -- 'initiated' | 'completed' | 'failed'
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER
);
```

### 3. API Endpoints

#### `POST /api/user/call`
Make an outbound call.

**Auth:** Gateway token (same as LLM proxy)

**Request:**
```json
{
  "to": "+1234567890",
  "task": "You are calling to confirm an appointment...",
  "voice_id": "optional-bland-voice-id",
  "max_duration": 300
}
```

**Response:**
```json
{
  "success": true,
  "call_id": "bland-call-uuid",
  "from": "+1987654321"
}
```

**Logic:**
1. Validate gateway token → get user_id
2. Check user has phone number provisioned
3. Check monthly minute limit not exceeded
4. Log call initiation to `call_usage`
5. Forward to Bland API with real credentials
6. Return call_id for tracking

#### `POST /api/webhooks/bland/inbound`
Handle incoming calls.

**Request:** Bland webhook payload with caller info

**Logic:**
1. Look up `to` number in `phone_numbers` → get user_id
2. Fetch user's inbound agent config from their OpenClaw
3. Return Bland response config (prompt, voice, etc.)

#### `POST /api/webhooks/bland/status`
Call status updates (completion, duration).

**Logic:**
1. Find call in `call_usage` by call_id
2. Update duration_seconds, status, completed_at

### 4. OpenClaw Tool

Add to user's agent config:

```yaml
tools:
  - name: make_call
    description: Make a phone call to a contact
    endpoint: https://automna.ai/api/user/call
    auth: gateway_token
```

### 5. Usage Limits

| Tier | Monthly Minutes | Overage |
|------|-----------------|---------|
| Starter | N/A | N/A |
| Mid | 60 min | Blocked (v1) |
| Pro | 300 min | Blocked (v1) |

**v2:** Allow overage at $0.15/min (our cost ~$0.12 + margin)

### 6. Dashboard UI

- Show assigned phone number
- Show minutes used / limit
- Call history log
- Inbound agent configuration (prompt, voice)

## Credentials Required

| Service | Credential | Storage |
|---------|-----------|---------|
| Twilio | Account SID, Auth Token | Vercel env vars |
| Bland.ai | API Key | Vercel env vars |

## Cost Analysis

**Per User (Mid tier):**
- Twilio number: $1/mo
- 60 min usage: ~$7.20/mo (at $0.12/min Build tier)
- Total: ~$8.20/mo worst case

**Per User (Pro tier):**
- Twilio number: $1/mo  
- 300 min usage: ~$36/mo (at $0.12/min)
- Total: ~$37/mo worst case

At $49/mo Mid and $99/mo Pro, margins work if users don't max out minutes.

## Implementation Order

1. [ ] Add database tables (phone_numbers, call_usage)
2. [ ] Twilio integration (provision/release numbers)
3. [ ] Bland.ai integration (import numbers, make calls)
4. [ ] `/api/user/call` endpoint
5. [ ] Bland webhooks (inbound, status)
6. [ ] Stripe webhook to auto-provision on upgrade
7. [ ] Dashboard UI for phone/usage display
8. [ ] OpenClaw tool configuration

## Open Questions

- [ ] Voice selection: Let users pick from Bland voices, or default?
- [ ] Inbound config: How do users customize their inbound agent? Dashboard UI or file in their workspace?
- [ ] Contact list: Require pre-approved contacts to prevent abuse, or allow any number?
- [ ] International: Support non-US numbers? (Higher Twilio costs)
