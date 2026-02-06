# Automna Chat Streaming Spec

> Last updated: 2026-02-05
> Status: Draft, pending implementation

## Overview

The webchat has issues with message streaming: choppy updates, missing content, hanging messages, and garbled text from a botched fix attempt. This spec documents how OpenClaw's WebSocket protocol actually works (verified against source code), identifies every problem in our current implementation, and provides a complete plan to fix it.

---

## Part 1: How OpenClaw Actually Works

### Source of Truth

All findings verified against the OpenClaw gateway source:
- `/usr/lib/node_modules/clawdbot/dist/gateway/server-chat.js` - Event broadcasting
- `/usr/lib/node_modules/clawdbot/dist/gateway/server-methods/chat.js` - chat.send, chat.history, chat.abort
- `/usr/lib/node_modules/clawdbot/dist/gateway/chat-sanitize.js` - Message sanitization
- `/usr/lib/node_modules/clawdbot/dist/gateway/session-utils.fs.js` - Reading session transcripts
- `/usr/lib/node_modules/clawdbot/dist/agents/pi-embedded-subscribe.handlers.tools.js` - Tool events

### 1.1 The Full Message Lifecycle

When a user sends a message via `chat.send`:

```
User sends chat.send
    │
    ▼
Gateway responds: { runId, status: "started" }    ← ACK
    │
    ▼
Agent starts processing...
    │
    ├── event agent  stream:"lifecycle"  phase:"start"
    │
    ├── event agent  stream:"tool"  phase:"start"  name:"read"    ← (if verbose on)
    ├── event agent  stream:"tool"  phase:"update"                ← (if verbose on)
    ├── event agent  stream:"tool"  phase:"end"                   ← (if verbose on)
    │
    ├── event agent  stream:"assistant"  data.text:"H"   delta:"H"
    ├── event agent  stream:"assistant"  data.text:"He"  delta:"e"
    ├── event agent  stream:"assistant"  data.text:"Hel" delta:"l"
    │       │
    │       └── event chat  state:"delta"  message.content[0].text:"Hel"  ← THROTTLED (150ms)
    │
    ├── event agent  stream:"assistant"  data.text:"Hello" delta:"lo"
    │
    ├── event agent  stream:"lifecycle"  phase:"end"
    │
    └── event chat  state:"final"  message.content[0].text:"Hello"
```

### 1.2 Event Types

#### `event agent` - Raw Agent Stream (Real-time)

Fired for every piece of agent activity. Three stream types:

| stream | data shape | when | notes |
|--------|-----------|------|-------|
| `"lifecycle"` | `{ phase: "start"\|"end"\|"error", startedAt/endedAt, error? }` | Run start/end | Always sent |
| `"assistant"` | `{ text: "accumulated", delta: "incremental" }` | Every token | `text` = full text so far, `delta` = just the new part |
| `"tool"` | `{ phase: "start"\|"update"\|"end", name, toolCallId, args?, partialResult? }` | Tool execution | **Only sent when verbose mode is on** for the session |

Full payload shape:
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "uuid",
    "stream": "lifecycle" | "assistant" | "tool",
    "data": { ... },
    "sessionKey": "agent:main:session-name",
    "seq": 1,
    "ts": 1770270062919
  }
}
```

#### `event chat` - Throttled Chat Events

**The `emitChatDelta` function throttles to max once per 150ms:**

```javascript
// From server-chat.js
const emitChatDelta = (sessionKey, clientRunId, seq, text) => {
    chatRunState.buffers.set(clientRunId, text);
    const now = Date.now();
    const last = chatRunState.deltaSentAt.get(clientRunId) ?? 0;
    if (now - last < 150) return;  // ← THROTTLE: skip if <150ms since last
    chatRunState.deltaSentAt.set(clientRunId, now);
    // ... broadcast
};
```

So `event chat` with `state: "delta"` fires at most ~6.7 times/second, while `event agent stream:"assistant"` fires for every single token.

The `emitChatFinal` function sends the final event with buffered text:
```javascript
const emitChatFinal = (sessionKey, clientRunId, seq, jobState, error) => {
    const text = chatRunState.buffers.get(clientRunId)?.trim() ?? "";
    // ... sends event chat with state:"final" and the full buffered text
};
```

**Important:** The final event text comes from `chatRunState.buffers`, which is set by `emitChatDelta`. This buffer contains the last `data.text` seen from `event agent stream:"assistant"`. The final event's text should match the last assistant stream text.

#### Other Events (we can ignore)

| event | purpose | action needed |
|-------|---------|--------------|
| `connect.challenge` | Auth challenge | Send connect params |
| `health` | Gateway health broadcast | Ignore |
| `presence` | User presence | Ignore |
| `tick` | Keepalive | Ignore |

### 1.3 Chat History Format

`chat.history` returns messages read from JSONL transcript files. Each message has:

```json
{
  "role": "user" | "assistant",
  "content": [
    { "type": "text", "text": "message text" },
    { "type": "image", "data": "base64...", "media_type": "image/jpeg" },
    { "type": "tool_use", "id": "...", "name": "...", "input": {...} },
    { "type": "tool_result", "tool_use_id": "...", "content": [...] }
  ],
  "timestamp": 1770270062919,
  "stopReason": "end_turn" | "injected" | ...,
  "usage": { "input": 0, "output": 0, "totalTokens": 0 }
}
```

**Sanitization:** User messages get `stripEnvelopeFromMessages()` applied, which removes internal metadata like `[message_id: ...]` hints. Assistant messages are returned as-is.

**Image handling:** Images appear as `type: "image"` content parts with base64 data. They may also appear as `MEDIA:/path` text within `type: "text"` parts. Both need to be handled.

### 1.4 Non-Agent Runs (Commands, Injections)

When the message triggers a command (like `/status`) instead of an agent run, the flow is different:

```
User sends chat.send
    │
    ▼
