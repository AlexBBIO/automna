# Admin Panel Specification

> **Status:** Planning  
> **Priority:** High  
> **Target:** v0.6

## Overview

Internal admin dashboard for Automna operations. Provides visibility into users, usage metrics, billing, and system health.

**URL:** `https://automna.ai/admin` (protected route)

## Authentication

- Clerk-based auth with role check
- Only users with `role: "admin"` in Clerk metadata can access
- Your Clerk user ID: `user_38uauJcurhCOJznltOKvU12RCdK` → set as admin

```typescript
// middleware.ts addition
if (pathname.startsWith('/admin')) {
  const { sessionClaims } = await auth();
  if (sessionClaims?.metadata?.role !== 'admin') {
    return NextResponse.redirect('/dashboard');
  }
}
```

## Pages & Features

### 1. Dashboard Overview (`/admin`)

Quick stats at a glance:

| Metric | Source |
|--------|--------|
| Total Users | `COUNT(users)` |
| Active Users (24h) | `machines.last_active_at > now - 24h` |
| Total Messages Today | Aggregate from machine logs |
| API Spend Today | `SUM(llm_usage.cost_microdollars)` |
| Emails Sent Today | `COUNT(email_sends)` |
| Active Machines | `machines.status = 'started'` |

**Charts:**
- Daily active users (7 day trend)
- API cost per day (7 day trend)
- New signups per day

### 2. Users List (`/admin/users`)

Paginated table of all users:

| Column | Source | Sortable |
|--------|--------|----------|
| User | `users.name`, `users.email` | ✓ |
| Plan | `machines.plan` | ✓ |
| Status | `machines.status` | ✓ |
| Messages Today | Computed | ✓ |
| API Cost (MTD) | `SUM(llm_usage.cost_microdollars)` | ✓ |
| Emails (Today) | `COUNT(email_sends)` | ✓ |
| Last Active | `machines.last_active_at` | ✓ |
| Created | `users.created_at` | ✓ |

**Filters:**
- Plan (free/starter/pro/business)
- Status (active/inactive/stopped)
- Date range (created)

**Actions:**
- View details → `/admin/users/[id]`
- Quick actions: Start/stop machine, change plan

### 3. User Detail (`/admin/users/[id]`)

Full view of a single user:

#### User Info
```
Name: Alex Corrino
Email: alex@example.com
Clerk ID: user_xxx
Created: Jan 28, 2026

Plan: Pro ($50/mo)
Stripe Customer: cus_xxx
Subscription Status: active
```

#### Machine Info
```
App Name: automna-u-abc123
Machine ID: xyz789
Region: sjc
Status: started
IP: 10.0.0.x

Gateway Token: ****-****-****-xxxx [Copy] [Regenerate]
Email: swiftfox@mail.automna.ai
Browserbase Context: ctx_xxx
```

#### Usage Stats (This Month)
```
LLM Tokens:     1,234,567 / 5,000,000 (24.7%)
LLM Cost:       $12.34 / $50.00 (24.7%)
Emails Sent:    127 / 1,500 (8.5%)
Conversations:  45
Messages:       892
```

#### Usage History (Table)
| Date | Tokens | Cost | Emails | Messages |
|------|--------|------|--------|----------|
| Feb 3 | 45,000 | $0.45 | 3 | 28 |
| Feb 2 | 123,000 | $1.23 | 12 | 156 |
| ... | | | | |

#### Recent Activity (Log)
```
05:32 - Sent email to recipient@example.com
05:30 - LLM request: claude-sonnet-4 (2,340 tokens)
05:28 - New conversation started: "Work Projects"
...
```

#### Admin Actions
- **Change Plan:** Dropdown to upgrade/downgrade
- **Start/Stop Machine:** Toggle machine state
- **Regenerate Token:** Create new gateway token
- **View Logs:** Link to Fly.io dashboard
- **Impersonate:** Open their chat view (read-only?)

### 4. Usage Analytics (`/admin/usage`)

Aggregate usage across all users:

#### LLM Usage
- Total tokens (input/output breakdown)
- Total cost
- By model breakdown (sonnet vs opus)
- Top 10 users by usage
- Requests per minute (rate limit headroom)

#### Email Usage
- Total emails sent
- By domain breakdown (gmail, outlook, etc.)
- Top 10 senders
- Bounce/failure rate

#### Chat Activity
- Total messages
- Active conversations
- Average messages per user
- Peak activity hours

**Time Range Selector:** Today, 7 days, 30 days, custom

### 5. Billing (`/admin/billing`)

Stripe integration overview:

#### Revenue
- MRR (Monthly Recurring Revenue)
- Active subscriptions by plan
- Churn rate (30 day)

