# Automna MVP Steps

**Date:** 2026-01-31  
**Status:** Planning  
**Target:** Production-ready MVP

---

## Current State

✅ Working:
- User signup/auth (Clerk)
- Per-user sandboxes (Cloudflare Moltworker)
- WebSocket chat with streaming
- Chat history (via HTTP fallback)
- Stripe billing integration

🔧 Needs improvement for MVP:
1. Load times (cold start)
2. History load time
3. File management
4. Chat UI/UX
5. Multiple chat channels

---

## Feature 1: Improve Load Times

### Problem
Cold starts take 30-90 seconds when sandbox hasn't been used recently. Users see a loading spinner for too long.

### Root Causes
1. Cloudflare Sandbox container spin-up (~10-15s)
2. R2 filesystem mount (~5-10s)
3. Clawdbot gateway boot (~10-20s)
4. Node.js + dependencies load time

### Solutions

#### 1.1 Keep-Alive Pings (Quick Win)
**Effort:** Low | **Impact:** High

Ping each active user's sandbox every 4 minutes to prevent hibernation.

```typescript
// Moltworker: Add keep-alive endpoint
app.get('/api/keepalive', async (c) => {
  const userId = c.get('userId');
  const sandbox = getSandbox(c.env.Sandbox, `user-${userId}`);
  
  // Simple ping to keep container warm
  const proc = await sandbox.startProcess('echo "ping"');
  await waitForProcess(proc, 5000);
  
  return c.json({ status: 'alive', timestamp: Date.now() });
});
```

```typescript
// Dashboard: Ping while user is active
useEffect(() => {
  if (!gatewayInfo) return;
  
  const interval = setInterval(() => {
    fetch('/api/keepalive').catch(() => {});
  }, 4 * 60 * 1000); // Every 4 minutes
  
  return () => clearInterval(interval);
}, [gatewayInfo]);
```

#### 1.2 Optimistic UI Loading (Quick Win)
**Effort:** Low | **Impact:** Medium

Show chat UI skeleton immediately while WebSocket connects in background.

```tsx
// Show skeleton while connecting
if (!isConnected) {
  return (
    <div className="flex flex-col h-full">
      <ChatSkeleton />
      <div className="text-center text-gray-500 py-4">
        <Spinner /> Connecting to your agent...
      </div>
    </div>
  );
}
```

#### 1.3 Progressive Loading States
**Effort:** Medium | **Impact:** High

Show granular progress during cold start:
1. "Initializing container..." (0-30%)
2. "Loading workspace..." (30-60%)
3. "Starting agent..." (60-90%)
4. "Ready!" (100%)

```typescript
// Moltworker: Add status endpoint with phases
app.get('/api/status', async (c) => {
  const sandbox = getSandbox(...);
  
  // Check container state
  const containerReady = await sandbox.isRunning();
  if (!containerReady) {
    return c.json({ phase: 'container', progress: 20, message: 'Starting container...' });
  }
  
  // Check filesystem
  const fsReady = await checkFilesystem(sandbox);
  if (!fsReady) {
    return c.json({ phase: 'filesystem', progress: 50, message: 'Loading workspace...' });
  }
  
  // Check gateway
  const gwReady = await checkGateway(sandbox);
  if (!gwReady) {
    return c.json({ phase: 'gateway', progress: 80, message: 'Starting agent...' });
  }
  
  return c.json({ phase: 'ready', progress: 100, message: 'Ready!' });
});
```

#### 1.4 Prewarming on Login (Medium Term)
**Effort:** Medium | **Impact:** High

When user logs in, immediately start warming their sandbox before they reach dashboard.

```typescript
// After Clerk auth, trigger prewarm
export async function POST(req: Request) {
  const { userId } = await auth();
  
  // Fire and forget - don't wait
  fetch(`${MOLTWORKER_URL}/api/prewarm`, {
    method: 'POST',
    headers: { 'X-User-Id': userId }
  }).catch(() => {});
  
  return redirect('/dashboard');
}
```

### Implementation Order
1. ⏱️ 1.2 Optimistic UI (1 hour)
2. ⏱️ 1.1 Keep-alive pings (2 hours)
3. ⏱️ 1.3 Progressive loading (4 hours)
4. ⏱️ 1.4 Prewarming (4 hours)

