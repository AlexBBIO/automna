# File System Specification

**Date:** 2026-02-01  
**Status:** Draft  
**Priority:** High (core MVP feature)

---

## Overview

The file system gives users visibility into their agent's workspace and enables seamless file exchange between human and agent. It's not just a file browser - it's the shared workspace where human and agent collaborate.

---

## User Stories

### As a user, I want to...

1. **Upload files to my agent** so it can work with my documents, images, data
2. **Download files my agent creates** (reports, code, images, exports)
3. **Browse my agent's workspace** to see what it's working on
4. **Edit config files** (SOUL.md, USER.md) to customize my agent's personality
5. **View my agent's memory** to understand what it remembers
6. **Attach files to chat messages** for quick sharing
7. **Save chat outputs to files** when agent generates something useful
8. **Search for files** when my workspace grows large
9. **Preview files** without downloading (images, markdown, code)
10. **Recover deleted files** if I make a mistake

### As an agent, I want to...

1. **Access uploaded files** immediately after user uploads
2. **Create files the user can download** from chat or file browser
3. **Reference files in responses** with clickable links
4. **Store user-shared content** for later reference
5. **Organize my workspace** with folders the user can see

---

## Architecture

### File Locations

```
/root/clawd/                          # Agent workspace root
├── SOUL.md                           # Agent personality (user-editable)
├── USER.md                           # Info about user (user-editable)
├── MEMORY.md                         # Long-term memory (read-only for user)
├── TOOLS.md                          # Tool configs (user-editable)
├── AGENTS.md                         # Agent instructions (advanced users)
├── IDENTITY.md                       # Agent identity (user-editable)
├── HEARTBEAT.md                      # Periodic tasks (user-editable)
├── memory/                           # Daily notes
│   ├── 2026-02-01.md
│   └── ...
├── uploads/                          # User-uploaded files
│   ├── documents/
│   ├── images/
│   └── data/
├── outputs/                          # Agent-generated files
│   ├── reports/
│   ├── exports/
│   └── ...
├── projects/                         # Project workspaces
│   └── [project-name]/
└── .trash/                           # Soft-deleted files (7 day retention)
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User Actions                               │
├─────────────────────────────────────────────────────────────────────┤
│  Upload file    │  Download file  │  Edit file    │  Delete file    │
└────────┬────────┴────────┬────────┴───────┬───────┴────────┬────────┘
         │                 │                │                │
         ▼                 ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Dashboard API (Next.js)                          │
│   /api/files/upload  │  /api/files/read  │  /api/files/write  │ ... │
└─────────────────────────────────────────────────────────────────────┘
         │                 │                │                │
         ▼                 ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Moltworker File APIs                               │
│  Runs commands in user's sandbox container                           │
│  All paths validated, sandboxed to /root/clawd                       │
└─────────────────────────────────────────────────────────────────────┘
         │                 │                │                │
         ▼                 ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Sandbox                                │
│              User's isolated container filesystem                    │
│                    Persisted to R2 storage                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Specification

### Base URL
All file APIs are on the Moltworker: `https://moltbot-sandbox.alex-0bb.workers.dev/api/files/*`

All requests require signed URL auth (same as WebSocket/history).

### Endpoints

#### 1. List Directory
```
GET /api/files/list?path=/root/clawd
```

**Response:**
```json
{
  "path": "/root/clawd",
  "files": [
    {
      "name": "SOUL.md",
      "path": "/root/clawd/SOUL.md",
      "type": "file",
      "size": 1234,
      "modified": "2026-02-01T12:00:00Z",
      "extension": "md",
      "editable": true
    },
    {
      "name": "memory",
      "path": "/root/clawd/memory",
      "type": "directory",
      "children": 5
    }
  ],
  "parent": "/root"
}
```

**Parameters:**
- `path` (required): Directory to list
- `recursive` (optional): If true, return full tree (default: false)
- `maxDepth` (optional): Max recursion depth (default: 1, max: 5)

#### 2. Read File
```
GET /api/files/read?path=/root/clawd/SOUL.md
```

**Response:**
```json
{
  "path": "/root/clawd/SOUL.md",
  "content": "# SOUL.md - Who You Are\n\n...",
  "size": 1234,
  "modified": "2026-02-01T12:00:00Z",
  "encoding": "utf-8"
}
```

