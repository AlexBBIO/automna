# Integrations Panel

> Last updated: 2026-02-11
> Status: Live (basic) — UX overhaul planned (see WISHLIST.md #2)

## Current Implementation

**Component:** `components/IntegrationsPanel.tsx`

**How it works:**
1. User sees grid of integration cards, grouped by category
2. Cards are either clickable (active) or grayed out ("Coming soon")
3. Clicking an active card calls `onSelectIntegration(name, setupPrompt)`
4. Dashboard switches to Chat tab and sends the setup prompt to the agent
5. Agent walks user through configuration in natural language

**Active integrations (not "coming soon"):**
- Discord, Telegram, Slack, WhatsApp, Signal
- Notion, Trello
- GitHub
- Obsidian
- Email
- Spotify

**Categories:** Messaging, Productivity, Calendar, Developer, Notes, Smart Home, Media, Other

**Filters:** Category filter buttons + "Show coming soon" toggle

## Known UX Issues

1. **No connected/disconnected status** — Cards look the same regardless of state
2. **Context switch is jarring** — Click integration → silently switches to Chat tab
3. **No disconnect/reconfigure** — Must ask agent in chat
4. **"Coming soon" items outnumber active ones** — May signal "not ready"
5. **No verification** — No way to confirm an integration is actually working

## Planned Overhaul (WISHLIST #2)

**Modal wizard flow:**
- Click integration → info modal with prerequisites
- Step tracker + agent chat in structured panel (stays on Integrations tab)
- Agent tests connection → verification step
- Done state with summary

**Status-aware cards:**
- Read OpenClaw config via Files API to detect connected integrations
- Green dot + "Connected" badge + key info (which server, which chat)
- Settings button → config modal (change channels, disconnect)

**Default behavior change:**
- Hide "Coming soon" by default (toggle to show)
- Show confirmation toast when switching to setup flow
