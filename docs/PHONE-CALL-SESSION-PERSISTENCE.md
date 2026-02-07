# Session Persistence & Routing Fix

> **Last updated:** 2026-02-07  
> **Status:** Fully implemented and deployed ✅

## Problem

Two related issues with Automna's webchat session model:

### 1. Webhook notifications don't persist to conversation history
When a phone call completes, the Bland webhook sends a notification via `/hooks/agent` on the user's Fly machine **without a `sessionKey`**. OpenClaw generates a throwaway `hook:<uuid>` session key. The agent runs in that ephemeral session. While `deliver: true` + `channel: "last"` pushes the message to the user's active WebSocket in real-time, the history is written to the throwaway session's JSONL file, not the user's actual conversation. Page reload = message gone.

### 2. Streaming cross-talk when switching conversations
The dashboard uses a single WebSocket connection that multiplexes all conversations. Agent events (`event agent`, `event chat`) carry a `runId` but the frontend doesn't filter by session. If the user sends a message in conversation A, switches to conversation B, and conversation A's response arrives, it renders in conversation B's view.

### Why OpenClaw handles this natively for Discord/Telegram but not webchat
OpenClaw's channel plugins (Discord, Telegram, etc.) provide natural session isolation: each Discord channel maps to a unique session key, and the plugin routes responses back to the originating channel. Automna's webchat is the `INTERNAL_MESSAGE_CHANNEL` and is **not** in the deliverable channels list. Session multiplexing happens in the frontend, not at OpenClaw's level.

### Secondary issue: Transcript file write silently fails
The webhook calls `/api/v1/exec` to write transcript files to the user's machine. This endpoint doesn't exist on OpenClaw. Fails silently every time.

## Root Cause Analysis

### Current Architecture

**Call Initiation Flow:**
1. User types "Call John" in conversation "research" on the Automna dashboard
2. Dashboard has a direct WebSocket to the Fly machine: `wss://<app>.fly.dev/ws?token=<token>&clientId=webchat`
3. Browser sends `chat.send` with `sessionKey: "agent:main:research"` directly to the Fly machine
4. OpenClaw runs the agent in session `agent:main:research`
5. Agent executes `curl -X POST https://automna.ai/api/user/call` with the gateway token
6. `/api/user/call` (Vercel) authenticates via gateway token, calls Bland API, stores a `callUsage` record in Turso

**Call Completion Flow (the bug):**
7. Call completes. Bland sends webhook to `https://automna.ai/api/webhooks/bland/status`
8. Webhook handler updates `callUsage` record with transcript, summary, duration, cost
9. Webhook sends notification via `POST https://<app>.fly.dev/hooks/agent` **without sessionKey**
10. OpenClaw's `normalizeAgentPayload()` generates `hook:<uuid>` as the session key
11. `dispatchAgentHook()` passes this to `runCronIsolatedAgentTurn()`
12. `runCronIsolatedAgentTurn()` calls `buildAgentMainSessionKey({ mainKey: "hook:<uuid>" })` → `agent:main:hook:<uuid>`
13. Agent runs in throwaway session, response delivered via WebSocket (appears in real-time)
14. History saved to `agent:main:hook:<uuid>` JSONL (wrong place)

### Key Code Locations

| File | What it does |
|------|-------------|
| `landing/src/app/api/user/call/route.ts` | Initiates outbound calls via Bland API |
| `landing/src/app/api/webhooks/bland/status/route.ts` | Receives Bland completion webhook, updates DB, notifies agent |
| `landing/src/lib/clawdbot-runtime.ts` | Dashboard WebSocket client, streaming, history loading |
| `landing/src/app/dashboard/page.tsx` | Dashboard page, manages conversations and session state |
| `landing/src/lib/db/schema.ts` | Database schema (Drizzle ORM) |
| OpenClaw `dist/gateway/hooks.js` | `normalizeAgentPayload()` - generates throwaway session if none provided |
| OpenClaw `dist/gateway/server/hooks.js` | `dispatchAgentHook()` - runs isolated agent turn |
| OpenClaw `dist/cron/isolated-agent/run.js` | `runCronIsolatedAgentTurn()` - wraps sessionKey via `buildAgentMainSessionKey()` |
| OpenClaw `dist/routing/session-key.js` | `buildAgentMainSessionKey()` - prefixes `agent:{agentId}:` to mainKey |

