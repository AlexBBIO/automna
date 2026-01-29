/**
 * ClawdbotRuntimeAdapter
 * 
 * Connects to Clawdbot's Gateway WebSocket API.
 * Handles streaming responses and message history.
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

const genId = () => crypto.randomUUID();

export function useClawdbotRuntime(config: ClawdbotConfig) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const connectSentRef = useRef(false);
  const streamingTextRef = useRef('');
  
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
      console.log('[clawdbot] No gateway URL');
      return;
    }
    
    mountedRef.current = true;
    connectSentRef.current = false;
    streamingTextRef.current = '';
    
    console.log('[clawdbot] Connecting to', config.gatewayUrl);
    const ws = new WebSocket(config.gatewayUrl);
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
          id: 'clawdbot-control-ui',
          version: 'vdev',
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
      
      console.log('[clawdbot] Sending connect request');
      ws.send(JSON.stringify({
        type: 'req',
        id: genId(),
        method: 'connect',
        params: connectParams,
      }));
    };

    ws.onopen = () => {
      console.log('[clawdbot] WebSocket opened');
      // Wait for challenge, fallback after 800ms
      connectTimer = setTimeout(sendConnect, 800);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      
      try {
        const msg = JSON.parse(event.data);
        
        // Handle challenge
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          console.log('[clawdbot] Got challenge');
          if (connectTimer) clearTimeout(connectTimer);
          sendConnect();
          return;
        }
        
        // Handle connect response
        if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
          console.log('[clawdbot] Connected successfully');
          if (mountedRef.current) {
            setIsConnected(true);
            // Load history
            wsSend('chat.history', { sessionKey: configRef.current.sessionKey || 'main' });
          }
          return;
        }
        
        // Handle history response
        if (msg.type === 'res' && msg.ok && Array.isArray(msg.payload?.messages)) {
          const history = msg.payload.messages.map((m: { id: string; role: string; content: unknown; createdAt?: string }) => {
            // Content is already an array of parts from gateway
            let content: Array<{ type: string; text?: string }>;
            if (Array.isArray(m.content)) {
              // Filter to only text parts (skip thinking, tool_use, etc.)
              content = m.content.filter((p: { type: string }) => p.type === 'text');
            } else if (typeof m.content === 'string') {
              content = [{ type: 'text', text: m.content }];
            } else {
              content = [{ type: 'text', text: '' }];
            }
            return {
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content,
              createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
            };
          });
          if (mountedRef.current) setMessages(history);
          return;
        }
        
        // Handle chat.send ack
        if (msg.type === 'res' && msg.ok && (msg.payload?.status === 'started' || msg.payload?.status === 'in_flight')) {
          if (mountedRef.current) setIsRunning(true);
          return;
        }
        
        // Handle chat events
        if (msg.type === 'event' && msg.event === 'chat') {
          const { state, message } = msg.payload || {};
          const role = message?.role;
          const textContent = message?.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
          
          if (role === 'assistant') {
            if (state === 'delta' && textContent) {
              streamingTextRef.current = textContent;
              if (mountedRef.current) {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'assistant' && last.id === 'streaming') {
                    return [...prev.slice(0, -1), { ...last, content: [{ type: 'text', text: textContent }] }];
                  }
                  return [...prev, { id: 'streaming', role: 'assistant', content: [{ type: 'text', text: textContent }], createdAt: new Date() }];
                });
              }
            }
            
            if (state === 'final') {
              const finalText = textContent || streamingTextRef.current;
              streamingTextRef.current = '';
              if (mountedRef.current) {
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
        }
        
        // Handle errors
        if (msg.type === 'res' && !msg.ok) {
          console.error('[clawdbot] Error:', msg.error);
          if (mountedRef.current) setIsRunning(false);
        }
        
      } catch (e) {
        console.error('[clawdbot] Parse error:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('[clawdbot] WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('[clawdbot] WebSocket closed:', event.code);
      if (mountedRef.current) setIsConnected(false);
    };

    return () => {
      console.log('[clawdbot] Cleanup');
      mountedRef.current = false;
      if (connectTimer) clearTimeout(connectTimer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Component unmounted');
      }
    };
  }, [config.gatewayUrl, config.authToken, sessionKey, wsSend]);

  // Send message
  const append = useCallback((message: AppendMessage) => {
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

    wsSend('chat.send', {
      sessionKey: configRef.current.sessionKey || 'main',
      message: text,
      idempotencyKey: genId(),
    });
  }, [wsSend]);

  // Cancel
  const cancel = useCallback(() => {
    wsSend('chat.abort', { sessionKey: configRef.current.sessionKey || 'main' });
    setIsRunning(false);
  }, [wsSend]);

  return { messages, isRunning, isConnected, append, cancel };
}
