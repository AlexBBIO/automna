# Admin Console Specification

**Version:** 1.0  
**Date:** 2026-01-29  
**Status:** Planned (not yet built)

---

## Overview

Internal admin console for managing Automna users, instances, and data. Accessible only to admins (not customers).

## Access

- **URL:** `https://automna.ai/admin` (protected)
- **Auth:** Clerk with admin role check
- **Admin users:** Defined in env var or Clerk metadata

## Features

### 1. User Management

**List Users**
- View all users with: email, userId, created date, subscription status
- Search/filter by email, userId, status
- Pagination

**User Details**
- View user profile (from Clerk)
- View subscription status (from Stripe)
- View instance status (running/stopped/error)
- View storage usage
- View last active time

**User Actions**
- Delete user (see below)
- Suspend/unsuspend user
- Impersonate user (view their dashboard)
- Reset user's instance

### 2. Instance Management

**List Instances**
- View all active Durable Objects
- Show: userId, status, last active, memory usage
- Identify orphaned instances

**Instance Actions**
- Force restart instance
- View instance logs (tail)
- Kill stuck processes

### 3. Data Management

**User Data Deletion**
```
DELETE /api/admin/users/{userId}
```

Deletes:
1. R2 data at `users/{userId}/` (config, workspace, sessions)
2. Optionally: Clerk user via API
3. Optionally: Stripe subscription cancellation

**Soft Delete Flow:**
1. Move R2 data to `deleted/{userId}/{timestamp}/`
2. Mark user as deleted in database
3. After 30 days: permanent deletion via cron

**Data Export**
```
GET /api/admin/users/{userId}/export
```
Returns zip of all user data (for support requests)

### 4. System Health

**Dashboard**
- Total users (active/inactive)
- Total instances running
- R2 storage usage
- Error rate (last 24h)
- API latency metrics

**Alerts**
- Instance startup failures
- High error rates
- Storage quota warnings

### 5. Audit Log

Track admin actions:
- Who did what, when
- User deletions
- Impersonations
- Config changes

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/users` | GET | List all users |
| `/api/admin/users/{userId}` | GET | Get user details |
| `/api/admin/users/{userId}` | DELETE | Delete user and data |
| `/api/admin/users/{userId}/suspend` | POST | Suspend user |
| `/api/admin/users/{userId}/unsuspend` | POST | Unsuspend user |
| `/api/admin/users/{userId}/reset` | POST | Reset user's instance |
| `/api/admin/users/{userId}/export` | GET | Export user data |
| `/api/admin/users/{userId}/impersonate` | POST | Get impersonation token |
| `/api/admin/instances` | GET | List all instances |
| `/api/admin/instances/{sandboxId}/restart` | POST | Restart instance |
| `/api/admin/instances/{sandboxId}/logs` | GET | Get instance logs |
| `/api/admin/stats` | GET | System health stats |
| `/api/admin/audit` | GET | Audit log |

---

## UI Pages

### `/admin`
Dashboard with key metrics and recent activity

### `/admin/users`
User list with search/filter

### `/admin/users/{userId}`
User detail page with actions

### `/admin/instances`
Instance list with health status

### `/admin/audit`
Audit log viewer

---

## Security

- Admin role required (check Clerk metadata)
- All actions logged to audit trail
- Rate limiting on destructive actions
- Confirmation required for deletions
- No access to user API keys (encrypted, never displayed)

---

## Implementation Notes

### Tech Stack
- Next.js pages under `/app/admin/`
- Server actions for mutations
- Clerk `auth()` with role check
- R2 API for data operations
- Worker API for instance management

### Admin Role Check
```typescript
// In admin routes
import { auth } from '@clerk/nextjs';

export async function isAdmin() {
  const { userId, sessionClaims } = auth();
  return sessionClaims?.metadata?.role === 'admin';
}
```

### R2 Data Deletion
```typescript
// Delete user data from R2
async function deleteUserData(userId: string) {
  const prefix = `users/${userId}/`;
  const objects = await env.MOLTBOT_BUCKET.list({ prefix });
  
  for (const obj of objects.objects) {
    await env.MOLTBOT_BUCKET.delete(obj.key);
  }
}
```

---

## Future Enhancements

- Bulk operations (delete multiple users)
- Scheduled reports (email daily stats)
- Integration with support ticketing
- Cost tracking per user
- Usage alerts and quotas
