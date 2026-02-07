# Phone Call Post-Notification: Session Persistence Bug

## Problem

When a phone call completes, the agent is notified and the notification appears in the user's chat in real-time. However, **the message does not persist to conversation history**. If the user reloads the page, the notification is gone.

## Root Cause

The Bland webhook handler sends the call completion notification via `/hooks/agent` on the user's Fly machine **without a `sessionKey`**. OpenClaw's hook dispatcher generates a throwaway `hook:<uuid>` session key when none is provided. The agent run executes in that ephemeral session, and while `deliver: true` + `channel: "last"` pushes the message to the user's active WebSocket in real-time, the history is written to the throwaway session's JSONL file, not the user's actual conversation.

## Current Architecture

### Call Initiation Flow
1. User types "Call John" in conversation "research" on the Automna dashboard
2. Dashboard has a **direct WebSocket** to the Fly machine: `wss://<app>.fly.dev/ws?token=<token>&clientId=webchat`
3. Browser sends `chat.send` with `sessionKey: "agent:main:research"` directly to the Fly machine
4. OpenClaw runs the agent in session `agent:main:research`
5. Agent executes `curl -X POST https://automna.ai/api/user/call` with the gateway token
6. `/api/user/call` (Vercel) authenticates via gateway token, calls Bland API, stores a `callUsage` record in Turso

