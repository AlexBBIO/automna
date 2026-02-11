# Provisioning Status - Live Progress Spec

## Problem

When a new user provisions, the dashboard shows fake progress steps on a timer while blindly polling `/api/user/health`. If OpenClaw cold-starts slowly (~70s+), the 2-minute timeout expires and the user sees "Setup Failed" even though the machine is seconds from ready. The loading UI lies about what's actually happening.

## Goal

Show **real provisioning progress** tied to actual backend stages. User sees where they are, never waits longer than necessary, and lands in the dashboard the moment their agent is ready to chat.

## Design Principles

- **Low risk**: no changes to the actual provisioning logic. We're adding a status column and a status endpoint, then rewiring the frontend to use real data instead of fake timers.
- **Backwards compatible**: existing machines with no `provision_status` are treated as `ready`.
- **No timeout**: the frontend polls until it gets `ready` or an explicit `error`. No arbitrary 2-minute cutoff.

---

## Changes

### 1. Database: Add `provision_status` column to `machines`

```sql
ALTER TABLE machines ADD COLUMN provision_status TEXT DEFAULT 'ready';
```

Values: `creating_app` | `allocating_ips` | `creating_integrations` | `creating_machine` | `starting` | `ready` | `error`

Also add `provision_error` for error details:
```sql
ALTER TABLE machines ADD COLUMN provision_error TEXT;
```

**Migration**: New column defaults to `'ready'`, so all existing machines are unaffected.

Schema change in `schema.ts`:
```ts
provisionStatus: text("provision_status").default("ready"),
provisionError: text("provision_error"),
```

### 2. Provision API: Write status as it goes

Update `/api/user/provision/route.ts` to write `provision_status` at each stage. The key insight: we already insert a machine record placeholder early, then update it. We just need to insert the record **before** we start provisioning and update status as we go.

**New flow:**

```
POST /api/user/provision
  1. Insert machine record with provision_status='creating_app', id=placeholder
  2. Create Fly app → update to 'allocating_ips'
  3. Allocate IPs → update to 'creating_integrations'  
  4. Create volume + browserbase + agentmail (parallel) → update to 'creating_machine'
  5. Create machine → update to 'starting'
  6. waitForMachine → update to 'ready' (and update machine ID, etc.)
  
  On error at any step: update to 'error' + set provision_error
```

**Important**: The provision API currently creates the machine record at the END. We need to create a placeholder record at the START so the frontend can poll status. Use a temporary ID (e.g., `pending-{shortId}`) then update with real machine ID after Fly creates it.

Actually, simpler approach: **write status to `machineEvents` table** instead. This avoids changing the machines insert flow:

```
POST /api/user/provision
  At each stage, insert into machineEvents:
    { machineId: appName, eventType: 'provision_status', details: JSON.stringify({ status: 'creating_app' }) }
```

Wait, `machineEvents.machineId` references `machines.id` with FK. Let's keep it simple and use the `machines` table approach but with an upsert pattern:

**Simplest approach**: Create the machine row early with a placeholder ID, update as we go.

```ts
// Step 0: Insert placeholder
const placeholderId = `pending-${shortId}`;
await db.insert(machines).values({
  id: placeholderId,
  userId,
  appName,
  region: FLY_REGION,
  status: "creating",
  provisionStatus: "creating_app",
}).onConflictDoUpdate({
  target: machines.userId,
  set: { provisionStatus: "creating_app", provisionError: null },
});

// Helper to update status
const setStatus = async (status: string) => {
  await db.update(machines)
    .set({ provisionStatus: status, updatedAt: new Date() })
    .where(eq(machines.userId, userId));
};

// Step 1: Create app
await createApp(appName, orgId);
await setStatus("allocating_ips");

// Step 2: Allocate IPs
await allocateIps(appName);
await setStatus("creating_integrations");

// Step 3: Parallel work (volume, browserbase, agentmail)
const [volume, bbCtx, emailInbox] = await Promise.all([...]);
await setStatus("creating_machine");

// Step 4: Create machine
const machine = await createMachine(...);
await setStatus("starting");

// Step 5: Wait for machine
await waitForMachine(appName, machine.id);

// Step 6: Update record with real data
await db.update(machines)
  .set({
    id: machine.id, // Can't change PK easily...
    provisionStatus: "ready",
    ...other fields
  })
  .where(eq(machines.userId, userId));
```

**PK problem**: We can't easily change the primary key. Better approach: use the appName as the initial ID (it's unique), then delete + reinsert with real machine ID at the end. Or... just use a separate lightweight table.

### Revised: Use a separate `provision_status` table

Cleanest approach. No changes to machines table flow at all.

```ts
// New table
export const provisionStatus = sqliteTable("provision_status", {
  userId: text("user_id").primaryKey().references(() => users.id),
  status: text("status").notNull().default("pending"),
  // pending | creating_app | allocating_ips | creating_integrations | creating_machine | starting | waiting_for_gateway | ready | error
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```

Provision API upserts into this table at each step. Frontend polls a new endpoint. When provisioning completes, the machines table is populated as before (zero changes to existing flow). The provision_status table is just a progress tracker.

**This is the safest approach.** The existing provisioning logic is untouched except for adding `setStatus()` calls between existing steps.

### 3. New endpoint: `GET /api/user/provision/status`

