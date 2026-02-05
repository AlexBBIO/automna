/**
 * ClawdbotRuntimeAdapter
 * 
 * Connects to Clawdbot's Gateway WebSocket API.
 * Handles streaming responses and message history.
 * 
 * Optimizations:
 * - Parallel HTTP history fetch (doesn't wait for WebSocket to fail)
 * - Loading states for better UX
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface TextContentPart {
  type: 'text';
  text: string;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: Array<TextContentPart | { type: string; [key: string]: unknown }>;
  createdAt: Date;
}

interface AppendMessage {
  role: 'user';
  content: Array<{ type: 'text'; text: string }>;
}

interface ClawdbotConfig {
  gatewayUrl: string;
  authToken?: string;
  sessionKey?: string;
}

type LoadingPhase = 'connecting' | 'loading-history' | 'ready' | 'error';

const genId = () => crypto.randomUUID();

// Parse messages from API response - preserve all content types for agent activity toggle
function parseMessages(messages: Array<{ role: string; content: unknown; timestamp?: number }>, prefix: string): ThreadMessage[] {
  // Debug: log first message's content structure
  if (messages.length > 0) {
    const sample = messages[0];
    const contentTypes = Array.isArray(sample.content) 
      ? sample.content.map((c: { type?: string }) => c.type || 'unknown')
      : [typeof sample.content];
    console.log('[clawdbot] History message format:', {
      role: sample.role,
      contentIsArray: Array.isArray(sample.content),
      contentTypes,
      sampleContent: JSON.stringify(sample.content).slice(0, 300)
    });
  }
  
  return messages.map((m, idx) => {
    let content: Array<{ type: string; [key: string]: unknown }> = [];
    
    if (Array.isArray(m.content)) {
      content = m.content.map((part: { type: string; text?: string; [key: string]: unknown }) => {
        // Strip [message_id: ...] metadata from text parts
        if (part.type === 'text' && typeof part.text === 'string') {
          return {
            ...part,
            text: part.text.replace(/\n?\[message_id: [^\]]+\]/g, '').trim()
          };
        }
        return part;
      });
    } else if (typeof m.content === 'string') {
      const cleanedText = m.content.replace(/\n?\[message_id: [^\]]+\]/g, '').trim();
      content = [{ type: 'text', text: cleanedText }];
    }
    
    return {
      id: `${prefix}-${idx}`,
      role: m.role as 'user' | 'assistant',
      content,
      createdAt: m.timestamp ? new Date(m.timestamp) : new Date(),
    };
  });
}

// Build HTTP history URL - use local proxy to avoid CORS
function buildHistoryUrl(gatewayUrl: string, sessionKey: string): string {
  const wsUrl = new URL(gatewayUrl);
  // Use local proxy instead of direct Fly.io call
  const historyUrl = new URL('/api/ws/history', window.location.origin);
  historyUrl.searchParams.set('sessionKey', sessionKey);
  // Pass through all auth params from original URL
  const token = wsUrl.searchParams.get('token');
  const userId = wsUrl.searchParams.get('userId');
  const exp = wsUrl.searchParams.get('exp');
  const sig = wsUrl.searchParams.get('sig');
  if (token) historyUrl.searchParams.set('token', token);
  if (userId) historyUrl.searchParams.set('userId', userId);
  if (exp) historyUrl.searchParams.set('exp', exp);
  if (sig) historyUrl.searchParams.set('sig', sig);
  return historyUrl.toString();
}

// Extract token from URL query params
function extractTokenFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('token') || undefined;
  } catch {
    return undefined;
  }
}

// Canonicalize session key to match OpenClaw's internal format
// Our background fixer converts all session keys to "agent:main:{key}" format
function canonicalizeSessionKey(key: string): string {
  if (key.startsWith('agent:main:')) return key;
  return `agent:main:${key}`;
}

export function useClawdbotRuntime(config: ClawdbotConfig) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('connecting');
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const connectSentRef = useRef(false);
  const streamingTextRef = useRef('');
  const historyLoadedRef = useRef(false);
  const httpHistoryAbortRef = useRef<AbortController | null>(null);
  
  // Store config in ref to avoid effect deps
  const configRef = useRef(config);
  configRef.current = config;
  
  const rawSessionKey = config.sessionKey || 'main';
  const sessionKey = canonicalizeSessionKey(rawSessionKey);
  
  // Track current session to prevent stale responses from other sessions
  const currentSessionRef = useRef(sessionKey);
  currentSessionRef.current = sessionKey;

  // Send WebSocket message
  const wsSend = useCallback((method: string, params: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[clawdbot] WebSocket not connected');
      return null;
    }
    const id = genId();
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
    return id;
  }, []);

  // Connect to gateway
  useEffect(() => {
    if (!config.gatewayUrl) {
      setError('No gateway URL configured');
      setLoadingPhase('error');
      return;
    }
    
    mountedRef.current = true;
    connectSentRef.current = false;
    streamingTextRef.current = '';
    historyLoadedRef.current = false;
    setMessages([]); // Clear messages when switching conversations
    setLoadingPhase('connecting');
    setError(null);
    
    // Small delay to allow previous WebSocket cleanup to complete
    // This prevents "WebSocket closed before connection established" errors
    let connectionDelayTimer: NodeJS.Timeout | null = null;
    
    // Safety timeout - if nothing loads in 10 seconds, allow chat anyway
    // (Gateway should already be ready at this point since dashboard waits for it)
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current && !historyLoadedRef.current) {
        console.log('[clawdbot] Safety timeout - allowing chat');
        historyLoadedRef.current = true;
        setIsConnected(true);
        setLoadingPhase('ready');
      }
    }, 10000);
    
    // Debounce connection to prevent rapid reconnect issues when switching conversations
    connectionDelayTimer = setTimeout(() => {
    
    // === PARALLEL HTTP HISTORY FETCH ===
    // Start fetching history via HTTP immediately (don't wait for WebSocket)
    const httpAbort = new AbortController();
    httpHistoryAbortRef.current = httpAbort;
    
    const historyUrl = buildHistoryUrl(config.gatewayUrl, sessionKey);
    console.log('[clawdbot] Starting HTTP history fetch:', historyUrl);
    fetch(historyUrl, { signal: httpAbort.signal })
      .then(res => {
        console.log('[clawdbot] HTTP history response status:', res.status);
        if (!res.ok) {
          // Treat non-200 responses as empty history (new session)
          console.log('[clawdbot] HTTP history non-200, treating as new session');
          return { messages: [] };
        }
        return res.json();
      })
      .then(data => {
        console.log('[clawdbot] HTTP history data:', { keys: Object.keys(data || {}), hasMessages: 'messages' in (data || {}), messageCount: data?.messages?.length, historyLoadedRef: historyLoadedRef.current });
        if (!mountedRef.current) {
          console.log('[clawdbot] Component unmounted, ignoring HTTP history');
          return;
        }
        if (historyLoadedRef.current) {
          console.log('[clawdbot] History already loaded (probably via WS), ignoring HTTP');
          return;
        }
        
        // Only mark as loaded if we actually got messages
        // Empty response might mean the endpoint doesn't exist, let WS try
        if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          // Guard: only set messages if we're still on the same session
          if (currentSessionRef.current !== sessionKey) {
            console.log('[clawdbot] HTTP history arrived for old session, ignoring');
            return;
          }
          console.log(`[clawdbot] HTTP history loaded: ${data.messages.length} messages`);
          historyLoadedRef.current = true;
          setMessages(parseMessages(data.messages, 'http'));
          setIsConnected(true);
          setError(null);
          setLoadingPhase('ready');
        } else {
          console.log('[clawdbot] HTTP history empty - waiting for WebSocket');
          // Don't set historyLoadedRef - let WebSocket try to load history
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          console.log('[clawdbot] HTTP history fetch aborted (WS loaded first)');
          return;
        }
        console.warn('[clawdbot] HTTP history fetch failed:', err.message);
        
        // Even on error, allow the chat to work - treat as new session
        if (mountedRef.current && !historyLoadedRef.current) {
          console.log('[clawdbot] HTTP failed but allowing chat anyway');
          historyLoadedRef.current = true;
          setIsConnected(true);
          setLoadingPhase('ready');
        }
      });
    
    // === WEBSOCKET CONNECTION ===
    let wsUrl = config.gatewayUrl;
    if (!wsUrl.includes('/ws')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
    }
    // Token is already in URL from gateway, no need to add again
    
    console.log('[clawdbot] Connecting...');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    let connectTimer: NodeJS.Timeout | null = null;

    const sendConnect = () => {
      if (connectSentRef.current || ws.readyState !== WebSocket.OPEN) return;
      connectSentRef.current = true;
      
      const cfg = configRef.current;
      // Get token from config or URL
      const token = cfg.authToken || extractTokenFromUrl(cfg.gatewayUrl);
      
      const connectParams: Record<string, unknown> = {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'webchat',
          version: '1.0.0',
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'web',
          mode: 'webchat',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        locale: 'en-US',
      };
      
      if (token) {
        connectParams.auth = { token };
      }
      
      ws.send(JSON.stringify({
        type: 'req',
        id: genId(),
        method: 'connect',
        params: connectParams,
      }));
    };

    ws.onopen = () => {
      console.log('[clawdbot] WebSocket opened');
      connectTimer = setTimeout(sendConnect, 800);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      
      try {
        const msg = JSON.parse(event.data);
        
        // Handle challenge
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          if (connectTimer) clearTimeout(connectTimer);
          sendConnect();
          return;
        }
        
        // Handle connect response
        if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
          console.log('[clawdbot] Connected');
          setIsConnected(true);
          
          // Request history from WebSocket too (might be faster if already loaded)
          if (!historyLoadedRef.current) {
            setLoadingPhase('loading-history');
            wsSend('chat.history', { sessionKey: canonicalizeSessionKey(configRef.current.sessionKey || 'main') });
          }
          return;
        }
        
        // Handle history response from WebSocket
        // Debug: log all 'res' messages to understand the format
        if (msg.type === 'res') {
          const keys = Object.keys(msg.payload || {});
          console.log('[clawdbot] Response:', msg.ok ? 'ok' : 'error', 'keys:', keys.join(','));
          if (keys.includes('sessionKey') || keys.includes('messages')) {
            console.log('[clawdbot] HISTORY response detected:', {
              hasMessages: 'messages' in (msg.payload || {}),
              isArray: Array.isArray(msg.payload?.messages),
              length: msg.payload?.messages?.length,
              sessionKey: msg.payload?.sessionKey,
            });
          }
        }
        if (msg.type === 'res' && msg.ok && Array.isArray(msg.payload?.messages)) {
          console.log('[clawdbot] Entering history handler, historyLoadedRef:', historyLoadedRef.current);
          
          // Guard: only process if we're still on the same session
          if (currentSessionRef.current !== sessionKey) {
            console.log('[clawdbot] WS history arrived for old session, ignoring');
            return;
          }
          
          const wsMessages = msg.payload.messages;
          
          // Mark as loaded - empty is valid for new channels
          if (!historyLoadedRef.current) {
            console.log(`[clawdbot] WS history: ${wsMessages.length} messages`);
            historyLoadedRef.current = true;
            httpHistoryAbortRef.current?.abort(); // Cancel HTTP fetch
            
            if (wsMessages.length > 0) {
              // Debug: log sample of each content type
              const samples: Record<string, unknown> = {};
              wsMessages.forEach((m: { content: unknown }) => {
                if (Array.isArray(m.content)) {
                  m.content.forEach((c: { type?: string }) => {
                    const t = c.type || 'unknown';
                    if (!samples[t]) {
                      samples[t] = JSON.stringify(c).slice(0, 300);
                    }
                  });
                }
              });
              console.log('[clawdbot] Content type samples:', samples);
              
              const history = wsMessages.map((m: { id: string; role: string; content: unknown; createdAt?: string }) => {
                let content: Array<{ type: string; [key: string]: unknown }> = [];
                
                if (Array.isArray(m.content)) {
                  content = m.content.map((part: { type: string; text?: string; [key: string]: unknown }) => {
                    // Strip [message_id: ...] metadata from text parts
                    if (part.type === 'text' && typeof part.text === 'string') {
                      return {
                        ...part,
                        text: part.text.replace(/\n?\[message_id: [^\]]+\]/g, '').trim()
                      };
                    }
                    return part;
                  });
                } else if (typeof m.content === 'string') {
                  const cleanedText = m.content.replace(/\n?\[message_id: [^\]]+\]/g, '').trim();
                  content = [{ type: 'text', text: cleanedText }];
                }
                
                return {
                  id: m.id,
                  role: m.role as 'user' | 'assistant',
                  content,
                  createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                };
              });
              setMessages(history);
            }
            setLoadingPhase('ready');
          }
          return;
        }
        
        // Handle chat.send ack
        if (msg.type === 'res' && msg.ok && (msg.payload?.status === 'started' || msg.payload?.status === 'in_flight')) {
          setIsRunning(true);
          return;
        }
        
        // Handle chat events (streaming)
        if (msg.type === 'event' && msg.event === 'chat') {
          const { state, message } = msg.payload || {};
          const role = message?.role;
          const textContent = message?.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
          
          // Debug: log message content types
          if (message?.content && Array.isArray(message.content)) {
            const types = message.content.map((c: { type: string }) => c.type);
            if (types.some((t: string) => t !== 'text')) {
              console.log('[clawdbot] Message content types:', types);
            }
          }
          
          if (role === 'assistant') {
            if (state === 'delta' && textContent) {
              streamingTextRef.current = textContent;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.id === 'streaming') {
                  return [...prev.slice(0, -1), { ...last, content: [{ type: 'text', text: textContent }] }];
                }
                return [...prev, { id: 'streaming', role: 'assistant', content: [{ type: 'text', text: textContent }], createdAt: new Date() }];
              });
            }
            
            if (state === 'final') {
              console.log('[clawdbot] Final event received, processing...');
              try {
                // Build final content from message, but use streaming text for text parts
                // because the final message's text can be truncated (e.g., MEDIA paths cut off)
                let finalContent: Array<{ type: string; [key: string]: unknown }> = [];
                const streamedText = streamingTextRef.current;
                
                if (Array.isArray(message?.content)) {
                  // Keep non-text parts, replace text with streaming text
                  let hasTextPart = false;
                  finalContent = message.content.map((part: { type: string; text?: string; [key: string]: unknown }) => {
                    if (part.type === 'text') {
                      hasTextPart = true;
                      // Use streaming text if available (it's complete), else use final text
                      const text = streamedText || (typeof part.text === 'string' ? part.text : '');
                      return {
                        ...part,
                        text: text.replace(/\n?\[message_id: [^\]]+\]/g, '').trim()
                      };
                    }
                    return part;
                  });
                  
                  // If no text part existed but we have streaming text, add it
                  if (!hasTextPart && streamedText) {
                    finalContent.unshift({ type: 'text', text: streamedText.replace(/\n?\[message_id: [^\]]+\]/g, '').trim() });
                  }
                } else if (streamedText) {
                  // No content array, just use streaming text
                  finalContent = [{ type: 'text', text: streamedText.replace(/\n?\[message_id: [^\]]+\]/g, '').trim() }];
                }
                
                // Last resort fallback
                if (finalContent.length === 0 || !finalContent.some(p => p.type === 'text' && p.text)) {
                  if (textContent) {
                    finalContent = [{ type: 'text', text: textContent }];
                  }
                }
                
                console.log('[clawdbot] Final content parts:', finalContent.length, 'streamedText length:', streamedText?.length || 0);
                streamingTextRef.current = '';
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'assistant') {
                    return [...prev.slice(0, -1), { ...last, id: genId(), content: finalContent }];
                  }
                  return prev;
                });
              } catch (err) {
                console.error('[clawdbot] Error processing final message:', err);
              } finally {
                // Always stop running, even if there's an error
                setIsRunning(false);
              }
            }
          }
        }
        
        // Handle errors
        if (msg.type === 'res' && !msg.ok) {
          console.error('[clawdbot] Error:', msg.error);
          setIsRunning(false);
          if (msg.error?.message) {
            setError(msg.error.message);
          }
        }
        
      } catch (e) {
        console.error('[clawdbot] Parse error:', e);
      }
    };

    ws.onerror = () => {
      console.error('[clawdbot] WebSocket error');
      // Don't set error immediately - HTTP fallback might still work
    };

    ws.onclose = (event) => {
      console.log('[clawdbot] WebSocket closed:', event.code);
      setIsConnected(false);
      
      // Only show error if:
      // 1. Not a clean close (1000)
      // 2. Not already in ready state
      // 3. Wait a bit to see if HTTP fallback succeeds
      if (event.code !== 1000) {
        setTimeout(() => {
          if (mountedRef.current && !historyLoadedRef.current) {
            setError('Connection failed. Retrying...');
            setLoadingPhase('error');
          }
        }, 3000); // Give HTTP fallback 3 seconds
      }
    };

    }, 100); // 100ms delay to allow cleanup and prevent race conditions

    return () => {
      mountedRef.current = false;
      if (connectionDelayTimer) clearTimeout(connectionDelayTimer);
      httpHistoryAbortRef.current?.abort();
      clearTimeout(safetyTimeout);
      // Close WebSocket using ref (ws variable is inside the delayed callback)
      const currentWs = wsRef.current;
      if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
        currentWs.close(1000, 'Component unmounted');
      }
      wsRef.current = null;
    };
  }, [config.gatewayUrl, config.authToken, sessionKey, wsSend]);

  // Send message (with HTTP fallback)
  const append = useCallback(async (message: AppendMessage) => {
    const text = message.content.find(p => p.type === 'text')?.text?.trim();
    if (!text) return;

    // Add user message immediately
    setMessages(prev => [...prev, {
      id: genId(),
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt: new Date(),
    }]);

    streamingTextRef.current = '';
    setIsRunning(true);

    const cfg = configRef.current;
    const ws = wsRef.current;
    const sessionKey = canonicalizeSessionKey(cfg.sessionKey || 'main');
    
    // Try WebSocket first if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      wsSend('chat.send', {
        sessionKey,
        message: text,
        idempotencyKey: genId(),
      });
      return;
    }
    
    // Fall back to HTTP
    console.log('[clawdbot] WebSocket not available, using HTTP fallback');
    try {
      const wsUrl = new URL(cfg.gatewayUrl);
      const httpUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      const sendUrl = new URL(`${httpUrl}/api/chat/send`);
      
      // Pass through auth params
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      if (userId) sendUrl.searchParams.set('userId', userId);
      if (exp) sendUrl.searchParams.set('exp', exp);
      if (sig) sendUrl.searchParams.set('sig', sig);
      
      const response = await fetch(sendUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionKey }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      // HTTP send doesn't stream, so we need to poll for response
      // For now, just show a placeholder and reload history after a delay
      setTimeout(async () => {
        const historyUrl = buildHistoryUrl(cfg.gatewayUrl, sessionKey);
        try {
          const historyRes = await fetch(historyUrl);
          const historyData = await historyRes.json();
          if (historyData.messages && Array.isArray(historyData.messages)) {
            setMessages(parseMessages(historyData.messages, 'poll'));
          }
        } catch (e) {
          console.error('[clawdbot] Failed to poll history:', e);
        }
        setIsRunning(false);
      }, 3000);
    } catch (err) {
      console.error('[clawdbot] HTTP send failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsRunning(false);
    }
  }, [wsSend]);

  // Cancel
  const cancel = useCallback(() => {
    wsSend('chat.abort', { sessionKey: canonicalizeSessionKey(configRef.current.sessionKey || 'main') });
    setIsRunning(false);
  }, [wsSend]);

  // Clear local history (called after API clear succeeds)
  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isRunning, isConnected, loadingPhase, error, append, cancel, clearHistory };
}