---

## Feature 2: Improve History Load Time

### Problem
History loads via HTTP fallback after WebSocket returns empty. This adds 1-3 seconds to initial load.

### Root Causes
1. WebSocket `chat.history` returns empty (Clawdbot bug)
2. HTTP fallback runs a Node script inside sandbox to read JSONL
3. Script execution has overhead

### Solutions

#### 2.1 Parallel History Fetch (Quick Win)
**Effort:** Low | **Impact:** Medium

Start HTTP history fetch immediately, don't wait for WebSocket to fail.

```typescript
// clawdbot-runtime.ts: Fetch history in parallel
useEffect(() => {
  // Start HTTP fetch immediately (don't wait for WS)
  const historyPromise = fetchHistoryHttp(gatewayUrl, sessionKey);
  
  // Also connect WebSocket
  const ws = new WebSocket(wsUrl);
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    // If WS returns history, use it
    if (msg.payload?.messages?.length > 0) {
      setMessages(msg.payload.messages);
      historyPromise.cancel(); // Don't use HTTP result
    }
  };
  
  // Use HTTP result if WS didn't return history within 2s
  setTimeout(async () => {
    if (messages.length === 0) {
      const httpHistory = await historyPromise;
      if (httpHistory?.length > 0) setMessages(httpHistory);
    }
  }, 2000);
}, []);
```

#### 2.2 Cache History in R2 (Medium Term)
**Effort:** Medium | **Impact:** High

Store pre-serialized history JSON in R2, updated on each message. Read directly without running Node script.

```typescript
// Moltworker: Direct R2 history read
app.get('/api/history', async (c) => {
  const userId = c.get('userId');
  const sessionKey = c.req.query('sessionKey') || 'main';
  
  // Read pre-cached history from R2
  const historyKey = `users/${userId}/history/${sessionKey}.json`;
  const cached = await c.env.R2.get(historyKey);
  
  if (cached) {
    return c.json(JSON.parse(await cached.text()));
  }
  
  // Fallback to JSONL parse (and cache result)
  const history = await parseJSONLHistory(sandbox, sessionKey);
  await c.env.R2.put(historyKey, JSON.stringify(history));
  
  return c.json(history);
});

// Update cache on new messages (in WebSocket handler)
async function onMessageComplete(userId, sessionKey, message) {
  const historyKey = `users/${userId}/history/${sessionKey}.json`;
  const cached = await c.env.R2.get(historyKey);
  const history = cached ? JSON.parse(await cached.text()) : { messages: [] };
  history.messages.push(message);
  await c.env.R2.put(historyKey, JSON.stringify(history));
}
```

#### 2.3 Lazy Load Old Messages
**Effort:** Low | **Impact:** Medium

Only load last 20 messages initially, fetch more on scroll.

```typescript
// Load recent messages first
const history = await fetchHistory({ limit: 20 });
setMessages(history);

// Load more on scroll to top
const handleScroll = async (e) => {
  if (e.target.scrollTop === 0 && hasMore) {
    const older = await fetchHistory({ before: messages[0].id, limit: 20 });
    setMessages([...older, ...messages]);
  }
};
```

### Implementation Order
1. ⏱️ 2.1 Parallel fetch (2 hours)
2. ⏱️ 2.3 Lazy load (3 hours)
3. ⏱️ 2.2 R2 cache (6 hours)

---

## Feature 3: File Management

