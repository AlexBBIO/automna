# Contact Intelligence & Email Inbox — Product Spec

> **Date:** 2026-02-11 | **Status:** Draft | **Author:** Joi

---

## Table of Contents

1. [Overview](#overview)
2. [User Stories](#user-stories)
3. [Email Inbox](#1-email-inbox)
4. [Contact Intelligence](#2-contact-intelligence)
5. [Integration Layer](#3-integration-layer)
6. [Data Model](#data-model)
7. [API Endpoints](#api-endpoints)
8. [Dashboard UI](#dashboard-ui)
9. [AI Companion Integration](#ai-companion-integration)
10. [Agentmail Integration](#agentmail-integration)
11. [Security & Privacy](#security--privacy)
12. [Implementation Phases](#implementation-phases)
13. [Cost Implications](#cost-implications)
14. [Open Questions](#open-questions)

---

## Overview

Two tightly integrated features that transform Automna from "AI chatbot with email" into "AI companion that knows your people and manages your communications."

**Email Inbox** gives users a full email client in the dashboard, with AI-powered summarization, drafting, and smart replies. **Contact Intelligence** auto-builds a relationship graph from every interaction—emails, chat mentions, calls—so the AI companion has deep context about the people in the user's life.

Together, they enable natural requests like:
- "What did Sarah email me about last week?"
- "Draft a follow-up to John about the proposal"
- "Who haven't I talked to in a month?"
- "Prep me for my meeting with Lisa—pull up everything"

---

## User Stories

### Email Inbox
| # | As a... | I want to... | So that... |
|---|---------|-------------|-----------|
| E1 | User | View my inbox in the dashboard | I don't need a separate email client |
| E2 | User | Read email threads with full context | I can follow conversations |
| E3 | User | Compose and send emails from dashboard | I can use my Automna email for real communication |
| E4 | User | Have my AI summarize long email threads | I save time on verbose emails |
| E5 | User | Ask my AI to draft a reply | I get a starting point I can edit and send |
| E6 | User | Get notified when new email arrives | I don't miss important messages |
| E7 | User | Search my emails by keyword/sender/date | I can find old conversations |
| E8 | User | See which emails my AI sent on my behalf | I maintain oversight of AI actions |
| E9 | User | Tell my AI "email Sarah about X" in chat | The AI handles composition and sending seamlessly |
| E10 | User | Forward emails to external addresses | I can share information |

### Contact Intelligence
| # | As a... | I want to... | So that... |
|---|---------|-------------|-----------|
| C1 | User | See a list of all my contacts auto-built from interactions | I have a CRM without manual data entry |
| C2 | User | View a contact's full profile with interaction history | I have context before reaching out |
| C3 | User | Edit/merge/delete contacts | I can fix AI mistakes |
| C4 | User | Search contacts by name, company, or notes | I can find people quickly |
| C5 | User | Say "email Sarah" and have AI know which Sarah | Ambiguous references resolve intelligently |
| C6 | User | Have the AI remember "John is my accountant" from chat | Relationship context builds naturally |
| C7 | User | See "last contacted" dates | I can maintain relationships |
| C8 | User | Have the AI suggest follow-ups for stale contacts | I don't let relationships go cold |
| C9 | User | Import contacts manually or via CSV | I can bootstrap my contact list |

### Integration
| # | As a... | I want to... | So that... |
|---|---------|-------------|-----------|
| I1 | User | See contact info when viewing an email | I have full context in one place |
| I2 | User | Click a contact to see all emails with them | I can review communication history |
| I3 | User | Ask "what's my history with John" in chat | The AI synthesizes across email + chat + calls |
| I4 | User | Get AI meeting prep (contact + email + calendar) | I walk into meetings prepared |

---

## 1. Email Inbox

### Architecture Decision: Where to Fetch Emails

**Option A: Dashboard → Agentmail API directly (from Vercel serverless)**
- Pro: Lower latency, no dependency on user machine being up
- Pro: Simpler architecture
- Con: Agentmail API key must be accessible to Vercel (already is for provisioning)
- Con: AI features (summarize, draft) still need the user's machine

**Option B: Dashboard → Automna Proxy → User's Fly Machine → Agentmail**
- Pro: All email access goes through the AI companion (single source of truth)
- Pro: Machine can cache, index, enrich emails
- Con: Machine must be running to view inbox
- Con: Higher latency, more failure points

**Option C (Recommended): Hybrid**
- **Read path:** Dashboard → Vercel API → Agentmail SDK (direct). Fast, works even if machine is down.
- **AI path:** Dashboard → Proxy → User Machine (for summarize, draft, smart reply). Only when AI features invoked.
- **Write path (manual compose):** Dashboard → Vercel API → Agentmail SDK. Rate-limited via existing `email_sends` table.
- **Write path (AI compose):** User Machine → Proxy → Agentmail. Already works today.
- **Webhooks:** Agentmail → Vercel webhook endpoint → (store notification in Turso + push to dashboard via SSE/polling).

This keeps the inbox snappy while leveraging the AI companion for intelligence features.

### Email Data Flow

```
┌─────────────┐     Agentmail SDK      ┌──────────────┐
│  Dashboard   │ ◄──────────────────── │   Agentmail   │
│  (Vercel)    │ ──────────────────── ►│   API         │
└──────┬───────┘     read/send          └──────┬───────┘
       │                                        │
       │ AI features                            │ webhook
       ▼                                        ▼
┌──────────────┐                       ┌──────────────┐
│ Automna Proxy│                       │ Vercel API   │
│ (Fly.io)     │                       │ /api/webhook │
└──────┬───────┘                       │ /email       │
       │                               └──────┬───────┘
       ▼                                       │
┌──────────────┐                               │ SSE/poll
│ User Machine │                               ▼
│ (OpenClaw)   │                       ┌──────────────┐
│ - summarize  │                       │  Dashboard   │
│ - draft      │                       │  (realtime)  │
│ - contacts   │                       └──────────────┘
└──────────────┘
```

### Thread Model

Agentmail already provides thread support. Dashboard displays:
- **Inbox view:** List of threads, newest first. Each shows: sender, subject, snippet, timestamp, unread badge.
- **Thread view:** All messages in a thread, chronological. Collapsible quoted text.
- **Folders/labels:** Inbox, Sent, Drafts (map to Agentmail's thread/message status).

### Read/Unread Tracking

Agentmail may not track read status natively. Options:
1. **Turso table** `email_read_status` — store messageId + readAt per user. Lightweight.
2. **LocalStorage** — simplest but doesn't sync across devices.
3. **Agentmail metadata** — if SDK supports custom metadata on messages.

**Recommendation:** Turso table. Small, queryable, syncs across devices.

### Search

- **Phase 1:** Client-side filter on loaded messages (subject, sender contains query).
- **Phase 2:** Agentmail API search if supported, or build a simple search index in Turso (sender, subject, snippet per message, updated on webhook).
- **Phase 3:** AI-powered semantic search via companion ("find the email where John mentioned the budget").

### Notifications

- **Webhook from Agentmail** → hits Vercel endpoint `/api/webhooks/email`
- Stores notification in Turso `email_notifications` table
- Dashboard polls for new notifications (or SSE if we add a persistent connection layer later)
- Also forwards to user's AI companion so it can proactively inform: "You got an email from Sarah about the Q3 report"

### Compose Flow

1. User clicks "Compose" → modal with To, Subject, Body fields
2. Optional: "AI Draft" button → sends prompt to companion, gets back draft text
3. User edits, clicks Send → Vercel API → Agentmail SDK → sent
4. Logged in `email_sends` for rate limiting

### Attachments

- Agentmail SDK supports attachments
- Dashboard upload: file → base64 → API → Agentmail
- Size limit: 10MB per attachment (Agentmail limit TBD, enforce our own)
- Display: inline images rendered, other files as download links

---

## 2. Contact Intelligence

### Storage Architecture

**Dual storage (recommended):**

1. **Turso `contacts` table** — structured data (name, emails, phone, company, role, timestamps). Queryable from dashboard. Source of truth for display.
2. **OpenClaw workspace file** `contacts.json` on user machine — enriched copy with relationship notes, interaction summaries, AI-generated context. Used by the AI companion for contextual lookups.

**Why both?**
- Dashboard needs fast, structured queries (Turso)
- AI companion needs rich, unstructured context (workspace file)
- Sync: AI companion writes to workspace file in real-time; periodic sync to Turso via API (or on every significant update)

**Alternative considered:** Turso-only with a `notes` JSON column. Simpler but makes AI access slower (every contact lookup = API call). The workspace file acts as a local cache the AI can grep instantly.

### Contact Auto-Population

The AI companion builds contacts from three sources:

#### Source 1: Email Interactions
When an email arrives/is sent:
1. Extract sender/recipient name + email
2. Check if contact exists (by email match)
3. If new: create contact with name + email
4. If existing: update `lastInteractionAt`, append to interaction summary
5. AI enriches: extracts company, role, topic from email signatures and content

#### Source 2: Chat Conversations
When user mentions a person in chat:
- "My meeting with Sarah from Acme went well"
- AI extracts: name=Sarah, company=Acme, context=had a meeting
- Fuzzy match to existing contacts or create new
- **Key rule: Never ask "should I save this contact?" — just do it silently.** Users can delete unwanted contacts. Asking permission for every extraction is annoying.

#### Source 3: Phone Calls
From `call_usage` table:
- Extract phone number, map to contact
- Call transcript/summary → interaction history
- AI extracts names mentioned in transcript

### Contact Merge & Dedup

- Auto-merge: same email address → same contact (authoritative)
- Suggest merge: same name, different email → dashboard shows "Possible duplicate" badge
- Manual merge: user selects two contacts → merge UI picks which fields to keep
- AI can suggest: "I think Sarah from your email and Sarah you mentioned in chat are the same person. Want me to merge them?"

### Contact Enrichment (Future)

- Domain lookup (company website from email domain)
- LinkedIn profile suggestion (search, don't scrape)
- Timezone inference from email headers
- Communication frequency analysis

---

## 3. Integration Layer

### Email ↔ Contact Linking

Every email is linked to contacts via email address. When viewing:
- **Email thread:** sidebar shows contact card for each participant
- **Contact profile:** shows all email threads with this person

### AI Contextual Resolution

When user says "email Sarah about the meeting":
1. AI searches contacts for "Sarah"
2. If one match → use that contact's email
3. If multiple → ask: "I found Sarah Chen (Acme) and Sarah Miller (personal). Which one?"
4. If zero → ask: "I don't have a Sarah in your contacts. What's their email?"
5. AI has context from contact notes → can reference past interactions in the draft

### AI Proactive Behaviors

The companion can (based on user preferences):
- **New email notification:** "You got an email from John (your accountant) about tax documents. Want me to summarize it?"
- **Follow-up suggestions:** "You haven't heard back from Lisa about the proposal (sent 5 days ago). Want me to draft a follow-up?"
- **Meeting prep:** "You have a meeting with David Park in 2 hours. Last email exchange was about the API integration. He's CTO at TechCo."
- **Stale relationship alerts:** "You haven't contacted Mike in 30 days. He was working on the partnership deal."

**Important:** These should be opt-in and configurable. Some users want a proactive assistant; others find it intrusive.

### Task Integration (Future)

- "Remind me to follow up with Lisa next week" → creates a task linked to Lisa's contact
- Tasks stored in Turso `tasks` table (not specced here, but the contact FK is ready)
- AI checks tasks during heartbeats and reminds user

---

## Data Model

### New Turso Tables

```sql
-- Contacts
CREATE TABLE contacts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  
  -- Core fields
  name TEXT NOT NULL,
  email TEXT,                    -- Primary email
  emails TEXT,                   -- JSON array of all known emails
  phone TEXT,                    -- Primary phone
  phones TEXT,                   -- JSON array of all known phones
  company TEXT,
  role TEXT,                     -- Job title / role
  
  -- Relationship
  relationship TEXT,             -- "accountant", "friend", "client", "coworker"
  notes TEXT,                    -- Free-form user notes (editable)
  ai_summary TEXT,               -- AI-generated relationship summary
  
  -- Metadata
  source TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'chat' | 'call' | 'manual' | 'import'
  avatar_url TEXT,
  
  -- Timestamps
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_interaction_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_user_email ON contacts(user_id, email);
CREATE INDEX idx_contacts_user_name ON contacts(user_id, name);
CREATE INDEX idx_contacts_last_interaction ON contacts(user_id, last_interaction_at);

-- Contact interactions (lightweight log)
CREATE TABLE contact_interactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  type TEXT NOT NULL,            -- 'email_received' | 'email_sent' | 'chat_mention' | 'call_inbound' | 'call_outbound'
  summary TEXT,                  -- One-line summary: "Discussed Q3 budget proposal"
  reference_id TEXT,             -- Agentmail message ID, call ID, etc.
  
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_interactions_contact ON contact_interactions(contact_id, occurred_at);
CREATE INDEX idx_interactions_user ON contact_interactions(user_id, occurred_at);

-- Email read status
CREATE TABLE email_read_status (
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,      -- Agentmail message ID
  read_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, message_id)
);

-- Email notifications (for real-time updates)
CREATE TABLE email_notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,                  -- First ~200 chars
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  dismissed INTEGER NOT NULL DEFAULT 0,
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_email_notif_user ON email_notifications(user_id, dismissed, received_at);

-- Email search index (populated from webhooks)
CREATE TABLE email_search_index (
  message_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT,
  from_address TEXT,
  from_name TEXT,
  to_addresses TEXT,             -- JSON array
  subject TEXT,
  snippet TEXT,                  -- First ~500 chars of body
  has_attachments INTEGER DEFAULT 0,
  sent_at INTEGER NOT NULL,
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_email_search_user ON email_search_index(user_id, sent_at);
```

### Drizzle Schema Additions (TypeScript)

```typescript
export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  email: text("email"),
  emails: text("emails"), // JSON array
  phone: text("phone"),
  phones: text("phones"), // JSON array
  company: text("company"),
  role: text("role"),
  relationship: text("relationship"),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  source: text("source").notNull().default("email"),
  avatarUrl: text("avatar_url"),
  firstSeenAt: integer("first_seen_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  lastInteractionAt: integer("last_interaction_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => ({
  userIdIdx: index("idx_contacts_user_id").on(table.userId),
  userEmailIdx: index("idx_contacts_user_email").on(table.userId, table.email),
  userNameIdx: index("idx_contacts_user_name").on(table.userId, table.name),
  lastInteractionIdx: index("idx_contacts_last_interaction").on(table.userId, table.lastInteractionAt),
}));

export const contactInteractions = sqliteTable("contact_interactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id").notNull().references(() => contacts.id),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  summary: text("summary"),
  referenceId: text("reference_id"),
  occurredAt: integer("occurred_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => ({
  contactIdx: index("idx_interactions_contact").on(table.contactId, table.occurredAt),
  userIdx: index("idx_interactions_user").on(table.userId, table.occurredAt),
}));

export const emailReadStatus = sqliteTable("email_read_status", {
  userId: text("user_id").notNull(),
  messageId: text("message_id").notNull(),
  readAt: integer("read_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => ({
  pk: index("idx_email_read_pk").on(table.userId, table.messageId),
}));

export const emailNotifications = sqliteTable("email_notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  messageId: text("message_id").notNull(),
  threadId: text("thread_id"),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  subject: text("subject"),
  snippet: text("snippet"),
  receivedAt: integer("received_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  dismissed: integer("dismissed").notNull().default(0),
  createdAt: integer("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, (table) => ({
  userIdx: index("idx_email_notif_user").on(table.userId, table.dismissed, table.receivedAt),
}));
```

### OpenClaw Workspace File

On each user's machine at `~/.openclaw/workspace/contacts.json`:

```json
{
  "contacts": [
    {
      "id": "uuid-from-turso",
      "name": "Sarah Chen",
      "emails": ["sarah@acme.com", "sarah.chen@gmail.com"],
      "phone": "+14155551234",
      "company": "Acme Corp",
      "role": "VP of Engineering",
      "relationship": "client",
      "notes": "Met at TechCrunch Disrupt 2025. Working on API integration project.",
      "recentContext": "Last email (Feb 8): Asked about timeline for Phase 2. User said meeting went well in chat (Feb 10).",
      "lastInteraction": "2026-02-10T15:30:00Z"
    }
  ],
  "lastSyncedAt": "2026-02-11T12:00:00Z"
}
```

This file is the AI's quick-reference. It reads this before resolving any contact reference.

---

## API Endpoints

### Email Endpoints (Vercel API Routes)

```
GET  /api/user/email/threads          - List threads (paginated)
     ?page=1&limit=20&folder=inbox

GET  /api/user/email/threads/:id      - Get thread with messages

GET  /api/user/email/messages/:id     - Get single message (full body)

POST /api/user/email/send             - Send email (already exists, enhance)
     { to, cc, bcc, subject, text, html, replyTo?, attachments? }

POST /api/user/email/draft            - Save draft
     { to?, subject?, text?, threadId? }

GET  /api/user/email/drafts           - List drafts

POST /api/user/email/read             - Mark messages as read
     { messageIds: string[] }

GET  /api/user/email/search           - Search emails
     ?q=keyword&from=email&after=date&before=date

GET  /api/user/email/notifications    - Get unread notification count + recent
     ?since=timestamp

POST /api/user/email/notifications/dismiss  - Dismiss notifications
     { notificationIds: string[] }

POST /api/webhooks/email              - Agentmail webhook receiver (no auth, verify signature)
```

### Contact Endpoints (Vercel API Routes)

```
GET    /api/user/contacts             - List contacts (paginated, searchable)
       ?q=search&sort=lastInteraction&page=1&limit=50

GET    /api/user/contacts/:id         - Get contact with interaction history

POST   /api/user/contacts             - Create contact manually
       { name, email?, phone?, company?, role?, relationship?, notes? }

PATCH  /api/user/contacts/:id         - Update contact
       { name?, email?, company?, notes? }

DELETE /api/user/contacts/:id         - Delete contact

POST   /api/user/contacts/merge       - Merge two contacts
       { sourceId, targetId, keepFields? }

POST   /api/user/contacts/import      - Import contacts (CSV/JSON)
       { contacts: [{name, email, ...}] }

GET    /api/user/contacts/:id/emails  - Get all email threads with this contact

GET    /api/user/contacts/:id/interactions - Get interaction timeline
```

### Proxy Endpoints (for AI companion)

```
POST /api/user/contacts/sync          - AI companion pushes contact updates
     { contacts: [{id?, name, email, ...}] }     (upsert by email)

POST /api/user/contacts/lookup        - AI resolves a name/reference
     { query: "Sarah", context?: "from Acme" }
     → returns matched contacts ranked by relevance

POST /api/user/contacts/:id/interaction - AI logs an interaction
     { type, summary, referenceId? }
```

---

## Dashboard UI

### Email Inbox Page (`/dashboard/email`)

```
┌─────────────────────────────────────────────────────┐
│ 📧 Email                    [Compose] [🔍 Search]   │
├──────────────────────┬──────────────────────────────┤
│ Inbox (12)           │                              │
│ Sent                 │  Sarah Chen                  │
│ Drafts (2)           │  Re: API Integration Timeline│
│                      │  Feb 8, 2026 · 2 messages    │
│ ─────────────────    │                              │
│                      │  ┌────────────────────────┐  │
│ ● Sarah Chen    2/8  │  │ Sarah Chen <sarah@...> │  │
│   Re: API Integr...  │  │ Feb 8, 10:23 AM        │  │
│                      │  │                        │  │
│   John Park     2/7  │  │ Hi, just wanted to     │  │
│   Tax documents...   │  │ check on the timeline  │  │
│                      │  │ for Phase 2...         │  │
│ ● Mike R.       2/5  │  │                        │  │
│   Partnership up...  │  │ [📎 proposal.pdf]      │  │
│                      │  └────────────────────────┘  │
│   Lisa Wang     2/3  │                              │
│   Follow up: Q3...   │  ┌────────────────────────┐  │
│                      │  │ You · Feb 8, 11:45 AM  │  │
│                      │  │                        │  │
│                      │  │ Thanks Sarah, we're    │  │
│                      │  │ targeting end of March. │  │
│                      │  └────────────────────────┘  │
│                      │                              │
│                      │  [✨ AI Summary] [↩ Reply]   │
│                      │  [→ Forward]                 │
└──────────────────────┴──────────────────────────────┘
```

**Key interactions:**
- Click thread → opens thread view in right panel
- `●` = unread indicator
- "AI Summary" button → calls companion to summarize thread → shows summary card above messages
- "Reply" → opens reply composer inline at bottom of thread
- Compose modal: To (with contact autocomplete), Subject, Body, [AI Draft] button, attachments, Send

### Contacts Page (`/dashboard/contacts`)

```
┌─────────────────────────────────────────────────────┐
│ 👥 Contacts                 [+ Add] [🔍 Search]     │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│ Sort: Recent ▾       │  Sarah Chen                  │
│                      │  VP of Engineering · Acme    │
│ ─────────────────    │  sarah@acme.com              │
│                      │  +1 (415) 555-1234           │
│ Sarah Chen      2/10 │                              │
│ VP Eng · Acme        │  Relationship: Client        │
│                      │  ──────────────────────      │
│ John Park       2/7  │                              │
│ CPA · Park & Assoc.  │  📝 Notes                    │
│                      │  Met at TechCrunch Disrupt.  │
│ Mike Rodriguez  2/5  │  Working on API integration. │
│ BD · PartnerCo       │  [Edit]                      │
│                      │                              │
│ Lisa Wang       2/3  │  🤖 AI Summary               │
│ PM · InternalTeam    │  Primary contact for the     │
│                      │  Acme API project. Responsive│
│                      │  communicator, prefers email. │
│                      │                              │
│                      │  📊 Recent Interactions       │
│                      │  • 2/10 Chat mention (mtg)   │
│                      │  • 2/8 Email: API timeline   │
│                      │  • 2/1 Email: Kickoff        │
│                      │                              │
│                      │  [📧 View Emails] [📞 Call]  │
│                      │  [✉️ Email] [🗑 Delete]       │
└──────────────────────┴──────────────────────────────┘
```

**Key interactions:**
- Search filters by name, company, email
- Sort by: recent interaction, name, company
- Click contact → detail panel
- "Email" button → opens compose with To pre-filled
- "View Emails" → filters email inbox to threads with this contact
- "Call" → initiates Bland call (if user has phone feature)
- Edit modal for all fields

### Notification Badge

In the dashboard sidebar:
```
📧 Email (3)    ← unread count badge
👥 Contacts
```

---

## AI Companion Integration

### New Tools/Skills for OpenClaw

The companion gets these tools added to its skill set:

#### `email` skill
```yaml
Tools:
  - email_list_threads(folder, limit, page)
  - email_get_thread(threadId)
  - email_get_message(messageId)
  - email_send(to, subject, body, replyToMessageId?, cc?, bcc?)
  - email_draft(to?, subject?, body?, threadId?)
  - email_search(query, from?, dateRange?)
  - email_summarize_thread(threadId)  # Uses LLM internally
```

#### `contacts` skill
```yaml
Tools:
  - contacts_lookup(query, context?)      # "Sarah from Acme"
  - contacts_get(contactId)
  - contacts_list(sortBy?, limit?)
  - contacts_create(name, email?, phone?, company?, role?, relationship?, notes?)
  - contacts_update(contactId, fields)
  - contacts_log_interaction(contactId, type, summary, referenceId?)
  - contacts_search(query)
  - contacts_stale(daysSince?)            # Contacts not interacted with in N days
```

### AI Behavioral Rules

Added to the companion's system prompt / SOUL.md:

```markdown
## Email & Contacts

### Contact Management
- When you learn about a person from conversation or email, silently update contacts.
- Don't announce every contact update. Just do it.
- If user says "Sarah is my dentist" → update Sarah's relationship field.
- If email arrives from new sender → create contact from email headers.
- When user references someone ambiguously, check contacts first. Only ask if truly ambiguous (2+ matches).

### Email Behavior
- When notified of new email: mention it briefly if it seems important, ignore routine/spam.
- Don't read every email aloud. Summarize only when asked or when it's clearly urgent.
- When drafting: match the user's writing style (learn from sent emails).
- Always confirm before sending unless user explicitly said "send it."
- For "email X about Y": look up contact → draft → show user → send on approval.

### Privacy
- Never share contact details with other users or in group chats.
- Email content is private. Don't reference it in shared contexts.
- Contact notes may contain sensitive info. Treat as confidential.
```

### Contact Extraction Pipeline

When the AI processes any message (chat or email notification):

1. **Entity extraction:** Identify person names, companies, roles mentioned
2. **Contact resolution:** Match against existing contacts (fuzzy name + email match)
3. **Silent update:** Update or create contacts via `contacts_create`/`contacts_update`
4. **Interaction log:** If meaningful interaction, log via `contacts_log_interaction`

This runs passively—no extra LLM call. The AI does it as part of normal response generation when it notices relevant information.

---

## Agentmail Integration Details

### SDK Usage

```typescript
import { AgentMail } from 'agentmail';

// Server-side only (Vercel API routes)
const client = new AgentMail({ apiKey: process.env.AGENTMAIL_API_KEY });

// List threads for a user's inbox
const threads = await client.threads.list({
  inbox_id: user.agentmailInboxId,
  limit: 20,
  offset: 0,
});

// Get thread messages
const messages = await client.threads.messages.list({
  inbox_id: user.agentmailInboxId,
  thread_id: threadId,
});

// Send message
await client.messages.send({
  inbox_id: user.agentmailInboxId,
  to: [recipient],
  subject: subject,
  text: body,
  in_reply_to: replyToMessageId, // For threading
});
```

### Webhook Setup

Register webhook per inbox during provisioning:

```typescript
await client.webhooks.create({
  inbox_id: inboxId,
  url: `https://automna.ai/api/webhooks/email`,
  events: ['message.received'],
  secret: webhookSecret, // For signature verification
});
```

Webhook handler:
1. Verify signature
2. Look up user by inbox ID
3. Insert into `email_notifications`
4. Insert/update `email_search_index`
5. Auto-create/update contact from sender
6. Optionally forward to user's AI companion (via proxy → machine gateway) for proactive notification

### Rate Limiting

- Existing: 50 sends/user/day via `email_sends` table
- Dashboard sends go through same rate limit
- AI sends go through same rate limit (via proxy)
- Consider separate limits: 50 AI-initiated + 50 manual = 100 total? Or shared pool.

---

## Security & Privacy

### API Key Management

| Secret | Location | Access |
|--------|----------|--------|
| Agentmail API key | Vercel env var | Server-side only, never exposed to client |
| Webhook secret | Vercel env var | Webhook signature verification |
| User gateway tokens | Turso `machines.gateway_token` | Per-user, for proxy auth |

**Critical:** The Agentmail API key has access to ALL user inboxes. It must NEVER be exposed to the client or to user machines. All email API calls from the dashboard go through Vercel server-side routes.

### Data Access Boundaries

- **User A cannot access User B's emails or contacts.** All API routes validate `userId` from Clerk session.
- **AI companion on User A's machine** can only access User A's inbox (enforced by proxy routing).
- **Contact data** is per-user. No cross-user contact sharing.

### Email Content Security

- Email bodies are NOT stored in Turso (too large, too sensitive). Only metadata in search index.
- Full email content fetched from Agentmail API on demand.
- AI summaries stored in Turso only if user explicitly requests (and can be deleted).

### GDPR / Privacy

- User can delete all contacts (bulk delete)
- User can delete all emails (triggers Agentmail inbox purge)
- User can export contacts (CSV)
- AI-generated notes clearly labeled as AI-generated
- No contact data used for training or shared across users

### Spam & Abuse

- Inbound: Agentmail handles spam filtering
- Outbound: rate limits prevent abuse
- AI companion cannot send email without user's knowledge (all sends logged, visible in dashboard Sent folder)

---

## Implementation Phases

### Phase 1: Email Inbox MVP (2-3 weeks)

**Goal:** Users can read and send email from dashboard.

- [ ] Vercel API routes: list threads, get messages, send
- [ ] Dashboard email page: thread list, thread view, compose modal
- [ ] Read/unread tracking (Turso table)
- [ ] Agentmail webhook → `email_notifications` table
- [ ] Notification badge in sidebar
- [ ] Wire up existing `email_sends` rate limiting

**Not included:** Search, AI features, drafts, attachments.

### Phase 2: Contact Intelligence MVP (2-3 weeks)

**Goal:** Contacts auto-populate from emails. Users can view/edit.

- [ ] Turso `contacts` + `contact_interactions` tables + migrations
- [ ] Auto-create contacts from email webhook (sender extraction)
- [ ] Vercel API routes: CRUD contacts, list interactions
- [ ] Dashboard contacts page: list, detail view, edit
- [ ] Contact search
- [ ] OpenClaw `contacts` skill with lookup/create/update tools
- [ ] Workspace `contacts.json` sync

### Phase 3: AI Integration (1-2 weeks)

**Goal:** AI companion actively uses email + contacts.

- [ ] OpenClaw `email` skill (list, read, send, summarize, draft)
- [ ] AI contact extraction from chat conversations
- [ ] "AI Summary" button on email threads
- [ ] "AI Draft" button on compose
- [ ] Contact autocomplete in compose (To field)
- [ ] Forward email notifications to companion for proactive alerts

### Phase 4: Polish & Advanced (2-3 weeks)

- [ ] Email search (keyword + date + sender)
- [ ] Email attachments (upload/download/inline display)
- [ ] Drafts (save/load)
- [ ] Contact merge UI
- [ ] Contact import (CSV)
- [ ] Stale contact alerts
- [ ] "View emails with contact" integration
- [ ] AI style matching (learn from sent emails)
- [ ] Semantic search ("find the email about the budget")

### Phase 5: Future

- [ ] Calendar integration (meeting prep with contacts)
- [ ] Task system linked to contacts
- [ ] Contact enrichment (company info, timezone)
- [ ] Email templates
- [ ] Email scheduling (send later)
- [ ] Shared contacts (team feature)

---

## Cost Implications

### Agentmail

- Currently paying per-inbox. Check pricing for:
  - Webhook volume (new emails across all users)
  - API call volume (each dashboard page load = API calls)
  - Storage (email retention)
- Estimate: with 100 users, ~500-2000 API calls/day for inbox browsing

### Turso

- New tables add rows but SQLite is efficient
- `email_search_index` could grow large (1 row per email per user)
- `contact_interactions` grows linearly with activity
- Estimate: negligible cost increase for <1000 users

### LLM Costs (AI Features)

- Email summarization: ~500-1000 tokens per summary (Sonnet)
- Contact extraction from chat: near-zero (done inline with response)
- AI drafts: ~500-2000 tokens per draft
- These are charged to user's Automna credit balance (existing system)

### Compute

- No additional Fly machines needed
- Vercel serverless handles email API routes (within existing plan)
- Webhook processing is lightweight

---

## Open Questions

1. **Agentmail thread support:** Does the SDK provide native thread grouping, or do we need to build threading from `In-Reply-To` / `References` headers?

2. **Agentmail search:** Does the API support server-side search, or must we build our own search index? This determines whether `email_search_index` table is necessary.

3. **Webhook reliability:** What happens if our webhook endpoint is down? Does Agentmail retry? Do we need a dead letter queue?

4. **Email rendering:** Agentmail returns HTML email bodies. Do we render raw HTML (XSS risk) or convert to safe markdown? Need an HTML sanitizer (like DOMPurify).

5. **Contact photo/avatar:** Do we try to resolve Gravatar from email? Or leave blank until user uploads?

6. **Multi-device read status:** If user reads email on phone (via forwarding to personal email), our read status is out of sync. Accept this limitation?

7. **AI sending autonomy:** Should the AI ever send email without explicit approval? Current spec says no. But advanced users might want "handle routine replies automatically."

8. **Shared inbox (future):** Teams sharing an inbox? This complicates the data model significantly. Punt to v2.

9. **Email forwarding:** Should users be able to forward their personal email to their Automna inbox? This would bring in much more volume and contact data.

10. **Agentmail rate limits:** What are Agentmail's API rate limits? We need to know before building the dashboard polling pattern.

11. **Contact dedup confidence:** How aggressive should auto-merge be? "John" in chat + "John Smith <john@company.com>" in email—same person? Probably need user confirmation for non-obvious matches.

12. **Notification delivery:** For Phase 1, polling is fine. But eventually we need push (SSE, WebSocket, or service worker push notifications). When do we invest in this?

---

*This spec is a living document. Update as decisions are made and questions resolved.*