### ⚠️ Critical: Session Key Format

OpenClaw's `buildAgentMainSessionKey()` always prefixes the provided key:
```
buildAgentMainSessionKey({ agentId: "main", mainKey: "research" })
→ "agent:main:research"
```

**The webhook must pass just the bare key (e.g., `"research"`), NOT the full canonical key (e.g., `"agent:main:research"`).** Passing the full key would result in double-prefixing: `agent:main:agent:main:research`.

## Solution

Two complementary pieces that together fix all session routing issues.

### Piece 1: Frontend Session-Aware Event Routing

**Goal:** Prevent streaming responses from one conversation appearing in another.

**Implementation in `clawdbot-runtime.ts`:**

1. Add a `Map<string, string>` ref: `runIdSessionMap` (maps `runId → sessionKey`)
2. On `chat.send` acknowledgment (which returns `runId`): store `runId → currentSessionKey` in the map
3. On incoming `event agent` / `event chat`:
   - Extract `runId` from the event payload
   - If `runId` exists in `runIdSessionMap`:
     - If it matches the current session → render normally
     - If it doesn't match → silently ignore (history is saved correctly on the backend)
   - If `runId` is NOT in the map (e.g., from a webhook-triggered hook): render normally (best-effort delivery to current view)
4. On conversation switch: clear streaming state (already happens via `useEffect` cleanup on `sessionKey` change)

**Multi-tab safety:** Each browser tab runs its own instance of `clawdbot-runtime.ts` with its own `runIdSessionMap`. No shared state, no cross-tab interference.

**Edge case - unknown `runId`:** Webhook-triggered agent runs produce events with a `runId` the frontend never saw via `chat.send`. These render in the currently-viewed conversation (same as today). History is correct because Piece 2 ensures the webhook targets the right session. This is acceptable behavior, and a future enhancement could add a notification badge ("New message in Research") instead of rendering in the wrong conversation.

### Piece 2: Backend Active Session Tracking

**Goal:** Give webhooks/notifications a way to route to the correct conversation.

#### 2a. Track active session on the machines table

Add `lastSessionKey TEXT DEFAULT 'main'` to the `machines` table.

**New endpoint:** `POST /api/user/sessions/active`
```typescript
// Called by dashboard when user switches conversations or sends a message
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  const { sessionKey } = await req.json();
  await db.update(machines)
    .set({ lastSessionKey: sessionKey, lastActiveAt: new Date() })
    .where(eq(machines.userId, userId));
  return NextResponse.json({ ok: true });
}
```

**Dashboard calls it** (fire-and-forget) in two places:
1. When `currentConversation` changes (conversation switch)
2. When a message is sent (confirms active conversation)

#### 2b. Capture session key at call initiation time

Add `sessionKey TEXT` to the `callUsage` table.

In `/api/user/call/route.ts`, when a call is initiated:
```typescript
const sessionKey = machine.lastSessionKey || 'main';

await db.insert(callUsage).values({
  ...existingFields,
  sessionKey, // Locked at initiation time
});
```

**Why initiation time, not webhook time:** Makes the fix multi-tab safe. If the user has multiple tabs viewing different conversations, `lastSessionKey` gets overwritten by whichever tab reports last. By capturing the session at call initiation, we lock it before the call even starts. The webhook fires minutes later and reads from `callUsage.sessionKey`, not from `machines.lastSessionKey`.

**Inbound calls** (no user action): Route to `machines.lastSessionKey` as best-effort. There's no "source conversation" for inbound calls, so most-recently-active is the reasonable default.

#### 2c. Update webhook to pass session key

