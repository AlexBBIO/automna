/**
 * ClawdbotRuntimeAdapter
 * 
 * Connects assistant-ui to Clawdbot's Gateway WebSocket API.
 * Handles streaming responses, message history, and abort.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
// Define our own types to avoid version mismatches with assistant-ui
interface TextContentPart {
  type: 'text';
  text: string;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: Array<TextContentPart | { type: string; [key: string]: unknown }>;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

interface AppendMessage {
  role: 'user';
  content: Array<{ type: 'text'; text: string }>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

interface ClawdbotConfig {
  /** WebSocket URL to Clawdbot gateway */
  gatewayUrl: string;
  /** Auth token for gateway */
  authToken?: string;
  /** Session key (defaults to 'main') */
  sessionKey?: string;
}

interface ClawdbotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

// Convert Clawdbot message format to assistant-ui format
function toThreadMessage(msg: ClawdbotMessage): ThreadMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: [{ type: 'text', text: msg.content }],
    createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
  };
}

export function useClawdbotRuntime(config: ClawdbotConfig) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingReqId = useRef<string | null>(null);
  const streamingMessageRef = useRef<string>('');

  const sessionKey = config.sessionKey || 'main';

  // Generate unique request ID
  const genId = () => crypto.randomUUID();

  // Send WebSocket message
  const wsSend = useCallback((method: string, params: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return null;
    }
    const id = genId();
    wsRef.current.send(JSON.stringify({
      type: 'req',
      id,
      method,
      params,
    }));
    return id;
  }, []);

  // Send connect request (called after challenge or timeout)
  const sendConnect = useCallback((nonce?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    console.log('[clawdbot] Sending connect request');
    
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
      locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'automna-chat/1.0.0',
    };

    if (config.authToken) {
      connectParams.auth = { token: config.authToken };
    }

    wsRef.current.send(JSON.stringify({
      type: 'req',
      id: genId(),
      method: 'connect',
      params: connectParams,
    }));
  }, [config.authToken]);

  const connectSentRef = useRef(false);
  const connectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Connect to gateway
  useEffect(() => {
    // Skip if no gateway URL
    if (!config.gatewayUrl) {
      console.log('[clawdbot] No gateway URL, skipping connection');
      return;
    }
    
    console.log('[clawdbot] Connecting to', config.gatewayUrl);
    mountedRef.current = true;
    connectSentRef.current = false;
    
    const ws = new WebSocket(config.gatewayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[clawdbot] WebSocket connected, waiting for challenge...');
      
      // Wait for challenge event, but also set a fallback timer
      // (Control UI uses 750ms delay)
      connectTimerRef.current = setTimeout(() => {
        if (!connectSentRef.current) {
          console.log('[clawdbot] No challenge received, sending connect anyway');
          connectSentRef.current = true;
          sendConnect();
        }
      }, 800);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('[clawdbot] Failed to parse message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('[clawdbot] WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('[clawdbot] WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
    };

    return () => {
      console.log('[clawdbot] Cleanup - closing WebSocket');
      mountedRef.current = false;
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current);
      }
      ws.close();
    };
  }, [config.gatewayUrl, config.authToken, sendConnect]);

  // Handle incoming messages
  const handleMessage = useCallback((msg: { type: string; id?: string; ok?: boolean; payload?: unknown; event?: string; error?: unknown }) => {
    // Response to our request
    if (msg.type === 'res') {
      if (msg.ok && msg.payload) {
        const payload = msg.payload as Record<string, unknown>;
        
        // Connect response
        if (payload.type === 'hello-ok') {
          console.log('[clawdbot] Connected to gateway');
          if (mountedRef.current) {
            setIsConnected(true);
            
            // Load chat history
            try {
              wsSend('chat.history', { sessionKey });
            } catch (e) {
              console.error('[clawdbot] Failed to request history:', e);
            }
          }
        }
        
        // History response
        if (Array.isArray(payload.messages)) {
          const history = (payload.messages as ClawdbotMessage[]).map(toThreadMessage);
          setMessages(history);
        }
        
        // Chat send ack
        if (payload.status === 'started' || payload.status === 'in_flight') {
          setIsRunning(true);
        }
      } else if (msg.error) {
        console.error('[clawdbot] Request error:', msg.error);
        setIsRunning(false);
      }
    }
    
    // Event (streaming, etc.)
    if (msg.type === 'event') {
      const payload = msg.payload as Record<string, unknown> | undefined;
      
      // Handle connect challenge
      if (msg.event === 'connect.challenge') {
        console.log('[clawdbot] Received connect challenge');
        if (!connectSentRef.current) {
          connectSentRef.current = true;
          if (connectTimerRef.current) {
            clearTimeout(connectTimerRef.current);
          }
          const nonce = payload && typeof payload.nonce === 'string' ? payload.nonce : undefined;
          sendConnect(nonce);
        }
        return;
      }
      
      if (msg.event === 'chat' && payload) {
        // Chat event structure:
        // { runId, sessionKey, seq, state: "delta"|"final", message: { role, content: [{type, text}] } }
        const { state, message } = payload as {
          state?: string;
          message?: {
            role?: string;
            content?: Array<{ type: string; text?: string }>;
          };
        };
        
        const role = message?.role;
        const textContent = message?.content?.find(c => c.type === 'text')?.text || '';
        
        if (role === 'assistant') {
          if (state === 'delta' && textContent) {
            // Streaming delta - update assistant message
            streamingMessageRef.current = textContent; // Gateway sends accumulated text
            
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.role === 'assistant' && lastMsg.id === 'streaming') {
                // Update existing streaming message
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMsg,
                    content: [{ type: 'text', text: streamingMessageRef.current }],
                  },
                ];
              } else {
                // Add new streaming message
                return [
                  ...prev,
                  {
                    id: 'streaming',
                    role: 'assistant',
                    content: [{ type: 'text', text: streamingMessageRef.current }],
                    createdAt: new Date(),
                  },
                ];
              }
            });
          }
          
          if (state === 'final') {
            // Finalize message with real ID
            const finalContent = textContent || streamingMessageRef.current;
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMsg,
                    id: genId(),
                    content: [{ type: 'text', text: finalContent }],
                  },
                ];
              }
              return prev;
            });
            streamingMessageRef.current = '';
            setIsRunning(false);
          }
        }
      }
    }
  }, [sessionKey, wsSend, sendConnect]);

  // Send a message
  const append = useCallback(async (message: AppendMessage) => {
    // Extract text from message
    const textPart = message.content.find(p => p.type === 'text') as TextContentPart | undefined;
    const text = textPart?.text || '';
    
    if (!text.trim()) return;

    // Add user message to UI immediately
    const userMessage: ThreadMessage = {
      id: genId(),
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Reset streaming buffer
    streamingMessageRef.current = '';
    setIsRunning(true);

    // Send to Clawdbot
    pendingReqId.current = wsSend('chat.send', {
      sessionKey,
      message: text,
      idempotencyKey: genId(),
    });
  }, [sessionKey, wsSend]);

  // Cancel generation
  const cancel = useCallback(() => {
    wsSend('chat.abort', { sessionKey });
    setIsRunning(false);
    streamingMessageRef.current = '';
  }, [sessionKey, wsSend]);

  return {
    messages,
    isRunning,
    isConnected,
    append,
    cancel,
  };
}
