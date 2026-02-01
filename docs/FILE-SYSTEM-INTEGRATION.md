# File System Integration Spec

**Date:** 2026-02-01  
**Status:** Draft

How the file system integrates with our existing Automna architecture.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        automna.ai (Vercel)                          │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Landing Page │  │ Dashboard    │  │ API Routes               │   │
│  │ /            │  │ /dashboard   │  │ /api/user/sync           │   │
│  │ /joi         │  │              │  │ /api/user/gateway        │   │
│  │ /pricing     │  │ AutomnaChat  │  │ /api/webhooks/*          │   │
│  └──────────────┘  │ component    │  └──────────────────────────┘   │
│                    └──────┬───────┘                                  │
│                           │ WebSocket + HTTP                         │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Moltworker (Cloudflare Worker + Sandbox)                │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Routes (src/routes/api.ts)                                    │   │
│  │                                                               │   │
│  │  GET  /ws              → WebSocket upgrade (chat)             │   │
│  │  GET  /ws/api/history  → HTTP history fallback                │   │
│  │  GET  /api/keepalive   → Keep sandbox warm                    │   │
│  │  GET  /api/status      → Container status                     │   │
│  │  POST /api/reset-workspace → Clear user data                  │   │
│  │                                                               │   │
│  │  🆕 File APIs (to add):                                       │   │
│  │  GET  /api/files/list                                         │   │
│  │  GET  /api/files/read                                         │   │
│  │  POST /api/files/write                                        │   │
│  │  POST /api/files/upload                                       │   │
│  │  GET  /api/files/download                                     │   │
│  │  DELETE /api/files                                            │   │
│  │  ...                                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Cloudflare Sandbox (per-user Durable Object)                  │   │
│  │                                                               │   │
│  │  /root/clawd/          ← Agent workspace (filesystem)         │   │
│  │  /root/.clawdbot/      ← Clawdbot internals                   │   │
│  │  Clawdbot gateway      ← Running process (chat backend)       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ R2 Storage (moltbot-data bucket)                              │   │
│  │                                                               │   │
│  │  /users/{userId}/workspace/   ← Synced from sandbox           │   │
│  │  /users/{userId}/clawdbot/    ← Session data                  │   │
│  │  /users/{userId}/history/     ← Cached chat history           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### 1. Authentication (Reuse Existing)

File APIs use the same signed URL auth as WebSocket/history.

**Current auth flow:**
```typescript
// Dashboard fetches gateway URL with signed params
const response = await fetch('/api/user/gateway');
const { gatewayUrl } = await response.json();
// gatewayUrl = "wss://moltbot-sandbox.../ws?userId=xxx&exp=xxx&sig=xxx"
```

**For file APIs:**
```typescript
// Build file API URL from same gateway URL
function buildFileApiUrl(gatewayUrl: string, endpoint: string): string {
  const wsUrl = new URL(gatewayUrl);
  const httpUrl = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
  const baseUrl = `${httpUrl}//${wsUrl.host}`;
  
  const fileUrl = new URL(`${baseUrl}/api/files/${endpoint}`);
  
  // Copy auth params
  fileUrl.searchParams.set('userId', wsUrl.searchParams.get('userId')!);
  fileUrl.searchParams.set('exp', wsUrl.searchParams.get('exp')!);
  fileUrl.searchParams.set('sig', wsUrl.searchParams.get('sig')!);
  
  return fileUrl.toString();
}

// Usage
const listUrl = buildFileApiUrl(gatewayUrl, 'list');
const files = await fetch(`${listUrl}&path=/root/clawd`).then(r => r.json());
```

**Moltworker side:** File routes use existing `signedUrlAuth` middleware.

```typescript
// src/routes/api.ts - existing pattern
api.use('/*', signedUrlAuth);  // Already protects all /api/* routes

// New file routes automatically protected
api.get('/files/list', async (c) => {
  const userId = c.get('userId');  // From signedUrlAuth middleware
  const sandbox = c.get('sandbox');
  // ...
});
```

### 2. Moltworker File Routes

**Location:** `moltworker/src/routes/api.ts`

Add to existing `api` Hono router:

```typescript
// ============================================
// FILE MANAGEMENT APIs
// ============================================

const WORKSPACE_ROOT = '/root/clawd';
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;  // 50MB

// Validate path is within workspace
function validatePath(path: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = path.replace(/\/+/g, '/').replace(/\/$/, '');
  
  if (!normalized.startsWith(WORKSPACE_ROOT)) {
    return { valid: false, normalized, error: 'Path must be within workspace' };
  }
  if (normalized.includes('..')) {
    return { valid: false, normalized, error: 'Path traversal not allowed' };
  }
  if (normalized.startsWith('/root/.clawdbot')) {
    return { valid: false, normalized, error: 'Cannot access Clawdbot internals' };
  }
  
  return { valid: true, normalized };
}

// GET /api/files/list - List directory contents
api.get('/files/list', async (c) => {
  const sandbox = c.get('sandbox');
  const path = c.req.query('path') || WORKSPACE_ROOT;
  
  const { valid, normalized, error } = validatePath(path);
  if (!valid) return c.json({ error }, 400);
  
  try {
    // Use find command to get file info
    const cmd = `find "${normalized}" -maxdepth 1 -printf "%y|%s|%T@|%f\\n" 2>/dev/null | tail -n +2`;
    const proc = await sandbox.startProcess(cmd);
    await waitForProcess(proc, 10000);
    const logs = await proc.getLogs();
    
    const files = logs.stdout?.split('\n').filter(Boolean).map(line => {
      const [type, size, mtime, name] = line.split('|');
      return {
        name,
        path: `${normalized}/${name}`,
        type: type === 'd' ? 'directory' : 'file',
        size: parseInt(size),
        modified: new Date(parseFloat(mtime) * 1000).toISOString(),
      };
    }) || [];
    
    return c.json({ path: normalized, files });
  } catch (err) {
    return c.json({ error: 'Failed to list directory' }, 500);
  }
});

// GET /api/files/read - Read file contents
api.get('/files/read', async (c) => {
  const sandbox = c.get('sandbox');
  const path = c.req.query('path');
  const encoding = c.req.query('encoding') || 'utf-8';
  
  if (!path) return c.json({ error: 'Path required' }, 400);
  
  const { valid, normalized, error } = validatePath(path);
  if (!valid) return c.json({ error }, 400);
  
  try {
    // Check file size first
    const statProc = await sandbox.startProcess(`stat -c %s "${normalized}" 2>/dev/null`);
    await waitForProcess(statProc, 5000);
    const statLogs = await statProc.getLogs();
    const size = parseInt(statLogs.stdout?.trim() || '0');
    
    if (size > MAX_FILE_SIZE) {
      return c.json({ error: 'File too large', size, maxSize: MAX_FILE_SIZE }, 413);
    }
    
    // Read file
    const readCmd = encoding === 'base64' 
      ? `base64 "${normalized}"`
      : `cat "${normalized}"`;
    const proc = await sandbox.startProcess(readCmd);
    await waitForProcess(proc, 30000);
    const logs = await proc.getLogs();
    
    if (logs.stderr?.includes('No such file')) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    return c.json({
      path: normalized,
      content: logs.stdout || '',
      size,
      encoding,
    });
  } catch (err) {
    return c.json({ error: 'Failed to read file' }, 500);
  }
});

// POST /api/files/write - Write file contents
api.post('/files/write', async (c) => {
  const sandbox = c.get('sandbox');
  const body = await c.req.json();
  const { path, content, encoding = 'utf-8', createDirs = true } = body;
  
  if (!path || content === undefined) {
    return c.json({ error: 'Path and content required' }, 400);
  }
  
  const { valid, normalized, error } = validatePath(path);
  if (!valid) return c.json({ error }, 400);
  
  // Check content size
  const contentSize = encoding === 'base64' 
    ? Buffer.from(content, 'base64').length
    : Buffer.from(content).length;
  
  if (contentSize > MAX_FILE_SIZE) {
    return c.json({ error: 'Content too large', size: contentSize, maxSize: MAX_FILE_SIZE }, 413);
  }
  
  try {
    // Create parent directories if needed
    if (createDirs) {
      const dir = normalized.substring(0, normalized.lastIndexOf('/'));
      await sandbox.startProcess(`mkdir -p "${dir}"`);
    }
    
    // Write file using heredoc (safe for special chars)
    const writeCmd = encoding === 'base64'
      ? `echo "${content}" | base64 -d > "${normalized}"`
      : `cat > "${normalized}" << 'AUTOMNA_EOF'\n${content}\nAUTOMNA_EOF`;
    
    const proc = await sandbox.startProcess(writeCmd);
    await waitForProcess(proc, 30000);
    
    // Get new file stats
    const statProc = await sandbox.startProcess(`stat -c "%s|%Y" "${normalized}"`);
    await waitForProcess(statProc, 5000);
    const statLogs = await statProc.getLogs();
    const [size, mtime] = (statLogs.stdout?.trim() || '0|0').split('|');
    
    return c.json({
      success: true,
      path: normalized,
      size: parseInt(size),
      modified: new Date(parseInt(mtime) * 1000).toISOString(),
    });
  } catch (err) {
    return c.json({ error: 'Failed to write file' }, 500);
  }
});

// POST /api/files/upload - Upload file (multipart)
api.post('/files/upload', async (c) => {
  const sandbox = c.get('sandbox');
  
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const targetPath = formData.get('path') as string;
    
    if (!file || !targetPath) {
      return c.json({ error: 'File and path required' }, 400);
    }
    
    const { valid, normalized, error } = validatePath(targetPath);
    if (!valid) return c.json({ error }, 400);
    
    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json({ error: 'File too large', size: file.size, maxSize: MAX_UPLOAD_SIZE }, 413);
    }
    
    // Read file as base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    
    // Create parent directory
    const dir = normalized.substring(0, normalized.lastIndexOf('/'));
    await sandbox.startProcess(`mkdir -p "${dir}"`);
    
    // Write via base64 decode
    const proc = await sandbox.startProcess(`echo "${base64}" | base64 -d > "${normalized}"`);
    await waitForProcess(proc, 60000);  // Longer timeout for uploads
    
    return c.json({
      success: true,
      path: normalized,
      size: file.size,
      mimeType: file.type,
    });
  } catch (err) {
    return c.json({ error: 'Upload failed' }, 500);
  }
});

// GET /api/files/download - Download file
api.get('/files/download', async (c) => {
  const sandbox = c.get('sandbox');
  const path = c.req.query('path');
  
  if (!path) return c.json({ error: 'Path required' }, 400);
  
  const { valid, normalized, error } = validatePath(path);
  if (!valid) return c.json({ error }, 400);
  
  try {
    // Read file as base64
    const proc = await sandbox.startProcess(`base64 "${normalized}"`);
    await waitForProcess(proc, 60000);
    const logs = await proc.getLogs();
    
    if (logs.stderr?.includes('No such file')) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    const bytes = Buffer.from(logs.stdout || '', 'base64');
    const filename = normalized.split('/').pop() || 'download';
    
    // Guess content type
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'ts': 'application/typescript',
    };
    const contentType = contentTypes[ext || ''] || 'application/octet-stream';
    
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': bytes.length.toString(),
      },
    });
  } catch (err) {
    return c.json({ error: 'Download failed' }, 500);
  }
});

// DELETE /api/files - Delete file (move to trash)
api.delete('/files', async (c) => {
  const sandbox = c.get('sandbox');
  const path = c.req.query('path');
  const permanent = c.req.query('permanent') === 'true';
  
  if (!path) return c.json({ error: 'Path required' }, 400);
  
  const { valid, normalized, error } = validatePath(path);
  if (!valid) return c.json({ error }, 400);
  
  try {
    if (permanent) {
      // Permanent delete
      const proc = await sandbox.startProcess(`rm -rf "${normalized}"`);
      await waitForProcess(proc, 10000);
    } else {
      // Move to trash
      const trashDir = `${WORKSPACE_ROOT}/.trash`;
      const timestamp = Date.now();
      const filename = normalized.split('/').pop();
      const trashPath = `${trashDir}/${filename}.${timestamp}`;
      
      await sandbox.startProcess(`mkdir -p "${trashDir}"`);
      const proc = await sandbox.startProcess(`mv "${normalized}" "${trashPath}"`);
      await waitForProcess(proc, 10000);
      
      return c.json({
        success: true,
        path: normalized,
        trashPath,
        trashedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
    
    return c.json({ success: true, path: normalized });
  } catch (err) {
    return c.json({ error: 'Delete failed' }, 500);
  }
});

// POST /api/files/mkdir - Create directory
api.post('/files/mkdir', async (c) => {
  const sandbox = c.get('sandbox');
  const { path } = await c.req.json();
  
  if (!path) return c.json({ error: 'Path required' }, 400);
  
  const { valid, normalized, error } = validatePath(path);
  if (!valid) return c.json({ error }, 400);
  
  try {
    const proc = await sandbox.startProcess(`mkdir -p "${normalized}"`);
    await waitForProcess(proc, 10000);
    
    return c.json({ success: true, path: normalized });
  } catch (err) {
    return c.json({ error: 'Failed to create directory' }, 500);
  }
});
```

### 3. Dashboard File Context

**Location:** `landing/src/lib/file-context.tsx`

Create a React context to share file API utilities across components:

```typescript
'use client';

import { createContext, useContext, useCallback, useState, ReactNode } from 'react';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

interface FileContextType {
  // State
  currentPath: string;
  files: FileItem[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  listDirectory: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  uploadFile: (file: File, targetPath: string) => Promise<void>;
  downloadFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const FileContext = createContext<FileContextType | null>(null);

interface FileProviderProps {
  gatewayUrl: string;
  children: ReactNode;
}

export function FileProvider({ gatewayUrl, children }: FileProviderProps) {
  const [currentPath, setCurrentPath] = useState('/root/clawd');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Build API URL from gateway URL
  const buildUrl = useCallback((endpoint: string, params?: Record<string, string>) => {
    const wsUrl = new URL(gatewayUrl);
    const httpUrl = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    const baseUrl = `${httpUrl}//${wsUrl.host}`;
    
    const url = new URL(`${baseUrl}/api/files/${endpoint}`);
    url.searchParams.set('userId', wsUrl.searchParams.get('userId')!);
    url.searchParams.set('exp', wsUrl.searchParams.get('exp')!);
    url.searchParams.set('sig', wsUrl.searchParams.get('sig')!);
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    
    return url.toString();
  }, [gatewayUrl]);
  
  const listDirectory = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const url = buildUrl('list', { path });
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error);
      
      setCurrentPath(path);
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list directory');
    } finally {
      setIsLoading(false);
    }
  }, [buildUrl]);
  
  const readFile = useCallback(async (path: string): Promise<string> => {
    const url = buildUrl('read', { path });
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    return data.content;
  }, [buildUrl]);
  
  const writeFile = useCallback(async (path: string, content: string) => {
    const url = buildUrl('write');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
  }, [buildUrl]);
  
  const uploadFile = useCallback(async (file: File, targetPath: string) => {
    const url = buildUrl('upload');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', targetPath);
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
  }, [buildUrl]);
  
  const downloadFile = useCallback(async (path: string) => {
    const url = buildUrl('download', { path });
    const response = await fetch(url);
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error);
    }
    
    const blob = await response.blob();
    const filename = path.split('/').pop() || 'download';
    
    // Trigger browser download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [buildUrl]);
  
  const deleteFile = useCallback(async (path: string) => {
    const url = buildUrl('', { path });  // DELETE /api/files?path=...
    const response = await fetch(url, { method: 'DELETE' });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
  }, [buildUrl]);
  
  const createDirectory = useCallback(async (path: string) => {
    const url = buildUrl('mkdir');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
  }, [buildUrl]);
  
  const refresh = useCallback(async () => {
    await listDirectory(currentPath);
  }, [listDirectory, currentPath]);
  
  return (
    <FileContext.Provider value={{
      currentPath,
      files,
      isLoading,
      error,
      listDirectory,
      readFile,
      writeFile,
      uploadFile,
      downloadFile,
      deleteFile,
      createDirectory,
      refresh,
    }}>
      {children}
    </FileContext.Provider>
  );
}

export function useFiles() {
  const context = useContext(FileContext);
  if (!context) throw new Error('useFiles must be used within FileProvider');
  return context;
}
```

### 4. Dashboard Layout Update

**Location:** `landing/src/app/dashboard/page.tsx`

Add Files tab alongside Chat:

```typescript
// Current layout:
// ┌─────────────────────────────────────────────────┐
// │ Sidebar │         Chat                          │
// │         │                                       │
// └─────────────────────────────────────────────────┘

// New layout:
// ┌─────────────────────────────────────────────────┐
// │ Sidebar │ [💬 Chat] [📁 Files] [🧠 Memory]      │
// │         │                                       │
// │         │  (Tab content)                        │
// └─────────────────────────────────────────────────┘

// Add to dashboard page:
import { FileProvider } from '@/lib/file-context';
import { FileBrowser } from '@/components/FileBrowser';
import { MemoryViewer } from '@/components/MemoryViewer';

type TabView = 'chat' | 'files' | 'memory';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabView>('chat');
  
  // ... existing gateway loading logic ...
  
  return (
    <FileProvider gatewayUrl={gatewayInfo.gatewayUrl}>
      <div className="h-screen flex">
        {/* Sidebar - unchanged */}
        <ConversationSidebar ... />
        
        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-gray-800 bg-gray-900/50">
            <TabButton 
              active={activeTab === 'chat'} 
              onClick={() => setActiveTab('chat')}
            >
              💬 Chat
            </TabButton>
            <TabButton 
              active={activeTab === 'files'} 
              onClick={() => setActiveTab('files')}
            >
              📁 Files
            </TabButton>
            <TabButton 
              active={activeTab === 'memory'} 
              onClick={() => setActiveTab('memory')}
            >
              🧠 Memory
            </TabButton>
          </div>
          
          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'chat' && (
              <AutomnaChat 
                key={currentConversation}
                gatewayUrl={gatewayInfo.gatewayUrl}
                sessionKey={currentConversation}
              />
            )}
            {activeTab === 'files' && (
              <FileBrowser />
            )}
            {activeTab === 'memory' && (
              <MemoryViewer />
            )}
          </div>
        </div>
      </div>
    </FileProvider>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition-colors ${
        active 
          ? 'text-white border-b-2 border-purple-500' 
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
```

### 5. Chat File Attachments

**Location:** `landing/src/components/AutomnaChat.tsx`

Add file attachment support to the chat input:

```typescript
// Add to AutomnaChat component

const [attachments, setAttachments] = useState<File[]>([]);
const fileInputRef = useRef<HTMLInputElement>(null);
const { uploadFile } = useFiles();

const handleAttachment = (e: ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  setAttachments(prev => [...prev, ...files]);
};

const removeAttachment = (index: number) => {
  setAttachments(prev => prev.filter((_, i) => i !== index));
};

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  if (!input.trim() && attachments.length === 0) return;
  if (isRunning) return;
  
  // Upload attachments first
  const uploadedPaths: string[] = [];
  for (const file of attachments) {
    const targetPath = `/root/clawd/uploads/${file.name}`;
    await uploadFile(file, targetPath);
    uploadedPaths.push(targetPath);
  }
  
  // Build message with attachment references
  let messageText = input;
  if (uploadedPaths.length > 0) {
    const attachmentRefs = uploadedPaths.map(p => `[Attached: ${p}]`).join('\n');
    messageText = `${attachmentRefs}\n\n${input}`;
  }
  
  append({
    role: 'user',
    content: [{ type: 'text', text: messageText }],
  });
  
  setInput('');
  setAttachments([]);
};

