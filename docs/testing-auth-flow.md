# Testing the Auth → Chat Flow

## What's New

The dashboard now integrates with the chat! When you sign in:
1. Your user is synced to our database
2. If you have gateway credentials, you see the chat
3. If not, you see the setup prompt

## Testing Steps

### 1. Sign In
Go to https://automna.ai and click "Dashboard" or "Sign In"

### 2. Set Up Gateway Credentials
After signing in, open browser console (F12) and run:

```javascript
// First, sync your user
await fetch('/api/user/sync', { method: 'POST' }).then(r => r.json());

// Then set your gateway credentials
await fetch('/api/admin/set-gateway', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gatewayUrl: 'wss://test.automna.ai',
    gatewayToken: 'test123'
  })
}).then(r => r.json());

// Refresh the page
location.reload();
```

### 3. Use the Chat
- You should now see "Agent Online" with a green dot
- Click "Open Chat" to enter full-screen chat mode
- The chat connects to test.automna.ai and you can talk to your agent!

## Expected Behavior

**Dashboard without gateway:**
- Shows "Set Up Your Agent" card
- Links to /dashboard/setup

**Dashboard with gateway:**
- Shows "Agent Online" with green pulse
- "Open Chat" button enters full-screen chat
- "← Dashboard" button returns to dashboard

## Troubleshooting

**"Gateway not configured" error:**
- Run the console commands above to set credentials

**Chat not connecting:**
- Check that test.automna.ai gateway is running
- Verify token is correct (test123)

**User not found:**
- Call `/api/user/sync` first
- Clerk webhook may not have fired - manual sync needed

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/user/sync` | POST | Creates/updates user in DB |
| `/api/user/gateway` | GET | Returns gateway credentials |
| `/api/admin/set-gateway` | POST | Sets gateway credentials |

## Files Changed

- `prisma/schema.prisma` - Added gatewayUrl, gatewayToken fields
- `src/app/dashboard/page.tsx` - Chat integration
- `src/app/api/user/gateway/route.ts` - Gateway credentials endpoint
- `src/app/api/user/sync/route.ts` - User sync endpoint
- `src/app/api/admin/set-gateway/route.ts` - Admin gateway setter
- `src/app/api/webhooks/clerk/route.ts` - Now creates users in DB
