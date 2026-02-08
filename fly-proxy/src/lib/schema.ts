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

// Plan limits
export const PLAN_LIMITS = {
  free: { monthlyAutomnaTokens: 10_000, requestsPerMinute: 5, tokensPerMinute: 10_000, monthlyCallMinutes: 0 },
  starter: { monthlyAutomnaTokens: 200_000, requestsPerMinute: 20, tokensPerMinute: 50_000, monthlyCallMinutes: 0 },
  pro: { monthlyAutomnaTokens: 1_000_000, requestsPerMinute: 60, tokensPerMinute: 150_000, monthlyCallMinutes: 60 },
  business: { monthlyAutomnaTokens: 5_000_000, requestsPerMinute: 120, tokensPerMinute: 300_000, monthlyCallMinutes: 300 },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
