/**
 * LLM Proxy - Anthropic Messages API
 *
 * Proxies requests to Anthropic's Messages API while:
 * - Authenticating via gateway token
 * - Logging usage for billing (including cache tokens)
 * - Applying rate limits
 *
 * Endpoint: POST /api/llm/v1/messages
 * Matches Anthropic's API path structure so we can use ANTHROPIC_BASE_URL.
 */

import { NextRequest } from "next/server";
import { authenticateGatewayToken, anthropicError } from "../../_lib/auth";
import { logUsageBackground } from "../../_lib/usage";
import { checkRateLimits, rateLimited } from "../../_lib/rate-limit";
import { logUsageEventBackground } from "@/app/api/_lib/usage-events";
import { calculateCostMicrodollars } from "../../_lib/pricing";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Request timeout in ms
const REQUEST_TIMEOUT = 300_000; // 5 minutes for long generations

export const runtime = "edge";
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Authenticate
  const auth = await authenticateGatewayToken(request);
  if (!auth) {
    return anthropicError(
      401,
      "authentication_error",
      "Invalid or missing gateway token"
    );
  }

  // Check API key
  if (!ANTHROPIC_API_KEY) {
    console.error("[LLM Proxy] ANTHROPIC_API_KEY not configured");
    return anthropicError(
      500,
      "api_error",
      "LLM proxy not configured"
    );
  }

  // Check rate limits
  const rateLimitResult = await checkRateLimits(auth);
  if (!rateLimitResult.allowed) {
    console.log(`[LLM Proxy] Rate limited user ${auth.userId}: ${rateLimitResult.reason}`);
    return rateLimited(rateLimitResult);
  }

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return anthropicError(400, "invalid_request_error", "Invalid JSON body");
  }

  const model = String(body.model ?? "claude-sonnet-4-20250514");
  const isStreaming = body.stream === true;

  // Forward headers (filter out auth, add our API key)
  const forwardHeaders = new Headers();
  forwardHeaders.set("Content-Type", "application/json");
  forwardHeaders.set("x-api-key", ANTHROPIC_API_KEY);
  forwardHeaders.set("anthropic-version", "2023-06-01");

  // Copy specific headers from original request
  const originalVersion = request.headers.get("anthropic-version");
  if (originalVersion) {
    forwardHeaders.set("anthropic-version", originalVersion);
  }

  const anthropicBeta = request.headers.get("anthropic-beta");
  if (anthropicBeta) {
    forwardHeaders.set("anthropic-beta", anthropicBeta);
  }

  // For streaming requests, start the response immediately with keepalive
  // comments to prevent Cloudflare from timing out (100s limit) while
  // Anthropic processes large-context Opus requests.
  if (isStreaming) {
    const encoder = new TextEncoder();
    const keepaliveComment = encoder.encode(": keepalive\n\n");
    const KEEPALIVE_INTERVAL = 25_000; // Send keepalive every 25s

    // Track usage for billing
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let requestId: string | undefined;
    let errorMessage: string | undefined;
    let sseBuffer = "";

    const stream = new ReadableStream({
      async start(streamController) {
        // Send initial keepalive immediately so Cloudflare sees data flowing
        streamController.enqueue(keepaliveComment);

        // Set up periodic keepalives until real data arrives
        let realDataStarted = false;
        const keepaliveTimer = setInterval(() => {
          if (!realDataStarted) {
            try {
              streamController.enqueue(keepaliveComment);
            } catch {
              // Stream may have been closed
              clearInterval(keepaliveTimer);
            }
          } else {
            clearInterval(keepaliveTimer);
          }
        }, KEEPALIVE_INTERVAL);

        // Make the actual request to Anthropic
        const abortController = new AbortController();
        const requestTimeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT);

        try {
          const response = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: forwardHeaders,
            body: JSON.stringify(body),
            signal: abortController.signal,
          });

          clearTimeout(requestTimeout);
          realDataStarted = true;
          clearInterval(keepaliveTimer);

          if (!response.body) {
            const errPayload = JSON.stringify({
              type: "error",
              error: { type: "api_error", message: "No response body from upstream" },
            });
            streamController.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
            streamController.close();
            return;
          }

          // If Anthropic returned an error status (non-streaming error response)
          if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
            const errData = await response.json();
            errorMessage = JSON.stringify(errData.error ?? errData);
            const errPayload = JSON.stringify(errData);
            streamController.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));

            const durationMs = Date.now() - startTime;
            logUsageBackground({
              userId: auth.userId, provider: "anthropic", model, endpoint: "chat",
              inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
              requestId, durationMs, error: errorMessage,
            });
            logUsageEventBackground({
              userId: auth.userId, eventType: 'llm', costMicrodollars: 0,
              metadata: { model, provider: 'anthropic', inputTokens: 0, outputTokens: 0,
                cacheCreationTokens: 0, cacheReadTokens: 0, requestId, durationMs },
              error: errorMessage,
            });

            streamController.close();
            return;
          }

          // Pipe the response body through, extracting usage as we go
          const reader = response.body.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Pass through immediately
            streamController.enqueue(value);

            // Parse for usage extraction
            try {
              sseBuffer += new TextDecoder().decode(value);
              const lines = sseBuffer.split("\n");
              sseBuffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]" || jsonStr === "") continue;

                try {
                  const event = JSON.parse(jsonStr);
                  if (event.message?.id) requestId = event.message.id;
                  if (event.type === "message_start" && event.message?.usage) {
                    const u = event.message.usage;
                    inputTokens = u.input_tokens ?? 0;
                    cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
                    cacheReadTokens = u.cache_read_input_tokens ?? 0;
                  }
                  if (event.type === "message_delta" && event.usage) {
                    outputTokens = event.usage.output_tokens ?? 0;
                  }
                  if (event.type === "error") {
                    errorMessage = JSON.stringify(event.error);
                  }
                } catch {
                  // Ignore parse errors for individual events
                }
              }
            } catch {
              // Ignore chunk processing errors
            }
          }

          // Process any remaining buffer
          if (sseBuffer.trim()) {
            const line = sseBuffer.trim();
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr !== "[DONE]" && jsonStr !== "") {
                try {
                  const event = JSON.parse(jsonStr);
                  if (event.type === "message_delta" && event.usage) {
                    outputTokens = event.usage.output_tokens ?? 0;
                  }
                  if (event.type === "message_start" && event.message?.usage) {
                    const u = event.message.usage;
                    inputTokens = u.input_tokens ?? 0;
                    cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
                    cacheReadTokens = u.cache_read_input_tokens ?? 0;
                  }
                } catch {
                  // Ignore
                }
              }
            }
          }

          // Log usage
          const durationMs = Date.now() - startTime;
          logUsageBackground({
            userId: auth.userId, provider: "anthropic", model, endpoint: "chat",
            inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
            requestId, durationMs, error: errorMessage,
          });
          const costMicro = calculateCostMicrodollars(
            model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens
          );
          logUsageEventBackground({
            userId: auth.userId, eventType: 'llm', costMicrodollars: costMicro,
            metadata: {
              model, provider: 'anthropic', inputTokens, outputTokens,
              cacheCreationTokens, cacheReadTokens, requestId, durationMs,
            },
            error: errorMessage,
          });

          streamController.close();
        } catch (error) {
          clearTimeout(requestTimeout);
          clearInterval(keepaliveTimer);

          const isTimeout = error instanceof Error && error.name === "AbortError";
          const errPayload = JSON.stringify({
            type: "error",
            error: {
              type: isTimeout ? "timeout_error" : "api_error",
              message: isTimeout ? "Request timed out" : "Failed to connect to upstream API",
            },
          });

          try {
            streamController.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
            streamController.close();
          } catch {
            // Stream may already be closed
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Handle non-streaming response
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();
    const durationMs = Date.now() - startTime;

    // Extract all token types from usage
    const usage = data.usage ?? {};
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

    logUsageBackground({
      userId: auth.userId,
      provider: "anthropic",
      model,
      endpoint: "chat",
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      requestId: data.id,
      durationMs,
      error: data.type === "error" ? JSON.stringify(data.error) : undefined,
    });

    // Log to unified usage_events for Automna Token billing
    const costMicro = calculateCostMicrodollars(
      model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens
    );
    logUsageEventBackground({
      userId: auth.userId,
      eventType: 'llm',
      costMicrodollars: costMicro,
      metadata: {
        model, provider: 'anthropic', inputTokens, outputTokens,
        cacheCreationTokens, cacheReadTokens, requestId: data.id, durationMs,
      },
      error: data.type === "error" ? JSON.stringify(data.error) : undefined,
    });

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      return anthropicError(504, "timeout_error", "Request timed out");
    }

    console.error("[LLM Proxy] Request failed:", error);
    return anthropicError(
      502,
      "api_error",
      "Failed to connect to upstream API"
    );
  }
}
