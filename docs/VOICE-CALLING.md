# Voice Calling Feature Spec

**Status:** Implemented ✅ (deployed 2026-02-07)  
**Available Tiers:** Pro ($149/mo), Business ($299/mo)  
**Not included:** Starter ($79/mo)

## Overview

Add voice calling capabilities to Automna agents via Twilio + Bland.ai integration. Users get a dedicated US phone number and can make/receive AI-powered calls.

**Default Voice:** Alexandra (Young chirpy American female)  
**Voice ID:** `6277266e-01eb-44c6-b965-438566ef7076`

## Architecture

### Outbound Call Flow
```
User's OpenClaw Agent
        │
        ▼ call_phone tool
automna-proxy.fly.dev/api/user/call
        │ (validate gateway token, check limits, log)
        ▼
Bland.ai API (POST /v1/calls)
        │
        ▼
Phone Network → Recipient
        │
        ▼ (call ends)
Bland webhook → automna-proxy.fly.dev/api/webhooks/bland/status
        │
        ▼ (parallel)
   ┌────┴────┐
   ▼         ▼
Turso DB   Direct file write to user's Fly volume
   │         (calls/YYYY-MM-DD_HHMM_outbound_+1234.md)
   │
   ▼
Inject message into user's OpenClaw session
   (agent can act on result: calendar, follow-up, etc.)
```

### Inbound Call Flow
```
Caller → User's Twilio Number
             │
             ▼ (Twilio forwards to Bland)
Bland.ai handles call
             │
             ▼ (uses user's inbound config)
AI Conversation
             │
             ▼ (call ends)
Bland webhook → automna-proxy.fly.dev/api/webhooks/bland/status
             │
             ▼ (parallel)
        ┌────┴────┐
        ▼         ▼
     Turso DB   Direct file write
        │
        ▼
  Inject message into user's session
  ("You received a call from +1234. Summary: ...")
```

---

## Database Schema

Add to `landing/src/lib/db/schema.ts`:

```typescript
// ============================================
// VOICE CALLING
// ============================================

// Phone numbers assigned to users (one per user)
export const phoneNumbers = sqliteTable("phone_numbers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique().references(() => users.id),
  phoneNumber: text("phone_number").notNull().unique(), // E.164: +12025551234
  twilioSid: text("twilio_sid").notNull(), // Twilio phone number SID
  blandImported: integer("bland_imported", { mode: "boolean" }).default(false),
  
  // Inbound call configuration
  inboundPrompt: text("inbound_prompt"), // System prompt for incoming calls
  inboundFirstSentence: text("inbound_first_sentence"), // e.g., "Hello, how can I help you?"
  voiceId: text("voice_id").default("alexandra"), // Bland voice ID
  
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index("idx_phone_numbers_user_id").on(table.userId),
}));

// Call usage tracking
export const callUsage = sqliteTable("call_usage", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  blandCallId: text("bland_call_id").notNull().unique(), // Bland's call UUID
  
  direction: text("direction").notNull(), // 'inbound' | 'outbound'
  toNumber: text("to_number").notNull(),
  fromNumber: text("from_number").notNull(),
  
  status: text("status").notNull().default("initiated"), // initiated | in_progress | completed | failed | no_answer | voicemail
  durationSeconds: integer("duration_seconds"), // Filled after call ends
  
  // Call metadata
  task: text("task"), // Outbound: the prompt/task given
  transcript: text("transcript"), // Full transcript (JSON)
  recordingUrl: text("recording_url"),
  summary: text("summary"), // AI-generated summary
  
  // Cost tracking (in cents)
  costCents: integer("cost_cents"),
  
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => ({
  userIdIdx: index("idx_call_usage_user_id").on(table.userId),
  blandCallIdIdx: index("idx_call_usage_bland_call_id").on(table.blandCallId),
  createdAtIdx: index("idx_call_usage_created_at").on(table.createdAt),
}));

// Type exports
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type NewPhoneNumber = typeof phoneNumbers.$inferInsert;
export type CallUsage = typeof callUsage.$inferSelect;
export type NewCallUsage = typeof callUsage.$inferInsert;
```

