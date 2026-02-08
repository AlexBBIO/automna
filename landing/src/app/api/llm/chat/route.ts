/**
 * Anthropic Chat Proxy
 * 
 * Proxies chat completions through our API with:
 * - Gateway token authentication
 * - Rate limiting (per-minute and monthly)
 * - Usage logging
 * - Streaming support
 * 
 * POST /api/llm/chat
 * Authorization: Bearer <gateway_token>
 * Body: Anthropic messages API format
 */

import { authenticateGatewayToken, unauthorized } from '../_lib/auth';
import { checkRateLimits, rateLimited } from '../_lib/rate-limit';
import { logUsage } from '../_lib/usage';
import { createTokenCountingStream, extractTokensFromResponse } from '../_lib/stream';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Use Edge Runtime for better streaming performance
export const runtime = 'edge';

// Allow longer requests for streaming
export const maxDuration = 60; // seconds

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // 1. Authenticate
  const user = await authenticateGatewayToken(request);
  if (!user) {
    return unauthorized('Invalid or missing gateway token');
  }
  
  // 2. Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { 
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Invalid JSON body' } 
      },
      { status: 400 }
    );
  }
  
  const { model, messages, stream = false, ...rest } = body as {
    model?: string;
    messages?: unknown[];
    stream?: boolean;
    [key: string]: unknown;
  };
  
  if (!model || !messages) {
    return Response.json(
      { 
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Missing model or messages' } 
      },
      { status: 400 }
    );
  }
  
  // 3. Check rate limits (monthly AT budget + RPM)
  const rateLimitResult = await checkRateLimits(user);
  
  if (!rateLimitResult.allowed) {
    console.log(`[llm/chat] Rate limited user ${user.userId}: ${rateLimitResult.reason}`);
    return rateLimited(rateLimitResult);
  }
  
  // 4. Check we have API key
  if (!ANTHROPIC_API_KEY) {
    console.error('[llm/chat] ANTHROPIC_API_KEY not configured');
    return Response.json(
      { 
        type: 'error',
        error: { type: 'api_error', message: 'API key not configured' } 
      },
      { status: 500 }
    );
  }
  
  // 5. Forward to Anthropic
  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
        ...rest,
      }),
    });
  } catch (err) {
    console.error('[llm/chat] Fetch error:', err);
    logUsage({
      userId: user.userId,
      provider: 'anthropic',
      model: String(model),
      endpoint: 'chat',
      inputTokens: 0,
      outputTokens: 0,
      requestId,
      durationMs: Date.now() - startTime,
      error: `Fetch error: ${err instanceof Error ? err.message : 'Unknown'}`,
    });
    return Response.json(
      { 
        type: 'error',
        error: { type: 'api_error', message: 'Failed to reach Anthropic API' } 
      },
      { status: 502 }
    );
  }
  
  // 6. Handle errors from Anthropic
  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text();
    console.error(`[llm/chat] Anthropic error ${anthropicResponse.status}:`, errorText.slice(0, 500));
    
    logUsage({
      userId: user.userId,
      provider: 'anthropic',
      model: String(model),
      endpoint: 'chat',
      inputTokens: 0,
      outputTokens: 0,
      requestId,
      durationMs: Date.now() - startTime,
      error: `Anthropic ${anthropicResponse.status}: ${errorText.slice(0, 200)}`,
    });
    
    // Pass through Anthropic's error response
    return new Response(errorText, {
      status: anthropicResponse.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  
  // 7. Handle streaming response
  if (stream && anthropicResponse.body) {
    const tokenCountingStream = createTokenCountingStream((tokens) => {
      logUsage({
        userId: user.userId,
        provider: 'anthropic',
        model: String(model),
        endpoint: 'chat',
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cacheCreationTokens: tokens.cacheCreationTokens,
        cacheReadTokens: tokens.cacheReadTokens,
        requestId,
        durationMs: Date.now() - startTime,
      });
    });
    
    const transformedStream = anthropicResponse.body.pipeThrough(tokenCountingStream);
    
    return new Response(transformedStream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      },
    });
  }
  
  // 8. Handle non-streaming response
  const data = await anthropicResponse.json();
  const tokens = extractTokensFromResponse(data);
  
  logUsage({
    userId: user.userId,
    provider: 'anthropic',
    model: String(model),
    endpoint: 'chat',
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheCreationTokens: tokens.cacheCreationTokens,
    cacheReadTokens: tokens.cacheReadTokens,
    requestId,
    durationMs: Date.now() - startTime,
  });
  
  return Response.json(data);
}
