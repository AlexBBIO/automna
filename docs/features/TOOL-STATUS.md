# Tool Status Indicator Spec

> Created: 2026-02-08
> Status: Ready for implementation
> Parent: STREAMING-SPEC.md (Phase 2E established tool event flow)

## Problem

When the agent runs tool calls (exec, web_search, read files, etc.), the user sees dead silence for 10-60+ seconds. The agent IS working, but nothing in the UI communicates that. The only indicator is the bouncing dots typing indicator, which only shows when no assistant text has appeared yet.

Worse: once the agent writes some text and then calls a tool, the typing indicator doesn't show at all (because the last message IS from the assistant). So mid-run tool calls are completely invisible.

## Current State

We already receive tool events from OpenClaw (requires `verboseDefault: "on"`, which is deployed to all machines). The `handleAgentEvent` function in `clawdbot-runtime.ts` processes `stream === 'tool'` events with:
- `phase: "start"` — tool execution begins, includes `data.name`
- `phase: "update"` — partial results (we ignore these)  
- `phase: "end"` — tool execution complete

Currently, tool start events trigger bubble splitting (finalize current text, start new bubble). But there's **no visual indicator** during the tool execution itself.

## Solution

Add a `toolStatus` state to `useClawdbotRuntime` that carries a user-friendly status message. Display it in `AutomnaChat.tsx` as an animated indicator below the last message, replacing the existing typing indicator when a tool is active.

## Changes

### 1. `clawdbot-runtime.ts` — Add `toolStatus` state

```typescript
// New state
const [toolStatus, setToolStatus] = useState<string | null>(null);

// Tool name → friendly status message
function getToolStatusMessage(toolName: string): string {
  switch (toolName) {
    case 'exec':
      return '💻 Running a command…';
    case 'Read':
    case 'read':
      return '📄 Reading a file…';
    case 'Write':
    case 'write':
      return '✏️ Writing a file…';
    case 'Edit':
    case 'edit':
      return '✏️ Editing a file…';
    case 'web_search':
      return '🔍 Searching the web…';
    case 'web_fetch':
      return '🌐 Fetching a page…';
    case 'browser':
      return '🌐 Browsing…';
    case 'image':
      return '🖼️ Analyzing an image…';
    case 'sessions_spawn':
      return '🤖 Starting a sub-task…';
    case 'tts':
      return '🔊 Generating audio…';
    case 'message':
      return '💬 Sending a message…';
    default:
      return '⚙️ Working on it…';
  }
}
```

### 2. `clawdbot-runtime.ts` — Update tool event handler

Inside `handleAgentEvent`, where `stream === 'tool'` is handled:

```typescript
if (stream === 'tool') {
  startRecoveryTimer();
  const phase = (data?.phase as string) || '';
  const toolName = (data?.name as string) || '';

  if (phase === 'start') {
    // Show status indicator
    setToolStatus(getToolStatusMessage(toolName));

    // Existing bubble-splitting logic stays as-is
    const currentText = streamingTextRef.current;
    if (currentText) {
      // ... (existing finalize-bubble code, unchanged)
    }
  }

  // Clear status on tool end (next assistant delta will also clear it)
  if (phase === 'end') {
    setToolStatus(null);
  }

  log('🔧 Tool:', phase, toolName);
  return;
}
```

### 3. `clawdbot-runtime.ts` — Clear status on assistant delta

Inside the `stream === 'assistant'` handler, at the top:

```typescript
if (stream === 'assistant' && data) {
  const delta = data.delta as string | undefined;

  if (typeof delta === 'string' && delta) {
    // Clear tool status as soon as text starts flowing
    if (toolStatus) setToolStatus(null);

    deltaCountRef.current++;
    startRecoveryTimer();
    streamingTextRef.current += delta;
  }
  // ... rest unchanged
}
```

### 4. `clawdbot-runtime.ts` — Clear status on run end

In `handleChatEvent` when `state === 'final'` or `state === 'error'`:

```typescript
setToolStatus(null);
```

### 5. `clawdbot-runtime.ts` — Expose in return value

```typescript
return { messages, isRunning, isConnected, loadingPhase, error, toolStatus, append, cancel, clearHistory };
```

### 6. `AutomnaChat.tsx` — New `ToolStatusIndicator` component

```tsx
function ToolStatusIndicator({ status }: { status: string }) {
  return (
    <div className="flex gap-3 items-start animate-fadeIn">
      <AssistantAvatar />
      <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 shadow-sm border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-300">{status}</span>
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      </div>
    </div>
  );
}
```

### 7. `AutomnaChat.tsx` — Replace typing indicator logic

Current code (line ~664):
```tsx
{isRunning && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
  <TypingIndicator />
)}
```

New code:
```tsx
{/* Tool status indicator (shown during tool execution) */}
{toolStatus && (
  <ToolStatusIndicator status={toolStatus} />
)}

{/* Typing indicator (shown when running but no text yet and no tool active) */}
{isRunning && !toolStatus && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
  <TypingIndicator />
)}
```

### 8. `AutomnaChat.tsx` — Destructure new state

```tsx
const { messages, isRunning, isConnected, loadingPhase, error, toolStatus, append, cancel } = useClawdbotRuntime({
```

## Behavior Summary

| Agent state | What user sees |
|-------------|---------------|
| Agent thinking (no text yet) | ● ● ● (bouncing dots) |
| Agent writing text | Text streaming in real-time |
| Agent calls `exec` | 💻 Running a command… ● ● ● |
| Agent calls `web_search` | 🔍 Searching the web… ● ● ● |
| Agent calls `read` | 📄 Reading a file… ● ● ● |
| Tool finishes, agent writes more | Text streaming resumes, indicator gone |
| Agent chains tools (exec → read → exec) | Status updates for each: 💻→📄→💻 |
| Run completes | All indicators cleared |
| Run errors | All indicators cleared |

## Edge Cases

**Multiple rapid tool calls:** If the agent calls tool A, then immediately tool B (no text between), the status flips from A's message to B's message. This is fine — it shows the agent is actively working through steps.

**Tool call with no prior text:** The tool status indicator shows instead of the typing indicator. No conflict.

**Tool call after text:** Text bubble is finalized (existing behavior), then tool status shows below it. When text resumes, a new bubble starts and the indicator disappears.

**Disconnect during tool call:** On reconnect, `toolStatus` will be stale. The recovery timer and reconnect logic already handle this by re-fetching state. `toolStatus` gets cleared on chat final or error, which fires on reconnect recovery.

**Non-agent runs (commands):** No tool events are emitted. `toolStatus` stays null. The existing typing indicator handles this case.

## Files Changed

| File | Change | Risk |
|------|--------|------|
| `landing/src/lib/clawdbot-runtime.ts` | Add `toolStatus` state, `getToolStatusMessage()`, set/clear in handlers | Low — additive only |
| `landing/src/components/AutomnaChat.tsx` | Add `ToolStatusIndicator`, update indicator rendering logic | Low — UI only |

## What This Does NOT Change

- No OpenClaw config changes needed (verbose is already on)
- No backend changes
- No changes to message persistence or history
- No changes to streaming text handling
- No changes to bubble splitting logic
- Existing typing indicator still works for non-tool scenarios

## Testing

1. Send a message that triggers tool calls (e.g., "search the web for X" or "what files are in my workspace")
2. Verify status indicator appears during each tool call
3. Verify it clears when text starts streaming
4. Verify it updates when agent chains multiple tools
5. Verify typing indicator still works for simple text responses (no tools)
6. Verify indicator clears on cancel (Esc)
7. Verify indicator clears on error