Update `PLAN_LIMITS` in schema:

```typescript
export const PLAN_LIMITS = {
  free: {
    // ... existing
    monthlyCallMinutes: 0,
  },
  starter: {
    // ... existing  
    monthlyCallMinutes: 0, // No calling on starter
  },
  pro: {
    // ... existing
    monthlyCallMinutes: 60, // 60 minutes/month
  },
  business: {
    // ... existing
    monthlyCallMinutes: 300, // 300 minutes/month
  },
} as const;
```

---

## API Endpoints

### 1. `POST /api/user/call` - Make Outbound Call

**Location:** `landing/src/app/api/user/call/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, phoneNumbers, callUsage, PLAN_LIMITS } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

const BLAND_API_KEY = process.env.BLAND_API_KEY!;
const BLAND_API_URL = "https://api.bland.ai/v1";

// Twilio encrypted key for BYOT (generated during setup)
const TWILIO_ENCRYPTED_KEY = process.env.TWILIO_BLAND_ENCRYPTED_KEY!;

interface CallRequest {
  to: string;           // E.164 phone number
  task: string;         // What the AI should do/say
  first_sentence?: string;
  voice_id?: string;    // Override default voice
  max_duration?: number; // Max call length in minutes (default 5)
  record?: boolean;     // Record the call (default true)
  voicemail_action?: "hangup" | "leave_message" | "ignore";
  voicemail_message?: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validate gateway token
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }
    
    // Look up user by gateway token
    const machine = await db.query.machines.findFirst({
      where: eq(machines.gatewayToken, token),
    });
    
    if (!machine) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    
    const userId = machine.userId;
    const plan = machine.plan || "starter";
    
    // 2. Check plan has calling enabled
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    if (!limits.monthlyCallMinutes || limits.monthlyCallMinutes === 0) {
      return NextResponse.json({ 
        error: "Voice calling not available on your plan",
        upgrade_url: "https://automna.ai/pricing"
      }, { status: 403 });
    }
    
    // 3. Check user has a phone number
    const userPhone = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.userId, userId),
    });
    
    if (!userPhone) {
      return NextResponse.json({ 
        error: "No phone number provisioned. Please contact support." 
      }, { status: 400 });
    }
    
    // 4. Check monthly minute limit
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyUsage = await db
      .select({ totalSeconds: sql<number>`COALESCE(SUM(${callUsage.durationSeconds}), 0)` })
      .from(callUsage)
      .where(and(
        eq(callUsage.userId, userId),
        gte(callUsage.createdAt, startOfMonth)
      ));
    
    const usedMinutes = Math.ceil((monthlyUsage[0]?.totalSeconds || 0) / 60);
    
    if (usedMinutes >= limits.monthlyCallMinutes) {
      return NextResponse.json({
        error: "Monthly call limit reached",
        used_minutes: usedMinutes,
        limit_minutes: limits.monthlyCallMinutes,
      }, { status: 429 });
    }
    
    // 5. Parse request
    const body: CallRequest = await req.json();
    
    if (!body.to || !body.task) {
      return NextResponse.json({ 
        error: "Missing required fields: to, task" 
      }, { status: 400 });
    }
    
    // Validate phone number format (E.164)
    if (!body.to.match(/^\+1[2-9]\d{9}$/)) {
      return NextResponse.json({ 
        error: "Invalid US phone number. Use E.164 format: +12025551234" 
      }, { status: 400 });
    }
    
    // 6. Make Bland API call
    const blandRequest = {
      phone_number: body.to,
      from: userPhone.phoneNumber,
      task: body.task,
      first_sentence: body.first_sentence,
      voice: body.voice_id || userPhone.voiceId || "alexandra",
      model: "base",
      language: "en-US",
      max_duration: body.max_duration || 5,
      record: body.record !== false, // Default true
      
      // Voicemail handling
      voicemail: {
        action: body.voicemail_action || "hangup",
        message: body.voicemail_message,
      },
      
      // Webhook for call status updates
      webhook: "https://automna-proxy.fly.dev/api/webhooks/bland/status",
      
      // Metadata for tracking
      metadata: {
        user_id: userId,
        automna: true,
      },
      
      // Nice office background for natural feel
      background_track: "office",
    };
    
    const blandResponse = await fetch(`${BLAND_API_URL}/calls`, {
      method: "POST",
      headers: {
        "Authorization": BLAND_API_KEY,
        "Content-Type": "application/json",
        "encrypted_key": TWILIO_ENCRYPTED_KEY, // BYOT auth
      },
      body: JSON.stringify(blandRequest),
    });
    
    if (!blandResponse.ok) {
      const error = await blandResponse.text();
      console.error("Bland API error:", error);
      return NextResponse.json({ 
        error: "Failed to initiate call" 
      }, { status: 502 });
    }
    
    const blandData = await blandResponse.json();
    
    // 7. Log call initiation
    await db.insert(callUsage).values({
      userId,
      blandCallId: blandData.call_id,
      direction: "outbound",
      toNumber: body.to,
      fromNumber: userPhone.phoneNumber,
      status: "initiated",
      task: body.task,
    });
    
    // 8. Return success
    return NextResponse.json({
      success: true,
      call_id: blandData.call_id,
      from: userPhone.phoneNumber,
      to: body.to,
      status: "initiated",
      remaining_minutes: limits.monthlyCallMinutes - usedMinutes,
    });
    
  } catch (error) {
    console.error("Call API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### 2. `POST /api/webhooks/bland/status` - Call Status Updates

**Location:** `landing/src/app/api/webhooks/bland/status/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callUsage } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Bland webhook payload types
interface BlandWebhookPayload {
  call_id: string;
  status: "completed" | "failed" | "no-answer" | "voicemail";
  call_length?: number; // Duration in seconds
  transcript?: string;  // Full transcript
  recording_url?: string;
  summary?: string;
  error_message?: string;
  to: string;
  from: string;
  metadata?: {
    user_id?: string;
    automna?: boolean;
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload: BlandWebhookPayload = await req.json();
    
    // Verify this is our call (has automna metadata)
    if (!payload.metadata?.automna) {
      return NextResponse.json({ ok: true }); // Ignore non-Automna calls
    }
    
    // Map Bland status to our status
    const statusMap: Record<string, string> = {
      "completed": "completed",
      "failed": "failed", 
      "no-answer": "no_answer",
      "voicemail": "voicemail",
    };
    
    // Calculate cost (Bland charges ~$0.12/min on Build tier)
    const durationSeconds = payload.call_length || 0;
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const costCents = durationMinutes * 12; // $0.12/min = 12 cents
    
    // Update call record
    await db.update(callUsage)
      .set({
        status: statusMap[payload.status] || payload.status,
        durationSeconds,
        transcript: payload.transcript,
        recordingUrl: payload.recording_url,
        summary: payload.summary,
        costCents,
        completedAt: new Date(),
      })
      .where(eq(callUsage.blandCallId, payload.call_id));
    
    return NextResponse.json({ ok: true });
    
  } catch (error) {
    console.error("Bland webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
```

### 3. `GET /api/user/call/usage` - Get Call Usage

**Location:** `landing/src/app/api/user/call/usage/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, phoneNumbers, callUsage, PLAN_LIMITS } from "@/lib/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }
    
    const machine = await db.query.machines.findFirst({
      where: eq(machines.gatewayToken, token),
    });
    
    if (!machine) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    
    const userId = machine.userId;
    const plan = machine.plan || "starter";
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    
    // Get user's phone number
    const userPhone = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.userId, userId),
    });
    
    // Calculate monthly usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyStats = await db
      .select({
        totalSeconds: sql<number>`COALESCE(SUM(${callUsage.durationSeconds}), 0)`,
        totalCalls: sql<number>`COUNT(*)`,
        totalCostCents: sql<number>`COALESCE(SUM(${callUsage.costCents}), 0)`,
      })
      .from(callUsage)
      .where(and(
        eq(callUsage.userId, userId),
        gte(callUsage.createdAt, startOfMonth)
      ));
    
    const usedMinutes = Math.ceil((monthlyStats[0]?.totalSeconds || 0) / 60);
    
    // Get recent calls
    const recentCalls = await db.query.callUsage.findMany({
      where: eq(callUsage.userId, userId),
      orderBy: desc(callUsage.createdAt),
      limit: 20,
    });
    
    return NextResponse.json({
      phone_number: userPhone?.phoneNumber || null,
      voice_id: userPhone?.voiceId || "alexandra",
      plan,
      usage: {
        used_minutes: usedMinutes,
        limit_minutes: limits.monthlyCallMinutes || 0,
        remaining_minutes: Math.max(0, (limits.monthlyCallMinutes || 0) - usedMinutes),
        total_calls: monthlyStats[0]?.totalCalls || 0,
        total_cost_cents: monthlyStats[0]?.totalCostCents || 0,
      },
      recent_calls: recentCalls.map(call => ({
        id: call.id,
        call_id: call.blandCallId,
        direction: call.direction,
        to: call.toNumber,
        from: call.fromNumber,
        status: call.status,
        duration_seconds: call.durationSeconds,
        summary: call.summary,
        created_at: call.createdAt,
      })),
    });
    
  } catch (error) {
    console.error("Usage API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

---

## Phone Number Provisioning

### Twilio Integration

**Location:** `landing/src/lib/twilio.ts`

```typescript
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;

const client = twilio(accountSid, authToken);

export async function provisionPhoneNumber(areaCode?: string): Promise<{
  phoneNumber: string;
  sid: string;
}> {
  // Search for available US local numbers
  const available = await client.availablePhoneNumbers("US")
    .local
    .list({
      areaCode: areaCode ? parseInt(areaCode) : undefined,
      limit: 1,
    });
  
  if (available.length === 0) {
    throw new Error("No available phone numbers");
  }
  
  // Purchase the number
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: "Automna User Number",
    // Don't configure webhooks here - Bland handles via BYOT
  });
  
  return {
    phoneNumber: purchased.phoneNumber,
    sid: purchased.sid,
  };
}

export async function releasePhoneNumber(sid: string): Promise<void> {
  await client.incomingPhoneNumbers(sid).remove();
}
```

### Bland BYOT Import

**Location:** `landing/src/lib/bland.ts`

```typescript
const BLAND_API_KEY = process.env.BLAND_API_KEY!;
const TWILIO_ENCRYPTED_KEY = process.env.TWILIO_BLAND_ENCRYPTED_KEY!;
const BLAND_API_URL = "https://api.bland.ai/v1";

export async function importNumberToBland(phoneNumber: string): Promise<boolean> {
  const response = await fetch(`${BLAND_API_URL}/inbound/insert`, {
    method: "POST",
    headers: {
      "Authorization": BLAND_API_KEY,
      "Content-Type": "application/json",
      "encrypted_key": TWILIO_ENCRYPTED_KEY,
    },
    body: JSON.stringify({
      numbers: [phoneNumber],
    }),
  });
  
  if (!response.ok) {
    console.error("Failed to import number to Bland:", await response.text());
    return false;
  }
  
  return true;
}

export async function configureInboundNumber(
  phoneNumber: string,
  config: {
    prompt: string;
    firstSentence?: string;
    voiceId?: string;
  }
): Promise<boolean> {
  const response = await fetch(`${BLAND_API_URL}/inbound/${encodeURIComponent(phoneNumber)}`, {
    method: "POST",
    headers: {
      "Authorization": BLAND_API_KEY,
      "Content-Type": "application/json",
      "encrypted_key": TWILIO_ENCRYPTED_KEY,
    },
    body: JSON.stringify({
      prompt: config.prompt,
      first_sentence: config.firstSentence || "Hello, how can I help you today?",
      voice: config.voiceId || "alexandra",
      model: "base",
      language: "en-US",
      webhook: "https://automna-proxy.fly.dev/api/webhooks/bland/status",
      record: true,
      background_track: "office",
    }),
  });
  
  if (!response.ok) {
    console.error("Failed to configure inbound:", await response.text());
    return false;
  }
  
  return true;
}
```

### Provisioning on Plan Upgrade

Add to Stripe webhook handler (`landing/src/app/api/webhooks/stripe/route.ts`):

```typescript
import { provisionPhoneNumber } from "@/lib/twilio";
import { importNumberToBland, configureInboundNumber } from "@/lib/bland";
import { phoneNumbers } from "@/lib/db/schema";

// Inside handleSubscriptionUpdated():

// Check if upgrading to a plan with calling
const plansWithCalling = ["pro", "business"];
const previousPlan = previousAttributes?.plan || "starter";
const newPlan = subscription.metadata?.plan || "pro";

if (plansWithCalling.includes(newPlan) && !plansWithCalling.includes(previousPlan)) {
  // User is upgrading to a calling-enabled plan
  const existingPhone = await db.query.phoneNumbers.findFirst({
    where: eq(phoneNumbers.userId, userId),
  });
  
  if (!existingPhone) {
    try {
      // 1. Provision Twilio number
      const { phoneNumber, sid } = await provisionPhoneNumber();
      
      // 2. Import to Bland
      await importNumberToBland(phoneNumber);
      
      // 3. Configure inbound with default prompt
      await configureInboundNumber(phoneNumber, {
        prompt: `You are a helpful AI assistant for an Automna user. 
                 Be friendly, professional, and helpful.
                 If you don't know something, say so.
                 Keep responses concise.`,
        firstSentence: "Hello, this is an AI assistant. How can I help you?",
      });
      
      // 4. Save to database
      await db.insert(phoneNumbers).values({
        userId,
        phoneNumber,
        twilioSid: sid,
        blandImported: true,
        inboundPrompt: "You are a helpful AI assistant...",
        inboundFirstSentence: "Hello, this is an AI assistant. How can I help you?",
        voiceId: "alexandra",
      });
      
      console.log(`Provisioned phone number ${phoneNumber} for user ${userId}`);
      
    } catch (error) {
      console.error("Failed to provision phone number:", error);
      // Don't fail the subscription - just log and continue
      // User can contact support to get number provisioned manually
    }
  }
}
```

---

## OpenClaw Tool Configuration

Add to user's agent tools (during machine provisioning):

```yaml
# In the OpenClaw config template
tools:
  - name: call_phone
    description: |
      Make a phone call to someone. The AI will conduct the conversation based on your instructions.
      Use this for appointment reminders, follow-ups, check-ins, or any phone-based task.
      
      Parameters:
      - to: Phone number in E.164 format (+12025551234)
      - task: Instructions for what the AI should accomplish on the call
      - first_sentence: (optional) Specific opening line
      - max_duration: (optional) Max call length in minutes (default 5)
      - voicemail_action: (optional) What to do if voicemail: "hangup", "leave_message", or "ignore"
      - voicemail_message: (optional) Message to leave on voicemail
    
    type: http
    http:
      url: https://automna-proxy.fly.dev/api/user/call
      method: POST
      headers:
        Authorization: "Bearer {{GATEWAY_TOKEN}}"
        Content-Type: application/json
      body_template: |
        {
          "to": "{{to}}",
          "task": "{{task}}",
          "first_sentence": "{{first_sentence}}",
          "max_duration": {{max_duration | default: 5}},
          "voicemail_action": "{{voicemail_action | default: 'hangup'}}",
          "voicemail_message": "{{voicemail_message}}"
        }
```

---

## Environment Variables

Add to Vercel:

```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Bland.ai
BLAND_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_BLAND_ENCRYPTED_KEY=xxxxxxxx  # Generated in Bland BYOT setup
```

---

## Usage Limits (v1)

| Plan | Monthly Minutes | Overage |
|------|-----------------|---------|
| Starter ($79/mo) | 0 (no calling) | N/A |
| Pro ($149/mo) | 60 min | Blocked |
| Business ($299/mo) | 300 min | Blocked |

**v2 (future):** Allow overage at $0.15/min

---

## Cost Analysis

**Per User (Pro tier, worst case - 60 min used):**
- Twilio number: $1/mo
- Bland usage: 60 min × $0.12 = $7.20/mo
- **Total: ~$8.20/mo** (at $149 price point = good margin)

**Per User (Business tier, worst case - 300 min used):**
- Twilio number: $1/mo
- Bland usage: 300 min × $0.12 = $36/mo
- **Total: ~$37/mo** (at $299 price point = very profitable)

Most users won't max out minutes, so average cost will be lower.

---

## Implementation Checklist

### Phase 1: Core Infrastructure ✅
- [x] Add database tables (`phoneNumbers`, `callUsage`) + migration columns (`sessionKey`, `lastSessionKey`)
- [x] Run Drizzle migration (Turso)
- [x] Set up Twilio account and get credentials
- [x] Set up Bland.ai account and get API key
- [x] Configure Bland BYOT (get encrypted key)
- [x] Add environment variables to Vercel
- [x] Provision test phone number (+17254339890)

### Phase 2: API Endpoints ✅
- [x] `POST /api/user/call` - make outbound calls (with session key capture)
- [x] `POST /api/user/call/status` - poll call status/transcript
- [x] `POST /api/webhooks/bland/status` - receive call updates + notify agent with session routing
- [x] `GET /api/user/call/usage` - get usage stats
- [x] `POST /api/user/sessions/active` - track active conversation for routing

### Phase 3: Agent Integration ✅
- [x] Disabled built-in voice-call plugin in OpenClaw config (avoids tool conflict)
- [x] Added phone call docs to workspace AGENTS.md and TOOLS.md (curl proxy instructions)
- [x] Workspace migration system (versioned, patches existing users on boot)
- [x] Agent polling loop for call completion (bash for-loop in docs)
- [x] Plan gating (Pro/Business only, 403 for Starter)
- [x] Docker image rebuilt with `jq` for polling script
- [x] Automna Token billing for calls (900 AT/min, 150 AT failed)

### Phase 4: Session Persistence & Routing ✅
- [x] Frontend `runIdSessionMap` for cross-talk prevention
- [x] Frontend `isEventForDifferentSession()` with `payload.sessionKey` support
- [x] Backend session key locked at call initiation time (multi-tab safe)
- [x] Webhook routes notification to correct conversation
- [x] Notification persists after page reload
- [x] Unread badges when events filter to different session
- [x] See: `docs/PHONE-CALL-SESSION-PERSISTENCE.md` for full details

### Phase 5: Dashboard UI
- [ ] Show phone number in settings
- [ ] Display usage (minutes used / limit)
- [ ] Call history log
- [ ] Inbound configuration (prompt, first sentence)

---

## Open Questions (Resolved)

- ~~Voice selection~~ → Default to Maya, allow override in call request
- ~~Inbound config~~ → Dashboard UI + API, stored in `phoneNumbers` table
- ~~Contact list~~ → No pre-approval required, any US number allowed
- ~~International~~ → US only for v1

---

## Security Considerations

1. **No direct Twilio/Bland credentials on user machines** - all calls proxied through our API
2. **Rate limiting** - monthly minute caps per plan
3. **US numbers only** - prevents international toll fraud
4. **Call recording** - enabled by default for audit trail
5. **Gateway token auth** - same security model as LLM proxy
