import { Hono } from "hono";
import { extractToken, lookupGatewayToken } from "../middleware/auth.js";
import { logUsageEventBackground } from "../lib/usage-events.js";
import { BROWSERBASE_SESSION_COST_MICRODOLLARS } from "../lib/cost-constants.js";

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY!;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
const BROWSERBASE_BASE_URL = "https://api.browserbase.com/v1";
const REQUEST_TIMEOUT = 120_000; // 2 minutes (browser sessions can be slow)

const app = new Hono();

app.all("/*", async (c) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: "Missing authentication" }, 401);
  const auth = await lookupGatewayToken(token);
  if (!auth) return c.json({ error: "Invalid gateway token" }, 401);

  const subPath = c.req.path.replace(/^\/api\/browserbase\/v1/, "") || "/";
  const url = `${BROWSERBASE_BASE_URL}${subPath}`;

  const method = c.req.method;

  // Parse body for non-GET requests
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await c.req.arrayBuffer();

    // Inject projectId on session creation if not provided
    if (method === "POST" && subPath.includes("/sessions") && BROWSERBASE_PROJECT_ID) {
      try {
        const bodyJson = JSON.parse(new TextDecoder().decode(body));
        if (!bodyJson.projectId) {
          bodyJson.projectId = BROWSERBASE_PROJECT_ID;
          body = new TextEncoder().encode(JSON.stringify(bodyJson)).buffer;
        }
      } catch {
        // Body might not be JSON, pass through as-is
      }
    }
  }

  const headers = new Headers();
  headers.set("Content-Type", c.req.header("Content-Type") || "application/json");
  headers.set("X-BB-API-Key", BROWSERBASE_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    clearTimeout(timeout);

    // Track session creation costs
    if (method === "POST" && subPath.includes("/sessions") && response.ok) {
      logUsageEventBackground({
        userId: auth.userId, eventType: 'browser',
        costMicrodollars: BROWSERBASE_SESSION_COST_MICRODOLLARS,
        metadata: { provider: 'browserbase', action: 'session_create' },
      });
    }

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return c.json({ error: "Request timed out" }, 504);
    }
    return c.json({ error: "Failed to connect to Browserbase API" }, 502);
  }
});

export default app;
