# Automna — Feature Wishlist & Backlog

> Last updated: 2026-02-11
> Priority: 🔴 Critical | 🟡 High | 🟢 Nice-to-have

Items marked with 📋 have a spec written. Items marked with 💡 are ideas that need speccing.

---

## 🔴 Critical (Before Real Users)

### 1. Guided Onboarding Flow 💡
**Problem:** User signs up, gets a blank chat. No idea what to try.
**Solution:** First-run experience with suggested prompts, capability overview, quick win task.
**Effort:** Small-Medium
**Notes:** Even just 3-4 starter prompt cards on first load would be huge. Could pull from the landing page demo scenarios.

### 2. Integration Setup UX Overhaul 💡
**Problem:** Clicking an integration dumps user into chat with a setup prompt. Jarring, no status tracking, no connected/disconnected state.
**Solution:** Modal wizard flow per integration. Steps panel + agent chat in a structured UI. Status indicators on cards (connected/not). Settings/disconnect for connected integrations.
**Effort:** Medium
**Notes:** See feature analysis discussion (2026-02-11). Detection via config file read through Files API.

### 3. Usage Dashboard for Users 💡
**Problem:** Users have no visibility into credit consumption, call minutes used, emails sent. They'll hit limits with no warning.
**Solution:** Usage page showing: current plan limits, consumption over time (chart), per-category breakdown (LLM, calls, email, browser).
**Effort:** Medium (data already in Turso `llm_usage` + `call_usage` tables)

### 4. Testing & Staging Environment 💡
**Problem:** All deploys go straight to prod. One bad push breaks every user.
**Solution:** Vercel preview deployments (already free), Fly staging app for infra changes, basic E2E test suite for critical paths (signup → provision → chat → send message).
**Effort:** Medium

### 5. Error Boundaries & Resilience 💡
**Problem:** Any component crash = white screen. WS disconnect = no visible feedback.
**Solution:** React error boundaries on dashboard, visible connection status indicator, auto-reconnect with user feedback.
**Effort:** Small

---

## 🟡 High (Post-Launch, Pre-Scale)

### 6. Activity Log / Audit Trail 💡
**Problem:** Users can't see what the agent did while they were away. Kills trust.
**Solution:** Structured activity feed showing: tasks completed, tools used, messages sent, files changed. Separate from chat history.
**Effort:** Medium-Large
**Notes:** Could derive from OpenClaw session events / tool call logs.

### 7. Notification System 💡
**Problem:** If the agent finishes a long task or hits an error, the user has no way to know unless they're staring at the dashboard.
**Solution:** Browser push notifications for important events. Email digest option. Could tie into heartbeat system.
**Effort:** Medium

### 8. Credit System Implementation 📋
**Problem:** Current billing is plan-based with hard rate limits. Need unified credit currency.
**Spec:** `features/CREDITS.md`
**Effort:** Large

### 9. BYOK (Bring Your Own Key) 📋
**Problem:** Power users want to use their own Anthropic key for unlimited usage.
**Spec:** `BYOK-SPEC.md`
**Effort:** Medium

### 10. Mobile-Responsive Dashboard 💡
**Problem:** Dashboard (sidebar + chat + tabs) breaks on mobile.
**Solution:** Responsive layout, collapsible panels, touch-friendly interactions.
**Effort:** Medium

### 11. Approval Queue UI 💡
**Problem:** Landing page promises "approval gates" but there's no dedicated UI. Approvals happen inline in chat and get buried.
**Solution:** Dedicated approvals panel/tab showing pending actions the agent wants to take. Approve/reject buttons.
**Effort:** Medium-Large
**Notes:** Requires agent-side changes too (structured approval requests).

### 12. Agent Customization from UI 💡
**Problem:** Users can't customize agent name, personality, avatar, or behavior from the Settings panel. Have to ask in chat.
**Solution:** Settings form for: display name, personality prompt, avatar, autonomy level, default tools.
**Effort:** Small-Medium

---

## 🟢 Nice-to-Have (Growth Phase)

### 13. Centralized Log Aggregation 💡
**Problem:** Each user's Fly machine has its own logs. No way to search across users for errors.
**Solution:** Ship logs to a central service (Axiom, Datadog, or self-hosted Loki).
**Effort:** Small-Medium

### 14. CI/CD for Docker Image 💡
**Problem:** Docker image rebuilds are manual `docker build && push`.
**Solution:** GitHub Actions: on push to docker/ → build → push → optionally rolling update.
**Effort:** Small

### 15. Database Migration Tracking 💡
**Problem:** Schema changes are ad-hoc. No migration files, no rollback path.
**Solution:** Use Drizzle Kit migrations properly. Track in git.
**Effort:** Small

### 16. Agent Templates / Starter Kits 💡
**Problem:** New users start with a generic agent.
**Solution:** Pre-configured templates: "Social Media Manager," "Research Assistant," "Developer Agent," etc. Each with tuned SOUL.md, AGENTS.md, pre-connected integrations.
**Effort:** Medium

### 17. Scheduled Tasks UI 💡
**Problem:** Cron/scheduled tasks require chat commands. Users can't see or manage them visually.
**Solution:** Schedules panel showing active crons, next run time, enable/disable toggle.
**Effort:** Medium

### 18. Conversation Search 💡
**Problem:** Can't search across conversation history.
**Solution:** Full-text search over chat messages. Powered by existing memory search or dedicated index.
**Effort:** Medium

### 19. User App Hosting 💡
**Problem:** Agents can build apps but no way to expose them.
**Solution:** Auto-deploy static/simple apps from agent workspace to a public URL.
**Effort:** Large

### 20. White-Label / Agency Tier 💡
**Problem:** Agencies want to resell under their brand.
**Solution:** Custom branding, domain, multi-agent management.
**Effort:** Very Large

---

## Completed (for reference)

| Feature | Completed | Notes |
|---------|-----------|-------|
| Fly.io migration | 2026-02-02 | From Cloudflare Moltworker |
| Multi-conversation chat | 2026-02-02 | Sessions API + sidebar |
| LLM Proxy + rate limits | 2026-02-03 | Moved to Fly proxy 2026-02-08 |
| Security hardening | 2026-02-03 | No keys on user machines |
| Media rendering | 2026-02-03 | Inline images, MEDIA: paths |
| Heartbeat system | 2026-02-03 | 30-min periodic checks |
| Files API + browser | 2026-02-02 | Caddy reverse proxy |
| Admin panel | 2026-02-03 | User mgmt, health, stats |
| Voice calling | 2026-02-06 | Twilio + Bland.ai |
| Streaming fixes | 2026-02-08 | Tool events, media URLs, bubble splitting |
| Provisioning loading fix | 2026-02-08 | Real health polling, no fake progress |
| Plan race condition fix | 2026-02-08 | Stripe direct check during provision |
