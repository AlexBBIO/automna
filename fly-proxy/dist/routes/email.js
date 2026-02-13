import { Hono } from "hono";
import { extractToken, lookupGatewayToken } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { machines, emailSends } from "../lib/schema.js";
import { eq, and, gte, count } from "drizzle-orm";
import { logUsageEventBackground } from "../lib/usage-events.js";
import { EMAIL_SEND_COST_MICRODOLLARS } from "../lib/cost-constants.js";
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;
const DAILY_EMAIL_LIMIT = 50;
const app = new Hono();
// POST /send - Send email with rate limiting
app.post("/send", async (c) => {
    const token = extractToken(c);
    if (!token)
        return c.json({ error: "Missing authentication" }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ error: "Invalid gateway token" }, 401);
    // Get user's machine (for agentmail inbox)
    const userMachine = await db.query.machines.findFirst({
        where: eq(machines.userId, auth.userId),
    });
    if (!userMachine?.agentmailInboxId) {
        return c.json({ error: "Email not configured for this user" }, 400);
    }
    // Check rate limit
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);
    const countResult = await db
        .select({ count: count() })
        .from(emailSends)
        .where(and(eq(emailSends.userId, auth.userId), gte(emailSends.sentAt, todayStartUnix)));
    const todayCount = countResult[0]?.count || 0;
    if (todayCount >= DAILY_EMAIL_LIMIT) {
        return c.json({
            error: "Daily email limit reached",
            limit: DAILY_EMAIL_LIMIT,
            sent: todayCount,
            resetsAt: new Date(todayStart.getTime() + 86400000).toISOString(),
        }, 429);
    }
    const body = await c.req.json();
    const { to, subject, text, html, cc, bcc, attachments } = body;
    if (!to || !subject)
        return c.json({ error: "Missing required fields: to, subject" }, 400);
    // Build request body
    const emailBody = {
        to: Array.isArray(to) ? to.join(", ") : to,
        subject, text, html,
        cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc) : undefined,
    };
    // Pass through attachments if provided
    // Format: [{filename, content_type, content (base64), url}]
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailBody.attachments = attachments;
        console.log(`[FLY-PROXY][email/send] Sending with ${attachments.length} attachment(s)`);
    }
    // Send via Agentmail
    const agentmailResponse = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(userMachine.agentmailInboxId)}/messages/send`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${AGENTMAIL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(emailBody),
    });
    if (!agentmailResponse.ok) {
        const error = await agentmailResponse.text();
        console.error("[FLY-PROXY][email/send] Agentmail error:", error);
        return c.json({ error: "Failed to send email", details: error }, 500);
    }
    const result = await agentmailResponse.json();
    logUsageEventBackground({
        userId: auth.userId, eventType: 'email',
        costMicrodollars: EMAIL_SEND_COST_MICRODOLLARS,
        metadata: { recipient: Array.isArray(to) ? to[0] : to, subject, messageId: result.message_id },
    });
    await db.insert(emailSends).values({
        userId: auth.userId,
        sentAt: Math.floor(Date.now() / 1000),
        recipient: Array.isArray(to) ? to[0] : to,
        subject,
    });
    return c.json({ success: true, messageId: result.message_id, remaining: DAILY_EMAIL_LIMIT - todayCount - 1 });
});
// GET /inbox - List messages
app.get("/inbox", async (c) => {
    const token = extractToken(c);
    if (!token)
        return c.json({ error: "Missing authentication" }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ error: "Invalid gateway token" }, 401);
    const userMachine = await db.query.machines.findFirst({
        where: eq(machines.userId, auth.userId),
    });
    if (!userMachine?.agentmailInboxId) {
        return c.json({ error: "Email not configured for this user" }, 400);
    }
    const limit = c.req.query("limit") || "20";
    const offset = c.req.query("offset") || "0";
    const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(userMachine.agentmailInboxId)}/messages?limit=${limit}&offset=${offset}`, { headers: { "Authorization": `Bearer ${AGENTMAIL_API_KEY}` } });
    if (!response.ok) {
        const error = await response.text();
        return c.json({ error: "Failed to fetch inbox", details: error }, 500);
    }
    return c.json(await response.json());
});
// GET /inbox/:messageId - Get specific message
app.get("/inbox/:messageId", async (c) => {
    const token = extractToken(c);
    if (!token)
        return c.json({ error: "Missing authentication" }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ error: "Invalid gateway token" }, 401);
    const userMachine = await db.query.machines.findFirst({
        where: eq(machines.userId, auth.userId),
    });
    if (!userMachine?.agentmailInboxId) {
        return c.json({ error: "Email not configured for this user" }, 400);
    }
    const messageId = c.req.param("messageId");
    const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(userMachine.agentmailInboxId)}/messages/${encodeURIComponent(messageId)}`, { headers: { "Authorization": `Bearer ${AGENTMAIL_API_KEY}` } });
    if (!response.ok) {
        const error = await response.text();
        return c.json({ error: "Failed to fetch message", details: error }, response.status);
    }
    return c.json(await response.json());
});
export default app;
