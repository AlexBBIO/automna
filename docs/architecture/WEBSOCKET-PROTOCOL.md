# OpenClaw WebSocket Protocol

> **Critical Reference:** This document describes the WebSocket protocol used by OpenClaw gateways. Getting this wrong will cause silent failures. Learned the hard way on 2026-02-02.

## Overview

OpenClaw uses a custom WebSocket protocol (NOT JSON-RPC 2.0). All communication happens via WebSocket at `wss://{gateway}/ws`.

## Connection Flow

```
Client                                    Gateway
   │                                         │
   │─────── WebSocket Connect ──────────────►│
   │        ?token=xxx&clientId=yyy          │
   │                                         │
   │◄────── connect.challenge ───────────────│
   │        { nonce, ts }                    │
   │                                         │
   │─────── connect request ────────────────►│
   │        { type:'req', method:'connect' } │
   │                                         │
   │◄────── hello-ok response ───────────────│
   │        { type:'res', ok:true }          │
   │                                         │
   │─────── RPC requests ───────────────────►│
   │        { type:'req', method:'...' }     │
   │                                         │
   │◄────── RPC responses ───────────────────│
   │        { type:'res', payload:... }      │
```

## Frame Formats

### Request Frame (Client → Gateway)

```typescript
interface RequestFrame {
  type: 'req';           // REQUIRED - literal string
  id: string;            // REQUIRED - unique request ID
  method: string;        // REQUIRED - method name
  params?: unknown;      // Optional - method parameters
}
```

**Example:**
```json
{
  "type": "req",
  "id": "sessions-1",
  "method": "sessions.list",
  "params": { "limit": 100 }
}
```

### Response Frame (Gateway → Client)

```typescript
interface ResponseFrame {
  type: 'res';           // REQUIRED - literal string
  id: string;            // REQUIRED - matches request ID
  ok: boolean;           // REQUIRED - success flag
  payload?: unknown;     // Present on success
  error?: {              // Present on failure
    code: string;
    message: string;
    details?: unknown;
  };
}
```

**Example (success):**
```json
{
  "type": "res",
  "id": "sessions-1",
  "ok": true,
  "payload": {
    "sessions": [...],
    "count": 5
  }
}
```

### Event Frame (Gateway → Client)

```typescript
interface EventFrame {
  type: 'event';
  event: string;         // Event name
  payload?: unknown;     // Event data
}
```

## Connect Handshake

### Step 1: Challenge Event

Gateway sends immediately after WebSocket connects:

```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": {
    "nonce": "uuid-here",
    "ts": 1770071427395
  }
}
```

### Step 2: Connect Request

Client MUST send connect request with valid client info:

```json
{
  "type": "req",
  "id": "connect-123",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "gateway-client",
      "version": "1.0.0",
      "platform": "server",
      "mode": "backend"
    },
    "auth": {
      "token": "your-gateway-token"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "caps": []
  }
}
```

### Step 3: Hello-OK Response

Gateway responds with hello-ok on success:

```json
{
  "type": "res",
  "id": "connect-123",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "server": { ... },
    "features": { ... }
  }
}
```

## ⚠️ Critical: Valid Client IDs

The `client.id` field MUST be from this allowlist:

| ID | Mode | Use Case |
|----|------|----------|
| `webchat` | `webchat` | Browser chat UI |
| `webchat-ui` | `webchat` | Browser chat UI |
| `clawdbot-control-ui` | `ui` | Control panel |
| `cli` | `cli` | CLI tool |
| `gateway-client` | `backend` | Server-to-server |
| `node-host` | `node` | Node device |
| `test` | `test` | Testing |

**For server-side API calls, use:**
```json
{
  "client": {
    "id": "gateway-client",
    "mode": "backend"
  }
}
```

## ⚠️ Critical: Use `params` Not `payload`

The request frame uses `params` for method parameters:

```json
// ✅ CORRECT
{ "type": "req", "id": "1", "method": "sessions.list", "params": { "limit": 100 } }

// ❌ WRONG
{ "type": "req", "id": "1", "method": "sessions.list", "payload": { "limit": 100 } }
```

## ⚠️ Critical: Use `payload` Not `result`

The response frame uses `payload` for return data:

```json
// ✅ Response structure
{ "type": "res", "id": "1", "ok": true, "payload": { "sessions": [...] } }

// ❌ NOT like JSON-RPC
{ "jsonrpc": "2.0", "id": "1", "result": { "sessions": [...] } }
```

