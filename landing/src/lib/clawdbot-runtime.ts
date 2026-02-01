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

// Parse messages from API response
function parseMessages(messages: Array<{ role: string; content: unknown; timestamp?: number }>, prefix: string): ThreadMessage[] {
  return messages.map((m, idx) => {
    let textContent = '';
    if (Array.isArray(m.content)) {
      const textPart = m.content.find((p: { type: string; text?: string }) => p.type === 'text');
      textContent = (textPart && typeof textPart.text === 'string') ? textPart.text : '';
    } else if (typeof m.content === 'string') {
      textContent = m.content;
    }
    // Strip [message_id: ...] metadata from display
    textContent = textContent.replace(/\n?\[message_id: [^\]]+\]/g, '').trim();
    return {
      id: `${prefix}-${idx}`,
      role: m.role as 'user' | 'assistant',
      content: [{ type: 'text' as const, text: textContent }],
      createdAt: m.timestamp ? new Date(m.timestamp) : new Date(),
    };
  });
}

// Build HTTP history URL from WebSocket URL
function buildHistoryUrl(gatewayUrl: string, sessionKey: string): string {
  const wsUrl = new URL(gatewayUrl);
  const httpUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
  const historyUrl = new URL(`${httpUrl}/ws/api/history`);
  historyUrl.searchParams.set('sessionKey', sessionKey);
  // Pass through auth params
  const userId = wsUrl.searchParams.get('userId');
  const exp = wsUrl.searchParams.get('exp');
  const sig = wsUrl.searchParams.get('sig');
  if (userId) historyUrl.searchParams.set('userId', userId);
  if (exp) historyUrl.searchParams.set('exp', exp);
  if (sig) historyUrl.searchParams.set('sig', sig);
  return historyUrl.toString();
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
  
  const sessionKey = config.sessionKey || 'main';

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
    setLoadingPhase('connecting');
    setError(null);
    
    // === PARALLEL HTTP HISTORY FETCH ===
    // Start fetching history via HTTP immediately (don't wait for WebSocket)
    const httpAbort = new AbortController();
    httpHistoryAbortRef.current = httpAbort;
    
    const historyUrl = buildHistoryUrl(config.gatewayUrl, sessionKey);
    console.log('[clawdbot] Starting HTTP history fetch:', historyUrl);
    fetch(historyUrl, { signal: httpAbort.signal })
      .then(res => {
        console.log('[clawdbot] HTTP history response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('[clawdbot] HTTP history data:', { keys: Object.keys(data), hasMessages: 'messages' in data, historyLoadedRef: historyLoadedRef.current });
        if (!mountedRef.current) {
          console.log('[clawdbot] Component unmounted, ignoring HTTP history');
          return;
        }
        if (historyLoadedRef.current) {
          console.log('[clawdbot] History already loaded (probably via WS), ignoring HTTP');
          return;
        }
        if (data.messages && Array.isArray(data.messages)) {
          console.log(`[clawdbot] HTTP history loaded: ${data.messages.length} messages`);
          historyLoadedRef.current = true;
          if (data.messages.length > 0) {
            setMessages(parseMessages(data.messages, 'http'));
          }
          // HTTP success means we can use the chat (even if WS failed)
          setIsConnected(true);
          setError(null);
          setLoadingPhase('ready');
        } else {
          console.warn('[clawdbot] HTTP history response missing messages array:', data);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.warn('[clawdbot] HTTP history fetch failed:', err.message, err);
        } else {
          console.log('[clawdbot] HTTP history fetch aborted (WS loaded first)');
        }
      });
    
    // === WEBSOCKET CONNECTION ===
    let wsUrl = config.gatewayUrl;
    if (!wsUrl.includes('/ws')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
    }
    if (config.authToken) {
      const separator = wsUrl.includes('?') ? '&' : '?';
      wsUrl = `${wsUrl}${separator}token=${encodeURIComponent(config.authToken)}`;
    }
    
    console.log('[clawdbot] Connecting...');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    let connectTimer: NodeJS.Timeout | null = null;

    const sendConnect = () => {
      if (connectSentRef.current || ws.readyState !== WebSocket.OPEN) return;
      connectSentRef.current = true;
      
      const cfg = configRef.current;
      const connectParams: Record<string, unknown> = {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'webchat',  // Must use valid Clawdbot client ID
          version: '1.0.0',
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'web',
          mode: 'webchat',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        locale: 'en-US',
      };
      
      if (cfg.authToken) {
        connectParams.auth = { token: cfg.authToken };
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
            wsSend('chat.history', { sessionKey: configRef.current.sessionKey || 'main' });
          }
          return;
        }
        
        // Handle history response from WebSocket
        // Debug: log all 'res' messages to understand the format
        if (msg.type === 'res') {
          console.log('[clawdbot] Response:', msg.ok ? 'ok' : 'error', 'payload keys:', Object.keys(msg.payload || {}));
          console.log('[clawdbot] messages is array?', Array.isArray(msg.payload?.messages), 'length:', msg.payload?.messages?.length);
        }
        if (msg.type === 'res' && msg.ok && Array.isArray(msg.payload?.messages)) {
          console.log('[clawdbot] Entering history handler, historyLoadedRef:', historyLoadedRef.current);
          const wsMessages = msg.payload.messages;
          
          // Only use WebSocket history if we haven't loaded from HTTP yet
          if (!historyLoadedRef.current && wsMessages.length > 0) {
            console.log(`[clawdbot] WS history: ${wsMessages.length} messages`);
            historyLoadedRef.current = true;
            httpHistoryAbortRef.current?.abort(); // Cancel HTTP fetch
            
            const history = wsMessages.map((m: { id: string; role: string; content: unknown; createdAt?: string }) => {
              let textContent = '';
              if (Array.isArray(m.content)) {
                const textPart = m.content.find((p: { type: string; text?: string }) => p.type === 'text');
                textContent = (textPart && typeof textPart.text === 'string') ? textPart.text : '';
              } else if (typeof m.content === 'string') {
                textContent = m.content;
              }
              textContent = textContent.replace(/\n?\[message_id: [^\]]+\]/g, '').trim();
              return {
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: [{ type: 'text' as const, text: textContent }],
                createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
              };
            });
            setMessages(history);
          }
          
          // Only mark as loaded if we got messages
          // If WS returns empty, let HTTP fallback provide the data
          if (wsMessages.length > 0) {
            setLoadingPhase('ready');
          } else {
            console.log('[clawdbot] WS history empty, waiting for HTTP fallback');
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
              const finalText = textContent || streamingTextRef.current;
              streamingTextRef.current = '';
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { ...last, id: genId(), content: [{ type: 'text', text: finalText }] }];
                }
                return prev;
              });
              setIsRunning(false);
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

    return () => {
      mountedRef.current = false;
      httpHistoryAbortRef.current?.abort();
      if (connectTimer) clearTimeout(connectTimer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Component unmounted');
      }
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
    const sessionKey = cfg.sessionKey || 'main';
    
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
    wsSend('chat.abort', { sessionKey: configRef.current.sessionKey || 'main' });
    setIsRunning(false);
  }, [wsSend]);

  return { messages, isRunning, isConnected, loadingPhase, error, append, cancel };
}
