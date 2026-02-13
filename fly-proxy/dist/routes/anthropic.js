import { Hono } from "hono";
import { extractToken, lookupGatewayToken } from "../middleware/auth.js";
import { checkRateLimits, rateLimitedResponse } from "../middleware/rate-limit.js";
import { logUsageBackground } from "../lib/usage.js";
import { logUsageEventBackground, updateLastActiveBackground } from "../lib/usage-events.js";
import { calculateCostMicrodollars } from "../lib/pricing.js";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const REQUEST_TIMEOUT = 300_000;
const app = new Hono();
app.post("/messages", async (c) => {
    const startTime = Date.now();
    const traceId = Math.random().toString(36).slice(2, 10);
    const log = (msg, data) => {
        console.log(`[FLY-PROXY][Anthropic][${traceId}][${Date.now() - startTime}ms] ${msg}`, data ? JSON.stringify(data) : '');
    };
    log("request received");
    // Auth
    const token = extractToken(c);
    if (!token)
        return c.json({ type: "error", error: { type: "authentication_error", message: "Missing token" } }, 401);
    const auth = await lookupGatewayToken(token);
    if (!auth)
        return c.json({ type: "error", error: { type: "authentication_error", message: "Invalid token" } }, 401);
    log("auth ok", { userId: auth.userId, plan: auth.plan });
    // Update last active (debounced, non-blocking)
    updateLastActiveBackground(auth.machineId);
    // Rate limits
    const rateLimitResult = await checkRateLimits(auth);
    if (!rateLimitResult.allowed) {
        log("rate limited", { reason: rateLimitResult.reason });
        return rateLimitedResponse(c, rateLimitResult);
    }
    // Parse body
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ type: "error", error: { type: "invalid_request_error", message: "Invalid JSON body" } }, 400);
    }
    const model = String(body.model ?? "claude-sonnet-4-20250514");
    const isStreaming = body.stream === true;
    const messageCount = Array.isArray(body.messages) ? body.messages.length : 0;
    log("parsed request", { model, streaming: isStreaming, messageCount });
    // Forward headers
    const forwardHeaders = new Headers();
    forwardHeaders.set("Content-Type", "application/json");
    forwardHeaders.set("x-api-key", ANTHROPIC_API_KEY);
    forwardHeaders.set("anthropic-version", c.req.header("anthropic-version") || "2023-06-01");
    const beta = c.req.header("anthropic-beta");
    if (beta)
        forwardHeaders.set("anthropic-beta", beta);
    if (isStreaming) {
        const encoder = new TextEncoder();
        const keepaliveComment = encoder.encode(": keepalive\n\n");
        const KEEPALIVE_INTERVAL = 25_000;
        let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
        let requestId, errorMessage;
        let sseBuffer = "";
        const stream = new ReadableStream({
            async start(streamController) {
                streamController.enqueue(keepaliveComment);
                let realDataStarted = false;
                let keepaliveCount = 1;
                const keepaliveTimer = setInterval(() => {
                    if (!realDataStarted) {
                        try {
                            keepaliveCount++;
                            streamController.enqueue(keepaliveComment);
                        }
                        catch {
                            clearInterval(keepaliveTimer);
                        }
                    }
                    else {
                        clearInterval(keepaliveTimer);
                    }
                }, KEEPALIVE_INTERVAL);
                const abortController = new AbortController();
                const requestTimeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT);
                try {
                    const response = await fetch(ANTHROPIC_API_URL, {
                        method: "POST", headers: forwardHeaders, body: JSON.stringify(body), signal: abortController.signal,
                    });
                    clearTimeout(requestTimeout);
                    realDataStarted = true;
                    clearInterval(keepaliveTimer);
                    log("Anthropic responded", { status: response.status });
                    if (!response.body || !response.ok) {
                        const errText = response.body ? await response.text() : "No response body";
                        log("Anthropic error", { status: response.status, body: errText.slice(0, 300) });
                        errorMessage = `upstream_${response.status}`;
                        const errPayload = JSON.stringify({ type: "error", error: { type: "api_error", message: errText.slice(0, 300) } });
                        streamController.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
                        logUsageBackground({ userId: auth.userId, provider: "anthropic", model, endpoint: "chat", inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startTime, error: errorMessage });
                        streamController.close();
                        return;
                    }
                    const reader = response.body.getReader();
                    let chunkCount = 0, totalBytes = 0;
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        chunkCount++;
                        totalBytes += value.length;
                        streamController.enqueue(value);
                        try {
                            sseBuffer += new TextDecoder().decode(value);
                            const lines = sseBuffer.split("\n");
                            sseBuffer = lines.pop() ?? "";
                            for (const line of lines) {
                                if (!line.startsWith("data: "))
                                    continue;
                                const jsonStr = line.slice(6).trim();
                                if (jsonStr === "[DONE]" || jsonStr === "")
                                    continue;
                                try {
                                    const event = JSON.parse(jsonStr);
                                    if (event.message?.id)
                                        requestId = event.message.id;
                                    if (event.type === "message_start" && event.message?.usage) {
                                        const u = event.message.usage;
                                        inputTokens = u.input_tokens ?? 0;
                                        cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
                                        cacheReadTokens = u.cache_read_input_tokens ?? 0;
                                    }
                                    if (event.type === "message_delta" && event.usage)
                                        outputTokens = event.usage.output_tokens ?? 0;
                                    if (event.type === "error")
                                        errorMessage = JSON.stringify(event.error);
                                }
                                catch { }
                            }
                        }
                        catch { }
                    }
                    const durationMs = Date.now() - startTime;
                    log("stream completed", { durationMs, chunkCount, totalBytes, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens });
                    logUsageBackground({ userId: auth.userId, provider: "anthropic", model, endpoint: "chat", inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, requestId, durationMs, error: errorMessage });
                    const costMicro = calculateCostMicrodollars(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
                    logUsageEventBackground({ userId: auth.userId, eventType: 'llm', costMicrodollars: costMicro, metadata: { model, provider: 'anthropic', inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, requestId, durationMs }, error: errorMessage });
                    streamController.close();
                }
                catch (error) {
                    clearTimeout(requestTimeout);
                    clearInterval(keepaliveTimer);
                    const isTimeout = error instanceof Error && error.name === "AbortError";
                    log("STREAM ERROR", { isTimeout, error: String(error).slice(0, 300) });
                    const errPayload = JSON.stringify({ type: "error", error: { type: isTimeout ? "timeout_error" : "api_error", message: isTimeout ? "Request timed out" : "Failed to connect" } });
                    try {
                        streamController.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
                        streamController.close();
                    }
                    catch { }
                }
            },
        });
        return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
        });
    }
    // Non-streaming
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: "POST", headers: forwardHeaders, body: JSON.stringify(body), signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await response.json();
        const durationMs = Date.now() - startTime;
        const usage = (data.usage ?? {});
        const inputTokens = usage.input_tokens ?? 0;
        const outputTokens = usage.output_tokens ?? 0;
        const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
        const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
        logUsageBackground({ userId: auth.userId, provider: "anthropic", model, endpoint: "chat", inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, requestId: data.id, durationMs, error: data.type === "error" ? JSON.stringify(data.error) : undefined });
        const costMicro = calculateCostMicrodollars(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
        logUsageEventBackground({ userId: auth.userId, eventType: 'llm', costMicrodollars: costMicro, metadata: { model, provider: 'anthropic', inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, requestId: data.id, durationMs }, error: data.type === "error" ? JSON.stringify(data.error) : undefined });
        return c.json(data, response.status);
    }
    catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
            return c.json({ type: "error", error: { type: "timeout_error", message: "Request timed out" } }, 504);
        }
        return c.json({ type: "error", error: { type: "api_error", message: "Failed to connect" } }, 502);
    }
});
export default app;
