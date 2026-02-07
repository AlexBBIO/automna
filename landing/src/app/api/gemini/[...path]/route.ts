/**
 * Gemini API Proxy
 *
 * Proxies all requests to Google's Gemini/Generative AI API while:
 * - Authenticating via gateway token
 * - Logging usage for billing
 * - Applying rate limits
 *
 * Endpoint: /api/gemini/v1beta/models/{model}:{method}
 * Auth: x-goog-api-key header (gateway token, we swap in real key)
 *
 * User machines set:
 *   GEMINI_BASE_URL=https://automna.ai/api/gemini
 *   GEMINI_API_KEY=<gateway_token>  (we intercept and swap)
 */

import { NextRequest } from "next/server";
import { authenticateGatewayToken } from "../../llm/_lib/auth";
import { logUsageBackground } from "../../llm/_lib/usage";
import { checkRateLimits, rateLimited } from "../../llm/_lib/rate-limit";
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const REQUEST_TIMEOUT = 300_000; // 5 minutes

export const runtime = "edge";
export const maxDuration = 300;

function geminiError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: status,
        message,
        status: status === 401 ? "UNAUTHENTICATED" : "INTERNAL",
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function handleRequest(request: NextRequest, method: string) {
  const startTime = Date.now();

  // Extract path from URL (e.g., /api/gemini/v1beta/models/gemini-pro:generateContent)
  const url = new URL(request.url);
  const pathMatch = url.pathname.match(/^\/api\/gemini\/(.+)$/);
  if (!pathMatch) {
    return geminiError(400, "Invalid path");
  }
  const apiPath = pathMatch[1];

  // Authenticate via gateway token
  // Gemini SDK sends key in x-goog-api-key header or ?key= query param
  let token: string | undefined = request.headers.get("x-goog-api-key")?.trim();
  if (!token) {
    token = url.searchParams.get("key")?.trim() ?? undefined;
  }

  // Create a mock request with the token for our auth function
  const authRequest = new Request(request.url, {
    headers: {
      "x-api-key": token ?? "",
    },
  });

  const auth = await authenticateGatewayToken(authRequest);
  if (!auth) {
    return geminiError(401, "Invalid or missing gateway token");
  }

  // Check API key configured
  if (!GEMINI_API_KEY) {
    console.error("[Gemini Proxy] GEMINI_API_KEY not configured");
    return geminiError(500, "Gemini proxy not configured");
  }

  // Check rate limits
  const rateLimitResult = await checkRateLimits(auth);
  if (!rateLimitResult.allowed) {
    console.log(`[Gemini Proxy] Rate limited user ${auth.userId}: ${rateLimitResult.reason}`);
    return rateLimited(rateLimitResult);
  }

  // Build upstream URL (add our real API key)
  const upstreamUrl = new URL(`${GEMINI_API_BASE}/${apiPath}`);
  // Copy query params except 'key'
  url.searchParams.forEach((value, key) => {
    if (key !== "key") {
      upstreamUrl.searchParams.set(key, value);
    }
  });
  upstreamUrl.searchParams.set("key", GEMINI_API_KEY);

  // Forward headers (filter out auth headers)
  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== "x-goog-api-key" &&
      lowerKey !== "authorization" &&
      lowerKey !== "host" &&
      !lowerKey.startsWith("x-vercel") &&
      !lowerKey.startsWith("x-forwarded")
    ) {
      forwardHeaders.set(key, value);
    }
  });

  // Extract model from path for logging (e.g., models/gemini-pro:generateContent)
  const modelMatch = apiPath.match(/models\/([^/:]+)/);
  const model = modelMatch ? modelMatch[1] : "unknown";
  const endpointMatch = apiPath.match(/:([a-zA-Z]+)$/);
  const endpoint = endpointMatch ? endpointMatch[1] : "unknown";

  // Get request body for non-GET requests
  let body: string | null = null;
  let bodyJson: Record<string, unknown> | null = null;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await request.text();
      if (body) {
        bodyJson = JSON.parse(body);
      }
    } catch {
      // Body might not be JSON
    }
  }

  // Make request to Gemini
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

    // Check if streaming (SSE)
    const contentType = response.headers.get("content-type") ?? "";
    const isStreaming = contentType.includes("text/event-stream") || 
                        url.searchParams.get("alt") === "sse";

    if (!isStreaming) {
      // Non-streaming: parse response and log usage
      const data = await response.json();
      const durationMs = Date.now() - startTime;

      // Extract usage from response
      const usage = data.usageMetadata ?? {};
      const inputTokens = usage.promptTokenCount ?? 0;
      const outputTokens = usage.candidatesTokenCount ?? 0;

      logUsageBackground({
        userId: auth.userId,
        provider: "gemini",
        model,
        endpoint,
        inputTokens,
        outputTokens,
        durationMs,
        error: data.error ? JSON.stringify(data.error) : undefined,
      });

      // Log to unified usage_events for Automna Token billing
      // Gemini pricing: use approximate rates (embeddings are ~free)
      const isEmbedding = endpoint === 'embedContent' || endpoint === 'batchEmbedContents';
      // Flash-Lite: $0.10/$0.40 per M. Pro: $2/$12 per M. Flash: $0.50/$3 per M.
      const geminiInputRate = model.includes('pro') ? 2.0 : model.includes('flash-lite') ? 0.10 : 0.50;
      const geminiOutputRate = model.includes('pro') ? 12.0 : model.includes('flash-lite') ? 0.40 : 3.0;
      const geminiCostMicro = Math.round(inputTokens * geminiInputRate + outputTokens * geminiOutputRate);
      logUsageEventBackground({
        userId: auth.userId,
        eventType: isEmbedding ? 'embedding' : 'llm',
        costMicrodollars: geminiCostMicro,
        metadata: { model, inputTokens, outputTokens, endpoint },
        error: data.error ? JSON.stringify(data.error) : undefined,
      });

      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Streaming response
    if (!response.body) {
      return geminiError(502, "No response body from upstream");
    }

    let inputTokens = 0;
    let outputTokens = 0;

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);

        // Try to extract usage from streaming chunks
        try {
          const text = new TextDecoder().decode(chunk);
          // Gemini streaming sends JSON objects with usageMetadata
          const matches = text.match(/"usageMetadata"\s*:\s*\{[^}]+\}/g);
          if (matches) {
            for (const match of matches) {
              try {
                const usage = JSON.parse(`{${match}}`).usageMetadata;
                if (usage?.promptTokenCount) inputTokens = usage.promptTokenCount;
                if (usage?.candidatesTokenCount) outputTokens = usage.candidatesTokenCount;
              } catch {
                // Ignore parse errors
              }
            }
          }
        } catch {
          // Ignore chunk processing errors
        }
      },
      flush() {
        const durationMs = Date.now() - startTime;
        logUsageBackground({
          userId: auth.userId,
          provider: "gemini",
          model,
          endpoint,
          inputTokens,
          outputTokens,
          durationMs,
        });

        // Log to unified usage_events for Automna Token billing
        const isEmbedding = endpoint === 'embedContent' || endpoint === 'batchEmbedContents';
        const geminiInputRate = model.includes('pro') ? 2.0 : model.includes('flash-lite') ? 0.10 : 0.50;
        const geminiOutputRate = model.includes('pro') ? 12.0 : model.includes('flash-lite') ? 0.40 : 3.0;
        const geminiCostMicro = Math.round(inputTokens * geminiInputRate + outputTokens * geminiOutputRate);
        logUsageEventBackground({
          userId: auth.userId,
          eventType: isEmbedding ? 'embedding' : 'llm',
          costMicrodollars: geminiCostMicro,
          metadata: { model, inputTokens, outputTokens, endpoint, durationMs },
        });
      },
    });

    return new Response(response.body.pipeThrough(transformStream), {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      return geminiError(504, "Request timed out");
    }

    console.error("[Gemini Proxy] Request failed:", error);
    return geminiError(502, "Failed to connect to upstream API");
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
