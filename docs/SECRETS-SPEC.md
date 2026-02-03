# Secrets Management Specification

**Date:** 2026-02-03  
**Status:** In Progress  
**Priority:** P0

---

## Overview

Secure storage for user secrets (API keys, tokens, passwords) that:
1. Never appear in chat history
2. Encrypted at rest
3. Accessible only to user's agent
4. Manageable via dashboard UI

---

## User Experience

### Flow 1: Dashboard UI (Preferred)

```
User: Opens Dashboard → Settings → Secrets
      Sees form: "Add Secret"
      
      Name: [discord_token        ]
      Value: [••••••••••••••••••••]
      [Save]
      
      Saved! Your agent can now use $DISCORD_TOKEN
```

### Flow 2: Chat (With Redaction)

```
User: "Store this as my discord token: MTIzNDU2Nzg5"

Agent: *detects secret pattern*
       *calls POST /api/user/secrets*
       *secret stored encrypted*
       
Agent: "Got it! I've securely stored your Discord token.
        You can manage it in Dashboard → Settings → Secrets."
        
[Message is redacted in history: "Store this as my discord token: •••••••"]
```

### Flow 3: Agent Uses Secret

```
User: "Connect to my Discord"

Agent: *calls GET /api/user/secrets/discord_token*
       *gets decrypted value*
       *uses in config.patch*
       
Agent: "Connected! I'm now on Discord."
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dashboard (automna.ai)                        │
│                                                                 │
│  Settings → Secrets                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ discord_token    •••••••••••    [Edit] [Delete]             ││
│  │ browserbase_key  •••••••••••    [Edit] [Delete]             ││
│  │                                                             ││
│  │ [+ Add Secret]                                              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel API Routes                             │
│                                                                 │
│  POST /api/user/secrets     - Create/update secret              │
│  GET  /api/user/secrets     - List secret names (not values)    │
│  GET  /api/user/secrets/:name - Get decrypted value (agent only)│
│  DELETE /api/user/secrets/:name - Delete secret                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Turso Database                                │
│                                                                 │
│  secrets table:                                                 │
│  - id (text, primary key)                                       │
│  - user_id (text, not null)                                     │
│  - name (text, not null) -- "discord_token"                     │
│  - encrypted_value (text, not null) -- AES-256-GCM encrypted    │
│  - iv (text, not null) -- initialization vector                 │
│  - created_at (integer)                                         │
│  - updated_at (integer)                                         │
│                                                                 │
│  UNIQUE(user_id, name)                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Encryption

- **Algorithm:** AES-256-GCM
- **Key:** Derived from master key + user_id (per-user encryption)
- **IV:** Random per secret, stored alongside
- **Master key:** In Vercel env vars (SECRETS_MASTER_KEY)

```typescript
import crypto from 'crypto';

const MASTER_KEY = process.env.SECRETS_MASTER_KEY!; // 32 bytes

function deriveUserKey(userId: string): Buffer {
  return crypto.pbkdf2Sync(MASTER_KEY, userId, 100000, 32, 'sha256');
}

function encrypt(value: string, userId: string): { encrypted: string; iv: string } {
  const key = deriveUserKey(userId);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted + ':' + authTag.toString('base64'),
    iv: iv.toString('base64'),
  };
}