Gateway responds: { runId, status: "started" }
    │
    ▼
Command runs (no agent events)
    │
    └── event chat  state:"final"  message:{role:"assistant", content:[...]}
```

**No `event agent` events are emitted.** The final event includes the complete response. The `agentRunStarted` flag stays false, and the gateway assembles the final reply itself.

This is critical: **we cannot rely solely on `event agent` for content.** The `event chat state:"final"` message field is our fallback for non-agent runs.

---

## Part 2: Current Code Audit

### 2.1 What's in `clawdbot-runtime.ts` Today

The file is ~500 lines with these sections:

1. **Types & Utils** (lines 1-110) - Clean, no issues
2. **WebSocket Connection** (lines 112-350) - Overly complex with dual HTTP/WS history, safety timeouts, race conditions
3. **Event Handlers** (inside `ws.onmessage`, lines 200-350) - Monolithic, mixed concerns, lots of debug logging
4. **append/cancel/clearHistory** (lines 350-430) - Mostly clean

### 2.2 Specific Problems Found

#### Problem 1: Only using `event chat` for streaming text

```typescript
// Current code: only processes event chat deltas
if (msg.type === 'event' && msg.event === 'chat') {
  if (role === 'assistant' && state === 'delta' && textContent) {
    streamingTextRef.current = textContent;
    setMessages(prev => { ... });
  }
}
```

This uses the throttled (150ms) `event chat` events. Streaming is choppy - you see text jump in chunks instead of smooth character-by-character flow.

#### Problem 2: `event agent` handler is debug-only (no action)

```typescript
// Current code: just logs, does nothing
if (msg.type === 'event' && msg.event === 'agent') {
  console.log('[clawdbot] Agent event FULL:', JSON.stringify(payload).slice(0, 500));
  // ... no actual message handling
}
```

The `event agent` handler was left as debug-only after the botched fix attempt.

#### Problem 3: Complex history re-fetch mechanism

```typescript
// Current code: re-fetches entire history after every final event
pendingRefetchRef.current = { tempId, streamedText };
wsSend('chat.history', { sessionKey: currentSessionRef.current });
```

After every message completes, we re-fetch the entire chat history to get "complete" content. This is a workaround for truncated MEDIA paths but it:
- Adds 500ms+ delay after every message
- Downloads the entire history (potentially large) just for the last message
- Creates complex state management with `pendingRefetchRef`
- Has race conditions with the initial history load

#### Problem 4: Dual history loading with race conditions

```typescript
// HTTP fetch and WebSocket both try to load history
// First one wins, other gets ignored
fetch(historyUrl).then(data => {
  if (historyLoadedRef.current) return; // WS already loaded
  historyLoadedRef.current = true;
  ...
});