// In the render, add attachment button and preview:
<div className="p-4 border-t border-gray-800/50 bg-gray-900/50">
  {/* Attachment previews */}
  {attachments.length > 0 && (
    <div className="flex flex-wrap gap-2 mb-3">
      {attachments.map((file, i) => (
        <div key={i} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
          <span className="text-sm text-gray-300">{file.name}</span>
          <button onClick={() => removeAttachment(i)} className="text-gray-500 hover:text-red-400">
            ✕
          </button>
        </div>
      ))}
    </div>
  )}
  
  <form onSubmit={handleSubmit}>
    <div className="flex items-end gap-3 bg-gray-800/80 rounded-2xl p-3">
      {/* Attachment button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
      >
        📎
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleAttachment}
        className="hidden"
      />
      
      {/* Text input - unchanged */}
      <textarea ... />
      
      {/* Send button - unchanged */}
      <button ... />
    </div>
  </form>
</div>
```

### 6. File Cards in Messages

**Location:** `landing/src/components/MessageContent.tsx`

Parse `[[file:path]]` syntax and render as downloadable cards:

```typescript
// Add to segment types
type Segment = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'inline-code'; content: string }
  | { type: 'file'; path: string };  // NEW

// Add file card regex
const fileRefRegex = /\[\[file:(\/[^\]]+)\]\]/g;