function decrypt(encrypted: string, iv: string, userId: string): string {
  const key = deriveUserKey(userId);
  const [ciphertext, authTag] = encrypted.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### Access Control

- **Dashboard:** User authenticated via Clerk, can only see their secrets
- **Agent:** Authenticated via gateway token, linked to user
- **API:** Validates user owns the secret before returning

### What's NOT Stored

- Plain text values (always encrypted)
- Secrets in chat history (redacted)
- Secrets in agent memory files (agent trained not to)

---

## Database Schema

```sql
CREATE TABLE secrets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_secrets_user ON secrets(user_id);
```

**Drizzle schema:**

```typescript
export const secrets = sqliteTable('secrets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  userNameUnique: unique().on(table.userId, table.name),
  userIdx: index('idx_secrets_user').on(table.userId),
}));
```

---

## API Endpoints

### POST /api/user/secrets

Create or update a secret.

**Request:**
```json
{
  "name": "discord_token",
  "value": "MTIzNDU2Nzg5..."
}
```

**Response:**
```json
{
  "success": true,
  "name": "discord_token",
  "created": true
}
```

### GET /api/user/secrets

List user's secret names (not values).

**Response:**
```json
{
  "secrets": [
    { "name": "discord_token", "createdAt": "2026-02-03T01:00:00Z" },
    { "name": "browserbase_key", "createdAt": "2026-02-03T01:05:00Z" }
  ]
}
```

### GET /api/user/secrets/:name

Get decrypted secret value. **Agent-only endpoint.**

**Response:**
```json
{
  "name": "discord_token",
  "value": "MTIzNDU2Nzg5..."
}
```

**Security:** Requires gateway token auth, not just Clerk session.

### DELETE /api/user/secrets/:name

Delete a secret.

**Response:**
```json
{
  "success": true,
  "deleted": "discord_token"
}
```

---

## Chat Redaction

When user sends a message containing a secret:

### Detection Patterns

```typescript
const SECRET_PATTERNS = [
  /(?:token|key|secret|password|api.?key)[\s:=]+([A-Za-z0-9_\-\.]{20,})/i,
  /(?:MTI|MTM|MTQ|MTU|MTY)[A-Za-z0-9_\-\.]{50,}/,  // Discord token pattern
  /sk-[A-Za-z0-9]{48}/,  // OpenAI key pattern
  /ghp_[A-Za-z0-9]{36}/,  // GitHub token pattern
];
```

### Redaction Flow

1. User sends message with secret
2. WebSocket handler detects pattern
3. Extract secret, store via API
4. Replace in message: `"token: MTIz..."` → `"token: •••••••••"`
5. Forward redacted message to agent
6. Store redacted message in history

### Agent Notification

After redaction, append to message:

```
[System: A secret was detected and stored securely. 
 Access it with: GET /api/user/secrets/discord_token]
```

---

## Dashboard UI

### Settings Page Addition

```tsx
// app/dashboard/settings/page.tsx

export default function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      
      <section>
        <h2>Secrets</h2>
        <p>Securely store API keys and tokens for your agent.</p>
        
        <SecretsManager />
      </section>
    </div>
  );
}
```

### SecretsManager Component

```tsx
function SecretsManager() {
  const [secrets, setSecrets] = useState([]);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  
  // Fetch secrets on mount
  useEffect(() => {
    fetch('/api/user/secrets')
      .then(r => r.json())
      .then(d => setSecrets(d.secrets));
  }, []);
  
  const addSecret = async () => {
    await fetch('/api/user/secrets', {
      method: 'POST',
      body: JSON.stringify({ name: newName, value: newValue }),
    });
    // Refresh list
  };
  
  return (
    <div>
      {secrets.map(s => (
        <div key={s.name}>
          <span>{s.name}</span>
          <span>••••••••••</span>
          <button onClick={() => deleteSecret(s.name)}>Delete</button>
        </div>
      ))}
      
      <form onSubmit={addSecret}>
        <input placeholder="Name (e.g. discord_token)" />
        <input type="password" placeholder="Value" />
        <button>Add Secret</button>
      </form>
    </div>
  );
}
```

---

## Agent Integration

### AGENTS.md Update

```markdown
## Secrets

User secrets are stored securely and accessible via API.

To use a secret:
1. Check if it exists: GET /api/user/secrets (lists names)
2. Get the value: GET /api/user/secrets/{name}
3. Use it in your config or API calls

Common secrets:
- discord_token - For Discord integration
- telegram_token - For Telegram integration  
- browserbase_key - For browser automation (if BYOK)

NEVER write secret values to memory files or chat.
Reference them by name only: "Using discord_token from secrets"
```

### Agent Tool (Optional)

Could add a `secrets` tool for cleaner access:

```typescript
// secrets-tool.ts
{
  name: 'secrets',
  description: 'Manage user secrets (API keys, tokens)',
  parameters: {
    action: { type: 'string', enum: ['list', 'get'] },
    name: { type: 'string', description: 'Secret name (for get)' },
  },
  handler: async ({ action, name }) => {
    if (action === 'list') {
      const res = await fetch('/api/user/secrets');
      return res.json();
    }
    if (action === 'get' && name) {
      const res = await fetch(`/api/user/secrets/${name}`);
      return res.json();
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Database & API (2h)

- [ ] Add secrets table to Drizzle schema
- [ ] Run migration
- [ ] Create encryption utilities
- [ ] Implement CRUD API endpoints
- [ ] Add SECRETS_MASTER_KEY to Vercel env

### Phase 2: Dashboard UI (2h)

- [ ] Create /dashboard/settings page
- [ ] Build SecretsManager component
- [ ] Add to dashboard navigation

### Phase 3: Chat Redaction (3h)

- [ ] Add secret detection patterns
- [ ] Implement redaction in WebSocket handler
- [ ] Store secret via API
- [ ] Update history with redacted message

### Phase 4: Agent Integration (1h)

- [ ] Update AGENTS.md with secrets docs
- [ ] Test agent accessing secrets
- [ ] Optional: Add secrets tool

**Total: ~8 hours**

---

## Environment Variables

Add to Vercel:

```
SECRETS_MASTER_KEY=<32-byte-random-hex>
```

Generate with:
```bash
openssl rand -hex 32
```

---

## Testing Checklist

- [ ] Create secret via API
- [ ] List secrets (names only)
- [ ] Get secret value (authenticated)
- [ ] Delete secret
- [ ] Encryption/decryption works
- [ ] Dashboard UI works
- [ ] Chat redaction detects secrets
- [ ] Redacted message stored in history
- [ ] Agent can retrieve secret
- [ ] Cannot access other user's secrets
