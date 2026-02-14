/**
 * Turso/Drizzle Schema
 * 
 * Database schema for Automna user and machine management.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Users table - synced from Clerk webhooks
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // Clerk user ID (user_xxx)
  email: text("email"),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Machines table - Fly machine tracking
export const machines = sqliteTable("machines", {
  id: text("id").primaryKey(), // Fly machine ID
  userId: text("user_id").notNull().unique().references(() => users.id),
  appName: text("app_name"), // Fly app name (automna-u-xxx)
  region: text("region").notNull(), // e.g., 'sjc'
  volumeId: text("volume_id"),
  status: text("status").default("created"), // created, started, stopped, destroyed
  ipAddress: text("ip_address"),
  gatewayToken: text("gateway_token"), // Per-user gateway auth token
  browserbaseContextId: text("browserbase_context_id"), // Browserbase persistent context for this user
  agentmailInboxId: text("agentmail_inbox_id"), // Agentmail inbox for this user (e.g., automna-abc123@agentmail.to)
  plan: text("plan").default("starter"), // User's subscription plan: starter, pro, power
  byokProvider: text("byok_provider"), // 'anthropic_oauth' | 'anthropic_api_key' | 'proxy' | null
  byokEnabled: integer("byok_enabled").default(0),
  effectivePlan: text("effective_plan"), // Higher plan to honor until effectivePlanUntil (for downgrades)
  effectivePlanUntil: integer("effective_plan_until"), // Unix timestamp - use effectivePlan limits until this time
  lastSessionKey: text("last_session_key").default("main"), // Last active conversation key (for webhook routing)
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  lastActiveAt: integer("last_active_at", { mode: "timestamp" }),
}, (table) => ({
  userIdIdx: index("idx_machines_user_id").on(table.userId),
  statusIdx: index("idx_machines_status").on(table.status),
  appNameIdx: index("idx_machines_app_name").on(table.appName),
}));

// Machine events - audit log
export const machineEvents = sqliteTable("machine_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  machineId: text("machine_id").notNull().references(() => machines.id),
  eventType: text("event_type").notNull(), // created, started, stopped, destroyed, error
  details: text("details"), // JSON blob
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  machineIdIdx: index("idx_machine_events_machine_id").on(table.machineId),
}));

// Secrets table - encrypted user secrets (API keys, tokens, etc.)
export const secrets = sqliteTable("secrets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(), // e.g., "discord_token", "browserbase_key"
  encryptedValue: text("encrypted_value").notNull(), // AES-256-GCM encrypted
  iv: text("iv").notNull(), // Initialization vector
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index("idx_secrets_user_id").on(table.userId),
  userNameUnique: index("idx_secrets_user_name").on(table.userId, table.name),
}));

// ============================================
// LLM USAGE TRACKING
// ============================================

// LLM usage logs - track every API call
export const llmUsage = sqliteTable("llm_usage", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  timestamp: integer("timestamp").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  
  // Request details
  provider: text("provider").notNull(), // 'anthropic' | 'gemini' | 'openai'
  model: text("model").notNull(),       // 'claude-opus-4-5' | 'claude-sonnet-4' | etc.
  endpoint: text("endpoint").notNull(), // 'chat' | 'embed'
  
  // Token counts
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  
  // Cost in microdollars (1 USD = 1,000,000 microdollars)
  costMicrodollars: integer("cost_microdollars").notNull().default(0),
  
  // Request metadata
  sessionKey: text("session_key"),      // Which conversation
  requestId: text("request_id"),        // For debugging
  durationMs: integer("duration_ms"),   // How long the request took
  
  // Error tracking
  error: text("error"),                 // Error message if failed
}, (table) => ({
  userTimestampIdx: index("idx_llm_usage_user_timestamp").on(table.userId, table.timestamp),
}));

// Rate limit tracking - per-minute counters
export const llmRateLimits = sqliteTable("llm_rate_limits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique(),
  
  // Current minute tracking (for RPM limits)
  currentMinute: integer("current_minute").notNull().default(0),
  requestsThisMinute: integer("requests_this_minute").notNull().default(0),
  tokensThisMinute: integer("tokens_this_minute").notNull().default(0),
  
  // Last reset timestamp
  lastReset: integer("last_reset").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ============================================
// EMAIL TRACKING
// ============================================

// Email sends - track outgoing emails for rate limiting
export const emailSends = sqliteTable("email_sends", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  sentAt: integer("sent_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  recipient: text("recipient").notNull(),
  subject: text("subject"),
}, (table) => ({
  userSentAtIdx: index("idx_email_sends_user_sent_at").on(table.userId, table.sentAt),
}));

// ============================================
// UNIFIED USAGE EVENTS (Automna Credit billing)
// ============================================

// Tracks ALL billable activity: LLM, search, browser, calls, email
export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  timestamp: integer("timestamp").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  eventType: text("event_type").notNull(), // 'llm' | 'search' | 'browser' | 'call' | 'email' | 'embedding'
  automnaTokens: integer("automna_tokens").notNull().default(0),
  costMicrodollars: integer("cost_microdollars").notNull().default(0),
  metadata: text("metadata"), // JSON
  error: text("error"),
}, (table) => ({
  userTimestampIdx: index("idx_usage_events_user_ts").on(table.userId, table.timestamp),
  eventTypeIdx: index("idx_usage_events_type").on(table.eventType),
}));

// ============================================
// BYOK PLAN LIMITS
// ============================================
// Users bring their own Claude key. We charge for infrastructure + services.
export const PLAN_LIMITS = {
  starter: {  // $20/mo - sleeps idle, no phone, no cron
    monthlyServiceCredits: 20_000, // $2 worth — covers search/browser/email/LLM fallback
    monthlySearches: 500,
    monthlyBrowserMinutes: 60,
    monthlyEmails: 100,
    monthlyCallMinutes: 0,
    maxChannels: -1,
    cronEnabled: false,
    customSkills: true,
    fileBrowser: true,
    apiAccess: false,
    sleepWhenIdle: true,
  },
  pro: {  // $30/mo - always-on, phone, cron
    monthlyServiceCredits: 50_000, // $5 worth
    monthlySearches: 2000,
    monthlyBrowserMinutes: 300,
    monthlyEmails: 500,
    monthlyCallMinutes: 60,
    maxChannels: -1,
    cronEnabled: true,
    customSkills: true,
    fileBrowser: true,
    apiAccess: false,
    sleepWhenIdle: false,
  },
  power: {  // $40/mo - unlimited channels, API, team
    monthlyServiceCredits: 50_000, // $5 worth
    monthlySearches: 10000,
    monthlyBrowserMinutes: 1000,
    monthlyEmails: 2000,
    monthlyCallMinutes: 120,
    maxChannels: -1,
    cronEnabled: true,
    customSkills: true,
    fileBrowser: true,
    apiAccess: true,
    sleepWhenIdle: false,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

// Legacy plan limits (kept for migration compatibility)
export const LEGACY_PLAN_LIMITS = {
  free: { monthlyAutomnaCredits: 10_000, monthlyTokens: 100_000, monthlyCostCents: 100, requestsPerMinute: 5, tokensPerMinute: 10_000, monthlyCallMinutes: 0 },
  lite: { monthlyAutomnaCredits: 50_000, monthlyTokens: 50_000, monthlyCostCents: 500, requestsPerMinute: 10, tokensPerMinute: 25_000, monthlyCallMinutes: 30 },
  starter: { monthlyAutomnaCredits: 200_000, monthlyTokens: 500_000, monthlyCostCents: 2000, requestsPerMinute: 20, tokensPerMinute: 50_000, monthlyCallMinutes: 30 },
  pro: { monthlyAutomnaCredits: 1_000_000, monthlyTokens: 2_000_000, monthlyCostCents: 10000, requestsPerMinute: 60, tokensPerMinute: 150_000, monthlyCallMinutes: 60 },
  power: { monthlyAutomnaCredits: 5_000_000, monthlyTokens: 10_000_000, monthlyCostCents: 50000, requestsPerMinute: 120, tokensPerMinute: 300_000, monthlyCallMinutes: 120 },
  business: { monthlyAutomnaCredits: 5_000_000, monthlyTokens: 10_000_000, monthlyCostCents: 50000, requestsPerMinute: 120, tokensPerMinute: 300_000, monthlyCallMinutes: 300 },
} as const;

// ============================================
// ANNOUNCEMENTS (Onboarding + Updates)
// ============================================

// Announcement types: 'new_user' (first provision) or 'all_users' (broadcast)
export const announcements = sqliteTable("announcements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(), // 'new_user' | 'all_users'
  title: text("title").notNull(),
  content: text("content").notNull(), // Markdown content
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  version: integer("version").default(1), // Increment to re-show to users who dismissed
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  typeIdx: index("idx_announcements_type").on(table.type),
}));

// Track which users have dismissed which announcement versions
export const announcementDismissals = sqliteTable("announcement_dismissals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  announcementId: text("announcement_id").notNull().references(() => announcements.id),
  dismissedVersion: integer("dismissed_version").notNull(), // Version they dismissed
  dismissedAt: integer("dismissed_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userAnnouncementIdx: index("idx_dismissals_user_announcement").on(table.userId, table.announcementId),
}));

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

  // Identity configuration
  agentName: text("agent_name").default("AI Assistant"), // "Sarah", "Jake", etc.
  agentRole: text("agent_role"), // "receptionist at Bright Smiles Dental"
  voiceId: text("voice_id").default("6277266e-01eb-44c6-b965-438566ef7076"), // Bland voice ID (default: Alexandra)

  // Inbound call configuration
  inboundPrompt: text("inbound_prompt"), // System prompt for incoming calls
  inboundFirstSentence: text("inbound_first_sentence"), // e.g., "Hello, how can I help you?"

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

  // Session context
  sessionKey: text("session_key"), // Conversation that initiated this call (locked at initiation time)

  // Call metadata
  task: text("task"), // Outbound: the prompt/task given
  transcript: text("transcript"), // Full transcript
  summary: text("summary"), // AI-generated summary
  recordingUrl: text("recording_url"),

  // Cost tracking (in cents)
  costCents: integer("cost_cents"),

  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => ({
  userIdIdx: index("idx_call_usage_user_id").on(table.userId),
  blandCallIdIdx: index("idx_call_usage_bland_call_id").on(table.blandCallId),
  createdAtIdx: index("idx_call_usage_created_at").on(table.createdAt),
}));

// ============================================
// PROVISIONING STATUS TRACKING
// ============================================

// Tracks real-time provisioning progress (separate from machines table)
// No row = user is either not provisioning or already has a machine (treat as ready)
export const provisionStatus = sqliteTable("provision_status", {
  userId: text("user_id").primaryKey().references(() => users.id),
  status: text("status").notNull().default("pending"),
  // pending | creating_app | allocating_ips | creating_integrations | creating_machine | starting | waiting_for_gateway | ready | error
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ============================================
// PREPAID CREDITS (Bill me as I go)
// ============================================

export const creditBalances = sqliteTable("credit_balances", {
  userId: text("user_id").primaryKey().references(() => users.id),
  balance: integer("balance").notNull().default(0), // Credits remaining
  autoRefillEnabled: integer("auto_refill_enabled").notNull().default(0),
  autoRefillAmountCents: integer("auto_refill_amount_cents").notNull().default(1000), // $10 default
  autoRefillThreshold: integer("auto_refill_threshold").notNull().default(10000), // Refill when below 10K
  monthlyCostCapCents: integer("monthly_cost_cap_cents").notNull().default(0), // 0 = no cap
  monthlySpentCents: integer("monthly_spent_cents").notNull().default(0),
  monthlySpentResetAt: integer("monthly_spent_reset_at"), // Unix timestamp for next monthly reset
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const creditTransactions = sqliteTable("credit_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'purchase' | 'usage' | 'refill' | 'bonus'
  amount: integer("amount").notNull(), // Positive for additions, negative for deductions
  balanceAfter: integer("balance_after").notNull(),
  stripePaymentId: text("stripe_payment_id"),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index("idx_credit_tx_user").on(table.userId),
}));

// Credit pack pricing
export const CREDIT_PACKS = [
  { id: 'pack_50k', credits: 50_000, priceCents: 500, label: '50K credits', priceLabel: '$5' },
  { id: 'pack_100k', credits: 100_000, priceCents: 1000, label: '100K credits', priceLabel: '$10' },
  { id: 'pack_300k', credits: 300_000, priceCents: 2500, label: '300K credits', priceLabel: '$25' },
  { id: 'pack_750k', credits: 750_000, priceCents: 5000, label: '750K credits', priceLabel: '$50' },
] as const;

export type CreditPackId = typeof CREDIT_PACKS[number]['id'];

// ============================================
// TYPE EXPORTS
// ============================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Machine = typeof machines.$inferSelect;
export type NewMachine = typeof machines.$inferInsert;
export type MachineEvent = typeof machineEvents.$inferSelect;
export type NewMachineEvent = typeof machineEvents.$inferInsert;
export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
export type LlmRateLimit = typeof llmRateLimits.$inferSelect;
export type EmailSend = typeof emailSends.$inferSelect;
export type NewEmailSend = typeof emailSends.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type AnnouncementDismissal = typeof announcementDismissals.$inferSelect;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type NewPhoneNumber = typeof phoneNumbers.$inferInsert;
export type CallUsage = typeof callUsage.$inferSelect;
export type NewCallUsage = typeof callUsage.$inferInsert;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type ProvisionStatus = typeof provisionStatus.$inferSelect;
export type NewProvisionStatus = typeof provisionStatus.$inferInsert;
export type CreditBalance = typeof creditBalances.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
