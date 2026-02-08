import { Hono } from "hono";
import { extractToken, lookupGatewayToken } from "../middleware/auth.js";
import { logUsageEventBackground } from "../lib/usage-events.js";
import { BRAVE_SEARCH_COST_MICRODOLLARS } from "../lib/cost-constants.js";

const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;
const BRAVE_BASE_URL = "https://api.search.brave.com";
const REQUEST_TIMEOUT = 30_000;

const app = new Hono();

app.all("/*", async (c) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: "Missing authentication" }, 401);
  const auth = await lookupGatewayToken(token);
  if (!auth) return c.json({ error: "Invalid gateway token" }, 401);

  const path = c.req.path;
  const query = new URL(c.req.url).search;
  const url = `${BRAVE_BASE_URL}${path}${query}`;

  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("X-Subscription-Token", BRAVE_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, { method: c.req.method, headers, signal: controller.signal });
    clearTimeout(timeout);

    logUsageEventBackground({
      userId: auth.userId, eventType: 'search',
      costMicrodollars: response.ok ? BRAVE_SEARCH_COST_MICRODOLLARS : 0,
      metadata: { provider: 'brave', path, query: new URL(c.req.url).searchParams.get('q') ?? '' },
      error: response.ok ? undefined : `upstream_${response.status}`,
    });

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
    return c.json({ error: "Failed to connect to Brave API" }, 502);
  }
});

export default app;