// Also in WS handler:
wsSend('chat.history', { sessionKey });
```

Having two parallel history loaders creates complexity and potential bugs:
- What if both arrive simultaneously?
- What if session changes between fetch and response?
- Guards exist but add cognitive load

#### Problem 5: Multiple completion handlers that might conflict

There are THREE places that handle run completion:

1. `event chat` with `state: "final"` - Main completion handler
2. `res` with `status: "done"/"completed"/"finished"` - Fallback for "some OpenClaw versions"
3. History re-fetch after final - Late content replacement

These can fire in unpredictable order and potentially step on each other.

#### Problem 6: 40+ console.log statements

Debug logging from multiple debugging sessions left in production code. Makes it hard to read and adds noise.

#### Problem 7: `streamingTextRef` could be stale

```typescript
streamingTextRef.current = textContent; // Set in event chat handler
// ...
const streamedText = streamingTextRef.current; // Read in final handler
```

Because `event chat` is throttled, `streamingTextRef` might not have the latest text when `final` fires. The `emitChatFinal` gets text from the buffer (which should be complete), but our code uses the potentially-stale ref.

### 2.3 What's NOT Broken (Don't Touch)

- **Message rendering** (`AutomnaChat.tsx`, `MessageContent.tsx`) - Works well
- **File upload flow** - Clean and functional
- **MEDIA path parsing** in `MessageContent` - Correct regex, renders properly
- **Image base64 rendering** from history - Working
- **Tool call display** components - Working
- **Session switching** logic - Mostly working (some edge cases)
- **`parseMessages` utility** - Correct
- **Cancel/abort flow** - Working

---

## Part 3: The Fix

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  useClawdbotRuntime()                                           │
│                                                                  │
│  ┌───────────────────┐  ┌─────────────────────────────────────┐ │
│  │ Connection Layer   │  │ State                               │ │
│  │                    │  │                                     │ │
│  │ - WebSocket mgmt   │  │ messages: ThreadMessage[]           │ │
│  │ - connect/auth     │  │ isRunning: boolean                  │ │
│  │ - reconnect        │  │ isConnected: boolean                │ │
│  │                    │  │ loadingPhase: LoadingPhase           │ │
│  └────────┬───────────┘  │ activeRunId: string | null          │ │
│           │              │ streamingText: string                │ │
│           ▼              └──────────────────┬──────────────────┘ │
│  ┌───────────────────┐                      │                    │
│  │ Message Router     │──── updates ────────┘                    │
│  │                    │                                          │
│  │ switch(msg.type) { │                                          │
│  │   event agent →    │                                          │
│  │   event chat  →    │                                          │
│  │   res         →    │                                          │
│  │ }                  │                                          │
│  └────────┬───────────┘                                          │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Event Handlers                                               ││
│  │                                                              ││
│  │ handleAgentEvent(payload)                                    ││
│  │   stream:"assistant" → update streaming message              ││
│  │   stream:"lifecycle" → track run state                       ││
│  │   stream:"tool"      → (future: show tool activity)          ││
│  │                                                              ││
│  │ handleChatEvent(payload)                                     ││
│  │   state:"delta"      → IGNORE (we use agent events now)      ││
│  │   state:"final"      → finalize message, stop running        ││
│  │   state:"error"      → show error, stop running              ││
│  │                                                              ││
│  │ handleHistoryResponse(payload)                               ││
│  │   Initial load or post-final re-fetch                        ││
│  │                                                              ││
│  │ handleSendAck(payload)                                       ││
│  │   status:"started" → setIsRunning(true)                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Streaming Strategy

**Primary source:** `event agent` with `stream: "assistant"`
- Use `data.text` (full accumulated text) for display
- Replace message content on each event (don't concatenate)
- This gives smooth, per-token streaming

**Completion signal:** `event chat` with `state: "final"`
- Stop the running indicator
- If `message.content` is present and has text, use it (it's the complete text)
- Trigger history re-fetch ONLY if the response might contain images/MEDIA

**Fallback for non-agent runs:** `event chat` with `state: "final"` and `message` present
- Commands like `/status` don't emit agent events
- The final event's message field contains the full response
- Must handle this case or commands will show blank responses

### 3.3 When to Re-fetch History

The history re-fetch is expensive (fetches ALL messages). Only do it when needed:

```typescript
// After final event, check if we need richer content
const needsRefetch = 
  // Message had MEDIA paths that might be truncated
  streamingText.includes('MEDIA:') ||
  // Message was very short (possible truncation)
  (finalTextLength > 0 && streamingText.length === 0) ||
  // Agent used tools that might produce images
  sawToolCalls;