In `notifyAgent()` within `/api/webhooks/bland/status/route.ts`:
```typescript
body: JSON.stringify({
  message: `A phone call just completed...`,
  name: "PhoneCall",
  deliver: true,
  channel: "last",
  wakeMode: "now",
  sessionKey: callRecord.sessionKey || machine.lastSessionKey || 'main',
  // ⚠️ Pass bare key only! OpenClaw's buildAgentMainSessionKey adds the agent:main: prefix.
}),
```

#### 2d. Remove broken transcript file write

Remove the `writeTranscriptToMachine()` function and its `/api/v1/exec` call. The transcript data is already:
- Stored in Turso (`callUsage.transcript`)
- Included in the hook notification message to the agent
- The agent can save it to a file if needed

No more silent failures.

## Database Migration

```sql
-- Add active session tracking to machines
ALTER TABLE machines ADD COLUMN last_session_key TEXT DEFAULT 'main';

-- Add session context to call records
ALTER TABLE call_usage ADD COLUMN session_key TEXT;
```

Both are `ALTER TABLE ADD COLUMN` with defaults or nullable. In SQLite/Turso:
- Instant execution, no table rewrite
- No downtime
- Existing rows get `'main'` or `NULL`
- Backward compatible

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `landing/src/lib/clawdbot-runtime.ts` | Add `runIdSessionMap` ref, filter events by current session |
| 2 | `landing/src/lib/db/schema.ts` | Add `lastSessionKey` to machines, `sessionKey` to callUsage |
| 3 | `landing/src/app/dashboard/page.tsx` | Report active conversation on switch and message send |
| 4 | `landing/src/app/api/user/sessions/active/route.ts` | New endpoint (simple DB update) |
| 5 | `landing/src/app/api/user/call/route.ts` | Read `lastSessionKey`, store with call record |
| 6 | `landing/src/app/api/webhooks/bland/status/route.ts` | Pass `sessionKey` in hook payload, remove broken `writeTranscriptToMachine()` |
| 7 | Drizzle migration | Two new columns |

## What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Phone call notification | Appears in real-time, gone on reload | Persists in the correct conversation |
| Switch conversations mid-response | Response bleeds into wrong conversation | Silently ignored, appears in correct conversation's history |
| Inbound call notification | Goes to throwaway session | Routes to most recently active conversation |
| Future webhooks (email, integrations) | Would have same persistence bug | Automatically routed via `lastSessionKey` |
| Transcript file write | Fails silently every time | Removed (data in Turso + hook message) |
| User offline when call completes | Notification lost | Persists in correct session, shows on next load |
| Multiple browser tabs | N/A | Safe: session locked at initiation for outbound calls |

## Testing Plan

### Phase 1: Frontend streaming isolation
1. Open dashboard, create conversations "alpha" and "beta"
2. Send a message in "alpha" that will take a few seconds to respond
3. Immediately switch to "beta"
4. Verify: no streaming text appears in "beta"
5. Switch back to "alpha" - verify response is in history

### Phase 2: Phone call persistence
1. Open dashboard in conversation "test-calls"
2. Verify `lastSessionKey` is updated in Turso machines table
3. Initiate a phone call
4. Verify `callUsage` record has correct `session_key`
5. Wait for call to complete
6. Verify notification appears in chat
7. Reload page - verify notification persists in "test-calls"

### Phase 3: Multi-tab safety
1. Open Tab A viewing "research", Tab B viewing "general"
2. In Tab A, initiate a phone call
3. In Tab B, switch to a different conversation
4. Wait for call to complete
5. Verify notification appears in "research" history (not wherever Tab B ended up)

### Phase 4: Inbound call routing
1. Note current `lastSessionKey` in Turso
2. Trigger an inbound call
3. Verify notification routes to the `lastSessionKey` conversation

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Session key double-prefixing | Eliminated | High | Pass bare key, not canonical key. Verified in code. |
| `lastSessionKey` stale for inbound calls | Low | Low | Best-effort routing is acceptable for events with no source conversation |
| Frontend filters out wanted events | Low | Medium | Unknown `runId`s (from hooks) render normally, only known mismatches are filtered |
| Migration breaks existing data | None | N/A | Additive columns only, no data modification |
| Multiple tabs overwrite `lastSessionKey` | Expected | Low | Outbound calls lock session at initiation; inbound uses most-recent (correct behavior) |

