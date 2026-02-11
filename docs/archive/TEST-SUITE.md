# Automna Test Suite Documentation

> **Last Updated:** 2026-02-03  
> **Total Tests:** 200 unit tests + E2E tests

## Overview

Automna uses two testing frameworks:
- **Vitest** — Unit and integration tests
- **Playwright** — End-to-end browser tests

## Running Tests

```bash
cd /root/clawd/projects/automna/landing

# Unit tests
npm run test              # Watch mode
npm run test:run          # Single run
npm run test:coverage     # With coverage report

# E2E tests (requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars)
npm run test:e2e          # Headless
npm run test:e2e:ui       # Interactive UI

# All tests
npm run test:all
```

## Test Structure

```
landing/
├── src/__tests__/              # Unit tests
│   ├── setup.ts                # Test setup (mocks, globals)
│   ├── clawdbot-runtime.test.ts
│   ├── message-content.test.ts
│   ├── channels.test.ts
│   ├── session-keys.test.ts    # NEW
│   ├── api/                    # API route tests
│   │   ├── provision.test.ts   # NEW
│   │   ├── sessions.test.ts    # NEW
│   │   ├── files.test.ts       # NEW
│   │   ├── email.test.ts       # NEW
│   │   └── webhooks.test.ts    # NEW
│   └── lib/                    # Library tests
│       └── db.test.ts          # NEW
├── e2e/                        # E2E tests
│   ├── auth.spec.ts
│   ├── chat.spec.ts
│   ├── files.spec.ts           # NEW
│   ├── conversations.spec.ts   # NEW
│   └── provisioning.spec.ts    # NEW
└── vitest.config.ts
```

## Test Coverage by Component

### ✅ Covered (Existing)

| Component | Test File | Coverage |
|-----------|-----------|----------|
| Message parsing | `clawdbot-runtime.test.ts` | URL building, message parsing, WS flow |
| Content rendering | `message-content.test.ts` | Code blocks, inline code, edge cases |
| Channel management | `channels.test.ts` | Key generation, validation, localStorage |
| Auth flow | `e2e/auth.spec.ts` | Sign-in, sign-up, redirects |
| Chat UI | `e2e/chat.spec.ts` | Dashboard load, send message, performance |

### 🆕 Added (New Tests)

| Component | Test File | Coverage |
|-----------|-----------|----------|
| Session key canonicalization | `session-keys.test.ts` | Canonical format, edge cases |
| Provisioning API | `api/provision.test.ts` | Happy path, errors, idempotency |
| Sessions API | `api/sessions.test.ts` | List, update, delete, WS protocol |
| Files API | `api/files.test.ts` | List, read, write, upload, delete |
| Email API | `api/email.test.ts` | Send, inbox, rate limiting |
| Webhooks | `api/webhooks.test.ts` | Clerk sync, Stripe events |
| Database | `lib/db.test.ts` | Turso operations, schema |
| File browser | `e2e/files.spec.ts` | Navigate, edit, upload |
| Conversations | `e2e/conversations.spec.ts` | Create, switch, delete |
| Provisioning flow | `e2e/provisioning.spec.ts` | First-time setup |

## Unit Tests Detail

### 1. Session Keys (`session-keys.test.ts`)

Tests the session key canonicalization logic used throughout the app.

```typescript
// Functions tested:
canonicalizeSessionKey('main')       // → 'agent:main:main'
canonicalizeSessionKey('agent:main:test') // → 'agent:main:test' (no change)
isCanonicalKey('agent:main:main')    // → true
isCanonicalKey('main')               // → false
```

### 2. Provisioning API (`api/provision.test.ts`)

Tests `/api/user/provision` endpoint:
- Creates Fly app when user has none
- Returns existing app if already provisioned
- Handles Fly API errors gracefully
- Creates database records (machines table)
- Generates unique gateway tokens

### 3. Sessions API (`api/sessions.test.ts`)

Tests `/api/user/sessions` endpoint:
- Lists sessions from OpenClaw gateway
- Updates session labels
- Deletes sessions
- Handles WS protocol correctly (NOT JSON-RPC!)
- Validates user ownership

