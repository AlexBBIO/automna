/**
 * Brave Search API Proxy
 *
 * Proxies all requests to Brave Search API while:
 * - Authenticating via gateway token
 * - Logging usage for billing
 * - Applying rate limits
 *
 * Endpoint: /api/brave/res/v1/web/search (and other endpoints)
 * Auth: X-Subscription-Token header (gateway token, we swap in real key)
 *
 * User machines set:
 *   BRAVE_API_URL=https://automna.ai/api/brave
 *   BRAVE_API_KEY=<gateway_token>  (we intercept and swap)
 */

import { NextRequest } from "next/server";
import { authenticateGatewayToken } from "../../llm/_lib/auth";
import { logUsageBackground } from "../../llm/_lib/usage";
import { checkRateLimits, rateLimited } from "../../llm/_lib/rate-limit";
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";
import { COSTS } from "@/app/api/_lib/cost-constants";

const BRAVE_API_BASE = "https://api.search.brave.com";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

const REQUEST_TIMEOUT = 30_000; // 30 seconds

export const runtime = "edge";
export const maxDuration = 60;

function braveError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      type: "ErrorResponse",
      status,
      message,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function handleRequest(request: NextRequest, method: string) {
  const startTime = Date.now();

  // Extract path from URL (e.g., /api/brave/res/v1/web/search)
  const url = new URL(request.url);
  const pathMatch = url.pathname.match(/^\/api\/brave\/(.+)$/);
  if (!pathMatch) {
    return braveError(400, "Invalid path");
  }
  const apiPath = pathMatch[1];

  // Authenticate via gateway token
  // Brave SDK sends key in X-Subscription-Token header
  const token = request.headers.get("X-Subscription-Token")?.trim() ?? 
                request.headers.get("x-subscription-token")?.trim();

  // Create a mock request with the token for our auth function
  const authRequest = new Request(request.url, {
    headers: {
      "x-api-key": token ?? "",
    },
  });

  const auth = await authenticateGatewayToken(authRequest);
  if (!auth) {
    return braveError(401, "Invalid or missing gateway token");
  }

  // Check API key configured
  if (!BRAVE_API_KEY) {
    console.error("[Brave Proxy] BRAVE_API_KEY not configured");
    return braveError(500, "Brave proxy not configured");
  }

  // Check rate limits
  const rateLimitResult = await checkRateLimits(auth);
  if (!rateLimitResult.allowed) {
    console.log(`[Brave Proxy] Rate limited user ${auth.userId}: ${rateLimitResult.reason}`);
    return rateLimited(rateLimitResult);
  }

  // Build upstream URL
  const upstreamUrl = new URL(`${BRAVE_API_BASE}/${apiPath}`);
  // Copy query params
  url.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  // Forward headers (filter out auth headers, add real API key)
  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== "x-subscription-token" &&
      lowerKey !== "authorization" &&
      lowerKey !== "host" &&
      !lowerKey.startsWith("x-vercel") &&
      !lowerKey.startsWith("x-forwarded")
    ) {
      forwardHeaders.set(key, value);
    }
  });
  // Add real Brave API key
  forwardHeaders.set("X-Subscription-Token", BRAVE_API_KEY);

  // Extract endpoint type for logging (e.g., web/search, news/search)
  const endpointMatch = apiPath.match(/res\/v1\/([^?]+)/);
  const endpoint = endpointMatch ? endpointMatch[1] : "unknown";

  // Get request body for non-GET requests (Brave mostly uses GET)
  let body: string | null = null;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      // Body might not exist
    }
  }

  // Make request to Brave
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method,
      headers: forwardHeaders,
      body: body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Parse response
    const data = await response.json();
    const durationMs = Date.now() - startTime;

    // Log usage (Brave charges per query, no tokens)
    // We track the number of results returned as a proxy for usage
    const resultCount = data.web?.results?.length ?? 
                       data.news?.results?.length ?? 
                       data.images?.results?.length ?? 
                       data.videos?.results?.length ?? 0;

    logUsageBackground({
      userId: auth.userId,
      provider: "brave",
      model: "search", // Brave doesn't have models, use "search" as identifier
      endpoint,
      inputTokens: 1, // Count as 1 query
      outputTokens: resultCount, // Track result count
      durationMs,
      error: data.type === "ErrorResponse" ? data.message : undefined,
    });

    // Log to unified usage_events for Automna Token billing
    if (data.type !== "ErrorResponse") {
      logUsageEventBackground({
        userId: auth.userId,
        eventType: 'search',
        costMicrodollars: COSTS.BRAVE_SEARCH_PER_QUERY,
        metadata: {
          endpoint,
          query: url.searchParams.get('q') || undefined,
          resultCount,
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 
        "Content-Type": "application/json",
        // Preserve rate limit headers from Brave
        ...(response.headers.get("x-ratelimit-limit") && {
          "x-ratelimit-limit": response.headers.get("x-ratelimit-limit")!,
        }),
        ...(response.headers.get("x-ratelimit-remaining") && {
          "x-ratelimit-remaining": response.headers.get("x-ratelimit-remaining")!,
        }),
      },
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      return braveError(504, "Request timed out");
    }

    console.error("[Brave Proxy] Request failed:", error);
    return braveError(502, "Failed to connect to upstream API");
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return handleRequest(request, "POST");
}