if (needsRefetch) {
  // Re-fetch history, but only update the LAST message
  // Don't replace the entire message list
}
```

### 3.4 Handling the MEDIA Truncation

**Root cause (from source analysis):**

Looking at `emitChatDelta`, the text comes directly from `evt.data.text` which is the agent's accumulated output. The throttling (`if (now - last < 150) return`) means we skip some events.

But the `event agent stream:"assistant"` sends EVERY token including the complete accumulated text. So if we use agent events, we should get the full text including MEDIA paths.

**Hypothesis to test:** The MEDIA truncation might be a `event chat` throttling artifact, not a fundamental bug. When the agent outputs `MEDIA:/very/long/path`, the text might be split across multiple agent events:
- `data.text: "Here's the image:\n\nMEDIA:/home/node/.op"` (seq 50)
- `data.text: "Here's the image:\n\nMEDIA:/home/node/.openclaw/media/img.png"` (seq 51)

If `event chat` fires between those two, it captures the truncated version. But the final `data.text` should have the complete path.

**If this hypothesis is correct:** Switching to `event agent` for streaming will automatically fix the MEDIA truncation issue, and we might not need the history re-fetch workaround at all for text content. We'd only need it for `type: "image"` base64 content parts (which only appear in stored messages, never in streaming).

### 3.5 Complete Handler Code

```typescript
// === EVENT AGENT: Real-time streaming ===
if (msg.type === 'event' && msg.event === 'agent') {
  const { stream, data, runId, sessionKey: evtSessionKey } = msg.payload || {};
  
  // Only process events for our session
  if (evtSessionKey && evtSessionKey !== currentSessionRef.current) return;
  
  // Assistant text streaming
  if (stream === 'assistant' && typeof data?.text === 'string') {
    streamingTextRef.current = data.text;
    const fullText = data.text;
    
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.id === 'streaming') {
        return [...prev.slice(0, -1), { 
          ...last, 
          content: [{ type: 'text', text: fullText }] 
        }];
      }
      return [...prev, { 
        id: 'streaming', 
        role: 'assistant', 
        content: [{ type: 'text', text: fullText }], 
        createdAt: new Date() 
      }];
    });
    return;
  }
  
  // Lifecycle events (optional: could use for run state tracking)
  if (stream === 'lifecycle') {
    if (data?.phase === 'start') {
      // Run started - ensure we're in running state
      // (should already be set by chat.send ack, but belt-and-suspenders)
      setIsRunning(true);
    }
    // Don't set isRunning=false on lifecycle end
    // Wait for event chat final which is the canonical completion signal
    return;
  }
  
  // Tool events (future: could show tool activity in UI)
  if (stream === 'tool') {
    // For now, ignore. Tool display comes from history content parts.
    return;
  }
  
  return;
}

// === EVENT CHAT: State transitions ===
if (msg.type === 'event' && msg.event === 'chat') {
  const { state, message, sessionKey: evtSessionKey } = msg.payload || {};
  
  // Only process events for our session
  if (evtSessionKey && evtSessionKey !== currentSessionRef.current) return;
  
  // Delta events: IGNORE
  // We get smoother streaming from event agent
  if (state === 'delta') return;
  
  // Final event: message complete
  if (state === 'final') {
    const streamedText = streamingTextRef.current;
    streamingTextRef.current = '';
    setIsRunning(false);
    
    // Get text from final event's message (if present)
    const finalText = message?.content
      ?.find((c: {type: string}) => c.type === 'text')?.text || '';
    
    // Use the best available text:
    // 1. Streamed text from agent events (most complete during streaming)
    // 2. Final event's message text (complete, but may not exist for agent runs)
    // 3. Empty (shouldn't happen, but handle gracefully)
    const bestText = streamedText || finalText || '';
    const cleanedText = bestText.replace(/\n?\[message_id: [^\]]+\]/g, '').trim();
    
    // Finalize the streaming message with a permanent ID
    const finalId = genId();
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.id === 'streaming') {
        if (cleanedText) {
          return [...prev.slice(0, -1), { 
            ...last, 
            id: finalId, 
            content: [{ type: 'text', text: cleanedText }] 
          }];
        }
        // Empty response - remove the streaming placeholder
        return prev.slice(0, -1);
      }
      // No streaming message exists (command/non-agent run)
      if (cleanedText) {
        return [...prev, { 
          id: finalId, 
          role: 'assistant', 
          content: [{ type: 'text', text: cleanedText }], 
          createdAt: new Date() 
        }];
      }
      return prev;
    });
    
    // Only re-fetch if the message likely contains images
    // (MEDIA paths, or we saw tool calls that might produce images)
    if (cleanedText.includes('MEDIA:') || !streamedText) {
      setTimeout(() => {
        refetchLastMessage(finalId);
      }, 500);
    }
    
    return;
  }
  
  // Error event
  if (state === 'error') {
    streamingTextRef.current = '';
    setIsRunning(false);
    const errorMsg = msg.payload?.errorMessage || 'Something went wrong';
    setError(errorMsg);
    
    // Remove streaming placeholder if present
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.id === 'streaming') {
        return prev.slice(0, -1);
      }
      return prev;
    });
    return;
  }
}
```

### 3.6 Simplified History Re-fetch

Instead of the current complex `pendingRefetchRef` mechanism, use a simple targeted function:

```typescript
// Only updates the last message, doesn't replace entire history
function refetchLastMessage(messageId: string) {
  const reqId = wsSend('chat.history', { 
    sessionKey: currentSessionRef.current,
    limit: 5  // Only need recent messages
  });
  
  // Store a simple callback
  pendingRefetch.current = {
    messageId,
    requestId: reqId,
  };
}

