# Admin Panel Implementation

> **Status:** ✅ Complete  
> **Deployed:** 2026-02-03  
> **URL:** `https://automna.ai/admin`

## Access Control

**Authorized Admin IDs:**
```typescript
const ADMIN_USER_IDS = ["user_38uauJcurhCOJznltOKvU12RCdK"]; // Alex
```

Admin check happens in:
- `src/app/admin/layout.tsx` - Client-side redirect
- Each `/api/admin/*` route - Server-side 403

## Pages

### Dashboard (`/admin`)
**File:** `src/app/admin/page.tsx`

Stats displayed:
- Total Users (from `users` table)
- Active Users 24h (machines with `last_active_at` > 24h ago)
- Active Machines / Total (from `machines` table)
- API Cost Today/Month (from `llm_usage`, in microdollars → dollars)
- Tokens Today/Month (sum of `input_tokens + output_tokens`)
- Emails Today/Month (from `email_sends` table)

**API:** `GET /api/admin/stats`

### Users List (`/admin/users`)
**File:** `src/app/admin/users/page.tsx`

Features:
- Search by email, name, or app name
- Columns: User, Plan, Status, API Cost (MTD), Emails Today, Last Active
- Click row → User detail page

**API:** `GET /api/admin/users`

### User Detail (`/admin/users/[id]`)
**File:** `src/app/admin/users/[id]/page.tsx`

Sections:
1. **User Info** - Clerk ID, created date, plan, Stripe customer link
2. **Machine** - App name (links to Fly.io), region, status, gateway token (masked), email address
3. **Usage This Month** - Token/cost/email usage bars with limits
4. **Recent Usage** - 7-day table of daily tokens, cost, emails

Actions:
- Start/Stop Machine → `POST /api/admin/users/[id]/machine`
- Regenerate Token → `POST /api/admin/users/[id]/regenerate-token`
- Copy gateway token to clipboard

**API:** `GET /api/admin/users/[id]`

### Usage Analytics (`/admin/usage`)
**File:** `src/app/admin/usage/page.tsx`

Charts (using Recharts):
1. **Cost Over Time** - Area chart of daily cost (microdollars)
2. **Tokens Over Time** - Stacked area (input vs output tokens)

Lists:
3. **By Model** - Cost breakdown by model (claude-opus-4-5, etc.)
4. **Top Users by Cost** - Top 5 users
5. **Top Email Senders** - Top 5 by email count

Time range selector: 24h / 7d / 30d

**API:** `GET /api/admin/usage?range=7d`

### System Health (`/admin/health`)
**File:** `src/app/admin/health/page.tsx`

Sections:
1. **Machine Stats** - Running/Stopped/Total counts
2. **External Services** - Anthropic, Agentmail, Turso status checks
3. **Errors (24h)** - Count of LLM errors
4. **All Machines Table** - Status, region, last active, links to Fly.io
5. **Recent Errors** - Error log with timestamps

**API:** `GET /api/admin/health`

### Settings (`/admin/settings`)
**File:** `src/app/admin/settings/page.tsx`

Configurable settings:
- **Token Limits** - Monthly limits per plan (free/starter/pro/business)
- **Cost Caps** - Monthly cost caps per plan (in cents)
- **Rate Limits** - Requests per minute per plan
- **Email Limits** - Emails per day
- **Feature Flags** - Toggle provisioning, email, browserbase, heartbeat
- **Maintenance Mode** - Enable/disable with custom message

Settings stored in `settings` SQLite table (key-value).

**API:** 
- `GET /api/admin/settings`
- `PATCH /api/admin/settings`

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/stats` | GET | Dashboard overview metrics |
| `/api/admin/users` | GET | List all users with usage |
| `/api/admin/users/[id]` | GET | User detail with machine info |
| `/api/admin/users/[id]/machine` | POST | Start/stop machine |
| `/api/admin/users/[id]/regenerate-token` | POST | New gateway token |
| `/api/admin/usage` | GET | Usage analytics with charts |
| `/api/admin/health` | GET | System health check |
| `/api/admin/settings` | GET/PATCH | Global settings |

## Database Tables Used

- `users` - User accounts (synced from Clerk)
- `machines` - Fly.io machine tracking
- `llm_usage` - LLM API request logs
- `email_sends` - Email send tracking
- `settings` - Admin settings (key-value)

## Cost Display

Costs stored in **microdollars** (1 USD = 1,000,000 microdollars).

Conversion helper:
```typescript
function formatMicrodollars(micro: number): string {
  const dollars = micro / 1000000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;  // $0.0002
  }
  return `$${dollars.toFixed(2)}`;    // $1.23
}
```

## File Structure

```
src/app/admin/
├── layout.tsx           # Admin layout with sidebar
├── page.tsx             # Dashboard
├── billing/page.tsx     # Placeholder (Phase 3)
├── health/page.tsx      # System health
├── settings/page.tsx    # Global settings
├── usage/page.tsx       # Usage analytics with charts
└── users/
    ├── page.tsx         # Users list
    └── [id]/page.tsx    # User detail

src/app/api/admin/
├── stats/route.ts       # Dashboard stats
├── users/route.ts       # Users list
├── users/[id]/
│   ├── route.ts         # User detail
│   ├── machine/route.ts # Machine control
│   └── regenerate-token/route.ts
├── usage/route.ts       # Usage analytics
├── health/route.ts      # Health check
└── settings/route.ts    # Settings CRUD
```

## Dependencies

- `recharts` - Charts for usage analytics
- `lucide-react` - Icons

## Future Improvements

1. **Billing page** - Stripe revenue metrics, subscription management
2. **Activity log** - Audit trail of admin actions
3. **User impersonation** - View as user (read-only)
4. **Export** - CSV export of usage data
5. **Alerts** - Email/Slack on anomalies
