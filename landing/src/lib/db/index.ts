/**
 * Turso Database Client
 * 
 * Connects to Turso using libsql and exposes Drizzle ORM instance.
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Re-export schema tables and types
export { users, machines, machineEvents } from "./schema";
export type { User, NewUser, Machine, NewMachine, MachineEvent, NewMachineEvent } from "./schema";

// Create client - will fail at runtime if env vars not set (expected during build)
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "libsql://placeholder.turso.io",
  authToken: process.env.TURSO_AUTH_TOKEN || "placeholder",
});

// Create Drizzle instance with schema for relational queries
export const db = drizzle(client, { schema });