### 4. Files API (`api/files.test.ts`)

Tests `/api/files/*` endpoints:
- `GET /api/files/list?path=/` — List directory
- `GET /api/files/read?path=/file.txt` — Read file content
- `POST /api/files/write` — Create/update files
- `POST /api/files/upload` — Multipart file upload
- `DELETE /api/files?path=/file.txt` — Delete files
- Path traversal prevention (`../` attacks)
- Size limits (100MB upload)

### 5. Email API (`api/email.test.ts`)

Tests `/api/user/email/*` endpoints:
- `POST /api/user/email/send` — Send email
- `GET /api/user/email/inbox` — List inbox
- `GET /api/user/email/inbox/[messageId]` — Get message
- Rate limiting (50 emails/day/user)
- Email address format validation

### 6. Webhooks (`api/webhooks.test.ts`)

Tests webhook handlers:
- **Clerk:** User created/updated sync to Turso
- **Stripe:** checkout.session.completed, subscription.updated, subscription.deleted
- Signature verification
- Idempotency (same event doesn't double-process)

### 7. Database (`lib/db.test.ts`)

Tests Turso/Drizzle operations:
- User CRUD
- Machine tracking
- Event logging
- Email send tracking

## E2E Tests Detail

### 1. Files (`e2e/files.spec.ts`)

- Navigate file tree
- View file content
- Edit and save files
- Create new files
- Upload files
- Delete files

### 2. Conversations (`e2e/conversations.spec.ts`)

- Create new conversation
- Switch between conversations
- Rename conversation
- Delete conversation
- Messages isolated per conversation

### 3. Provisioning (`e2e/provisioning.spec.ts`)

- New user sees loading screen
- Progress steps shown
- Chat becomes available after provisioning
- Subsequent visits load instantly

## Mocking Strategy

### External Services

| Service | Mock Approach |
|---------|---------------|
| Fly.io API | `vi.mock()` with predefined responses |
| OpenClaw Gateway | Mock WebSocket server |
| Clerk | Use test mode, mock webhook payloads |
| Stripe | Use test mode, mock webhook payloads |
| Turso | Use in-memory SQLite or mock client |
| Agentmail | Mock API responses |

### Example Mock Setup

```typescript
// vi.mock for Fly API
vi.mock('@/lib/fly', () => ({
  createApp: vi.fn().mockResolvedValue({ id: 'test-app-id' }),
  createVolume: vi.fn().mockResolvedValue({ id: 'test-vol-id' }),
  createMachine: vi.fn().mockResolvedValue({ id: 'test-machine-id' }),
}));

// Mock WebSocket for sessions
class MockWebSocket {
  send(data: string) {
    const msg = JSON.parse(data);
    if (msg.method === 'sessions.list') {
      this.onmessage({ data: JSON.stringify({
        type: 'res',
        id: msg.id,
        ok: true,
        payload: { sessions: [] }
      })});
    }
  }
}
```

## CI/CD Integration

Tests run on every push via GitHub Actions:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:run
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
```

## Coverage Targets

| Category | Target | Current |
|----------|--------|---------|
| Statements | 80% | TBD |
| Branches | 75% | TBD |
| Functions | 80% | TBD |
| Lines | 80% | TBD |

## Test Data

### Test User
- Email: Set via `E2E_TEST_EMAIL` env var
- Password: Set via `E2E_TEST_PASSWORD` env var
- Use Clerk test mode for E2E

### Test Files
- Keep test fixtures in `__fixtures__/` directories
- Don't commit real API keys or secrets

## Troubleshooting

### Tests timing out
- Increase `timeout` in test config
- Check if mocks are set up correctly
- For E2E, ensure test user is provisioned

### WebSocket tests failing
- OpenClaw uses `type: 'req'` NOT `jsonrpc: '2.0'`
- Client ID must be in allowlist (`webchat`, `gateway-client`)
- Response data is in `payload`, not `result`

### Flaky E2E tests
- Add explicit waits for elements
- Use `data-testid` for selectors
- Ensure clean state between tests