// Add FileCard component
function FileCard({ path }: { path: string }) {
  const { downloadFile } = useFiles();
  const filename = path.split('/').pop() || 'file';
  const ext = filename.split('.').pop()?.toLowerCase();
  
  // Icon by extension
  const icons: Record<string, string> = {
    pdf: '📄',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    md: '📝',
    txt: '📝',
    json: '📋',
    csv: '📊',
  };
  const icon = icons[ext || ''] || '📁';
  
  return (
    <div className="inline-flex items-center gap-3 bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 my-2">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{filename}</div>
        <div className="text-xs text-gray-400">{path}</div>
      </div>
      <button
        onClick={() => downloadFile(path)}
        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
      >
        ⬇️ Download
      </button>
    </div>
  );
}

// Update parseContent to handle file refs
function parseContent(text: string): Segment[] {
  // ... existing code ...
  
  // Add file ref parsing (after code blocks, before inline code)
  // ... 
}
```

### 7. Live Updates (Polling)

When the file browser tab is active, poll for changes every 5 seconds so users see agent-created files appear automatically.

**Location:** `landing/src/components/FileBrowser.tsx`

```typescript
// Poll for file changes when tab is active
useEffect(() => {
  if (!isVisible) return;
  
  // Initial load
  refresh();
  
  // Poll every 5 seconds
  const interval = setInterval(() => {
    refresh();
  }, 5000);
  
  return () => clearInterval(interval);
}, [isVisible, currentPath]);