// In history response handler:
if (pendingRefetch.current && msg.id === pendingRefetch.current.requestId) {
  const target = pendingRefetch.current;
  pendingRefetch.current = null;
  
  const lastMsg = wsMessages[wsMessages.length - 1];
  if (lastMsg?.role === 'assistant') {
    const content = parseMessageContent(lastMsg.content);
    const hasRichContent = content.some(p => p.type === 'image') || 
                           content.length > 1;
    
    if (hasRichContent) {
      setMessages(prev => prev.map(m => 
        m.id === target.messageId ? { ...m, content } : m
      ));
    }
  }
}
```

**Note:** The `chat.history` method doesn't support a `limit` param in the request, but the gateway applies a default limit of 200 and hard max of 1000 internally. We can't optimize the payload size. However, we only need to process the last message from the response.

---

## Part 4: Implementation Plan

### Phase 1: Cleanup (Day 1)

**Goal:** Clean code without changing behavior.

1. **Extract handler functions** from the monolithic `ws.onmessage`
   - `handleConnectChallenge(msg)`
   - `handleConnectResponse(msg)`  
   - `handleHistoryResponse(msg, wsMessages)`
   - `handleSendAck(msg)`
   - `handleAgentEvent(payload)` - Currently debug-only, will expand in Phase 2
   - `handleChatEvent(payload)` - Current streaming logic
   - `handleRunResponse(payload)` - Completion via res message
   - `handleError(msg)`

2. **Gate debug logging**
   ```typescript
   const DEBUG = process.env.NODE_ENV === 'development' || 
                 new URLSearchParams(window.location.search).has('debug');
   const log = DEBUG ? console.log.bind(console, '[clawdbot]') : () => {};
   ```

3. **Remove dead code**
   - The `event agent` debug-only handler (replacing in Phase 2)
   - Excessive debug logging
   - The "some OpenClaw versions" `res` completion handler (test if it's actually needed first)

4. **Simplify history loading**
   - Keep WS-only history loading (remove HTTP parallel fetch if WS is reliable)
   - OR keep HTTP, but simplify the race condition handling

5. **Add TypeScript types** for OpenClaw events
   ```typescript
   interface AgentEvent {
     runId: string;
     stream: 'lifecycle' | 'assistant' | 'tool';
     data: AgentLifecycleData | AgentAssistantData | AgentToolData;
     sessionKey: string;
     seq: number;
     ts: number;
   }
   ```

### Phase 2: Streaming Fix (Day 2)

**Goal:** Smooth, reliable streaming.

1. **Add `event agent` handler** for `stream: "assistant"` (per 3.5 above)
2. **Change `event chat` delta to no-op** (just return, don't process)
3. **Update `event chat` final handler** (per 3.5 above)
4. **Simplify history re-fetch** (per 3.6 above)
5. **Handle non-agent runs** via final event's message field

### Phase 3: Testing (Day 2-3)

Test matrix:

| Scenario | What to verify |
|----------|---------------|
| Simple text response | Smooth streaming, complete text on final |
| Response with MEDIA path | Path not truncated, image renders |
| Response with base64 image | Image appears after history re-fetch |
| Response with tool calls (verbose on) | Tool activity shown |
| Response with tool calls (verbose off) | Clean text only |
| Command (e.g. /status) | Response appears (no agent events) |
| Long response (>1000 tokens) | No truncation, smooth throughout |
| Cancelled response (Esc) | Partial text preserved, running stops |
| Error during response | Error shown, cleanup happens |
| Session switch during response | Old events ignored |
| Page reload during response | History loads correctly |
| Multiple rapid messages | No state leaks between runs |
| File upload + response | File attached, response renders |

### Phase 4: Polish (Day 3)

- Remove any remaining workarounds that Phase 2 made unnecessary
- Performance: verify no memory leaks from message array updates
- UX: smooth scroll behavior during streaming
- UX: typing indicator shows immediately after send

---

## Part 5: Risk Assessment

### What Could Break

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Non-agent runs show blank | Medium | High | Always check final event's message field as fallback |
| Images stop rendering | Low | High | Keep history re-fetch for MEDIA/image content; test extensively |
| Tool display breaks | Low | Medium | Tool display comes from history, not streaming; unchanged |
| Session switching races | Low | Medium | Guard all handlers with session key check |
| Old OpenClaw versions behave differently | Low | High | Test on actual Fly instances before deploying |

### What Won't Break

- **History loading** - Untouched
- **Message rendering** - Untouched (AutomnaChat.tsx, MessageContent.tsx)
- **File uploads** - Untouched
- **Cancel/abort** - Uses separate `chat.abort` method
- **Session key handling** - Untouched

### Rollback Plan

1. All changes in `clawdbot-runtime.ts` only
2. Git tag before starting: `git tag v0.2-pre-streaming`
3. Vercel has instant rollback to previous deployment
4. If broken: `vercel rollback` or deploy the tagged version

---

## Part 6: Files Reference

| File | Role | Changes needed |
|------|------|---------------|
| `landing/src/lib/clawdbot-runtime.ts` | WebSocket + streaming logic | **Major rewrite** |
| `landing/src/components/AutomnaChat.tsx` | Message rendering | No changes needed |
| `landing/src/components/MessageContent.tsx` | Text/code/MEDIA parsing | No changes needed |
| `landing/src/app/api/ws/[...path]/route.ts` | HTTP history proxy | No changes needed |
| `landing/src/app/api/files/download/route.ts` | File download for MEDIA | No changes needed |

---

## Part 7: Slash Commands

### 7.1 Current State

The webchat has **zero** slash command support. Users can type `/status` as plain text and it technically works (goes through `chat.send`, OpenClaw processes it as a command), but:

- No autocomplete or suggestions when typing `/`
- No visual feedback that it's a command vs. regular message
- No command palette or help
- Users have no way to discover available commands
- Command responses aren't styled differently from agent responses

### 7.2 Available Commands (from OpenClaw source)

These are all text-alias commands supported by OpenClaw:

**Session Management:**
| Command | Aliases | Description | Args |
|---------|---------|-------------|------|
| `/status` | | Show current status | None |
| `/reset` | | Reset the current session | Optional |
| `/new` | | Start a new session | Optional |
| `/compact` | | Compact session context | Optional instructions |
| `/stop` | | Stop the current run | None |

**Model & Thinking:**
| Command | Aliases | Description | Args |
|---------|---------|-------------|------|
| `/model` | | Show or set model | Optional: model id |
| `/models` | | List available models | Optional: provider |
| `/think` | `/thinking`, `/t` | Set thinking level | off, minimal, low, medium, high, xhigh |
| `/reasoning` | `/reason` | Toggle reasoning visibility | on, off, stream |

**Agent Settings:**
| Command | Aliases | Description | Args |
|---------|---------|-------------|------|
| `/verbose` | `/v` | Toggle verbose mode (tool events) | on, off |
| `/elevated` | `/elev` | Toggle elevated exec mode | on, off, ask, full |
| `/exec` | | Set exec defaults | host=, security=, ask=, node= |
| `/send` | | Set send policy | on, off, inherit |
| `/activation` | | Set group activation mode | mention, always |

**Utility:**
| Command | Aliases | Description | Args |
|---------|---------|-------------|------|
| `/help` | | Show available commands | None |
| `/commands` | | List all slash commands | None |
| `/whoami` | `/id` | Show sender id | None |
| `/usage` | | Usage/cost summary | off, tokens, full, cost |
| `/tts` | | Configure text-to-speech | Optional |
| `/context` | | Explain context building | Optional |
| `/skill` | | Run a skill by name | name, input |
| `/subagents` | | Manage subagent runs | list, stop, log, info, send |

**Admin:**
| Command | Aliases | Description | Args |
|---------|---------|-------------|------|
| `/config` | | Show or set config | show, get, set, unset + path + value |
| `/debug` | | Runtime debug overrides | show, reset, set, unset + path + value |
| `/restart` | | Restart OpenClaw | None |
| `/allowlist` | | Manage allowlist | Optional |
| `/approve` | | Approve/deny exec requests | Optional |
| `/bash` | | Run host shell command | command text |
| `/queue` | | Adjust queue settings | mode, debounce, cap, drop |

### 7.3 Which Commands Matter for Automna Users

Not all commands make sense for Automna users. Prioritize:

**Tier 1 - Essential (show in UI):**
- `/status` - See what model, session info
- `/model` - Switch models
- `/think` - Adjust thinking level
- `/new` - Fresh conversation
- `/reset` - Reset session
- `/stop` - Stop current run (already have cancel button, but alias is nice)
- `/help` - Discoverability

**Tier 2 - Power Users:**
- `/verbose` - Show tool calls
- `/compact` - Manage context
- `/usage` - See token usage
- `/reasoning` - See thinking output
- `/subagents` - Manage background tasks

**Tier 3 - Admin Only (hide or restrict):**
- `/config` - Could break things
- `/debug` - Development only
- `/restart` - Dangerous
- `/bash` - Security risk
- `/allowlist`, `/approve` - Admin functions
- `/exec`, `/elevated` - Security-sensitive

### 7.4 Implementation Plan

#### Phase A: Basic Command Passthrough (Minimal Effort)

Commands already work via `chat.send`. Just need:
1. Style command messages differently in the UI (monospace? darker bubble?)
2. Style command responses differently (system message style)
3. Test that common commands work end-to-end

#### Phase B: Command Autocomplete (Medium Effort)

When user types `/` in the input:
1. Show a floating menu above the input with matching commands
2. Filter as user types more characters
3. Show command description and args
4. Tab or click to select
5. If command has choices (like `/think`), show sub-menu

```tsx
// Rough UI concept
function CommandPalette({ query, onSelect }: { query: string; onSelect: (cmd: string) => void }) {
  const filtered = COMMANDS.filter(c => c.alias.startsWith(query));
  return (
    <div className="absolute bottom-full mb-2 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
      {filtered.map(cmd => (
        <button key={cmd.key} onClick={() => onSelect(cmd.alias)}>
          <span className="font-mono text-purple-600">{cmd.alias}</span>
          <span className="text-zinc-500 text-sm ml-2">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}
```

#### Phase C: Command Response Formatting (Polish)

Some commands return structured data (like `/status` returns a status card). We could:
1. Detect command responses (they come via non-agent final events)
2. Parse common formats (status cards, lists, tables)
3. Render with appropriate UI components

### 7.5 Command List as Data

For the autocomplete, we need a static list of commands available on the client:

```typescript
// Available in landing/src/lib/commands.ts
export const AUTOMNA_COMMANDS = [
  { key: 'status', alias: '/status', description: 'Show current status', tier: 1 },
  { key: 'model', alias: '/model', description: 'Show or set model', tier: 1, args: 'model id' },
  { key: 'think', alias: '/think', description: 'Set thinking level', tier: 1, 
    choices: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] },
  { key: 'new', alias: '/new', description: 'Start a new session', tier: 1 },
  { key: 'reset', alias: '/reset', description: 'Reset session', tier: 1 },
  { key: 'stop', alias: '/stop', description: 'Stop current run', tier: 1 },
  { key: 'help', alias: '/help', description: 'Show available commands', tier: 1 },
  { key: 'verbose', alias: '/verbose', description: 'Toggle tool call display', tier: 2, choices: ['on', 'off'] },
  { key: 'compact', alias: '/compact', description: 'Compact session context', tier: 2 },
  { key: 'usage', alias: '/usage', description: 'Show token usage', tier: 2, choices: ['off', 'tokens', 'full', 'cost'] },
  { key: 'reasoning', alias: '/reasoning', description: 'Toggle reasoning', tier: 2, choices: ['on', 'off', 'stream'] },
  { key: 'subagents', alias: '/subagents', description: 'Manage background tasks', tier: 2 },
] as const;
```

---

## Part 8: Double Message Bug

### 8.1 Symptom

Sometimes the agent sends what appears to be two messages. The first message appears and sits in the chat, then a second message appears which overwrites the first.

### 8.2 Root Cause Analysis

There are **three independent code paths** that can create or modify assistant messages, and they can fire in overlapping sequence:

#### Path 1: Streaming delta → Final event
```
event chat state:"delta"  → creates/updates message id:"streaming"
event chat state:"final"  → replaces id:"streaming" with id:finalId, sets content
```

#### Path 2: History re-fetch (500ms after final)
```
setTimeout(500ms) → wsSend('chat.history')
                  → handleRefetchResponse() 
                  → updates message by finalId with richer content
                  → OR adds new message if finalId not found (!)
```

#### Path 3: Run completion via `res` message
```
res { runId, status:"done"|"completed"|"finished" }
  → handleRunCompletion()
  → creates new message OR updates streaming message
```

### 8.3 Likely Scenarios Causing the Double Message

**Scenario A: Final event + Re-fetch creates visual "jump"**

1. `handleChatEvent` final fires → message appears with streamed text
2. 500ms later → `handleRefetchResponse` fires → message content REPLACES with history version
3. If history text is different (longer, formatted differently, has MEDIA), the message visibly changes
4. User perception: "first message sits, then gets overwritten"

This isn't technically two messages, but the content change is jarring.

**Scenario B: `handleRunCompletion` AND `handleChatEvent` both fire**

Looking at the OpenClaw source:
- Agent runs: `emitChatFinal()` sends `event chat state:"final"` (from server-chat.js)
- Non-agent runs: `broadcastChatFinal()` sends `event chat state:"final"` (from chat.send handler)
- After either: dedupe cache stores `{ runId, status: "ok" }` as a `res` message

Our router checks for `status: "done"|"completed"|"finished"` but NOT `"ok"`. So normally `handleRunCompletion` shouldn't fire. However, if there's any code path that sends a `res` with matching status, BOTH handlers would fire:
- `handleChatEvent` final → creates message with finalId
- `handleRunCompletion` → creates ANOTHER message (can't find id:"streaming" because final already changed it)

**Scenario C: Timing race with `pendingRefetchRef`**

1. Final event fires → `handleChatEvent` sets `pendingRefetchRef` after 500ms
2. But the `handleHistoryResponse` function checks `pendingRefetchRef` immediately
3. If a stale history response arrives (from initial connect or a previous re-fetch) BEFORE the 500ms setTimeout fires, it could hit the initial-load path instead of the re-fetch path
4. Or if `pendingRefetchRef` is set but the history response doesn't find the `messageId`, it ADDS a new message instead of updating

**Scenario D: Non-agent run (commands) create a message, then agent re-fetch adds another**

For commands like `/status`:
1. No streaming deltas (no `event agent` or `event chat delta`)
2. `event chat state:"final"` fires with `message` content → `handleChatEvent` creates message (no streaming message exists, so adds new one)
3. Re-fetch fires 500ms later → `handleRefetchResponse` finds the last assistant message in history
4. If history's last message is DIFFERENT from the command response (e.g., a previous agent message), it might update the wrong message or add another

### 8.4 Specific Code Issues

**Issue 1: `handleRefetchResponse` fallback adds messages**
```typescript
if (idx >= 0) {
  // Update in-place ✓
} else {
  // ADDS A NEW MESSAGE if finalId not found!
  return [...prev, { id: pending.messageId, ... }];
}
```
If the `finalId` message was somehow removed or the state update from `handleChatEvent` hasn't committed yet (React batching), this creates a duplicate.

**Issue 2: No deduplication by runId**
We don't track `runId`. Multiple events for the same run can each create messages. If we tracked `runId`, we could deduplicate.

**Issue 3: `handleRunCompletion` can create messages independently**
This handler creates messages without checking if `handleChatEvent` already handled the same run. It's a "fallback" that can accidentally double up.

### 8.5 Proposed Fixes (for Phase 2)

1. **Track `activeRunId`** - Store the current run's ID. All handlers check against it before creating messages.

2. **Remove `handleRunCompletion` or make it no-op when chat event handled it** - The `res` completion path was added as a fallback for "some OpenClaw versions." Verify if it's still needed. If so, gate it behind a check: "only if `handleChatEvent` didn't already finalize this run."

3. **Don't add messages in `handleRefetchResponse`** - If the `finalId` isn't found, log a warning and do nothing instead of adding a duplicate. The message is already displayed from the final event.

4. **Debounce or merge rapid message updates** - Use `requestAnimationFrame` or a short debounce to coalesce multiple state updates within the same frame.

5. **Use `runId` as message ID** - Instead of random `genId()` for finalized messages, use the `runId` from the event. This prevents the same run from creating multiple messages. The streaming message still uses `id: "streaming"`, but on finalize it gets `id: runId`.

---

## Appendix A: Raw Event Log (Annotated)

From debug session 2026-02-05. Agent responding "Ha, yeah? What happened? Technical hiccups or something weirder?"

```
event agent  stream:"lifecycle"  phase:"start"           ← Run begins
event agent  stream:"assistant"  text:"Ha"               ← Token 1
event chat   state:"delta"       textLength:2            ← Throttled (150ms passed)
event agent  stream:"assistant"  text:"Ha,"              ← Token 2
event agent  stream:"assistant"  text:"Ha, yeah"         ← Token 3
event agent  stream:"assistant"  text:"Ha, yeah?"        ← Token 4
event agent  stream:"assistant"  text:"Ha, yeah? What"   ← Token 5
event chat   state:"delta"       textLength:14           ← Throttled (150ms)
event agent  stream:"assistant"  text:"Ha, yeah? What happene"  ← Token 6
event agent  stream:"assistant"  text:"..."              ← Tokens 7-12
event chat   state:"delta"       textLength:64           ← Throttled
event agent  stream:"lifecycle"  phase:"end"             ← Run ending
event chat   state:"final"       textLength:64           ← Complete
```

**Observation:** Between seq 1 and the first chat delta, 4 agent events fired. Between chat deltas, 4-6 agent events fired. Using agent events gives ~6x smoother streaming.

## Appendix B: Throttle Math

- OpenClaw throttle: 150ms between `event chat` deltas
- Typical Claude token rate: ~30-80 tokens/second
- At 50 tokens/sec: 
  - `event agent`: 50 updates/sec
  - `event chat`: ~6.7 updates/sec
  - **7.5x more responsive** with agent events
