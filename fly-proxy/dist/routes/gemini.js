import { Hono } from "hono";
import { extractToken, lookupGatewayToken } from "../middleware/auth.js";
import { logUsageEventBackground } from "../lib/usage-events.js";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const REQUEST_TIMEOUT = 120_000;
const GEMINI_COST_PER_REQUEST = 100; // ~$0.0001 per request (rough estimate, free tier usually)
const app = new Hono();
// Catch-all proxy
app.all("/*", async (c) => {
    const token = extractToken(c);
    if (!token)
        return c.json({ error: "Missing authentication" }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ error: "Invalid gateway token" }, 401);
    const subPath = c.req.path.replace(/^\/api\/gemini/, "") || "/";
    let url = `${GEMINI_BASE_URL}${subPath}`;
    const rawQuery = new URL(c.req.url).searchParams;
    rawQuery.delete("key"); // remove user's "key" param
    rawQuery.set("key", GEMINI_API_KEY);
    url += `?${rawQuery.toString()}`;
    const method = c.req.method;
    const headers = new Headers();
    headers.set("Content-Type", c.req.header("Content-Type") || "application/json");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const body = method === "GET" || method === "HEAD" ? undefined : await c.req.arrayBuffer();
        const response = await fetch(url, { method, headers, body, signal: controller.signal });
        clearTimeout(timeout);
        logUsageEventBackground({
            userId: auth.userId, eventType: 'llm',
            costMicrodollars: response.ok ? GEMINI_COST_PER_REQUEST : 0,
            metadata: { provider: 'gemini', path: subPath, status: response.status },
            error: response.ok ? undefined : `upstream_${response.status}`,
        });
        const respHeaders = new Headers();
        response.headers.forEach((value, key) => {
            if (!["transfer-encoding", "content-encoding"].includes(key.toLowerCase())) {
                respHeaders.set(key, value);
            }
        });
        return new Response(response.body, { status: response.status, headers: respHeaders });
    }
    catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
            return c.json({ error: "Request timed out" }, 504);
        }
        return c.json({ error: "Failed to connect to Gemini API" }, 502);
    }
});
export default app;
