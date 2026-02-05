# Automna Chat Streaming Spec

## Current State (2026-02-05)

The webchat has issues with message streaming - messages hang, disappear, or show garbled content. This doc captures findings from debugging and specs the proper fix.

## OpenClaw WebSocket Event Format

OpenClaw sends two types of events during a chat response:

### 1. `event agent` - Real-time streaming

```json
// Lifecycle events (run start/end)
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "uuid",
    "stream": "lifecycle",
    "data": { "phase": "start", "startedAt": 1770270062919 },
    "sessionKey": "agent:main:hi",
    "seq": 1,
    "ts": 1770270062919
  }
}

// Text streaming events (fires for EVERY token)
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "uuid",
    "stream": "assistant",
    "data": {
      "text": "Full accumulated text so far",  // <-- USE THIS
      "delta": "just the new part"
    },
    "sessionKey": "agent:main:hi",
    "seq": 2,
    "ts": 1770270065684
  }
}
```

**Key insight:** `event agent` with `stream: "assistant"` fires for every token. The `data.text` field contains the **full accumulated text** (not just delta), so you can just replace the message content with it directly.

### 2. `event chat` - Throttled state updates

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "uuid",
    "sessionKey": "agent:main:hi",
    "seq": 5,
    "state": "delta",  // or "final"
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "Accumulated text (throttled)" }]
    }
  }
}
```

**Key insight:** `event chat` is **throttled/batched** - it doesn't fire for every token. In the logs, we saw `event agent` firing 10+ times between `event chat` updates. **Don't rely on this for smooth streaming.**

## Event Flow

```
1. event agent  stream:"lifecycle"  data.phase:"start"    → Run begins
2. event agent  stream:"assistant"  data.text:"Ha"        → First token
3. event agent  stream:"assistant"  data.text:"Ha,"       → Second token
4. event agent  stream:"assistant"  data.text:"Ha, yeah"  → Third token
5. event chat   state:"delta"       textLength:14         → Throttled update
6. event agent  stream:"assistant"  data.text:"..."       → More tokens
7. event agent  stream:"lifecycle"  data.phase:"end"      → Run ending
8. event chat   state:"final"       textLength:64         → Run complete
```

## Current Problems

1. **Using throttled events:** We use `event chat` delta events which are batched, causing choppy streaming

2. **Missing content:** Because `event chat` is throttled, we sometimes miss the final content between the last delta and the final event

3. **Wrong field access:** Earlier bug concatenated `stream` field values ("lifecycle", "assistant") instead of `data.text`

4. **MEDIA truncation:** Separate issue - MEDIA paths get truncated in WebSocket events, requiring history re-fetch

## Phase 1: Cleanup First

Before implementing the streaming fix, clean up the existing code. It's accumulated patches and debug code that makes it fragile and hard to reason about.

### 1.1 Audit Current State

Review `clawdbot-runtime.ts` and identify:
- [ ] Dead code paths (handlers that never trigger)
- [ ] Redundant logic (multiple places handling same event)
- [ ] Debug logging that should be removed or gated
- [ ] Unclear variable names or magic strings

### 1.2 Extract Clear Responsibilities

The current code mixes concerns. Refactor into clear sections:

```
┌─────────────────────────────────────────────────────────┐
│  WebSocket Connection                                    │
│  - connect/disconnect/reconnect logic                    │
│  - auth handling                                         │
└─────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  Message Router                                          │
│  - parse incoming messages                               │
│  - route to appropriate handler by type/event            │
└─────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  Event Handlers (separate functions)                     │
│  - handleConnectResponse()                               │
│  - handleHistoryResponse()                               │
│  - handleAgentEvent()      ← streaming content           │
│  - handleChatEvent()       ← state transitions           │
│  - handleError()                                         │
└─────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  State Management                                        │
│  - messages array                                        │
│  - isRunning, isConnected                                │
│  - streaming message buffer                              │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Document the Image Path

Images have been particularly fragile. Document the exact flow:

```
User sends image:
1. File uploaded to /api/files/upload → returns workspace path
2. Message sent with MEDIA:/path/to/file
3. Agent receives, processes, responds

Agent sends image:
1. Agent generates MEDIA:/path in response text
2. During streaming: MEDIA path may be truncated (known bug)
3. On final: re-fetch history to get complete message
4. History contains either:
   a. Text with full MEDIA:/path → render via MessageContent
   b. Content part type:"image" with base64 → render inline
5. MessageContent parses MEDIA: syntax, fetches via /api/files/download
```