### Requirements
1. Upload files to agent workspace
2. View agent's file system
3. Download files from agent
4. Hierarchical .md file viewer (agent's notes/docs)
5. Create/edit files in browser

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard UI                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │    Chat Panel       │  │    Files Panel              │   │
│  │                     │  │  ┌───────────────────────┐  │   │
│  │                     │  │  │  📁 workspace         │  │   │
│  │                     │  │  │  ├─ 📁 memory         │  │   │
│  │                     │  │  │  │  └─ 📄 notes.md    │  │   │
│  │                     │  │  │  ├─ 📁 projects       │  │   │
│  │                     │  │  │  └─ 📄 SOUL.md        │  │   │
│  │                     │  │  └───────────────────────┘  │   │
│  └─────────────────────┘  │  ┌───────────────────────┐  │   │
│                           │  │  File Preview / Edit  │  │   │
│                           │  │  (Markdown rendered)  │  │   │
│                           │  └───────────────────────┘  │   │
│                           └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### API Endpoints

```typescript
// Moltworker: File management endpoints

// List directory
app.get('/api/files', async (c) => {
  const path = c.req.query('path') || '/root/clawd';
  const sandbox = getSandbox(...);
  
  const proc = await sandbox.startProcess(`find "${path}" -maxdepth 1 -printf "%y %s %T@ %p\n"`);
  await waitForProcess(proc, 10000);
  
  const files = parseFileList(proc.stdout);
  return c.json({ path, files });
});

// Read file
app.get('/api/files/read', async (c) => {
  const path = c.req.query('path');
  const sandbox = getSandbox(...);
  
  const proc = await sandbox.startProcess(`cat "${path}"`);
  await waitForProcess(proc, 10000);
  
  return c.json({ path, content: proc.stdout });
});

// Write file
app.post('/api/files/write', async (c) => {
  const { path, content } = await c.req.json();
  const sandbox = getSandbox(...);
  
  // Write via heredoc
  const proc = await sandbox.startProcess(
    `cat > "${path}" << 'AUTOMNA_EOF'\n${content}\nAUTOMNA_EOF`
  );
  await waitForProcess(proc, 10000);
  
  return c.json({ success: true });
});

// Upload file
app.post('/api/files/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  const targetPath = formData.get('path') as string;
  
  const sandbox = getSandbox(...);
  const bytes = await file.arrayBuffer();
  
  // Write binary via base64
  const b64 = Buffer.from(bytes).toString('base64');
  const proc = await sandbox.startProcess(
    `echo "${b64}" | base64 -d > "${targetPath}"`
  );
  await waitForProcess(proc, 30000);
  
  return c.json({ success: true, path: targetPath });
});

// Download file
app.get('/api/files/download', async (c) => {
  const path = c.req.query('path');
  const sandbox = getSandbox(...);
  
  const proc = await sandbox.startProcess(`base64 "${path}"`);
  await waitForProcess(proc, 30000);
  
  const bytes = Buffer.from(proc.stdout, 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${basename(path)}"`
    }
  });
});

