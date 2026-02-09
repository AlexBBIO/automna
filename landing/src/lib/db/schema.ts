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
  plan: text("plan").default("starter"), // User's subscription plan: free, starter, pro, business
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

// Plan limits (stored in code for simplicity)
// monthlyAutomnaCredits = cost cap / $0.0001 (1 AC = 100 microdollars)
export const PLAN_LIMITS = {
  free: {
    monthlyAutomnaCredits: 10_000,   // $1 real cost cap
    monthlyTokens: 100_000,         // LEGACY — remove after migration
    monthlyCostCents: 100,          // LEGACY — remove after migration
    requestsPerMinute: 5,
    tokensPerMinute: 10_000,
    monthlyCallMinutes: 0,
  },
  starter: {
    monthlyAutomnaCredits: 200_000,  // $20 real cost cap
    monthlyTokens: 500_000,         // LEGACY — remove after migration
    monthlyCostCents: 2000,         // LEGACY — remove after migration
    requestsPerMinute: 20,
    tokensPerMinute: 50_000,
    monthlyCallMinutes: 0,          // No calling on starter
  },
  pro: {
    monthlyAutomnaCredits: 1_000_000, // $100 real cost cap
    monthlyTokens: 2_000_000,        // LEGACY — remove after migration
    monthlyCostCents: 10000,         // LEGACY — remove after migration
    requestsPerMinute: 60,
    tokensPerMinute: 150_000,
    monthlyCallMinutes: 60,           // 60 minutes/month
  },
  business: {
    monthlyAutomnaCredits: 5_000_000, // $500 real cost cap
    monthlyTokens: 10_000_000,       // LEGACY — remove after migration
    monthlyCostCents: 50000,         // LEGACY — remove after migration
    requestsPerMinute: 120,
    tokensPerMinute: 300_000,
    monthlyCallMinutes: 300,       // 300 minutes/month
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

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