### 1.4 Add Integration Tests

Before changing streaming logic, add tests that verify:
- [ ] Basic message send/receive works
- [ ] Images upload and display correctly
- [ ] History loads on reconnect
- [ ] Tool calls display properly
- [ ] Errors are handled gracefully

Use Playwright for e2e tests against a real OpenClaw instance.

### 1.5 Remove Debug Logging

Current code has extensive console.log statements from debugging. Either:
- Remove them entirely, OR
- Gate behind a DEBUG flag: `if (DEBUG) console.log(...)`

### 1.6 Cleanup Checklist

- [ ] Remove dead `event chat` delta handler (once streaming fix is in)
- [ ] Remove `pendingRefetchRef` complexity if we can simplify
- [ ] Consolidate history loading (HTTP vs WS race condition handling)
- [ ] Clean up session key canonicalization logic
- [ ] Remove any temporary workarounds that are no longer needed

---

## Phase 2: Recommended Fix

### Option A: Use `event agent` for streaming (Recommended)

```typescript
if (msg.type === 'event' && msg.event === 'agent') {
  const { stream, data } = msg.payload || {};
  
  // Handle text streaming
  if (stream === 'assistant' && data?.text) {
    const fullText = data.text;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.id === 'streaming') {
        return [...prev.slice(0, -1), { ...last, content: [{ type: 'text', text: fullText }] }];
      }
      return [...prev, { id: 'streaming', role: 'assistant', content: [{ type: 'text', text: fullText }], createdAt: new Date() }];
    });
  }
  
  // Handle lifecycle events
  if (stream === 'lifecycle') {
    if (data?.phase === 'start') {
      setIsRunning(true);
    }
    // Note: Don't use 'end' phase alone - wait for event chat final
  }
}

// Still use event chat for final state
if (msg.type === 'event' && msg.event === 'chat') {
  const { state, message } = msg.payload || {};
  
  if (state === 'final') {
    setIsRunning(false);
    // Finalize the streaming message with a stable ID
    // Optionally re-fetch from history for complete content (MEDIA paths)
  }
}
```

### Why this is better:
- `event agent` fires for every token → smooth streaming
- `data.text` is already accumulated → simple replace, no concatenation needed
- `event chat` final still signals completion
- Separates concerns: agent events for content, chat events for state

### Option B: Keep using `event chat` (Not recommended)

Continue using throttled `event chat` delta events. Results in choppy streaming but simpler code. Not recommended for good UX.

## MEDIA Path Issue (Separate Problem)

MEDIA paths (e.g., `MEDIA:/home/node/.openclaw/media/image.png`) get truncated in streaming events. This appears to be an OpenClaw bug where the WebSocket serialization cuts off long strings.

**Current workaround:** Re-fetch history after `final` event to get complete message with full MEDIA paths.

**Better fix:** Report to OpenClaw / investigate WebSocket frame size limits.

## Tool Call Events

Tool calls come through in a similar pattern but with different stream types. Need to investigate:
- How tool_use and tool_result appear in `event agent`
- Whether they need special handling

## Implementation Checklist

### Phase 1: Cleanup
- [ ] Audit and document current code state
- [ ] Extract handlers into separate functions
- [ ] Document image flow end-to-end
- [ ] Add Playwright e2e tests for critical paths
- [ ] Remove or gate debug logging
- [ ] Remove dead code and simplify where possible

### Phase 2: Streaming Fix
- [ ] Switch from `event chat` delta to `event agent` assistant for streaming
- [ ] Use `data.text` (full accumulated) not `data.delta` (incremental)
- [ ] Keep `event chat` final for completion state
- [ ] Keep history re-fetch workaround for MEDIA paths

### Phase 3: Verification
- [ ] Test basic chat works
- [ ] Test with tool calls (read, exec, etc.)
- [ ] Test with images and file uploads
- [ ] Test error handling (aborted runs, API errors)
- [ ] Test on multiple user accounts
- [ ] Monitor for regressions after deploy

## Files to Modify

- `landing/src/lib/clawdbot-runtime.ts` - Main streaming logic
- `landing/src/components/AutomnaChat.tsx` - Message rendering (may need updates for tool display)

## References

- Debug logs: Discord #automna-3, 2026-02-05
- OpenClaw source: https://github.com/clawdbot/clawdbot (check gateway WS implementation)