#### Recent Events
| Time | Event | User | Details |
|------|-------|------|---------|
| 05:30 | subscription.created | alex@... | Pro ($50/mo) |
| 05:15 | invoice.paid | bob@... | $20.00 |
| ... | | | |

#### Actions
- Link to Stripe Dashboard
- Manual subscription adjustment (rare)

### 6. System Health (`/admin/health`)

Infrastructure monitoring:

#### Fly.io Machines
| App | Status | Region | CPU | Memory | Last Check |
|-----|--------|--------|-----|--------|------------|
| automna-u-abc | started | sjc | 12% | 45% | 2m ago |
| automna-u-def | stopped | sjc | - | - | 1h ago |

#### API Health
- Anthropic API status (latency, errors)
- Agentmail status
- Turso database status
- Vercel function metrics

#### Error Log (Last 24h)
| Time | Type | User | Error |
|------|------|------|-------|
| 05:30 | LLM | user_x | Rate limit exceeded |
| 05:15 | Email | user_y | Invalid recipient |

### 7. Settings (`/admin/settings`)

Global configuration:

- **Plan Limits:** Edit token/email limits per plan
- **Rate Limits:** Adjust RPM limits
- **Feature Flags:** Enable/disable features globally
- **Maintenance Mode:** Toggle site-wide maintenance banner

## Database Additions

### Admin Activity Log
```sql
CREATE TABLE admin_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'plan_change', 'machine_stop', etc.
  target_user_id TEXT,
  details TEXT,                -- JSON
  created_at INTEGER NOT NULL
);
```

### Aggregated Stats (Materialized)
For performance, pre-compute daily stats:

```sql
CREATE TABLE daily_stats (
  date TEXT NOT NULL,          -- '2026-02-03'
  user_id TEXT NOT NULL,
  llm_tokens INTEGER DEFAULT 0,
  llm_cost_microdollars INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  conversations_created INTEGER DEFAULT 0,
  PRIMARY KEY (date, user_id)
);
```

**Aggregation:** Cron job runs at midnight UTC, rolls up previous day's stats.

## API Endpoints

### Users
```
GET  /api/admin/users                 - List users (paginated)
GET  /api/admin/users/[id]            - Get user details
PATCH /api/admin/users/[id]           - Update user (plan, etc.)
POST /api/admin/users/[id]/regenerate-token
POST /api/admin/users/[id]/machine/start
POST /api/admin/users/[id]/machine/stop
```

### Stats
```
GET /api/admin/stats/overview         - Dashboard metrics
GET /api/admin/stats/usage            - Usage analytics
GET /api/admin/stats/billing          - Revenue metrics
```

### System
```
GET /api/admin/health                 - System health check
GET /api/admin/logs                   - Error/activity logs
```

## UI Components

### Tech Stack
- Same as main app: Next.js + Tailwind + shadcn/ui
- Charts: Recharts or Tremor
- Tables: TanStack Table (sorting, filtering, pagination)

### Layout
```
┌─────────────────────────────────────────────────────────┐
│ 🔒 Automna Admin                    [Alex] [Logout]     │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Dashboard│  [Content Area]                              │
│ Users    │                                              │
│ Usage    │                                              │
│ Billing  │                                              │
│ Health   │                                              │
│ Settings │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

## Security Considerations

1. **Auth:** Double-check admin role on every API route
2. **Audit:** Log all admin actions
3. **Secrets:** Never expose full gateway tokens (mask all but last 4)
4. **Rate Limit:** Admin APIs also rate limited (prevent scraping)
5. **Read-Only Default:** Destructive actions require confirmation

## Implementation Phases

### Phase 1: Core (MVP)
- [ ] Admin auth middleware
- [ ] Users list with basic info
- [ ] User detail page
- [ ] Start/stop machine
- [ ] Basic usage stats

### Phase 2: Analytics
- [ ] Dashboard overview with charts
- [ ] Usage analytics page
- [ ] Daily stats aggregation cron

### Phase 3: Billing & Health
- [ ] Billing overview
- [ ] System health page
- [ ] Error log viewer

### Phase 4: Polish
- [ ] Settings page
- [ ] Export data (CSV)
- [ ] Admin activity log
- [ ] Email alerts for anomalies

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1 | 2-3 days | None |
| Phase 2 | 2 days | Phase 1 |
| Phase 3 | 2 days | Phase 1, Stripe webhook data |
| Phase 4 | 1-2 days | All above |

**Total:** ~8-10 days for full implementation

## Open Questions

1. **Impersonation:** Should admins be able to view user chats? Privacy implications?
2. **Multi-admin:** Need role levels (admin vs super-admin)?
3. **Alerts:** Email/Slack notifications for anomalies?
4. **Data Retention:** How long to keep detailed logs?

---

*Ready to start Phase 1 when approved.*
