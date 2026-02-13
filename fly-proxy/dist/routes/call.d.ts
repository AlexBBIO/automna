/**
 * Voice Call API - Make Outbound Calls, Check Status, Get Usage
 *
 * Proxies outbound calls through Bland.ai with Twilio BYOT.
 * Auth: Gateway token in Authorization header.
 */
import { Hono } from "hono";
declare const app: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export default app;