**Parameters:**
- `path` (required): File to read
- `encoding` (optional): "utf-8" (default), "base64" (for binary)
- `maxSize` (optional): Max bytes to read (default: 1MB, max: 10MB)

**Errors:**
- 404: File not found
- 413: File too large
- 415: Binary file (use encoding=base64)

#### 3. Write File
```
POST /api/files/write
Content-Type: application/json

{
  "path": "/root/clawd/SOUL.md",
  "content": "# Updated SOUL.md\n\n...",
  "createDirs": true
}
```

**Response:**
```json
{
  "success": true,
  "path": "/root/clawd/SOUL.md",
  "size": 1456,
  "modified": "2026-02-01T12:30:00Z"
}
```

**Parameters:**
- `path` (required): File to write
- `content` (required): File content (string or base64)
- `encoding` (optional): "utf-8" (default), "base64"
- `createDirs` (optional): Create parent directories if missing (default: true)
- `overwrite` (optional): Overwrite existing file (default: true)

**Errors:**
- 400: Invalid path
- 409: File exists (if overwrite=false)
- 413: Content too large (max 10MB)

#### 4. Upload File
```
POST /api/files/upload
Content-Type: multipart/form-data

file: <binary>
path: /root/clawd/uploads/document.pdf
```

**Response:**
```json
{
  "success": true,
  "path": "/root/clawd/uploads/document.pdf",
  "size": 123456,
  "mimeType": "application/pdf"
}
```

**Parameters:**
- `file` (required): File binary
- `path` (required): Destination path
- `overwrite` (optional): Overwrite existing (default: false)

**Limits:**
- Max file size: 50MB
- Allowed extensions: configurable (default: all except executables)

#### 5. Download File
```
GET /api/files/download?path=/root/clawd/outputs/report.pdf
```

**Response:**
- Binary file with appropriate Content-Type
- Content-Disposition: attachment; filename="report.pdf"

#### 6. Delete File
```
DELETE /api/files?path=/root/clawd/uploads/old-file.txt
```

**Response:**
```json
{
  "success": true,
  "path": "/root/clawd/uploads/old-file.txt",
  "trashedAt": "2026-02-01T12:00:00Z",
  "expiresAt": "2026-02-08T12:00:00Z"
}
```

Files are moved to `.trash/` with 7-day retention, not permanently deleted.

**Parameters:**
- `path` (required): File to delete
- `permanent` (optional): Skip trash, delete permanently (default: false)

#### 7. Move/Rename File
```
POST /api/files/move
Content-Type: application/json

{
  "from": "/root/clawd/uploads/old-name.txt",
  "to": "/root/clawd/uploads/new-name.txt"
}
```

#### 8. Create Directory
```
POST /api/files/mkdir
Content-Type: application/json

{
  "path": "/root/clawd/projects/new-project"
}
```

#### 9. Search Files
```
GET /api/files/search?query=TODO&path=/root/clawd
```

**Response:**
```json
{
  "query": "TODO",
  "results": [
    {
      "path": "/root/clawd/memory/2026-02-01.md",
      "matches": [
        { "line": 15, "text": "TODO: Fix the bug in..." }
      ]
    }
  ],
  "total": 3
}
```

**Parameters:**
- `query` (required): Search term
- `path` (optional): Directory to search (default: /root/clawd)
- `fileTypes` (optional): Filter by extension (e.g., "md,txt")
- `limit` (optional): Max results (default: 50)

#### 10. Get Trash
```
GET /api/files/trash
```

**Response:**
```json
{
  "files": [
    {
      "originalPath": "/root/clawd/uploads/old-file.txt",
      "trashPath": "/root/clawd/.trash/old-file.txt.1706799600",
      "deletedAt": "2026-02-01T12:00:00Z",
      "expiresAt": "2026-02-08T12:00:00Z",
      "size": 1234
    }
  ]
}
```

#### 11. Restore from Trash
```
POST /api/files/restore
Content-Type: application/json

{
  "trashPath": "/root/clawd/.trash/old-file.txt.1706799600"
}
```

---

## UI Components

