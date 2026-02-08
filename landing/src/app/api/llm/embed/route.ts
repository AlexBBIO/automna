/**
 * Gemini Embeddings Proxy
 * 
 * Proxies embedding requests through our API with:
 * - Gateway token authentication
 * - Rate limiting
 * - Usage logging
 * 
 * POST /api/llm/embed
 * Authorization: Bearer <gateway_token>
 * Body: { model?: string, content: string }
 */

import { authenticateGatewayToken, unauthorized } from '../_lib/auth';
import { checkRateLimits, rateLimited } from '../_lib/rate-limit';
import { logUsage } from '../_lib/usage';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Use Edge Runtime
export const runtime = 'edge';

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // 1. Authenticate
  const user = await authenticateGatewayToken(request);
  if (!user) {
    return unauthorized('Invalid or missing gateway token');
  }
  
  // 2. Parse request
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { type: 'invalid_request_error', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }
  
  const { model = 'text-embedding-004', content } = body as {
    model?: string;
    content?: string;
  };
  
  if (!content || typeof content !== 'string') {
    return Response.json(
      { error: { type: 'invalid_request_error', message: 'Missing or invalid content' } },
      { status: 400 }
    );
  }
  
  // 3. Check rate limits (monthly AT budget + RPM)
  const rateLimitResult = await checkRateLimits(user);
  
  if (!rateLimitResult.allowed) {
    console.log(`[llm/embed] Rate limited user ${user.userId}: ${rateLimitResult.reason}`);
    return rateLimited(rateLimitResult);
  }
  
  // 4. Check we have API key
  if (!GEMINI_API_KEY) {
    console.error('[llm/embed] GEMINI_API_KEY not configured');
    return Response.json(
      { error: { type: 'api_error', message: 'API key not configured' } },
      { status: 500 }
    );
  }
  
  // 5. Forward to Gemini
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${GEMINI_API_KEY}`;
  
  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: content }] },
      }),
    });
  } catch (err) {
    console.error('[llm/embed] Fetch error:', err);
    logUsage({
      userId: user.userId,
      provider: 'gemini',
      model,
      endpoint: 'embed',
      inputTokens: 0,
      requestId,
      durationMs: Date.now() - startTime,
      error: `Fetch error: ${err instanceof Error ? err.message : 'Unknown'}`,
    });
    return Response.json(
      { error: { type: 'api_error', message: 'Failed to reach Gemini API' } },
      { status: 502 }
    );
  }
  
  // 6. Handle errors
  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error(`[llm/embed] Gemini error ${geminiResponse.status}:`, errorText.slice(0, 500));
    
    logUsage({
      userId: user.userId,
      provider: 'gemini',
      model,
      endpoint: 'embed',
      inputTokens: 0,
      requestId,
      durationMs: Date.now() - startTime,
      error: `Gemini ${geminiResponse.status}: ${errorText.slice(0, 200)}`,
    });
    
    return new Response(errorText, { 
      status: geminiResponse.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  
  // 7. Return response and log usage
  const data = await geminiResponse.json();
  
  // Estimate tokens (Gemini doesn't return token count for embeddings)
  const inputTokens = Math.ceil(content.length / 4);
  
  logUsage({
    userId: user.userId,
    provider: 'gemini',
    model,
    endpoint: 'embed',
    inputTokens,
    requestId,
    durationMs: Date.now() - startTime,
  });
  
  return Response.json(data);
}