// Optimized refresh - only update if files changed
const refresh = useCallback(async () => {
  const newFiles = await listDirectory(currentPath);
  
  // Compare with current files to avoid unnecessary re-renders
  const hasChanged = !areFilesEqual(files, newFiles);
  if (hasChanged) {
    setFiles(newFiles);
  }
}, [currentPath, files]);

// Deep comparison helper
function areFilesEqual(a: FileItem[], b: FileItem[]): boolean {
  if (a.length !== b.length) return false;
  
  const aMap = new Map(a.map(f => [f.path, f.modified]));
  return b.every(f => aMap.get(f.path) === f.modified);
}
```

**Behavior:**
- Only polls when Files tab is active (not in background)
- Compares file list before updating to avoid flicker
- Uses `modified` timestamp to detect changes
- 5-second interval balances freshness vs API load

**Future enhancement:** WebSocket file events for instant updates without polling.

### 8. R2 Sync (Already Working)

Files in `/root/clawd/` are already synced to R2 automatically via:
- Keep-alive pings (every 4 min)
- WebSocket disconnect
- First history load

No changes needed - user files will persist automatically.

---

## File Tree

```
automna/
├── moltworker/
│   └── src/
│       └── routes/
│           └── api.ts           # ADD: File API endpoints
│
└── landing/
    └── src/
        ├── lib/
        │   └── file-context.tsx  # NEW: File API context
        │
        ├── components/
        │   ├── AutomnaChat.tsx   # EDIT: Add attachment support
        │   ├── MessageContent.tsx # EDIT: Add file card parsing
        │   ├── FileBrowser.tsx   # NEW: File tree + preview
        │   └── MemoryViewer.tsx  # NEW: Agent memory view
        │
        └── app/
            └── dashboard/
                └── page.tsx      # EDIT: Add Files/Memory tabs
