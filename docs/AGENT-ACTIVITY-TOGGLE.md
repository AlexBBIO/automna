# Agent Activity Toggle (Show Tool Calls)

**Date:** 2026-02-04
**Status:** ✅ Implemented (Frontend Filtering)

## What It Does

A toggle button in the chat header that controls visibility of tool-related content:

- **💬 Chat (default):** Shows only conversational responses - clean, user-friendly
- **🔧 Tools:** Shows everything including raw tool calls and results

## The Problem We Solved

### Streaming vs History Discrepancy

When chatting live, users only saw clean responses. After page refresh (loading from history), they saw ugly JSON blobs and tool output.

**Root cause:** OpenClaw stores ALL LLM messages in JSONL transcripts, including:
- `tool_use` content parts (tool invocations)
- `tool_result` content parts (raw JSON results)
- Messages with role `toolResult`

During streaming, OpenClaw only delivers cleaned text via `onBlockReply`. But `chat.history` returns everything from storage without filtering.

### Why Discord Doesn't Have This Problem

Discord (and other channels) only receive `onBlockReply` events - they never touch history storage directly.

## Implementation

### Approach: Frontend Filtering

We chose frontend filtering over:
- **Sed patches to OpenClaw Docker image** - Fragile, breaks on updates, hard to debug
- **Full fork** - High maintenance burden
- **Upstream PR** - Still a good idea, but takes time

### Code Changes

**File:** `landing/src/components/AutomnaChat.tsx`

1. Added `showToolCalls` state (default: `false`)
2. Added toggle button in chat header
3. Added `useMemo` filter that:
   - Removes messages with role `toolResult` or `tool_result`
   - Removes content parts with type `tool_use`, `tool_result`, or `toolCall`
   - Removes messages with no content left after filtering

```typescript
// Filter messages to hide tool-related content
const displayMessages = useMemo(() => {
  if (showToolCalls) return messages;
  
  return messages
    .filter(msg => !isToolResultRole(msg.role))
    .map(msg => ({
      ...msg,
      content: msg.content.filter(part => !isToolContentPart(part))
    }))
    .filter(msg => msg.content.length > 0);
}, [messages, showToolCalls]);
```

## Future Improvements

### Upstream Changes (Recommended)

Two PRs that would benefit the OpenClaw ecosystem:

1. **Add `includeTools` param to `chat.history`**
   - Let server filter tool content before returning
   - Frontend filtering becomes trivial
   - Schema change + handler change required

2. **Add `BRAVE_BASE_URL` env var support**
   - Currently hardcoded, requiring sed patch
   - Should work like `ANTHROPIC_BASE_URL`

### If Upstream Accepted

We could:
- Remove frontend filtering logic (server handles it)
- Remove Brave sed patch from Docker image
- Reduce maintenance burden

## Files Changed

- `landing/src/components/AutomnaChat.tsx` - Toggle state, filtering logic, UI button

## Commits

- `ed8418c` - feat: add Show Tool Calls toggle to filter tool output in chat

## Related

- `AGENT-ACTIVITY-TOGGLE-POSTMORTEM.md` - Previous failed attempt and analysis
