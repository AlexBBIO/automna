/**
 * Bland.ai Webhook - Call Status Updates
 *
 * Receives call completion events from Bland.
 * 1. Updates call record in database
 * 2. Logs usage event for billing
 * 3. Notifies user's agent session
 */
import { Hono } from "hono";
declare const app: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export default app;
