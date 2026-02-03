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

// Plan limits (stored in code for simplicity)
export const PLAN_LIMITS = {
  free: {
    monthlyTokens: 100_000,        // 100K tokens
    monthlyCostCents: 100,         // $1 cap
    requestsPerMinute: 5,
    tokensPerMinute: 10_000,
  },
  starter: {
    monthlyTokens: 2_000_000,      // 2M tokens
    monthlyCostCents: 2000,        // $20 cap
    requestsPerMinute: 20,
    tokensPerMinute: 50_000,
  },
  pro: {
    monthlyTokens: 10_000_000,     // 10M tokens
    monthlyCostCents: 10000,       // $100 cap
    requestsPerMinute: 60,
    tokensPerMinute: 150_000,
  },
  business: {
    monthlyTokens: 50_000_000,     // 50M tokens
    monthlyCostCents: 50000,       // $500 cap
    requestsPerMinute: 120,
    tokensPerMinute: 300_000,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
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