### Call Completion Flow
7. Call completes. Bland sends webhook to `https://automna.ai/api/webhooks/bland/status`
8. Webhook handler (`landing/src/app/api/webhooks/bland/status/route.ts`):
   - Updates `callUsage` record with transcript, summary, duration, cost
   - Attempts to write transcript file via `POST https://<app>.fly.dev/api/v1/exec` (**this fails silently** - endpoint doesn't exist on OpenClaw)
   - Sends notification via `POST https://<app>.fly.dev/hooks/agent`

### Hook Dispatch (on Fly machine)
9. OpenClaw's `createGatewayHooksRequestHandler` in `gateway/server/hooks.js` receives the POST
10. `dispatchAgentHook()` checks for `sessionKey` in payload - finds none, generates `hook:<uuid>`
11. Runs `runCronIsolatedAgentTurn()` with that throwaway session key
12. Agent response is delivered to `channel: "last"` (the user's WebSocket) - **appears in real-time**
13. History is saved to JSONL under `hook:<uuid>` session - **not in the user's conversation**

## Key Code Locations

| File | What it does |
|------|-------------|
| `landing/src/app/api/user/call/route.ts` | Initiates outbound calls via Bland API |
| `landing/src/app/api/webhooks/bland/status/route.ts` | Receives Bland completion webhook, updates DB, notifies agent |
| `landing/src/app/api/user/call/status/route.ts` | Optional polling endpoint for call status (not used in current flow) |
| `landing/src/app/api/user/gateway/route.ts` | Returns `wss://<app>.fly.dev/ws?token=...` - direct WS URL |
| `landing/src/lib/clawdbot-runtime.ts` | Dashboard WebSocket client, sends `chat.send` with sessionKey |
| `landing/src/app/api/ws/[...path]/route.ts` | HTTP-only proxy for `/ws/api/history` etc. (NOT the WebSocket) |
| `landing/src/app/dashboard/page.tsx` | Dashboard page, manages conversations, passes sessionKey to AutomnaChat |
| `docker/entrypoint.sh` (line ~506) | Configures `hooks.enabled: true` with gateway token |
| OpenClaw `dist/gateway/server/hooks.js` | `dispatchAgentHook()` - generates throwaway session if none provided |
| OpenClaw `dist/gateway/server-http.js` | Routes `/hooks/agent` POST to the dispatcher |
| OpenClaw `dist/gateway/hooks.js` | `normalizeAgentPayload()` - validates hook payload, defaults sessionKey to `hook:<uuid>` |

## Current Webhook Notification Code (the bug)

```typescript
// landing/src/app/api/webhooks/bland/status/route.ts, notifyAgent()
const agentResponse = await fetch(`${machineUrl}/hooks/agent`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${gatewayToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: `A phone call just completed...`,
    name: "PhoneCall",
    deliver: true,
    channel: "last",
    wakeMode: "now",
    // BUG: no sessionKey here!
    // OpenClaw generates hook:<uuid>, message doesn't persist to conversation
  }),
});
```

## Why This Is Hard to Fix

The WebSocket connection is **direct from browser to Fly machine**. Automna's Vercel backend never sees which conversation/session the user is in. When the call API (`/api/user/call`) is hit, it only receives the gateway token (identifies the user/machine), not the session context.

The session key is only known by:
- The **browser** (stores it in localStorage, sends it via `chat.send`)
- The **Fly machine's OpenClaw gateway** (running the agent in that session)

Neither passes it to Automna's backend.

## Secondary Issue: Transcript File Write Fails

The webhook also tries to write the transcript file to the user's machine:

```typescript
const execResponse = await fetch(`${machineUrl}/api/v1/exec`, { ... });
```

This fails silently because **`/api/v1/exec` does not exist** on the OpenClaw gateway. The handler logs a warning and continues. The transcript data is still in the Turso DB and included in the hook notification message, so the agent gets it. But no persistent `calls/*.md` file is saved on the user's volume.

## Proposed Fix: Track Active Session Key

### Approach: Frontend reports active session to backend

Since the WebSocket is direct (browser → Fly machine), the backend needs another signal. Have the dashboard frontend report which conversation is active.

**1. Add `lastSessionKey` column to `machines` table:**
```sql
ALTER TABLE machines ADD COLUMN last_session_key TEXT DEFAULT 'main';
```

**2. Create `POST /api/user/sessions/active` endpoint:**
```typescript
// Called by frontend when user switches conversations or sends a message
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  const { sessionKey } = await req.json();
  await db.update(machines)
    .set({ lastSessionKey: sessionKey })
    .where(eq(machines.userId, userId));
  return NextResponse.json({ ok: true });
}
```

**3. Update dashboard to call it:**
In `dashboard/page.tsx`, when `currentConversation` changes or a message is sent:
```typescript
// Fire-and-forget, don't block UI
fetch('/api/user/sessions/active', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionKey: currentConversation }),
}).catch(() => {}); // Silent failure is fine
```

**4. Update `/api/user/call` to capture session key:**
```typescript
// In the call initiation handler, after auth:
const sessionKey = machine.lastSessionKey || 'main';

// Store it with the call record:
await db.insert(callUsage).values({
  ...existingFields,
  sessionKey, // NEW: which conversation initiated this call
});
```

**5. Update `callUsage` schema:**
```typescript
// Add to schema:
sessionKey: text("session_key").default("main"),
```

**6. Update webhook handler to pass session key:**
```typescript
// In notifyAgent():
const canonicalSessionKey = callRecord.sessionKey 
  ? (callRecord.sessionKey.startsWith('agent:main:') 
      ? callRecord.sessionKey 
      : `agent:main:${callRecord.sessionKey}`)
  : undefined;

body: JSON.stringify({
  message: `A phone call just completed...`,
  name: "PhoneCall",
  deliver: true,
  channel: "last",
  wakeMode: "now",
  sessionKey: canonicalSessionKey, // FIX: targets the right conversation
}),
```

### Race Condition Note

There is a small race window: if the user sends "Call John" in Research, then immediately switches to General AND sends another message before the agent's curl hits `/api/user/call`, the `lastSessionKey` would be wrong. In practice this window is 2-3 seconds and requires active user action, so it's unlikely. Even if it happens, the notification just appears in the wrong conversation - not catastrophic.

For a more robust (but more complex) solution, the session key could be resolved on the Fly machine side (OpenClaw knows which session the agent is running in), but this would require OpenClaw modifications.

### Alternative Considered: `/hooks/wake`

Using `/hooks/wake` instead of `/hooks/agent` was considered. Wake injects a system event into the main session. However, this was previously tested and **did not work** (the notification didn't reach the user). The current `/hooks/agent` approach successfully delivers messages in real-time, so the fix should preserve that behavior and add session persistence on top.

## Testing Plan

1. Open dashboard, create a conversation called "test-calls"
2. Switch to "test-calls", initiate a phone call
3. Verify `lastSessionKey` is updated in Turso machines table
4. Verify `callUsage` record has `session_key = "test-calls"`
5. Wait for call to complete
6. Verify webhook sends `sessionKey: "agent:main:test-calls"` to `/hooks/agent`
7. Verify notification appears in chat AND persists after page reload
8. Edge case: initiate call in "test-calls", switch to "main", reload - notification should be in "test-calls" history

## Files to Modify

1. `landing/src/lib/db/schema.ts` - Add `lastSessionKey` to machines, `sessionKey` to callUsage
2. `landing/src/app/api/user/sessions/active/route.ts` - New endpoint (or add to existing sessions route)
3. `landing/src/app/dashboard/page.tsx` - Report active conversation to backend
4. `landing/src/app/api/user/call/route.ts` - Read lastSessionKey, store with call record
5. `landing/src/app/api/webhooks/bland/status/route.ts` - Pass sessionKey in hook payload
6. Run Drizzle migration for new columns
