/**
 * SSE Stream Handler
 * 
 * Handles Anthropic's Server-Sent Events stream format.
 * Extracts token counts while passing through the stream unchanged.
 * 
 * Anthropic SSE format:
 *   event: message_start
 *   data: {"type":"message_start","message":{"usage":{"input_tokens":25}}}
 *   
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","delta":{"text":"Hello"}}
 *   
 *   event: message_delta  
 *   data: {"type":"message_delta","usage":{"output_tokens":15}}
 */

export interface StreamTokens {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Create a transform stream that passes through data while counting tokens.
 * Calls onComplete with final token counts when stream ends.
 */
export function createTokenCountingStream(
  onComplete: (tokens: StreamTokens) => void
): TransformStream<Uint8Array, Uint8Array> {
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = '';
  const decoder = new TextDecoder();
  
  return new TransformStream({
    transform(chunk, controller) {
      // Pass through the chunk unchanged
      controller.enqueue(chunk);
      
      // Decode and parse for token counts
      const text = decoder.decode(chunk, { stream: true });
      buffer += text;
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        const jsonStr = line.slice(6).trim(); // Remove 'data: ' prefix
        if (jsonStr === '[DONE]' || !jsonStr) continue;
        
        try {
          const data = JSON.parse(jsonStr);
          
          // Extract input tokens from message_start
          if (data.type === 'message_start' && data.message?.usage?.input_tokens) {
            inputTokens = data.message.usage.input_tokens;
          }
          
          // Extract output tokens from message_delta (final usage)
          if (data.type === 'message_delta' && data.usage?.output_tokens) {
            outputTokens = data.usage.output_tokens;
          }
        } catch {
          // Ignore parse errors - some lines may not be JSON
        }
      }
    },
    
    flush() {
      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            const data = JSON.parse(jsonStr);
            if (data.type === 'message_delta' && data.usage?.output_tokens) {
              outputTokens = data.usage.output_tokens;
            }
          }
        } catch {
          // Ignore
        }
      }
      
      // Call completion handler with final counts
      onComplete({ inputTokens, outputTokens });
    },
  });
}

/**
 * Parse a non-streaming Anthropic response for token counts.
 */
export function extractTokensFromResponse(data: unknown): StreamTokens {
  const response = data as { usage?: { input_tokens?: number; output_tokens?: number } };
  return {
    inputTokens: response?.usage?.input_tokens || 0,
    outputTokens: response?.usage?.output_tokens || 0,
  };
}
