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

  // Connect to gateway
  useEffect(() => {
    console.log('[clawdbot] Connecting to', config.gatewayUrl);
    
    const ws = new WebSocket(config.gatewayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[clawdbot] WebSocket connected');
      
      // Send connect request with auth
      const connectParams: Record<string, unknown> = {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'automna-chat',
          version: '1.0.0',
          platform: 'web',
          mode: 'operator',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        locale: 'en-US',
        userAgent: 'automna-chat/1.0.0',
      };

      if (config.authToken) {
        connectParams.auth = { token: config.authToken };
      }

      ws.send(JSON.stringify({
        type: 'req',
        id: genId(),
        method: 'connect',
        params: connectParams,
      }));
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
      ws.close();
    };
  }, [config.gatewayUrl, config.authToken]);

  // Handle incoming messages
  const handleMessage = useCallback((msg: { type: string; id?: string; ok?: boolean; payload?: unknown; event?: string; error?: unknown }) => {
    // Response to our request
    if (msg.type === 'res') {
      if (msg.ok && msg.payload) {
        const payload = msg.payload as Record<string, unknown>;
        
        // Connect response
        if (payload.type === 'hello-ok') {
          console.log('[clawdbot] Connected to gateway');
          setIsConnected(true);
          
          // Load chat history
          wsSend('chat.history', { sessionKey });
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
      
      if (msg.event === 'chat' && payload) {
        const { role, delta, content, status } = payload as {
          role?: string;
          delta?: string;
          content?: string;
          status?: string;
        };
        
        if (role === 'assistant') {
          if (status === 'streaming' && delta) {
            // Accumulate streaming content
            streamingMessageRef.current += delta;
            
            // Update or add assistant message
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
          
          if (status === 'complete') {
            // Finalize message with real ID
            const finalContent = content || streamingMessageRef.current;
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
  }, [sessionKey, wsSend]);

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
