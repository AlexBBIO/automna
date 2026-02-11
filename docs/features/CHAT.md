# Chat System

> Last updated: 2026-02-11

## Components

| Component | File | Purpose |
|-----------|------|---------|
| `AutomnaChat` | `components/AutomnaChat.tsx` | Main chat UI (messages, input, typing indicator) |
| `MessageContent` | `components/MessageContent.tsx` | Message rendering (markdown, code blocks, media) |
| `ConversationSidebar` | `components/ConversationSidebar.tsx` | Conversation list, create/switch/delete |
| `ChatSkeleton` | `components/ChatSkeleton.tsx` | Loading state during provisioning/warming |
| `clawdbot-runtime` | `lib/clawdbot-runtime.ts` | WebSocket client, history loading, streaming |

## Multi-Conversation

- Each conversation = an OpenClaw session with canonical key `agent:main:{name}`
- Sidebar fetches from `GET /api/user/sessions` (reads from OpenClaw via WS)
- Current conversation persisted to localStorage
- Unread indicators via `subscribeUnread()` in runtime

## Message Rendering

- Code blocks with syntax highlighting (Prism + oneDark)
- Copy button on code blocks
- Inline code styling
- Media: `MEDIA:/path` → inline image via Files API
- Tool status indicators during execution

## Keyboard Shortcuts

- `Enter` → Send
- `Shift+Enter` → Newline
- `Escape` → Cancel/abort generation

## Streaming Protocol

See `../architecture/STREAMING.md` for full details on the WebSocket streaming protocol, tool events, media URL injection, and bubble splitting.