---

## Implementation Status (2026-02-07)

All pieces are **fully implemented and deployed to production**.

### What was built:

#### Backend (Vercel + Turso)

1. **`lastSessionKey` column on `machines` table** — tracks user's most recently active conversation
2. **`sessionKey` column on `callUsage` table** — locks session at call initiation time (multi-tab safe)
3. **`POST /api/user/sessions/active`** — dashboard reports active session on switch/message send
4. **`/api/user/call/route.ts`** — captures `lastSessionKey` into `callUsage.sessionKey` at initiation
5. **`/api/webhooks/bland/status/route.ts`** — passes `sessionKey` to `/hooks/agent` so OpenClaw routes the notification to the correct session. Uses `callUsage.sessionKey` for outbound, `machine.lastSessionKey` for inbound. Bare key format (OpenClaw adds `agent:main:` prefix internally).
6. **Removed broken `writeTranscriptToMachine()`** — was calling non-existent `/api/v1/exec`. Transcript data is in Turso + included in the hook notification message.

#### Frontend (`clawdbot-runtime.ts`)

1. **`runIdSessionMap`** (module-level `Map<string, string>`) — maps `runId → sessionKey` for cross-talk prevention. Module-level so it survives component remounts when switching conversations.
2. **`isEventForDifferentSession()`** — checks both `runIdSessionMap` AND the event's `payload.sessionKey` field. This is the critical fix: webhook-triggered runs have unknown `runId`s but DO carry a `sessionKey` in the payload. Without checking `sessionKey`, those events leaked into whichever chat was active.
3. **Session-aware filtering in `handleChatEvent()` and `handleAgentEvent()`** — extracts `payload.sessionKey`, passes to `isEventForDifferentSession()`. Events for different sessions are silently dropped (with unread badge).
4. **Unread tracking** — when events are filtered for a different session, `markSessionUnread()` adds a badge so the user knows there's a new message in another conversation.
5. **Post-final re-fetch scoped to current session** — after a `final` event, re-fetches history for `currentSessionRef.current` to get complete content (images, MEDIA paths).

### Bug fix: "Ghost message" (2026-02-07 late)

**Symptom:** Post-call summary appeared in wrong chat, then disappeared when switching away.

**Root cause:** `isEventForDifferentSession()` only checked the `runIdSessionMap`. Webhook-triggered runs (`/hooks/agent`) produce events with `runId`s that were never registered via `handleSendAck` (because the run wasn't initiated from the UI). The function returned `false` for unknown `runId`s, letting the event render in whatever chat was active. Then the post-final history re-fetch pulled data for the CURRENT session (wrong one), which didn't contain that message, so it vanished.

**Fix:** Updated `isEventForDifferentSession()` to accept an optional `eventSessionKey` parameter. `handleChatEvent()` and `handleAgentEvent()` now extract `payload.sessionKey` from the event and pass it. When present, the `eventSessionKey` is the source of truth for routing. Falls back to `runIdSessionMap` for events without a `sessionKey` field (legacy compatibility).

**Commit:** `1a9b54b` — "fix: use event sessionKey for cross-talk filtering"

### Deployment log:
- Database migrations: applied (additive columns, no downtime)
- Docker image: rebuilt and pushed (`registry.fly.io/automna-openclaw-image:latest`)
- Test user machine: updated (`automna-u-1llgzf6t2spw`)
- Vercel: deployed to production (`automna.ai`)

### What's verified working:
- ✅ Outbound calls route notification to correct conversation
- ✅ Notification persists after page reload
- ✅ Streaming cross-talk prevented when switching conversations
- ✅ Session key locked at call initiation (multi-tab safe)
- ✅ Agent polls for call completion and reports transcript
- ✅ Webhook-triggered events don't leak into wrong chat
