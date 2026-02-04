/**
 * Browserbase API Proxy
 *
 * Proxies all requests to Browserbase API while:
 * - Authenticating via gateway token
 * - Logging usage for billing (session creates)
 * - Applying rate limits
 *
 * Endpoint: /api/browserbase/v1/{path}
 * Auth: X-BB-API-Key header (gateway token, we swap in real key)
 *
 * User machines set:
 *   BROWSERBASE_API_URL=https://automna.ai/api/browserbase
 *   BROWSERBASE_API_KEY=<gateway_token>  (we intercept and swap)
 */

import { NextRequest } from "next/server";
import { authenticateGatewayToken } from "../../../llm/_lib/auth";
import { logUsageBackground } from "../../../llm/_lib/usage";
import { checkRateLimits, rateLimited } from "../../../llm/_lib/rate-limit";

const BROWSERBASE_API_BASE = "https://api.browserbase.com/v1";
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY?.replace(/[\r\n]+$/, "");
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

const REQUEST_TIMEOUT = 120_000; // 2 minutes

export const runtime = "edge";
export const maxDuration = 120;

function bbError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      error: message,
      status,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function handleRequest(request: NextRequest, method: string) {
  const startTime = Date.now();

  // Extract path from URL (e.g., /api/browserbase/v1/sessions)
  const url = new URL(request.url);
  const pathMatch = url.pathname.match(/^\/api\/browserbase\/v1\/(.*)$/);
  const apiPath = pathMatch ? pathMatch[1] : "";

  // Authenticate via gateway token (sent in X-BB-API-Key header)
  const token = request.headers.get("X-BB-API-Key")?.trim() ?? 
                request.headers.get("x-bb-api-key")?.trim();

  // Create a mock request with the token for our auth function
  const authRequest = new Request(request.url, {
    headers: {
      "x-api-key": token ?? "",
    },
  });

  const auth = await authenticateGatewayToken(authRequest);
  if (!auth) {
    return bbError(401, "Invalid or missing gateway token");
  }

  // Check API key configured
  if (!BROWSERBASE_API_KEY) {
    console.error("[Browserbase Proxy] BROWSERBASE_API_KEY not configured");
    return bbError(500, "Browserbase proxy not configured");
  }

  // Check rate limits
  const rateLimitResult = await checkRateLimits(auth);
  if (!rateLimitResult.allowed) {
    console.log(`[Browserbase Proxy] Rate limited user ${auth.userId}: ${rateLimitResult.reason}`);
    return rateLimited(rateLimitResult);
  }

  // Build upstream URL
  const upstreamUrl = new URL(`${BROWSERBASE_API_BASE}/${apiPath}`);
  // Copy query params
  url.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  // Forward headers (replace auth header with real key)
  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== "x-bb-api-key" &&
      lowerKey !== "authorization" &&
      lowerKey !== "host" &&
      !lowerKey.startsWith("x-vercel") &&
      !lowerKey.startsWith("x-forwarded")
    ) {
      forwardHeaders.set(key, value);
    }
  });
  forwardHeaders.set("X-BB-API-Key", BROWSERBASE_API_KEY);

  // Get request body for non-GET requests
  let body: string | null = null;
  let bodyJson: Record<string, unknown> | null = null;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await request.text();
      if (body) {
        bodyJson = JSON.parse(body);
        
        // Inject our project ID if creating a session and none specified
        if (apiPath === "sessions" && method === "POST" && BROWSERBASE_PROJECT_ID && bodyJson) {
          if (!bodyJson.projectId) {
            bodyJson.projectId = BROWSERBASE_PROJECT_ID;
            body = JSON.stringify(bodyJson);
          }
        }
      }
    } catch {
      // Body might not be JSON
    }
  }

  // Determine endpoint type for logging
  const endpoint = apiPath.split("/")[0] || "unknown"; // sessions, contexts, etc.
  const isSessionCreate = apiPath === "sessions" && method === "POST";

  // Make request to Browserbase
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

    const durationMs = Date.now() - startTime;

    // Parse response
    const contentType = response.headers.get("content-type") ?? "";
    let responseBody: string;
    let responseData: Record<string, unknown> | null = null;

    if (contentType.includes("application/json")) {
      responseBody = await response.text();
      try {
        responseData = JSON.parse(responseBody);
      } catch {
        // Not valid JSON
      }
    } else {
      responseBody = await response.text();
    }

    // Log usage for session creates
    if (isSessionCreate && response.ok) {
      logUsageBackground({
        userId: auth.userId,
        provider: "browserbase",
        model: "session",
        endpoint: "session_create",
        inputTokens: 0,
        outputTokens: 0,
        requestId: responseData?.id as string | undefined,
        durationMs,
      });
      console.log(`[Browserbase Proxy] Session created for user ${auth.userId}`);
    } else if (!response.ok) {
      logUsageBackground({
        userId: auth.userId,
        provider: "browserbase",
        model: "api",
        endpoint,
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        error: `${response.status}: ${responseBody.slice(0, 200)}`,
      });
    }

    // Return response with same status and headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        !lowerKey.startsWith("x-vercel") &&
        lowerKey !== "transfer-encoding" &&
        lowerKey !== "connection"
      ) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      return bbError(504, "Request timed out");
    }

    console.error("[Browserbase Proxy] Request failed:", error);
    return bbError(502, "Failed to connect to upstream API");
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return handleRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, "PUT");
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request, "DELETE");
}

export async function PATCH(request: NextRequest) {
  return handleRequest(request, "PATCH");
}
