# Automna Test Suite Specification

## Overview

Three layers of testing to catch issues before production:

```
┌─────────────────────────────────────────────────────────┐
│  E2E Tests (Playwright)                                 │
│  Full user flows in real browser                        │
├─────────────────────────────────────────────────────────┤
│  Integration Tests (Vitest)                             │
│  Component interactions, API contracts                  │
├─────────────────────────────────────────────────────────┤
│  Unit Tests (Vitest)                                    │
│  Individual functions, edge cases                       │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Unit Tests

### Frontend (`landing/src/__tests__/`)

#### `clawdbot-runtime.test.ts`
```typescript
describe('buildHistoryUrl', () => {
  it('converts wss:// to https://')
  it('preserves auth params (userId, exp, sig)')
  it('adds sessionKey param')
})

describe('parseMessages', () => {
  it('handles array content format')
  it('handles string content format')
  it('strips message_id tags')
  it('handles empty messages array')
  it('handles malformed messages gracefully')
})

describe('useClawdbotRuntime', () => {
  it('starts HTTP fetch immediately on mount')
  it('connects WebSocket in parallel')
  it('prefers WS history if it has messages')
  it('falls back to HTTP if WS returns empty')
  it('does not double-load history')
  it('handles WS disconnect gracefully')
  it('supports HTTP fallback for sending messages')
})
```

#### `gateway-url.test.ts`
```typescript
describe('generateSignedUrl', () => {
  it('generates valid HMAC signature')
  it('includes userId and exp in payload')
  it('uses base64url encoding')
  it('sets correct expiry time')
})
```

### Moltworker (`moltworker/src/__tests__/`)

#### `signed-url.test.ts`
```typescript
describe('validateSignedUrl', () => {
  it('accepts valid signature')
  it('rejects invalid signature')
  it('rejects expired URLs')
  it('rejects missing params')
  it('rejects invalid userId format')
  it('is timing-safe against attacks')
})
```

#### `env.test.ts`
```typescript
describe('buildEnvVars', () => {
  it('includes ANTHROPIC_API_KEY')
  it('includes gateway token if configured')
  it('sets user-specific R2 path')
  it('omits undefined values')
})
```

---

## 2. Integration Tests

### Frontend ↔ API (`landing/src/__tests__/integration/`)

#### `auth-flow.test.ts`
```typescript
describe('Gateway URL API', () => {
  it('returns signed URL for authenticated user')
  it('returns 401 for unauthenticated request')
  it('signature validates on Moltworker')
})
```

#### `chat-connection.test.ts`
```typescript
describe('Chat Connection', () => {
  it('fetches gateway URL on mount')
  it('connects WebSocket with signed URL')
  it('receives hello-ok after connect')
  it('fetches history via HTTP')
  it('displays messages in UI')
})
```

### Moltworker ↔ Container (`moltworker/src/__tests__/integration/`)

#### `sandbox-lifecycle.test.ts`
```typescript
describe('Sandbox Management', () => {
  it('creates sandbox for new user')
  it('reuses existing sandbox for same user')
  it('isolates sandboxes between users')
  it('mounts R2 storage correctly')
})
```

#### `websocket-proxy.test.ts`
```typescript
describe('WebSocket Proxy', () => {
  it('proxies messages to container')
  it('injects auth token on connect')
  it('relays responses to client')
  it('handles container disconnect')
  it('queues messages while container starts')
})
```

#### `history-endpoint.test.ts`
```typescript
describe('History Endpoint', () => {
  it('returns messages from JSONL file')
  it('filters by sessionKey')
  it('returns empty array for new session')
  it('requires valid signature')
  it('handles missing session file')
})
```

---

## 3. E2E Tests (Playwright)

### `e2e/auth.spec.ts`
```typescript
test('new user can sign up', async ({ page }) => {
  await page.goto('/sign-up')
  // Fill form, submit, verify redirect to dashboard
})

test('existing user can sign in', async ({ page }) => {
  await page.goto('/sign-in')
  // Fill form, submit, verify redirect to dashboard
})

test('unauthenticated user redirected to sign-in', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/sign-in/)
})
```

### `e2e/chat.spec.ts`
```typescript
test('chat loads with history', async ({ page }) => {
  await signIn(page)
  await page.goto('/dashboard')
  
  // Wait for connection
  await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled()
  
  // Verify history loaded (if exists)
  // Or verify empty state for new user
})

test('user can send message and receive response', async ({ page }) => {
  await signIn(page)
  await page.goto('/dashboard')
  
  await page.fill('[data-testid="chat-input"]', 'Hello')
  await page.click('[data-testid="send-button"]')
  
  // Verify user message appears
  await expect(page.locator('text=Hello')).toBeVisible()
  
  // Wait for assistant response (with timeout)
  await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 30000 })
})

test('chat reconnects after disconnect', async ({ page }) => {
  await signIn(page)
  await page.goto('/dashboard')
  
  // Force disconnect
  await page.evaluate(() => window.__ws?.close())
  
  // Verify reconnection
  await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled({ timeout: 10000 })
})
```

### `e2e/cold-start.spec.ts`
```typescript
test('cold start completes within 15 seconds', async ({ page }) => {
  await signIn(page)
  
  const start = Date.now()
  await page.goto('/dashboard')
  
  await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled({ timeout: 15000 })
  
  const elapsed = Date.now() - start
  expect(elapsed).toBeLessThan(15000)
})
```

---

## 4. Test Infrastructure

### Setup

```bash
# Install dependencies
cd landing && npm install -D vitest @testing-library/react playwright
cd ../moltworker && npm install -D vitest
```

### Scripts (`package.json`)

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --dir src/__tests__",
    "test:integration": "vitest run --dir src/__tests__/integration",
    "test:e2e": "playwright test",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e"
  }
}
```

### CI Pipeline (GitHub Actions)

```yaml
name: Test
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit

  integration:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:integration

  e2e:
    runs-on: ubuntu-latest
    needs: integration
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

---

## 5. Test Environments

| Environment | Purpose | Container |
|-------------|---------|-----------|
| Unit | Fast, isolated | None |
| Integration | API contracts | Mock or local |
| E2E | Full flow | Staging Moltworker |

### Mock Moltworker (for local dev)

Create `moltworker/src/mock.ts`:
- Returns canned responses
- No actual container
- Fast iteration

### Staging Environment

- Separate Cloudflare Worker: `moltbot-staging.alex-0bb.workers.dev`
- Separate R2 bucket: `moltbot-data-staging`
- E2E tests run against staging

---

## 6. Priority Implementation Order

1. **Unit tests for clawdbot-runtime.ts** (catches tonight's bugs)
2. **Unit tests for signed-url.ts** (security critical)
3. **Integration test for history endpoint** (most common failure)
4. **E2E test for basic chat flow** (smoke test)
5. **CI pipeline** (prevent regressions)

Estimated effort: ~8 hours for basics, ~16 hours for full coverage.

---

## 7. Test Data

### Fixtures

```typescript
// fixtures/messages.ts
export const sampleHistory = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
]

// fixtures/users.ts
export const testUser = {
  id: 'user_test123',
  email: 'test@automna.ai',
}
```

### Seeds

For E2E tests, create a dedicated test user with known history.

---

## Notes

- Run unit tests on every save (watch mode)
- Run integration tests before commit
- Run E2E tests in CI only (slow)
- Never test against production Moltworker
