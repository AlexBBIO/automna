# Automna Email System

## Overview

Automna provides each user with a dedicated email address for their AI agent. Emails are powered by Agentmail with a custom domain and rate-limited through our proxy API.

## Architecture

```
User's Agent
    │
    │ POST /api/user/email/send
    │ Authorization: Bearer <gateway_token>
    │
    ▼
automna-proxy.fly.dev (Fly.io)
    │
    │ 1. Authenticate via gateway token
    │ 2. Check rate limit (50/day)
    │ 3. Forward to Agentmail if allowed
    │
    ▼
Agentmail API
    │
    ▼
Recipient's Email
```

## Components

### 1. Email Addresses

- **Format:** `{friendly_name}@mail.automna.ai`
- **Examples:** `swiftfox@mail.automna.ai`, `calmriver@mail.automna.ai`
- **Generation:** Two random words (adjective + noun) from curated lists
  - 60 adjectives × 60 nouns = 3,600 combinations
  - Collision retry: if name taken, try new combination (up to 5 attempts)

**Word Lists (in provision/route.ts):**
- Adjectives: happy, swift, clever, bright, cosmic, stellar, mystic, golden, etc.
- Nouns: fox, owl, wolf, moon, star, river, flame, dream, echo, etc.

### 2. DNS Configuration

**Domain:** `mail.automna.ai` (subdomain of automna.ai)

**DNS Records (in Cloudflare):**
- MX: Points to Agentmail's inbound servers (AWS SES)
- TXT: SPF record for email authentication
- TXT: DKIM record for email signing
- TXT: DMARC record for policy

**Why subdomain?**
- Main domain `automna.ai` uses Google Workspace
- Subdomain `mail.automna.ai` dedicated to Agentmail
- Each can have separate MX records

### 3. Rate Limiting

**Limit:** 50 emails per user per day

**Enforcement:**
- Agents do NOT have direct Agentmail API key
- All sends go through `/api/user/email/send`
- API checks `email_sends` table before forwarding
- Resets at midnight UTC

**Database Table:**
```sql
CREATE TABLE email_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,  -- Unix timestamp
  recipient TEXT,
  subject TEXT
);

CREATE INDEX idx_email_sends_user_date ON email_sends(user_id, sent_at);
```

**Rate Limit Response (429):**
```json
{
  "error": "Daily email limit reached",
  "limit": 50,
  "sent": 50,
  "resetsAt": "2026-02-04T00:00:00.000Z"
}
```

### 4. API Endpoints

#### POST /api/user/email/send

Send an email through the rate-limited proxy.

**Authentication:** Gateway token in Authorization header
```
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
```

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Hello",
  "text": "Plain text body",
  "html": "<p>HTML body</p>",
  "cc": "cc@example.com",
  "bcc": "bcc@example.com"
}
```

**Successful Response:**
```json
{
  "success": true,
  "messageId": "msg_abc123",
  "remaining": 49
}
```

#### GET /api/user/email/send

Check remaining email quota.

**Response:**
```json
{
  "limit": 50,
  "sent": 5,
  "remaining": 45,
  "resetsAt": "2026-02-04T00:00:00.000Z"
}
```

### 5. User Machine Environment

Agents receive these environment variables:

| Variable | Value | Purpose |
|----------|-------|---------|
| `AGENTMAIL_INBOX_ID` | `swiftfox@mail.automna.ai` | Their email address |
| `OPENCLAW_GATEWAY_TOKEN` | `uuid` | Auth for email API |

**NOT provided:** `AGENTMAIL_API_KEY` (prevents bypassing rate limits)

### 6. Agent Instructions

Located in workspace at `AGENTMAIL.md`:

```python
import os
import requests

GATEWAY_TOKEN = os.environ["OPENCLAW_GATEWAY_TOKEN"]
API_BASE = "https://automna-proxy.fly.dev/api/user/email"

# Send email
response = requests.post(
    f"{API_BASE}/send",
    headers={
        "Authorization": f"Bearer {GATEWAY_TOKEN}",
        "Content-Type": "application/json"
    },
    json={
        "to": "recipient@example.com",
        "subject": "Hello",
        "text": "Email body"
    }
)

# Check quota
response = requests.get(
    f"{API_BASE}/send",
    headers={"Authorization": f"Bearer {GATEWAY_TOKEN}"}
)
```

## Provisioning Flow

When a new user is provisioned:

1. **Generate friendly username:** `generateFriendlyUsername()` → `swiftfox`
2. **Create Agentmail inbox:** POST to Agentmail API with custom domain
3. **Store in database:** `machines.agentmail_inbox_id = 'swiftfox@mail.automna.ai'`
4. **Pass to machine:** Only `AGENTMAIL_INBOX_ID` env var (no API key)

## Database Schema

**machines table additions:**
```sql
agentmail_inbox_id TEXT  -- e.g., 'swiftfox@mail.automna.ai'
```

## Agentmail Configuration

**Account:** Automna's Agentmail account
**API Key:** Stored in Vercel as `AGENTMAIL_API_KEY` (same key as in `config/agentmail.json`)
**Domain:** `mail.automna.ai` (verified in Agentmail dashboard)
**Plan:** Starter (3,000 emails/month, 3 inboxes)

**API Notes:**
- Send endpoint: `POST /v0/inboxes/{inbox_id}/messages/send`
- `to`, `cc`, `bcc` are plain strings (comma-separated for multiple)
- Response includes `message_id` and `thread_id`

**Note:** Plan limits provide a secondary backstop beyond per-user limits.

## Settings UI

Users can view their email address at `/dashboard/settings`:

- Shows email address with copy button
- Under "Agent Info" section
- Fetched from `/api/user/gateway` response

## Security Considerations

1. **No direct API access:** Users can't bypass rate limits
2. **Gateway token auth:** Ties requests to specific user
3. **Daily limits:** Prevents spam/abuse
4. **Deliverability protection:** Rate limits protect domain reputation

## Future Enhancements

1. **Inbox reading:** Add `/api/user/email/inbox` endpoint for reading received emails
2. **Configurable limits:** Per-user limit overrides
3. **Usage dashboard:** Show email stats in settings
4. **Webhooks:** Real-time notifications for incoming emails

## Troubleshooting

**"Daily email limit reached"**
- Wait until midnight UTC for reset
- Or request limit increase

**"Email not configured"**
- User's machine doesn't have `agentmail_inbox_id`
- May need to re-provision

**"Unauthorized"**
- Invalid or missing gateway token
- Check `OPENCLAW_GATEWAY_TOKEN` env var
