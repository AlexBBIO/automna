# R2 Storage Specification

**Version:** 1.0  
**Date:** 2026-01-29  
**Status:** Draft

---

## Overview

Real-time persistent storage for user data using Cloudflare R2. Each user gets isolated storage that syncs immediately on every change.

## Data Structure

```
moltbot-data/                          # R2 bucket
└── users/
    └── {userId}/                      # Clerk user ID
        ├── config/
        │   └── clawdbot.json          # Gateway configuration
        ├── sessions/
        │   ├── main/
        │   │   ├── messages.jsonl     # Chat history (append-only)
        │   │   └── metadata.json      # Session metadata
        │   └── {sessionKey}/          # Additional sessions
        │       ├── messages.jsonl
        │       └── metadata.json
        ├── workspace/                 # User files, projects
        │   └── ...
        ├── skills/                    # Custom skills
        │   └── ...
        └── meta.json                  # User metadata
```

### meta.json
```json
{
  "userId": "user_abc123",
  "createdAt": "2026-01-29T00:00:00Z",
  "subscriptionStatus": "active",
  "subscriptionEndedAt": null,
  "retentionExpiresAt": null,
  "lastActiveAt": "2026-01-29T23:00:00Z",
  "storageUsedBytes": 12345678
}
```

### messages.jsonl (append-only)
```jsonl
{"id":"msg_1","role":"user","content":"Hello","timestamp":1706572800000}
{"id":"msg_2","role":"assistant","content":"Hi there!","timestamp":1706572801000}
```

---

## Sync Strategy

### Real-Time Sync (Write-Through)

Every state change syncs immediately to R2:

| Event | Action |
|-------|--------|
| User sends message | Append to messages.jsonl |
| Assistant responds | Append to messages.jsonl |
| Config changes | Write clawdbot.json |
| File created/modified | Write to workspace/ |
| Skill installed | Write to skills/ |

### Implementation

**Option A: Direct R2 API (Recommended)**
```typescript
// In the worker, after receiving a chat message
await env.MOLTBOT_BUCKET.put(
  `users/${userId}/sessions/${sessionKey}/messages.jsonl`,
  existingData + newMessage + '\n',
  { httpMetadata: { contentType: 'application/jsonl' } }
);
```

**Option B: Container → Worker → R2**
- Container emits events via WebSocket
- Worker intercepts and writes to R2
- More complex but keeps container stateless

**Option C: Container Direct to R2 (Current)**
- Container has R2 mounted via s3fs
- Periodic rsync (current: every 5 min)
- **Problem:** Not real-time, data loss on crash

### Recommended: Hybrid Approach

1. **Messages:** Worker intercepts WebSocket, writes directly to R2 (real-time)
2. **Config:** Sync on change + periodic backup
3. **Workspace:** Sync on file save + periodic backup
4. **Skills:** Sync on install/update

---

## Retention Policy

### Active Subscription
- All data retained indefinitely
- No automatic pruning

### Cancelled/Expired Subscription
- Data retained for **90 days** after subscription ends
- `retentionExpiresAt` set to endDate + 90 days
- After 90 days: data eligible for deletion

### Deletion Process
```
1. Subscription ends → set subscriptionEndedAt, retentionExpiresAt
2. Daily cron job checks retentionExpiresAt
3. If expired: move to deleted/ prefix (soft delete)
4. After 30 more days: permanent deletion
```

### Soft Delete Structure
```
moltbot-data/
└── deleted/
    └── {userId}/
        └── {deletionTimestamp}/
            └── ... (full user data)
```

---

## Container Startup Flow

```
1. Container starts
2. Check R2 for user data at users/{userId}/
3. If exists:
   - Download config/clawdbot.json → /root/.clawdbot/
   - Download skills/ → /root/clawd/skills/
   - (Messages loaded on-demand, not at startup)
4. If not exists:
   - Create from template
   - Initialize meta.json
5. Start gateway
```

---

## Message History Loading

Messages loaded on-demand when chat.history is requested:

```typescript
// Worker handles chat.history request
const messagesKey = `users/${userId}/sessions/${sessionKey}/messages.jsonl`;
const data = await env.MOLTBOT_BUCKET.get(messagesKey);
if (data) {
  const messages = data.text().split('\n').filter(Boolean).map(JSON.parse);
  return messages.slice(-100); // Last 100 messages
}
return [];
```

---

## Storage Limits (Future)

For MVP: No limits.

Future tiers:
| Tier | Storage | Message History |
|------|---------|-----------------|
| Starter | 1 GB | 30 days |
| Pro | 10 GB | Unlimited |
| Business | 100 GB | Unlimited |

---

## Implementation

### MVP (Current)

**Workspace sync:** 30-second rsync loop
```bash
while true; do
  rsync -a /root/clawd/ /data/moltbot/workspace/ 2>/dev/null
  rsync -a /root/.clawdbot/ /data/moltbot/config/ 2>/dev/null
  sleep 30
done &
```

**Tradeoffs:**
- Simple and reliable
- May lose up to 30 seconds of work on crash
- Good enough for MVP

**What this gives us:**
- [x] Workspace persists across container restarts
- [x] Config persists across container restarts
- [x] Dashboard can read files from R2
- [x] No clawdbot code changes required

### Future Improvements

**Phase 1: Debounced sync**
- Watch filesystem with inotify
- Sync 2 seconds after last change (debounced)
- Reduces data loss window to ~2 seconds

**Phase 2: Real-time message sync**
- Worker intercepts WebSocket messages
- Writes directly to R2 (bypasses container)
- Zero message loss on crash

**Phase 3: Bidirectional sync**
- Dashboard can upload files to R2
- Container picks up new files
- Conflict resolution (last-write-wins or merge)

**Phase 4: Retention enforcement**
- Track subscription status in meta.json
- Daily cron for retention checks
- Soft delete expired data (90 days after cancel)
- Permanent deletion after 30-day grace period

---

## API Endpoints (Worker)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/history` | GET | Get message history for session |
| `/api/storage/usage` | GET | Get storage usage for user |
| `/api/storage/export` | GET | Export all data (future) |

---

## Security

- R2 access via worker only (no direct user access)
- userId validated via signed URL before any R2 operation
- No cross-user data access possible
- Encryption at rest (R2 default)