## Common Methods

### sessions.list

List all sessions for the agent.

**Request:**
```json
{
  "type": "req",
  "id": "sessions-1",
  "method": "sessions.list",
  "params": {
    "limit": 100,
    "includeGlobal": false,
    "includeUnknown": false
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "sessions-1",
  "ok": true,
  "payload": {
    "ts": 1770071427395,
    "count": 5,
    "sessions": [
      {
        "key": "agent:main:test",
        "kind": "direct",
        "chatType": "direct",
        "updatedAt": 1770070693980,
        "sessionId": "uuid",
        "inputTokens": 10,
        "outputTokens": 254,
        "totalTokens": 13250
      }
    ]
  }
}
```

### chat.history

Get message history for a session.

**Request:**
```json
{
  "type": "req",
  "id": "history-1",
  "method": "chat.history",
  "params": {
    "sessionKey": "agent:main:main",
    "limit": 50
  }
}
```

### chat.send

Send a message to the agent.

**Request:**
```json
{
  "type": "req",
  "id": "send-1",
  "method": "chat.send",
  "params": {
    "sessionKey": "agent:main:main",
    "text": "Hello!"
  }
}
```

### sessions.patch

Update session metadata (e.g., label).

**Request:**
```json
{
  "type": "req",
  "id": "patch-1",
  "method": "sessions.patch",
  "params": {
    "key": "agent:main:test",
    "label": "My Test Conversation"
  }
}
```

### sessions.delete

Delete a session and its history.

**Request:**
```json
{
  "type": "req",
  "id": "delete-1",
  "method": "sessions.delete",
  "params": {
    "key": "agent:main:test",
    "deleteTranscript": true
  }
}
```

## Session Keys

Sessions use canonical keys with format: `agent:main:{name}`

| UI Display | Canonical Key |
|------------|---------------|
| General | `agent:main:main` |
| Test | `agent:main:test` |
| Work | `agent:main:work` |

Always canonicalize before sending to gateway:

```typescript
function canonicalizeSessionKey(key: string): string {
  if (key.startsWith('agent:main:')) return key;
  return `agent:main:${key}`;
}
```

## Complete Example: Server-Side Session Fetch

```typescript
import WebSocket from 'ws';

async function fetchSessions(gatewayUrl: string, token: string) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${gatewayUrl}/ws?token=${token}&clientId=gateway-client`);
    const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      // Step 1: Handle challenge
      if (msg.event === 'connect.challenge') {
        ws.send(JSON.stringify({
          type: 'req',
          id: 'connect-1',
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: 'gateway-client', version: '1.0.0', platform: 'server', mode: 'backend' },
            auth: { token },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
          },
        }));
        return;
      }
      
      // Step 2: Handle connect success
      if (msg.type === 'res' && msg.id === 'connect-1' && msg.ok) {
        ws.send(JSON.stringify({
          type: 'req',
          id: 'sessions-1',
          method: 'sessions.list',
          params: { limit: 100 },
        }));
        return;
      }
      
      // Step 3: Handle sessions response
      if (msg.id === 'sessions-1') {
        clearTimeout(timeout);
        ws.close();
        if (msg.ok) {
          resolve(msg.payload); // NOT msg.result!
        } else {
          reject(new Error(msg.error?.message || 'Unknown error'));
        }
      }
    });
    
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
```

## Debugging Tips

1. **Connection closes immediately after connect?**
   - Check client ID is from allowlist
   - Check mode matches client ID
   - Check auth token is included in params

2. **"invalid request frame" error?**
   - Make sure you're using `type: 'req'`, not `jsonrpc: '2.0'`
   - Make sure `id` field is present
   - Make sure `params` not `payload` for request parameters

3. **Empty sessions response?**
   - Check you're reading `msg.payload.sessions` not `msg.result.sessions`
   - Sessions are in the `payload` field

4. **Session key mismatch?**
   - Always canonicalize keys: `agent:main:main` not just `main`

## References

- Schema definitions: `/usr/lib/node_modules/clawdbot/dist/gateway/protocol/schema/frames.js`
- Valid client IDs: `/usr/lib/node_modules/clawdbot/dist/gateway/protocol/client-info.js`
- Message handler: `/usr/lib/node_modules/clawdbot/dist/gateway/server/ws-connection/message-handler.js`
