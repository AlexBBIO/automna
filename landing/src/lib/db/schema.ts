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

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Machine = typeof machines.$inferSelect;
export type NewMachine = typeof machines.$inferInsert;
export type MachineEvent = typeof machineEvents.$inferSelect;
export type NewMachineEvent = typeof machineEvents.$inferInsert;
export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