```ts
// Returns current provisioning status for the user
export async function GET() {
  const { userId } = await auth();
  
  const status = await db.query.provisionStatus.findFirst({
    where: eq(provisionStatus.userId, userId),
  });
  
  if (!status) {
    // Check if user already has a machine (existing user, no status row)
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });
    if (machine) return NextResponse.json({ status: "ready" });
    return NextResponse.json({ status: "not_started" });
  }
  
  // If status is "ready" or "starting", also do a live health check
  if (status.status === "starting" || status.status === "waiting_for_gateway") {
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });
    if (machine?.appName) {
      try {
        const resp = await fetch(
          `https://${machine.appName}.fly.dev/ws/api/sessions?token=${machine.gatewayToken}`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (resp.status === 200) {
          // Gateway is actually ready - update status
          await db.update(provisionStatus)
            .set({ status: "ready", updatedAt: new Date() })
            .where(eq(provisionStatus.userId, userId));
          return NextResponse.json({ status: "ready" });
        }
      } catch {}
    }
  }
  
  return NextResponse.json({
    status: status.status,
    error: status.error,
    startedAt: status.startedAt,
    updatedAt: status.updatedAt,
  });
}
```

### 4. Frontend: Real progress in ChatSkeleton

Replace the fake timer-based steps with real status polling.

**dashboard/page.tsx changes:**

```ts
// Replace waitForNewProvisionReady with:
const pollProvisionStatus = async (): Promise<boolean> => {
  const POLL_INTERVAL_MS = 1500;
  
  while (true) {
    try {
      const res = await fetch('/api/user/provision/status');
      const data = await res.json();
      
      setProvisionStage(data.status); // New state variable
      
      if (data.status === 'ready') return true;
      if (data.status === 'error') {
        setLoadError(data.error || 'Provisioning failed');
        return false;
      }
    } catch {}
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
};
```

**ChatSkeleton.tsx changes:**

Map real statuses to user-friendly messages:

```ts
const statusMessages: Record<string, { text: string; progress: number }> = {
  creating_app:           { text: 'Creating your environment...', progress: 10 },
  allocating_ips:         { text: 'Setting up networking...', progress: 25 },
  creating_integrations:  { text: 'Configuring email & browser...', progress: 40 },
  creating_machine:       { text: 'Building your agent...', progress: 55 },
  starting:               { text: 'Starting services...', progress: 70 },
  waiting_for_gateway:    { text: 'Almost ready...', progress: 85 },
  ready:                  { text: 'Ready!', progress: 100 },
};
```

Keep the tips carousel (users like it). Just replace the progress bar source and step text with real data.

**No timeout.** The frontend polls until `ready` or `error`. If the user reloads, it picks up where it left off by polling `/api/user/provision/status`.

### 5. Safety valve: server-side timeout

Add a 5-minute server-side timeout in the provision API itself. If `waitForMachine` exceeds 5 minutes, write `error` status and return failure. This prevents infinite polling if something truly breaks.

```ts
// In provision route, wrap the whole thing:
const PROVISION_TIMEOUT_MS = 300000; // 5 minutes absolute max
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Provisioning timed out')), PROVISION_TIMEOUT_MS)
);

try {
  await Promise.race([provisionFlow(), timeoutPromise]);
} catch (err) {
  await setStatus("error", err.message);
  throw err;
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `provisionStatus` table |
| `src/app/api/user/provision/route.ts` | Add `setStatus()` calls between existing steps |
| `src/app/api/user/provision/status/route.ts` | **New** - polling endpoint |
| `src/app/dashboard/page.tsx` | Replace `waitForNewProvisionReady` with `pollProvisionStatus` |
| `src/components/ChatSkeleton.tsx` | Accept real status prop, map to messages |

## Migration

```sql
CREATE TABLE IF NOT EXISTS provision_status (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  started_at INTEGER,
  updated_at INTEGER
);
```

Run via Drizzle push (`npx drizzle-kit push`).

## Risk Assessment

- **Zero changes to existing provisioning logic** - we only ADD status writes between existing steps
- **Existing users unaffected** - no provision_status row = treated as `ready`
- **If status endpoint fails** - frontend falls back to existing health polling (degrade gracefully)
- **If status writes fail** - provisioning still completes normally, frontend just sees stale status and eventually gets `ready` from health check fallback
- **Reload safe** - status is in DB, not in-memory. User can close tab and come back.

## Sequence Diagram

```
User clicks "Get Started"
  → POST /api/user/provision (starts async)
  → Frontend polls GET /api/user/provision/status every 1.5s
  
Backend:
  INSERT provision_status (status='creating_app')
  Create Fly app...
  UPDATE status='allocating_ips'
  Allocate IPs...
  UPDATE status='creating_integrations'
  Create volume + email + browser (parallel)...
  UPDATE status='creating_machine'
  Create Fly machine...
  UPDATE status='starting'
  Wait for machine to start...
  UPDATE status='waiting_for_gateway'
  (Machine started, waiting for OpenClaw process)
  
  [Meanwhile, frontend shows real progress at each poll]
  
  Health check passes → UPDATE status='ready'
  → Frontend sees 'ready', connects WebSocket, shows chat
```

## Implementation Order

1. Add `provisionStatus` table + Drizzle push
2. Add `GET /api/user/provision/status` endpoint  
3. Add `setStatus()` calls to provision route (between existing steps)
4. Update ChatSkeleton to accept real status
5. Update dashboard page to poll status instead of health
6. Test with a fresh account
7. Deploy