### 1. File Browser Panel

Located in dashboard sidebar or as a tab alongside chat.

```
┌─────────────────────────────────────────────────────────────────┐
│ 📁 Files                                          [⬆️ Upload] [🔍] │
├─────────────────────────────────────────────────────────────────┤
│ 📂 /root/clawd                                         [↻ Refresh] │
├─────────────────────────────────────────────────────────────────┤
│ > 📁 memory (5)                                                   │
│ > 📁 uploads (3)                                                  │
│ > 📁 outputs (2)                                                  │
│ > 📁 projects (1)                                                 │
│   ─────────────────────────────────────                          │
│   ✨ SOUL.md                                      [Edit] [👁️]     │
│   👤 USER.md                                      [Edit] [👁️]     │
│   🧠 MEMORY.md                                    [View]          │
│   🔧 TOOLS.md                                     [Edit] [👁️]     │
│   📋 AGENTS.md                                    [Edit] [👁️]     │
│   🪪 IDENTITY.md                                  [Edit] [👁️]     │
│   💓 HEARTBEAT.md                                 [Edit] [👁️]     │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Expandable folder tree
- Click file to preview
- Double-click to edit (if editable)
- Right-click context menu (rename, delete, download)
- Drag-drop to move files
- Drag-drop from desktop to upload

### 2. File Preview/Editor Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ 📄 SOUL.md                                    [Edit] [⬇️] [✕]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # SOUL.md - Who You Are                                        │
│                                                                  │
│  *You're not a chatbot. You're becoming someone.*               │
│                                                                  │
│  ## Core Truths                                                 │
│                                                                  │
│  **Be genuinely helpful, not performatively helpful.**          │
│  Skip the "Great question!" and "I'd be happy to help!"...      │
│                                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Preview modes:**
- Markdown: Rendered with headings, bold, lists, etc.
- Code: Syntax highlighted
- Images: Displayed inline (with zoom)
- PDF: Embedded viewer or "Download to view"
- Other: Show file info + download button

**Edit mode:**
- Monaco editor (VS Code's editor) for code/markdown
- Auto-save draft to localStorage
- "Save" button writes to server
- "Discard" button reverts changes
- Warn before closing with unsaved changes

### 3. Upload Interface

**Methods:**
1. **Upload button** - Opens file picker
2. **Drag-drop zone** - Drop files anywhere in file panel
3. **Chat attachment** - Drag file to chat input or click 📎

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    ┌─────────────────────┐                      │
│                    │   📁                │                      │
│                    │   Drop files here   │                      │
│                    │   or click to browse │                      │
│                    └─────────────────────┘                      │
│                                                                  │
│  Uploading: document.pdf                          [████░░] 67%  │
│  ✓ image.png uploaded to /uploads/images/                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Chat File Attachments

**Attaching files:**
```
┌─────────────────────────────────────────────────────────────────┐
│ [📎 document.pdf (2.3MB)] [✕]                                    │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Can you summarize this document?                      [Send]│ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Agent-created files in chat:**
```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 Here's the report you requested:                              │
│                                                                  │
│    ┌────────────────────────────────────────┐                   │
│    │ 📄 quarterly-report.pdf                │                   │
│    │ 2.3 MB • PDF Document                  │                   │
│    │ [👁️ Preview] [⬇️ Download] [📁 Save]   │                   │
│    └────────────────────────────────────────┘                   │
│                                                                  │
│ I've created a summary of Q4 performance...                     │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Agent Memory Viewer

Special tab showing the agent's "brain" - read-only view of memory files.

```
┌─────────────────────────────────────────────────────────────────┐
│ 🧠 Agent Memory                                                  │
├─────────────────────────────────────────────────────────────────┤
│ [✨ Soul] [👤 About You] [🧠 Memory] [🔧 Tools] [📅 Today]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ## About You (USER.md)                                         │
│                                                                  │
│  - **Name:** Alex Corrino                                       │
│  - **Role:** Fund Manager                                       │
│  - **Company:** Algorithmic Capital                             │
│  - **Location:** Las Vegas                                      │
│  - **Timezone:** Pacific                                        │
│                                                                  │
│  ### Notes                                                      │
│  - First met on 2026-01-26 via Discord                         │
│  - ...                                                          │
│                                                                  │
│                                                    [Edit →]     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security

