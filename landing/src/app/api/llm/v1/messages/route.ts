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

  // Make request to Anthropic
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

    // Handle non-streaming response
    if (!isStreaming) {
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

      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Handle streaming response
    if (!response.body) {
      return anthropicError(502, "api_error", "No response body from upstream");
    }

    // Create a transform stream to extract usage from streaming events
    // Tracks all token types including cache tokens
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let requestId: string | undefined;
    let errorMessage: string | undefined;
    let sseBuffer = "";

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        // Pass through the chunk immediately (user sees it in real-time)
        controller.enqueue(chunk);

        // Buffer and parse for usage extraction
        try {
          sseBuffer += new TextDecoder().decode(chunk);
          
          // Split on newlines, keep incomplete last line in buffer
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]" || jsonStr === "") continue;

            try {
              const event = JSON.parse(jsonStr);

              // Extract message ID
              if (event.message?.id) {
                requestId = event.message.id;
              }

              // Extract usage from message_start (includes all input token types)
              if (event.type === "message_start" && event.message?.usage) {
                const u = event.message.usage;
                inputTokens = u.input_tokens ?? 0;
                cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
                cacheReadTokens = u.cache_read_input_tokens ?? 0;
              }

              // Extract output tokens from message_delta (final usage at end of stream)
              if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens ?? 0;
              }

              // Track errors
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
      },
      flush() {
        // Process any remaining buffered data
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

        // Log usage when stream completes
        const durationMs = Date.now() - startTime;
        logUsageBackground({
          userId: auth.userId,
          provider: "anthropic",
          model,
          endpoint: "chat",
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          requestId,
          durationMs,
          error: errorMessage,
        });
      },
    });

    return new Response(response.body.pipeThrough(transformStream), {
      status: response.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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
