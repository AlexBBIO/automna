import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import anthropicRoutes from "./routes/anthropic.js";
import geminiRoutes from "./routes/gemini.js";
import braveRoutes from "./routes/brave.js";
import browserbaseRoutes from "./routes/browserbase.js";
import emailRoutes from "./routes/email.js";
import callRoutes from "./routes/call.js";
import blandWebhookRoutes from "./routes/bland-webhook.js";
const app = new Hono();
// Middleware
app.use("*", logger());
app.use("*", cors());
// Health check
app.get("/", (c) => c.json({ status: "ok", service: "automna-fly-proxy", timestamp: new Date().toISOString() }));
app.get("/health", (c) => c.json({ status: "ok" }));
// Route mounting
// Anthropic LLM proxy
app.route("/api/llm/v1", anthropicRoutes);
// Gemini proxy (strip the /api/gemini prefix)
app.route("/api/gemini", geminiRoutes);
// Brave Search proxy
app.route("/api/brave", braveRoutes);
// Browserbase proxy
app.route("/api/browserbase/v1", browserbaseRoutes);
// Email proxy (Agentmail)
app.route("/api/user/email", emailRoutes);
// Voice call proxy (Bland.ai)
app.route("/api/user/call", callRoutes);
// Bland webhook (no auth - called by Bland)
app.route("/api/webhooks/bland/status", blandWebhookRoutes);
// 404
app.notFound((c) => c.json({ error: "Not found", path: c.req.path }, 404));
// Error handler
app.onError((err, c) => {
    console.error("[FLY-PROXY] Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
});
// Start server
const port = parseInt(process.env.PORT || "8080", 10);
console.log(`[FLY-PROXY] Starting on port ${port}`);
console.log(`[FLY-PROXY] Routes: /api/llm/v1/messages, /api/gemini/*, /api/brave/*, /api/browserbase/v1/*, /api/user/email/*, /api/user/call/*, /api/webhooks/bland/status`);
export default {
    port,
    fetch: app.fetch,
};