// Delete file
app.delete('/api/files', async (c) => {
  const path = c.req.query('path');
  const sandbox = getSandbox(...);
  
  // Use trash instead of rm for safety
  const proc = await sandbox.startProcess(`trash "${path}" 2>/dev/null || rm "${path}"`);
  await waitForProcess(proc, 10000);
  
  return c.json({ success: true });
});
```

### UI Components

#### File Tree
```tsx
// components/FileTree.tsx
function FileTree({ path, onSelect }: { path: string, onSelect: (file: File) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    fetch(`/api/files?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(data => setFiles(data.files));
  }, [path]);
  
  return (
    <div className="font-mono text-sm">
      {files.map(file => (
        <div key={file.path}>
          {file.type === 'directory' ? (
            <>
              <button 
                onClick={() => toggleExpanded(file.path)}
                className="flex items-center gap-1 hover:bg-gray-800 w-full px-2 py-1"
              >
                {expanded.has(file.path) ? '📂' : '📁'} {file.name}
              </button>
              {expanded.has(file.path) && (
                <div className="ml-4">
                  <FileTree path={file.path} onSelect={onSelect} />
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => onSelect(file)}
              className="flex items-center gap-1 hover:bg-gray-800 w-full px-2 py-1"
            >
              {getFileIcon(file.name)} {file.name}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

#### Markdown Viewer/Editor
```tsx
// components/MarkdownEditor.tsx
function MarkdownEditor({ path }: { path: string }) {
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    fetch(`/api/files/read?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(data => setContent(data.content));
  }, [path]);
  
  const save = async () => {
    setSaving(true);
    await fetch('/api/files/write', {
      method: 'POST',
      body: JSON.stringify({ path, content })
    });
    setSaving(false);
    setEditing(false);
  };
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center p-2 border-b border-gray-700">
        <span className="text-gray-400">{path}</span>
        <button onClick={() => editing ? save() : setEditing(true)}>
          {editing ? (saving ? 'Saving...' : 'Save') : 'Edit'}
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-gray-900 text-white p-4 font-mono"
          />
        ) : (
          <div className="prose prose-invert p-4">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
```

#### Upload Button
```tsx
// components/UploadButton.tsx
function UploadButton({ targetPath, onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', `${targetPath}/${file.name}`);
    
    await fetch('/api/files/upload', { method: 'POST', body: formData });
    setUploading(false);
    onComplete();
  };
  
  return (
    <>
      <input type="file" ref={inputRef} onChange={handleUpload} className="hidden" />
      <button onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? 'Uploading...' : '📤 Upload File'}
      </button>
    </>
  );
}
```

### Special: Agent Memory Viewer

Show the agent's memory files in a special "Memory" tab with nice formatting.

```tsx
// components/MemoryViewer.tsx
function MemoryViewer() {
  const memoryFiles = [
    { path: '/root/clawd/SOUL.md', label: 'Soul', icon: '✨' },
    { path: '/root/clawd/USER.md', label: 'About You', icon: '👤' },
    { path: '/root/clawd/MEMORY.md', label: 'Long-term Memory', icon: '🧠' },
    { path: '/root/clawd/TOOLS.md', label: 'Tools & Config', icon: '🔧' },
  ];
  
  const [selected, setSelected] = useState(memoryFiles[0]);
  
  return (
    <div className="flex h-full">
      <div className="w-48 border-r border-gray-700">
        {memoryFiles.map(f => (
          <button
            key={f.path}
            onClick={() => setSelected(f)}
            className={`w-full px-3 py-2 text-left ${
              selected.path === f.path ? 'bg-purple-900/50' : 'hover:bg-gray-800'
            }`}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1">
        <MarkdownEditor path={selected.path} />
      </div>
    </div>
  );
}
```

### Implementation Order
1. ⏱️ File list/read API (3 hours)
2. ⏱️ File tree UI (3 hours)
3. ⏱️ Markdown viewer (2 hours)
4. ⏱️ File upload API + UI (3 hours)
5. ⏱️ File edit/write (2 hours)
6. ⏱️ Memory viewer tab (2 hours)
7. ⏱️ Download files (1 hour)

**Total: ~16 hours**

---

## Feature 4: Better Chat Window

### Current Issues
- Basic styling (functional but not polished)
- No typing indicators
- No message timestamps
- No code highlighting
- No copy buttons
- Loading states could be better

### Improvements

#### 4.1 Visual Polish
```tsx
// Improved message styling
<Message 
  className={cn(
    "rounded-2xl px-4 py-3 max-w-[85%] shadow-sm",
    message.role === 'user' 
      ? "bg-purple-600 text-white ml-auto" 
      : "bg-gray-800 text-gray-100"
  )}
>
  <MessageContent />
  <MessageTimestamp className="text-xs opacity-60 mt-1" />
</Message>
```

#### 4.2 Typing Indicator
```tsx
// Show when agent is thinking
{isRunning && (
  <div className="flex gap-1 px-4 py-3 bg-gray-800 rounded-2xl w-fit">
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
)}
```

#### 4.3 Code Blocks with Copy
```tsx
// Custom code renderer
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="relative group">
      <SyntaxHighlighter language={language} style={oneDark}>
        {code}
      </SyntaxHighlighter>
      <button 
        onClick={copy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition"
      >
        {copied ? '✓ Copied' : '📋 Copy'}
      </button>
    </div>
  );
}
```

#### 4.4 Message Actions
```tsx
// Hover actions on messages
<Message>
  <MessageContent />
  <div className="opacity-0 group-hover:opacity-100 flex gap-2 mt-2">
    <button onClick={() => copyMessage()}>📋</button>
    <button onClick={() => regenerate()}>🔄</button>
    <button onClick={() => editMessage()}>✏️</button>
  </div>
</Message>
```

#### 4.5 Better Input
```tsx
// Improved composer
<Composer className="border-t border-gray-700 p-4">
  <div className="flex items-end gap-2 bg-gray-800 rounded-xl p-2">
    <Composer.AddAttachment className="p-2 hover:bg-gray-700 rounded-lg">
      📎
    </Composer.AddAttachment>
    <Composer.Input 
      placeholder="Message your agent..."
      className="flex-1 bg-transparent resize-none"
      rows={1}
      autoResize
    />
    <Composer.Send className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg">
      ➤
    </Composer.Send>
  </div>
  <Composer.Attachments className="mt-2" />
</Composer>
```

#### 4.6 Keyboard Shortcuts
- `Enter` → Send message
- `Shift+Enter` → New line
- `Escape` → Cancel generation
- `Cmd/Ctrl+K` → Focus input
- `↑` in empty input → Edit last message

#### 4.7 Error States
```tsx
// Inline error display
{error && (
  <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-200">
    <strong>Error:</strong> {error}
    <button onClick={retry} className="ml-2 underline">Retry</button>
  </div>
)}
```

### Implementation Order
1. ⏱️ 4.1 Visual polish (3 hours)
2. ⏱️ 4.2 Typing indicator (1 hour)
3. ⏱️ 4.3 Code blocks (2 hours)
4. ⏱️ 4.5 Better input (2 hours)
5. ⏱️ 4.4 Message actions (2 hours)
6. ⏱️ 4.6 Keyboard shortcuts (1 hour)
7. ⏱️ 4.7 Error states (1 hour)

**Total: ~12 hours**

---

## Feature 5: Multiple Chat Channels

### Concept
Users can have multiple conversation "channels" with their agent, each with its own context/history.

Use cases:
- "Work" channel for professional tasks
- "Personal" channel for private notes
- "Project X" channel for specific project
- Separate contexts for different topics

### Architecture

```
User Account
├── Channel: main (default)
│   └── Messages...
├── Channel: work
│   └── Messages...
└── Channel: personal
    └── Messages...
```

Each channel = separate Clawdbot session.

### API Changes

```typescript
// List channels
app.get('/api/channels', async (c) => {
  const userId = c.get('userId');
  const sandbox = getSandbox(...);
  
  // Read sessions from Clawdbot
  const proc = await sandbox.startProcess(`
    node -e "
      const fs = require('fs');
      const sessions = JSON.parse(fs.readFileSync('/root/.clawdbot/agents/main/sessions/sessions.json', 'utf-8'));
      console.log(JSON.stringify(Object.keys(sessions)));
    "
  `);
  await waitForProcess(proc, 10000);
  
  return c.json({ channels: JSON.parse(proc.stdout) });
});

// Create channel
app.post('/api/channels', async (c) => {
  const { name, description } = await c.req.json();
  const channelKey = slugify(name);
  
  // Clawdbot creates session on first message
  // Just return the key
  return c.json({ key: channelKey, name, description });
});

// Delete channel
app.delete('/api/channels/:key', async (c) => {
  const key = c.req.param('key');
  const sandbox = getSandbox(...);
  
  // Delete session via Clawdbot
  const proc = await sandbox.startProcess(`
    node -e "
      const fs = require('fs');
      const path = '/root/.clawdbot/agents/main/sessions/sessions.json';
      const sessions = JSON.parse(fs.readFileSync(path, 'utf-8'));
      delete sessions['${key}'];
      fs.writeFileSync(path, JSON.stringify(sessions, null, 2));
    "
  `);
  await waitForProcess(proc, 10000);
  
  return c.json({ success: true });
});
```

### UI Components

#### Channel Sidebar
```tsx
// components/ChannelSidebar.tsx
function ChannelSidebar({ current, onChange }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [creating, setCreating] = useState(false);
  
  useEffect(() => {
    fetch('/api/channels').then(r => r.json()).then(data => {
      // Always include 'main' as default
      const allChannels = [
        { key: 'main', name: 'General', icon: '💬' },
        ...data.channels.filter(k => k !== 'main').map(k => ({
          key: k, 
          name: k,
          icon: '📝'
        }))
      ];
      setChannels(allChannels);
    });
  }, []);
  
  return (
    <div className="w-48 border-r border-gray-700 flex flex-col">
      <div className="p-3 font-semibold border-b border-gray-700">
        Channels
      </div>
      <div className="flex-1 overflow-auto">
        {channels.map(ch => (
          <button
            key={ch.key}
            onClick={() => onChange(ch.key)}
            className={cn(
              "w-full px-3 py-2 text-left flex items-center gap-2",
              current === ch.key ? "bg-purple-900/50" : "hover:bg-gray-800"
            )}
          >
            {ch.icon} {ch.name}
          </button>
        ))}
      </div>
      <button 
        onClick={() => setCreating(true)}
        className="p-3 border-t border-gray-700 hover:bg-gray-800"
      >
        + New Channel
      </button>
      
      {creating && <NewChannelModal onClose={() => setCreating(false)} />}
    </div>
  );
}
```

#### Updated Dashboard Layout
```tsx
// app/dashboard/page.tsx
function DashboardPage() {
  const [currentChannel, setCurrentChannel] = useState('main');
  const [view, setView] = useState<'chat' | 'files' | 'memory'>('chat');
  
  return (
    <div className="h-screen flex">
      {/* Channel sidebar */}
      <ChannelSidebar current={currentChannel} onChange={setCurrentChannel} />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Tab bar */}
        <div className="flex border-b border-gray-700">
          <Tab active={view === 'chat'} onClick={() => setView('chat')}>💬 Chat</Tab>
          <Tab active={view === 'files'} onClick={() => setView('files')}>📁 Files</Tab>
          <Tab active={view === 'memory'} onClick={() => setView('memory')}>🧠 Memory</Tab>
        </div>
        
        {/* Content */}
        <div className="flex-1">
          {view === 'chat' && (
            <AutomnaChat 
              key={currentChannel} // Re-mount on channel change
              sessionKey={currentChannel}
            />
          )}
          {view === 'files' && <FileManager />}
          {view === 'memory' && <MemoryViewer />}
        </div>
      </div>
    </div>
  );
}
```

### Implementation Order
1. ⏱️ Channels API (3 hours)
2. ⏱️ Channel sidebar UI (2 hours)
3. ⏱️ Create/delete channels (2 hours)
4. ⏱️ Per-channel history loading (1 hour)
5. ⏱️ Channel switching (1 hour)

**Total: ~9 hours**

---

## MVP Timeline

### Week 1: Core Improvements

| Day | Tasks | Hours |
|-----|-------|-------|
| 1 | Load times: Optimistic UI + Keep-alive | 3 |
| 1 | History: Parallel fetch | 2 |
| 2 | Chat UI: Visual polish + Typing indicator | 4 |
| 2 | Chat UI: Code blocks + Copy | 2 |
| 3 | Chat UI: Better input + Actions | 4 |
| 3 | Load times: Progressive loading | 4 |
| 4 | File mgmt: List/Read API | 3 |
| 4 | File mgmt: Tree UI | 3 |
| 5 | File mgmt: Upload + Download | 4 |
| 5 | File mgmt: Markdown viewer | 2 |

**Week 1 Total: ~31 hours**

### Week 2: Features & Polish

| Day | Tasks | Hours |
|-----|-------|-------|
| 1 | File mgmt: Edit/Write | 2 |
| 1 | File mgmt: Memory viewer | 2 |
| 1 | Channels: API | 3 |
| 2 | Channels: Sidebar UI | 2 |
| 2 | Channels: Create/Delete | 2 |
| 2 | History: R2 cache | 6 |
| 3 | Chat UI: Keyboard shortcuts | 1 |
| 3 | Chat UI: Error states | 1 |
| 3 | Load times: Prewarming | 4 |
| 4 | Testing & Bug fixes | 8 |
| 5 | Final polish & Deploy | 8 |

**Week 2 Total: ~39 hours**

### Total Estimate: ~70 hours (2 weeks)

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Cold start time | <15s (with progress indicator) |
| Warm load time | <2s |
| History load time | <1s |
| File tree load time | <500ms |
| Chat message latency | <200ms (send to stream start) |

---

## Open Questions

1. **File size limits?** Max upload size, large file handling
2. **Channel limits?** Max channels per user (10? unlimited?)
3. **File types?** Allow all types or restrict to safe ones?
4. **Sync conflicts?** What if agent and user edit same file?
5. **Mobile?** Responsive design considerations

---

*Created: 2026-01-31*