### Path Validation
All paths must:
1. Be under `/root/clawd/` (workspace root)
2. Not contain `..` (path traversal)
3. Not be system files (`/etc/`, `/usr/`, etc.)
4. Not be Clawdbot internals (`/root/.clawdbot/` - except specific config)

```typescript
function validatePath(path: string): boolean {
  const normalized = path.normalize(path);
  const allowed = ['/root/clawd/'];
  const blocked = ['/root/.clawdbot/', '/etc/', '/usr/', '/var/'];
  
  return allowed.some(p => normalized.startsWith(p)) &&
         !blocked.some(p => normalized.startsWith(p)) &&
         !normalized.includes('..');
}
```

### File Size Limits
| Operation | Limit |
|-----------|-------|
| Read | 10 MB |
| Write | 10 MB |
| Upload | 50 MB |
| Total workspace | 1 GB (soft limit, warn user) |

### Blocked Extensions
Prevent upload/creation of executables:
- `.exe`, `.dll`, `.so`, `.dylib`
- `.sh`, `.bash`, `.zsh` (allow for advanced users?)
- `.py`, `.js`, `.ts` (allow - agents need these)

### Rate Limits
- List: 60/min
- Read: 120/min
- Write: 30/min
- Upload: 10/min
- Search: 20/min

---

## Agent Integration

### How Agent Accesses Files

The agent (Clawdbot) already has full filesystem access via its `exec` and `read`/`write` tools. No changes needed.

When agent creates a file:
```typescript
// Agent creates file - nothing special needed
await write('/root/clawd/outputs/report.md', content);
```

The file is immediately visible in the user's file browser (on refresh).

### Notifying User of New Files

Agent can mention files in chat with special syntax:
```markdown
I've created the report: [[file:/root/clawd/outputs/report.md]]
```

The UI parses this and renders a file card with preview/download buttons.

### Agent Receiving Uploaded Files

When user uploads a file:
1. File is saved to `/root/clawd/uploads/[filename]`
2. If attached to a chat message, the message includes:
   ```
   [User attached: /root/clawd/uploads/document.pdf]
   ```
3. Agent can read it with normal file tools

### Suggested File Locations

Agent should use consistent paths:
- `/root/clawd/uploads/` - User-uploaded files
- `/root/clawd/outputs/` - Agent-generated files
- `/root/clawd/memory/` - Daily notes (agent manages)
- `/root/clawd/projects/` - Project workspaces

---

## Implementation Plan

### Phase 1: Core APIs (4 hours)
1. `GET /api/files/list` - Directory listing
2. `GET /api/files/read` - Read file content
3. `POST /api/files/write` - Write file content
4. Path validation and security

### Phase 2: Upload/Download (3 hours)
1. `POST /api/files/upload` - Multipart upload
2. `GET /api/files/download` - Binary download
3. Size limits and validation

### Phase 3: File Browser UI (4 hours)
1. Tree view component
2. Expand/collapse directories
3. File icons by extension
4. Click to preview

### Phase 4: Preview/Editor (4 hours)
1. Markdown rendering
2. Code syntax highlighting
3. Image display
4. Edit mode with Monaco

### Phase 5: Chat Integration (3 hours)
1. File attachment in chat input
2. File cards in messages
3. [[file:path]] syntax parsing
4. Download from chat

### Phase 6: Polish (2 hours)
1. Drag-drop upload
2. Search functionality
3. Trash and restore
4. Error handling

**Total: ~20 hours**

---

## Open Questions

1. **Real-time updates?** Should file changes sync live, or just on refresh?
   - Recommendation: Just refresh button for MVP, live sync later

2. **Collaborative editing?** What if agent and user edit same file?
   - Recommendation: Last-write-wins for MVP, conflict detection later

3. **File versioning?** Track changes to important files?
   - Recommendation: Not for MVP, but `.trash/` gives some safety

4. **Mobile support?** How does file browser work on phone?
   - Recommendation: Collapsible panel, simplified for mobile

5. **Offline access?** Cache files locally?
   - Recommendation: Not for MVP

---

*Last updated: 2026-02-01*
