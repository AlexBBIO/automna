# Agent Activity Toggle - Postmortem

**Date:** 2026-02-04
**Status:** Removed (not working)
**Commits:** ac30fe4 → 92f35ad (8 commits, all reverted)

## What It Was Supposed To Do

A toggle button (💬/🔧) in the chat header that would:
- **Toggle OFF (💬):** Hide tool output - search results, web fetches, file reads, etc.
- **Toggle ON (🔧):** Show everything including raw tool output

The goal was to let users see clean conversational responses without the "behind the scenes" tool data.

## Why It Failed

### 1. Misunderstanding of Message Structure

I assumed tool output would come as distinct `toolCall` content parts that could be easily filtered. Reality:

```typescript
// What I expected:
message.content = [
  { type: 'text', text: 'Here are the restaurants...' },
  { type: 'toolCall', name: 'web_fetch', result: {...} }  // ← filter this
]

// What actually happens (sometimes):
message.content = [
  { type: 'text', text: '{"url":"...","fetchedAt":"...","text":"..."}' }  // ← tool output embedded in text!
]
```

Tool output often appears as plain `text` type with JSON content, not as a separate `toolCall` type.

### 2. Multiple Output Formats

Tool output comes in at least 3 different forms:

1. **`toolCall` parts** - Has `name`, `args`, `result` - this IS filterable
2. **Raw JSON in text** - The result JSON dumped directly into a text part
3. **Code blocks** - JSON wrapped in ` ```json ... ``` ` for formatting

My `isRawToolOutputJson()` function tried to detect #2 and #3 by pattern matching:
- Starts with `{`, ends with `}`
- Contains keys like `"fetchedAt":`, `"citations":`, `"tookMs":`

But this was fragile and didn't catch all cases.

### 3. Code Block Exception

I initially excluded code blocks from filtering with the comment:
```typescript
// Code blocks - always show (user intentional content)
```

This was wrong. The agent often wraps tool output in code blocks for readability, so they need to be filtered too.

### 4. Mixed Content

A single `text` part might contain:
```
I found some restaurants for you:

```json
{"url":"...","text":"...restaurant list..."}
```

Here are the top picks:
1. ...
```

This has both conversational text AND tool output in the same segment. Can't just hide the whole thing.

## What I Tried (Commit History)

1. **ac30fe4** - Initial implementation: filter `toolCall` parts only
2. **cb7aca7** - Filter code blocks too
3. **e06a795** - Filter by content type properly
4. **eb207bf** - Only hide code blocks in messages that have toolCall
5. **79e83b2** - Debug logging to see content types
6. **f1fa044** - Detect tool error responses
7. **6984e4e** - Filter raw JSON text, not just code blocks
8. **6325d74** - Hide code blocks containing tool output JSON
9. **92f35ad** - Give up, remove toggle

## What Would Actually Work

### Option A: Server-Side Filtering
Have OpenClaw/the gateway flag which messages are "tool output" vs "conversational response". Then filter by flag, not by content pattern matching.

### Option B: Separate Message Types
Structure messages so tool output is ALWAYS in `toolCall` parts, never mixed into `text`. The frontend can then cleanly filter.

### Option C: Summary Mode
Instead of hiding raw output, have the agent generate a separate "summary" that's stored alongside the raw data. Show summary when toggle is off, raw when on.

### Option D: Smart Parsing (Hard)
Build a more sophisticated parser that can:
- Identify JSON blobs anywhere in text
- Match them against known tool output schemas
- Remove just those sections while preserving surrounding text

This is complex and error-prone.

## Key Insight

The fundamental issue is that **the AI model controls how output is formatted**. Claude decides whether to:
- Return raw JSON
- Wrap it in a code block
- Include it inline with conversational text
- Summarize it instead

Without controlling the model's output format, client-side filtering will always be a guessing game.

## Recommendation for V2

1. **Modify OpenClaw** to track which content is tool output at the source
2. Add a `toolOutput: boolean` flag to content parts
3. Store tool results separately from conversational responses
4. Frontend filtering becomes trivial: `content.filter(p => !p.toolOutput || showActivity)`

This requires backend changes but would be robust.

## Files Involved

- `landing/src/components/AutomnaChat.tsx` - Toggle state, filtering logic
- `landing/src/components/MessageContent.tsx` - `isRawToolOutputJson()` detection
- `landing/src/lib/clawdbot-runtime.ts` - Message parsing from OpenClaw

## Test Case That Exposed the Issue

User asked about Michelin restaurants in Newport Beach. Agent used `web_fetch` on the Michelin Guide site. The result was a large JSON blob containing:
- URL metadata (`url`, `finalUrl`, `status`)
- Extraction metadata (`extractMode`, `fetchedAt`, `tookMs`)
- The actual page content (`text`)

This appeared as a `text` content part containing the raw JSON - not as a `toolCall`. The toggle had no effect because my filter didn't match this format.
