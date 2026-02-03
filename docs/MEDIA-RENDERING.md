# Media Rendering in Automna Chat

**Date:** 2026-02-03  
**Status:** ✅ Working

---

## Overview

Automna's webchat supports inline rendering of images and files. Both users and agents can share media that displays directly in the chat interface.

## Syntax

OpenClaw uses the `MEDIA:` syntax for media references:

```
MEDIA:/path/to/file.png
```

**Supported formats:**
- Images: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`
- Files: `pdf`, `doc`, `docx`, `xls`, `xlsx`, `csv`, `txt`, `md`, `json`, `zip`

Images render inline. Other files show as download buttons.

---

## User Uploads

### Flow

1. User clicks 📎 button or drags file to chat
2. File uploads to `/home/node/.openclaw/workspace/uploads/{timestamp}_{filename}`
3. Message contains `MEDIA:/path/to/uploaded/file`
4. MessageContent parses and renders inline

### Implementation

**AutomnaChat.tsx:**
```typescript
const uploadFileToWorkspace = async (file: File): Promise<string> => {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const targetPath = `/home/node/.openclaw/workspace/uploads/${timestamp}_${safeName}`;
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', targetPath);
  
  const response = await fetch('/api/files/upload', {
    method: 'POST',
    body: formData,
  });
  
  return targetPath;
};

// On submit, format as MEDIA:
const fileRefs = uploadedPaths.map(path => `MEDIA:${path}`).join('\n');
```

### Upload API

**Endpoint:** `POST /api/files/upload`

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` (binary), `path` (target path)

**Implementation notes:**
- Uses Fly Machines exec API to write files
- Creates parent directory if needed (`mkdir -p`)
- Base64 encodes file, writes via heredoc

**⚠️ Important:** Vercel blocks HTTP to external services. The file server must use HTTPS.

---

## Agent Image Sharing

### How Agents Share Images

Agents output `MEDIA:/path` as **plain text** (not in code blocks):

```
Here's the chart you requested:

MEDIA:/home/node/.openclaw/workspace/charts/revenue.png

Let me know if you need changes!
```

### ⚠️ Critical: No Code Blocks!

The MEDIA: parser intentionally skips tokens inside fenced code blocks. This is by design (both in OpenClaw's native parser and our webchat parser) to avoid false positives.

**❌ Wrong (won't render):**
````
```
MEDIA:/path/to/image.png
```
````

**❌ Wrong (won't render):**
```
`MEDIA:/path/to/image.png`
```

**✅ Correct:**
```
MEDIA:/path/to/image.png
```

### Agent Instructions

The Docker image includes `AGENTS.md` with these instructions. For existing agents, tell them:

> "When sharing images, output MEDIA:/path on its own line as plain text. Don't use code blocks or backticks around it."

---

## MessageContent Parser

### Supported Syntax

The parser recognizes multiple formats:

| Format | Example | Notes |
|--------|---------|-------|
| `MEDIA:` | `MEDIA:/path/to/file.png` | OpenClaw native |
| `[[image:]]` | `[[image:/path/to/file.png]]` | Alternative |
| `[[file:]]` | `[[file:/path/to/doc.pdf]]` | Alternative |

### Parsing Order

1. **Code blocks** - Extracted first, excluded from further parsing
2. **File references** - `MEDIA:`, `[[image:]]`, `[[file:]]`
3. **Inline code** - Backtick-wrapped code

### Regex

```typescript
// Support both [[file:/path]] and MEDIA:/path formats
const fileRefRegex = /\[\[(file|image):([^\]]+)\]\]|(?:^|\s)MEDIA:\s*`?([^\n`]+)`?/gim;
```

### User vs Agent Messages

Both user and agent messages now parse file references. The only difference:
- **Agent messages:** Code blocks render with syntax highlighting
- **User messages:** Code blocks render as plain text (no highlighting)

File attachments render for both, with different styling:
- **User attachments:** Purple tint (matches user bubble)
- **Agent attachments:** Gray/white (matches agent bubble)

---

## File Download API

Images and files are served via the download endpoint:

**Endpoint:** `GET /api/files/download?path=/path/to/file`

**Response:**
- Binary file content
- Appropriate `Content-Type` header
- `Content-Disposition: attachment` for downloads

**Implementation:**
- Reads file via Fly Machines exec API
- Base64 decodes and streams to client
- Path validation prevents traversal attacks

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│                                                                 │
│  User Upload:                    Agent Response:                │
│  📎 → formData → POST            "MEDIA:/path" in message       │
│         │                              │                        │
│         ▼                              ▼                        │
│  /api/files/upload              MessageContent.tsx              │
│         │                        parseContent()                 │
│         │                              │                        │
│         │                              ▼                        │
│         │                        FileAttachment                 │
│         │                        <img src="/api/files/download">│
│         │                              │                        │
└─────────┼──────────────────────────────┼────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel (automna.ai)                           │
│                                                                 │
│  /api/files/upload              /api/files/download             │
│  - Lookup user gateway          - Lookup user gateway           │
│  - Fly exec: mkdir + write      - Fly exec: cat + base64        │
│  - Return success               - Stream binary                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Fly.io (automna-u-{shortId}.fly.dev)                │
│                                                                 │
│  Fly Machines Exec API                                          │
│  - Write: echo $base64 | base64 -d > /path                     │
│  - Read: cat /path | base64                                     │
│                                                                 │
│  Files stored at:                                               │
│  /home/node/.openclaw/workspace/uploads/                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Images not rendering inline

1. **Check syntax** - Is it `MEDIA:/path` on its own line?
2. **Check code blocks** - Is it wrapped in ``` or backticks?
3. **Check path** - Is the path absolute and correct?
4. **Check file exists** - Can you download it manually?

### Upload fails with 500

1. **Check HTTPS** - Vercel blocks HTTP to external services
2. **Check path** - Parent directory must exist (we create it, but check)
3. **Check permissions** - File server running as correct user?

### Agent wraps MEDIA: in code block

Tell the agent:
> "Output MEDIA:/path as plain text on its own line, not inside code blocks"

Or update the agent's AGENTS.md with proper instructions.

---

## Files Changed

| File | Purpose |
|------|---------|
| `landing/src/components/MessageContent.tsx` | Parse MEDIA: and render FileAttachment |
| `landing/src/components/AutomnaChat.tsx` | Upload flow, MEDIA: formatting |
| `landing/src/app/api/files/[...path]/route.ts` | Upload/download endpoints |
| `docker/workspace/AGENTS.md` | Agent instructions for MEDIA: |
| `docker/Dockerfile` | Copy default workspace |
| `docker/entrypoint.sh` | Initialize workspace on first run |

---

## History

- **2026-02-03 00:15 UTC** - Full implementation complete
- **2026-02-02 23:55 UTC** - Fixed HTTPS requirement for uploads
- **2026-02-02 23:10 UTC** - Added file upload to chat
- **2026-02-02 17:30 UTC** - Initial Files API implementation
