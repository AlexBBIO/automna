# Automna Chat UI Specification

**Date:** 2026-01-29  
**Status:** Planning

---

## Overview

Build a custom chat interface for Automna using **assistant-ui** (open source, MIT, YC-backed) that connects to Clawdbot's WebSocket API.

**Why assistant-ui:**
- Production-grade streaming, auto-scroll, accessibility
- Composable primitives (Radix-style, not monolithic)
- Built-in attachments/file upload support
- Works with custom backends
- 50k+ monthly downloads, used by LangChain, Stack AI
- MIT licensed

**Links:**
- GitHub: https://github.com/assistant-ui/assistant-ui
- Docs: https://www.assistant-ui.com/docs
- NPM: @assistant-ui/react

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Automna Dashboard                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  assistant-ui Components               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  │  │
│  │  │ ThreadList  │ │ MessageList │ │ ComposerInput   │  │  │
│  │  │             │ │             │ │ + Attachments   │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                 │
│                            ▼                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Clawdbot Runtime Adapter                  │  │
│  │  - Translates assistant-ui calls → Clawdbot WS API    │  │
│  │  - Handles streaming events → UI state                │  │
│  │  - Manages file uploads                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │ WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Clawdbot Gateway                          │
│                    (User's Container)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Basic Chat (MVP)

**Components from assistant-ui:**
- `<Thread>` - Main chat container
- `<ThreadScrollArea>` - Auto-scrolling message list
- `<Message>` - Individual message bubbles
- `<Composer>` - Input with send button
- `<AssistantMessage>` / `<UserMessage>` - Message variants

**Custom Runtime Adapter:**

```typescript
// lib/clawdbot-runtime.ts
import { 
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessage,
  type AssistantRuntime
} from "@assistant-ui/react";

interface ClawdbotRuntimeConfig {
  gatewayUrl: string;      // ws://localhost:18789 or via proxy
  sessionKey?: string;     // defaults to 'main'
  authToken?: string;      // internal proxy auth
}

export function useClawdbotRuntime(config: ClawdbotRuntimeConfig): AssistantRuntime {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to Clawdbot gateway
  useEffect(() => {
    const ws = new WebSocket(config.gatewayUrl);
    
    ws.onopen = () => {
      // Send connect with auth
      ws.send(JSON.stringify({
        type: 'req',
        id: crypto.randomUUID(),
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: { id: 'automna-chat', version: '1.0.0', mode: 'operator' },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          auth: { token: config.authToken }
        }
      }));
      
      // Load history
      ws.send(JSON.stringify({
        type: 'req',
        id: crypto.randomUUID(),
        method: 'chat.history',
        params: { sessionKey: config.sessionKey || 'main' }
      }));
    };
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleGatewayMessage(msg);
    };
    
    wsRef.current = ws;
    return () => ws.close();
  }, [config]);

  // Handle incoming gateway messages
  function handleGatewayMessage(msg: any) {
    if (msg.type === 'res' && msg.payload?.messages) {
      // History response
      setMessages(msg.payload.messages.map(convertToThreadMessage));
    }
    if (msg.type === 'event' && msg.event === 'chat') {
      // Streaming response
      const { role, content, status } = msg.payload;
      if (status === 'streaming') {
        // Update last assistant message with new content
        updateStreamingMessage(content);
      } else if (status === 'complete') {
        setIsRunning(false);
      }
    }
  }

  // Send message
  async function send(message: string, attachments?: File[]) {
    setIsRunning(true);
    
    // Add user message to UI immediately
    const userMsg: ThreadMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: message }],
      createdAt: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    
    // Handle attachments if any
    let attachmentRefs = [];
    if (attachments?.length) {
      attachmentRefs = await uploadAttachments(attachments);
    }
    
    // Send to Clawdbot
    wsRef.current?.send(JSON.stringify({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'chat.send',
      params: {
        sessionKey: config.sessionKey || 'main',
        message,
        attachments: attachmentRefs
      }
    }));
  }

  // Abort generation
  function abort() {
    wsRef.current?.send(JSON.stringify({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'chat.abort',
      params: { sessionKey: config.sessionKey || 'main' }
    }));
    setIsRunning(false);
  }

  return useExternalStoreRuntime({
    messages,
    isRunning,
    onNew: (msg) => send(msg.content[0].text, msg.attachments),
    onCancel: abort,
    convertMessage: convertToThreadMessage
  });
}
```

**Chat Component:**

```tsx
// components/AutomnaChat.tsx
'use client';

import { Thread } from "@assistant-ui/react";
import { useClawdbotRuntime } from "@/lib/clawdbot-runtime";
import { makeMarkdownText } from "@assistant-ui/react-markdown";

const MarkdownText = makeMarkdownText();

interface AutomnaChatProps {
  userId: string;
}

export function AutomnaChat({ userId }: AutomnaChatProps) {
  const runtime = useClawdbotRuntime({
    gatewayUrl: `/api/ws/${userId}`,  // Proxied through our backend
    sessionKey: 'main'
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-full flex flex-col bg-gray-950 text-white">
        <Thread 
          assistantMessage={{ components: { Text: MarkdownText } }}
          // Custom styling
          className="flex-1"
        />
      </div>
    </AssistantRuntimeProvider>
  );
}
```

### Phase 2: File & Image Support

**Uploading Files:**

assistant-ui has built-in attachment support via `<Composer.Attachments>`.

```tsx
// Enable attachments in composer
<Composer.Root>
  <Composer.Attachments />  {/* Shows attached files */}
  <Composer.AddAttachment /> {/* File picker button */}
  <Composer.Input placeholder="Type a message..." />
  <Composer.Send />
</Composer.Root>
```

**File Upload Handler:**

```typescript
// Upload to Clawdbot's workspace or our storage
async function uploadAttachments(files: File[]): Promise<AttachmentRef[]> {
  const refs = [];
  
  for (const file of files) {
    // Option 1: Upload to Clawdbot workspace
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`/api/a/${userId}/upload`, {
      method: 'POST',
      body: formData
    });
    
    const { path } = await res.json();
    refs.push({ type: 'file', path, name: file.name });
  }
  
  return refs;
}
```

**Receiving Images:**

Clawdbot can return images (screenshots, generated images, etc.). Handle in message rendering:

```tsx
// Custom message content renderer
function MessageContent({ content }) {
  return content.map((part, i) => {
    if (part.type === 'text') {
      return <MarkdownText key={i} text={part.text} />;
    }
    if (part.type === 'image') {
      return (
        <img 
          key={i}
          src={part.url || `data:${part.mimeType};base64,${part.data}`}
          alt={part.alt || 'Image'}
          className="max-w-full rounded-lg"
        />
      );
    }
    if (part.type === 'file') {
      return (
        <a 
          key={i}
          href={part.url}
          download={part.name}
          className="flex items-center gap-2 p-2 bg-gray-800 rounded"
        >
          <FileIcon /> {part.name}
        </a>
      );
    }
  });
}
```

### Phase 3: Rich Content / Artifacts

**Clawdbot Canvas:**

Clawdbot has a `canvas` tool that can present HTML/JS content to nodes. For web UI, we can render these inline or in a split view.

**Artifact Types:**
- Code with preview (HTML/CSS/JS)
- Interactive charts
- Data tables
- Forms for user input
- Embedded iframes

**Implementation:**

```tsx
// Detect canvas/artifact content in messages
function MessageContent({ content }) {
  return content.map((part, i) => {
    // ... text and image handling ...
    
    if (part.type === 'tool_call' && part.name === 'canvas') {
      return <ArtifactPreview key={i} artifact={part} />;
    }
  });
}

// Artifact preview component
function ArtifactPreview({ artifact }) {
  const [showPreview, setShowPreview] = useState(true);
  
  if (artifact.action === 'present') {
    return (
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-3 py-2 flex justify-between">
          <span>Preview</span>
          <button onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? 'Hide' : 'Show'}
          </button>
        </div>
        {showPreview && (
          <iframe
            srcDoc={artifact.params.html}
            className="w-full h-64 bg-white"
            sandbox="allow-scripts"
          />
        )}
      </div>
    );
  }
  
  // Handle other artifact types...
}
```

**Future: Split View:**

For complex artifacts, show a split view like Claude:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │                     │  │                             │  │
│  │    Chat Messages    │  │    Artifact Preview         │  │
│  │                     │  │    (Code, Charts, etc.)     │  │
│  │                     │  │                             │  │
│  │                     │  │                             │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Styling / Theming

**Dark theme to match Automna:**

assistant-ui uses CSS variables and Tailwind. We customize:

```css
/* globals.css */
.aui-root {
  --aui-bg: theme('colors.gray.950');
  --aui-text: theme('colors.white');
  --aui-border: theme('colors.gray.800');
  --aui-user-bg: theme('colors.blue.600');
  --aui-assistant-bg: theme('colors.gray.900');
  --aui-input-bg: theme('colors.gray.900');
  --aui-input-border: theme('colors.gray.700');
}
```

**Or use shadcn/ui theme:**

assistant-ui provides a shadcn-compatible theme we can customize:

```bash
npx assistant-ui init --theme shadcn
```

---

## WebSocket Proxy (for auth)

Since we're using same-origin auth, the WebSocket goes through our proxy:

```typescript
// app/api/ws/[userId]/route.ts
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request, { params }) {
  const { userId } = await auth();
  const agent = await getAgentBackend(userId);
  
  // Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req);
  // Or use ws library for Node.js
  
  // Connect to backend
  const backendUrl = agent.backendType === 'local'
    ? `ws://localhost:${agent.containerPort}`
    : `ws://${agent.vmIp}:${agent.vmPort}`;
    
  const backendWs = new WebSocket(backendUrl);
  
  // Add internal auth to backend connect
  backendWs.onopen = () => {
    // Inject auth into the connect flow
  };
  
  // Relay messages
  socket.onmessage = (e) => backendWs.send(e.data);
  backendWs.onmessage = (e) => socket.send(e.data);
  
  return response;
}
```

---

## Feature Matrix

| Feature | Phase | Status |
|---------|-------|--------|
| Basic chat with streaming | 1 | Planned |
| Message history | 1 | Planned |
| Abort generation | 1 | Planned |
| Markdown rendering | 1 | Planned |
| Code highlighting | 1 | Planned |
| Image upload | 2 | Planned |
| File upload | 2 | Planned |
| Image display (from agent) | 2 | Planned |
| File download | 2 | Planned |
| Typing indicators | 2 | Planned |
| Tool call visualization | 3 | Planned |
| Artifact previews | 3 | Planned |
| Split view layout | 3 | Planned |
| Voice input (dictation) | 4 | Future |
| Voice output (TTS) | 4 | Future |

---

## Dependencies

```json
{
  "dependencies": {
    "@assistant-ui/react": "^0.5.x",
    "@assistant-ui/react-markdown": "^0.2.x",
    "react-syntax-highlighter": "^15.x"
  }
}
```

**Bundle size:** assistant-ui core is ~15KB gzipped.

---

## Alternatives Considered

| Library | Pros | Cons | Decision |
|---------|------|------|----------|
| **assistant-ui** | Purpose-built for AI, streaming, attachments | Newer library | ✅ Use this |
| Build from scratch | Full control | Lots of work, reinventing wheel | ❌ |
| Vercel AI SDK UI | Good streaming | Less customizable, tied to their SDK | ❌ |
| Stream Chat React | Battle-tested | Designed for human chat, not AI | ❌ |
| Fork Clawdbot UI | Already works | Lit not React, hard to customize | ❌ |

---

## Next Steps

1. **Install assistant-ui** in landing project
2. **Create ClawdbotRuntimeAdapter** to connect to gateway WS
3. **Build basic chat page** at `/a/[userId]/chat`
4. **Test with prototype container** at test.automna.ai
5. **Add file upload** support
6. **Add artifact preview** for canvas tool calls

---

*Last updated: 2026-01-29*