```

---

## Implementation Order

### Phase 1: Backend (Moltworker) - 4 hours
1. Add `validatePath()` utility
2. Add `/api/files/list` endpoint
3. Add `/api/files/read` endpoint  
4. Add `/api/files/write` endpoint
5. Add `/api/files/upload` endpoint
6. Add `/api/files/download` endpoint
7. Add `/api/files/delete` endpoint
8. Add `/api/files/mkdir` endpoint
9. Deploy moltworker

### Phase 2: File Context - 1 hour
1. Create `file-context.tsx`
2. Add to dashboard layout

### Phase 3: File Browser UI - 4 hours
1. Create `FileBrowser.tsx` component
2. Tree view with expand/collapse
3. File preview panel
4. Markdown renderer
5. Code syntax highlighting

### Phase 4: File Editor - 2 hours
1. Add Monaco editor
2. Edit mode toggle
3. Save/discard functionality

### Phase 5: Chat Integration - 2 hours
1. Add attachment button to chat input
2. Upload attachments on send
3. Parse `[[file:path]]` in messages
4. Render FileCard components

### Phase 6: Memory Viewer - 2 hours
1. Create `MemoryViewer.tsx`
2. Tab navigation (Soul, User, Memory, Tools)
3. Rendered markdown view
4. Edit button linking to editor

### Phase 7: Live Updates - 1 hour
1. Polling when Files tab active
2. Smart comparison to avoid flicker
3. Loading indicator during refresh

### Phase 8: Polish - 2 hours
1. Drag-drop upload
2. Loading states
3. Error handling
4. Mobile responsive

---

## Testing

### API Tests (Moltworker)
```typescript
describe('File APIs', () => {
  test('list directory returns files', async () => { ... });
  test('read file returns content', async () => { ... });
  test('write file creates/updates file', async () => { ... });
  test('upload file saves binary', async () => { ... });
  test('path validation blocks traversal', async () => { ... });
  test('size limits enforced', async () => { ... });
});
```

### E2E Tests (Playwright)
```typescript
test('user can upload and download file', async () => {
  // Upload file
  // Verify in file browser
  // Download and compare
});

test('user can edit config file', async () => {
  // Open SOUL.md
  // Edit content
  // Save
  // Refresh and verify
});

test('file attachment in chat works', async () => {
  // Attach file to message
  // Send message
  // Verify agent receives file reference
});
```

---

*Last updated: 2026-02-01*
