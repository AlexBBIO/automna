// Re-export from the canonical schema
// This is a copy of the relevant tables from the landing project's schema.
// Keep in sync with: landing/src/lib/db/schema.ts

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const machines = sqliteTable("machines", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id),
  appName: text("app_name"),
  region: text("region").notNull(),
  volumeId: text("volume_id"),
  status: text("status").default("created"),
  ipAddress: text("ip_address"),
  gatewayToken: text("gateway_token"),
  browserbaseContextId: text("browserbase_context_id"),
  agentmailInboxId: text("agentmail_inbox_id"),
  plan: text("plan").default("starter"),
  byokProvider: text("byok_provider"),
  byokEnabled: integer("byok_enabled").default(0),
  effectivePlan: text("effective_plan"),
  effectivePlanUntil: integer("effective_plan_until"),
  lastSessionKey: text("last_session_key").default("main"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  lastActiveAt: integer("last_active_at", { mode: "timestamp" }),
}, (table) => ({
  userIdIdx: index("idx_machines_user_id").on(table.userId),
  statusIdx: index("idx_machines_status").on(table.status),
  appNameIdx: index("idx_machines_app_name").on(table.appName),
}));

export const llmUsage = sqliteTable("llm_usage", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  timestamp: integer("timestamp").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  endpoint: text("endpoint").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  costMicrodollars: integer("cost_microdollars").notNull().default(0),
  sessionKey: text("session_key"),
  requestId: text("request_id"),
  durationMs: integer("duration_ms"),
  error: text("error"),
}, (table) => ({
  userTimestampIdx: index("idx_llm_usage_user_timestamp").on(table.userId, table.timestamp),
}));

export const llmRateLimits = sqliteTable("llm_rate_limits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique(),
  currentMinute: integer("current_minute").notNull().default(0),
  requestsThisMinute: integer("requests_this_minute").notNull().default(0),
  tokensThisMinute: integer("tokens_this_minute").notNull().default(0),
  lastReset: integer("last_reset").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  timestamp: integer("timestamp").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  eventType: text("event_type").notNull(),
  automnaTokens: integer("automna_tokens").notNull().default(0),
  costMicrodollars: integer("cost_microdollars").notNull().default(0),
  metadata: text("metadata"),
  error: text("error"),
}, (table) => ({
  userTimestampIdx: index("idx_usage_events_user_ts").on(table.userId, table.timestamp),
  eventTypeIdx: index("idx_usage_events_type").on(table.eventType),
}));

export const emailSends = sqliteTable("email_sends", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  sentAt: integer("sent_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  recipient: text("recipient").notNull(),
  subject: text("subject"),
}, (table) => ({
  userSentAtIdx: index("idx_email_sends_user_sent_at").on(table.userId, table.sentAt),
}));

export const phoneNumbers = sqliteTable("phone_numbers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique().references(() => users.id),
  phoneNumber: text("phone_number").notNull().unique(),
  twilioSid: text("twilio_sid").notNull(),
  blandImported: integer("bland_imported", { mode: "boolean" }).default(false),
  agentName: text("agent_name").default("AI Assistant"),
  agentRole: text("agent_role"),
  voiceId: text("voice_id").default("6277266e-01eb-44c6-b965-438566ef7076"),
  inboundPrompt: text("inbound_prompt"),
  inboundFirstSentence: text("inbound_first_sentence"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index("idx_phone_numbers_user_id").on(table.userId),
}));

export const callUsage = sqliteTable("call_usage", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  blandCallId: text("bland_call_id").notNull().unique(),
  direction: text("direction").notNull(),
  toNumber: text("to_number").notNull(),
  fromNumber: text("from_number").notNull(),
  status: text("status").notNull().default("initiated"),
  durationSeconds: integer("duration_seconds"),
  sessionKey: text("session_key"),
  task: text("task"),
  transcript: text("transcript"),
  summary: text("summary"),
  recordingUrl: text("recording_url"),
  costCents: integer("cost_cents"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => ({
  userIdIdx: index("idx_call_usage_user_id").on(table.userId),
  blandCallIdIdx: index("idx_call_usage_bland_call_id").on(table.blandCallId),
  createdAtIdx: index("idx_call_usage_created_at").on(table.createdAt),
}));

// Credit balances (prepaid credits for proxy users)
export const creditBalances = sqliteTable("credit_balances", {
  userId: text("user_id").primaryKey(),
  balance: integer("balance").notNull().default(0),
  autoRefillEnabled: integer("auto_refill_enabled").notNull().default(0),
  autoRefillAmountCents: integer("auto_refill_amount_cents").notNull().default(1000),
  autoRefillThreshold: integer("auto_refill_threshold").notNull().default(10000),
  monthlyCostCapCents: integer("monthly_cost_cap_cents").notNull().default(0),
  monthlySpentCents: integer("monthly_spent_cents").notNull().default(0),
  monthlySpentResetAt: integer("monthly_spent_reset_at"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Plan limits
export const PLAN_LIMITS = {
  free: { monthlyAutomnaTokens: 10_000, requestsPerMinute: 5, tokensPerMinute: 10_000, monthlyCallMinutes: 0 },
  lite: { monthlyAutomnaTokens: 50_000, requestsPerMinute: 10, tokensPerMinute: 25_000, monthlyCallMinutes: 30 },
  starter: { monthlyAutomnaTokens: 200_000, requestsPerMinute: 20, tokensPerMinute: 50_000, monthlyCallMinutes: 30 },
  pro: { monthlyAutomnaTokens: 1_000_000, requestsPerMinute: 60, tokensPerMinute: 150_000, monthlyCallMinutes: 60 },
  business: { monthlyAutomnaTokens: 5_000_000, requestsPerMinute: 120, tokensPerMinute: 300_000, monthlyCallMinutes: 300 },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type CallUsage = typeof callUsage.$inferSelect;
