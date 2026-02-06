/**
 * ClawdbotRuntimeAdapter
 *
 * Connects to OpenClaw's Gateway WebSocket API.
 * Handles message streaming, history loading, and session management.
 *
 * Architecture:
 * - Parallel HTTP + WS history fetch (first to respond wins)
 * - Streaming via event chat delta events (throttled at 150ms by gateway)
 * - Post-final history re-fetch for complete content (images, MEDIA paths)
 *
 * See: /projects/automna/docs/STREAMING-SPEC.md for protocol details.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Debug ───────────────────────────────────────────────────────────────────

const DEBUG = typeof window !== 'undefined' &&
  (process.env.NODE_ENV === 'development' || new URLSearchParams(window.location.search).has('debug'));

const log = DEBUG
  ? (...args: unknown[]) => console.log('[clawdbot]', ...args)
  : () => {};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: ContentPart[];
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

/** Shape of a raw message from OpenClaw history */
interface RawMessage {
  id?: string;
  role: string;
  content: unknown;
  timestamp?: number;
  createdAt?: string;
}

/** Pending re-fetch tracking after final event */
interface PendingRefetch {
  messageId: string;
  streamedText: string;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

const genId = () => crypto.randomUUID();

/** Strip [message_id: ...] metadata injected by OpenClaw */
const stripMessageMeta = (text: string) =>
  text.replace(/\n?\[message_id: [^\]]+\]/g, '').trim();

/** Canonicalize session key to OpenClaw's internal "agent:main:{key}" format */
function canonicalizeSessionKey(key: string): string {
  if (key.startsWith('agent:main:')) return key;
  return `agent:main:${key}`;
}

/** Extract auth token from a gateway URL's query params */
function extractTokenFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('token') || undefined;
  } catch {
    return undefined;
  }
}

/** Build the HTTP history proxy URL (avoids CORS by going through our API) */
function buildHistoryUrl(gatewayUrl: string, sessionKey: string): string {
  const wsUrl = new URL(gatewayUrl);
  const historyUrl = new URL('/api/ws/history', window.location.origin);
  historyUrl.searchParams.set('sessionKey', sessionKey);

  // Forward auth params from the gateway URL
  for (const param of ['token', 'userId', 'exp', 'sig']) {
    const val = wsUrl.searchParams.get(param);
    if (val) historyUrl.searchParams.set(param, val);
  }
  return historyUrl.toString();
}

/** Parse raw message content into our ContentPart[] format */
function parseContent(raw: unknown): ContentPart[] {
  if (Array.isArray(raw)) {
    return raw.map((part: ContentPart) => {
      if (part.type === 'text' && typeof part.text === 'string') {
        return { ...part, text: stripMessageMeta(part.text) };
      }
      return part;
    });
  }
  if (typeof raw === 'string') {
    return [{ type: 'text', text: stripMessageMeta(raw) }];
  }
  return [];
}

/** Convert raw API messages to ThreadMessage[] */
function parseMessages(messages: RawMessage[], prefix: string): ThreadMessage[] {
  return messages.map((m, idx) => ({
    id: `${prefix}-${idx}`,
    role: m.role as 'user' | 'assistant',
    content: parseContent(m.content),
    createdAt: m.timestamp ? new Date(m.timestamp) : new Date(),
  }));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useClawdbotRuntime(config: ClawdbotConfig) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('connecting');
  const [error, setError] = useState<string | null>(null);

  // Refs for mutable state that doesn't trigger re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const connectSentRef = useRef(false);
  const streamingTextRef = useRef('');
  const historyLoadedRef = useRef(false);
  const httpHistoryAbortRef = useRef<AbortController | null>(null);
  const pendingRefetchRef = useRef<PendingRefetch | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const rawSessionKey = config.sessionKey || 'main';
  const sessionKey = canonicalizeSessionKey(rawSessionKey);
  const currentSessionRef = useRef(sessionKey);
  currentSessionRef.current = sessionKey;

  // ─── WebSocket Send ──────────────────────────────────────────────────────

  const wsSend = useCallback((method: string, params: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      log('WebSocket not connected, cannot send', method);
      return null;
    }
    const id = genId();
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
    return id;
  }, []);

  // ─── Event Handlers ──────────────────────────────────────────────────────

  /** Handle connect.challenge - send auth */
  function handleConnectChallenge(sendConnect: () => void, connectTimer: NodeJS.Timeout | null) {
    if (connectTimer) clearTimeout(connectTimer);
    sendConnect();
  }

  /** Handle successful connection response */
  function handleConnectResponse() {
    log('Connected to gateway');
    setIsConnected(true);

    if (!historyLoadedRef.current) {
      setLoadingPhase('loading-history');
      wsSend('chat.history', {
        sessionKey: canonicalizeSessionKey(configRef.current.sessionKey || 'main'),
      });
    }
  }

  /** Handle chat.history response (initial load or post-final re-fetch) */
  function handleHistoryResponse(wsMessages: RawMessage[]) {
    // Guard: ignore responses for stale sessions
    if (currentSessionRef.current !== sessionKey) {
      log('History arrived for old session, ignoring');
      return;
    }

    // Check if this is a post-final re-fetch
    const pending = pendingRefetchRef.current;
    if (pending && wsMessages.length > 0) {
      handleRefetchResponse(pending, wsMessages);
      return;
    }

    // Initial history load
    if (historyLoadedRef.current) return;

    log(`WS history loaded: ${wsMessages.length} messages`);
    historyLoadedRef.current = true;
    httpHistoryAbortRef.current?.abort();

    if (wsMessages.length > 0) {
      const history = wsMessages.map((m) => ({
        id: m.id || genId(),
        role: m.role as 'user' | 'assistant',
        content: parseContent(m.content),
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
      }));
      setMessages(history);
    }
    setLoadingPhase('ready');
  }

  /** Handle re-fetched history after a final event (for complete MEDIA/image content) */
  function handleRefetchResponse(pending: PendingRefetch, wsMessages: RawMessage[]) {
    pendingRefetchRef.current = null;

    const lastMsg = wsMessages[wsMessages.length - 1];
    if (lastMsg?.role !== 'assistant' || !Array.isArray(lastMsg.content)) return;

    const fullContent = parseContent(lastMsg.content);
    const hasImage = fullContent.some((p) => p.type === 'image');
    const fullText = fullContent.find((p) => p.type === 'text')?.text || '';
    const hasRicherContent =
      fullContent.length > 1 ||
      fullText.length > pending.streamedText.length ||
      hasImage;

    if (hasRicherContent) {
      log('Updating message with richer history content:', {
        parts: fullContent.length,
        hasImage,
        textLength: fullText.length,
      });
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === pending.messageId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], content: fullContent };
          return updated;
        }
        // Streaming message was removed - add the complete message
        return [
          ...prev,
          {
            id: pending.messageId,
            role: 'assistant' as const,
            content: fullContent,
            createdAt: new Date(),
          },
        ];
      });
    } else {
      log('History content not richer, keeping streamed version');
    }
  }

  /** Handle chat.send acknowledgment */
  function handleSendAck() {
    setIsRunning(true);
  }

  /** Handle run completion via res message */
  function handleRunCompletion(payload: Record<string, unknown>) {
    log('Run completed via res message');
    setIsRunning(false);

    const message = payload.message as { role?: string; content?: ContentPart[] } | undefined;
    if (message?.role === 'assistant' && Array.isArray(message.content)) {
      const textPart = message.content.find((c) => c.type === 'text');
      const text = typeof textPart?.text === 'string' ? stripMessageMeta(textPart.text) : '';

      if (text) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.id === 'streaming') {
            return [
              ...prev.slice(0, -1),
              { ...last, id: genId(), content: [{ type: 'text', text }] },
            ];
          }
          return [
            ...prev,
            { id: genId(), role: 'assistant', content: [{ type: 'text', text }], createdAt: new Date() },
          ];
        });
      }
    }
  }

  /** Handle event chat - streaming deltas and final state */
  function handleChatEvent(payload: Record<string, unknown>) {
    const state = payload.state as string | undefined;
    const message = payload.message as { role?: string; content?: ContentPart[] } | undefined;

    // Delta: update streaming message with accumulated text
    if (state === 'delta') {
      const textContent = message?.content?.find((c) => c.type === 'text')?.text;
      if (message?.role === 'assistant' && typeof textContent === 'string' && textContent) {
        streamingTextRef.current = textContent;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.id === 'streaming') {
            return [...prev.slice(0, -1), { ...last, content: [{ type: 'text', text: textContent }] }];
          }
          return [
            ...prev,
            { id: 'streaming', role: 'assistant', content: [{ type: 'text', text: textContent }], createdAt: new Date() },
          ];
        });
      }
      return;
    }

    // Final: message complete
    if (state === 'final') {
      const streamedText = streamingTextRef.current;
      streamingTextRef.current = '';

      // Get text from the final event's message (fallback for non-agent runs like commands)
      const finalText = message?.content?.find((c) => c.type === 'text')?.text || '';
      const bestText = streamedText || finalText;
      const cleanedText = bestText ? stripMessageMeta(bestText) : '';

      // Finalize the streaming message with a permanent ID
      const finalId = genId();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.id === 'streaming') {
          if (cleanedText) {
            return [...prev.slice(0, -1), { ...last, id: finalId, content: [{ type: 'text', text: cleanedText }] }];
          }
          return [...prev.slice(0, -1), { ...last, id: finalId }];
        }
        // No streaming message exists (command/non-agent run)
        if (cleanedText) {
          return [
            ...prev,
            { id: finalId, role: 'assistant', content: [{ type: 'text', text: cleanedText }], createdAt: new Date() },
          ];
        }
        return prev;
      });
      setIsRunning(false);

      // Re-fetch history to get complete content (images, full MEDIA paths)
      // NOTE: Store raw streamedText (not cleanedText) for comparison.
      // When streamedText is empty (fast response, no deltas), any history content
      // will be "richer" and trigger the update - which is how images get swapped in.
      if (currentSessionRef.current) {
        setTimeout(() => {
          pendingRefetchRef.current = { messageId: finalId, streamedText: streamedText };
          wsSend('chat.history', { sessionKey: currentSessionRef.current });
        }, 500);
      }
      return;
    }

    // Error state
    if (state === 'error') {
      streamingTextRef.current = '';
      setIsRunning(false);
      const errorMsg = (payload.errorMessage as string) || 'Something went wrong';
      setError(errorMsg);

      // Remove streaming placeholder
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.id === 'streaming') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }
  }

  /** Handle agent events (currently debug logging; streaming will use these in Phase 2) */
  function handleAgentEvent(payload: Record<string, unknown>) {
    // Agent events carry real-time streaming data but we don't use them yet.
    // Phase 2 will switch to using stream:"assistant" events for smoother streaming.
    // For now, just log in debug mode.
    log('Agent event:', payload.stream, payload.data ? JSON.stringify(payload.data).slice(0, 100) : '');
  }

  /** Handle error responses */
  function handleErrorResponse(msg: { error?: { message?: string } }) {
    const errorMsg = msg.error?.message;
    if (errorMsg) {
      log('Error response:', errorMsg);
      setError(errorMsg);
    }
    setIsRunning(false);
  }

  // ─── Connection Effect ───────────────────────────────────────────────────

  useEffect(() => {
    if (!config.gatewayUrl) {
      setError('No gateway URL configured');
      setLoadingPhase('error');
      return;
    }

    // Reset state for new connection
    mountedRef.current = true;
    connectSentRef.current = false;
    streamingTextRef.current = '';
    historyLoadedRef.current = false;
    pendingRefetchRef.current = null;
    setMessages([]);
    setLoadingPhase('connecting');
    setError(null);

    let connectionDelayTimer: NodeJS.Timeout | null = null;

    // Safety timeout: allow chat if nothing loads in 10s
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current && !historyLoadedRef.current) {
        log('Safety timeout - allowing chat without history');
        historyLoadedRef.current = true;
        setIsConnected(true);
        setLoadingPhase('ready');
      }
    }, 10000);

    // Debounce connection (100ms) to prevent race conditions when switching sessions
    connectionDelayTimer = setTimeout(() => {

      // ── HTTP History Fetch (parallel with WebSocket) ──

      const httpAbort = new AbortController();
      httpHistoryAbortRef.current = httpAbort;

      const historyUrl = buildHistoryUrl(config.gatewayUrl, sessionKey);
      log('Starting HTTP history fetch');

      fetch(historyUrl, { signal: httpAbort.signal })
        .then((res) => {
          if (!res.ok) return { messages: [] };
          return res.json();
        })
        .then((data) => {
          if (!mountedRef.current || historyLoadedRef.current) return;
          if (currentSessionRef.current !== sessionKey) return;

          if (data?.messages?.length > 0) {
            log(`HTTP history loaded: ${data.messages.length} messages`);
            historyLoadedRef.current = true;
            setMessages(parseMessages(data.messages, 'http'));
            setIsConnected(true);
            setError(null);
            setLoadingPhase('ready');
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          log('HTTP history fetch failed:', err.message);

          // Allow chat to work even if HTTP fails
          if (mountedRef.current && !historyLoadedRef.current) {
            historyLoadedRef.current = true;
            setIsConnected(true);
            setLoadingPhase('ready');
          }
        });

      // ── WebSocket Connection ──

      let wsUrl = config.gatewayUrl;
      if (!wsUrl.includes('/ws')) {
        wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      let connectTimer: NodeJS.Timeout | null = null;

      const sendConnect = () => {
        if (connectSentRef.current || ws.readyState !== WebSocket.OPEN) return;
        connectSentRef.current = true;

        const cfg = configRef.current;
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

        ws.send(JSON.stringify({ type: 'req', id: genId(), method: 'connect', params: connectParams }));
      };

      ws.onopen = () => {
        log('WebSocket opened');
        connectTimer = setTimeout(sendConnect, 800);
      };

      // ── Message Router ──

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const msg = JSON.parse(event.data);

          // Route by message type
          if (msg.type === 'event') {
            switch (msg.event) {
              case 'connect.challenge':
                handleConnectChallenge(sendConnect, connectTimer);
                return;
              case 'agent':
                handleAgentEvent(msg.payload || {});
                return;
              case 'chat':
                handleChatEvent(msg.payload || {});
                return;
              // Ignore: health, presence, tick
              default:
                return;
            }
          }

          if (msg.type === 'res') {
            if (!msg.ok) {
              handleErrorResponse(msg);
              return;
            }

            const payload = msg.payload || {};

            // Connect response
            if (payload.type === 'hello-ok') {
              handleConnectResponse();
              return;
            }

            // History response (has messages array)
            if (Array.isArray(payload.messages)) {
              handleHistoryResponse(payload.messages);
              return;
            }

            // Send acknowledgment
            if (payload.status === 'started' || payload.status === 'in_flight') {
              handleSendAck();
              return;
            }

            // Run completion via res (fallback path)
            if (payload.runId && (payload.status === 'done' || payload.status === 'completed' || payload.status === 'finished')) {
              handleRunCompletion(payload);
              return;
            }
          }
        } catch (e) {
          console.error('[clawdbot] Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = () => {
        log('WebSocket error');
      };

      ws.onclose = (event) => {
        log('WebSocket closed:', event.code);
        setIsConnected(false);

        if (event.code !== 1000) {
          setTimeout(() => {
            if (mountedRef.current && !historyLoadedRef.current) {
              setError('Connection failed. Retrying...');
              setLoadingPhase('error');
            }
          }, 3000);
        }
      };

    }, 100); // End of connection debounce

    // ── Cleanup ──

    return () => {
      mountedRef.current = false;
      if (connectionDelayTimer) clearTimeout(connectionDelayTimer);
      httpHistoryAbortRef.current?.abort();
      clearTimeout(safetyTimeout);

      const currentWs = wsRef.current;
      if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
        currentWs.close(1000, 'Component unmounted');
      }
      wsRef.current = null;
    };
  }, [config.gatewayUrl, config.authToken, sessionKey, wsSend]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  /** Send a user message */
  const append = useCallback(async (message: AppendMessage) => {
    const text = message.content.find((p) => p.type === 'text')?.text?.trim();
    if (!text) return;

    // Add user message to UI immediately
    setMessages((prev) => [
      ...prev,
      { id: genId(), role: 'user', content: [{ type: 'text', text }], createdAt: new Date() },
    ]);

    streamingTextRef.current = '';
    setIsRunning(true);

    const cfg = configRef.current;
    const ws = wsRef.current;
    const sk = canonicalizeSessionKey(cfg.sessionKey || 'main');

    // Prefer WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      wsSend('chat.send', { sessionKey: sk, message: text, idempotencyKey: genId() });
      return;
    }

    // HTTP fallback
    log('WebSocket not available, using HTTP fallback');
    try {
      const wsUrl = new URL(cfg.gatewayUrl);
      const httpUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      const sendUrl = new URL(`${httpUrl}/api/chat/send`);

      for (const param of ['userId', 'exp', 'sig']) {
        const val = wsUrl.searchParams.get(param);
        if (val) sendUrl.searchParams.set(param, val);
      }

      const response = await fetch(sendUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionKey: sk }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Poll for response since HTTP doesn't stream
      setTimeout(async () => {
        const historyUrl = buildHistoryUrl(cfg.gatewayUrl, sk);
        try {
          const historyRes = await fetch(historyUrl);
          const historyData = await historyRes.json();
          if (historyData?.messages?.length > 0) {
            setMessages(parseMessages(historyData.messages, 'poll'));
          }
        } catch {
          log('Failed to poll history after HTTP send');
        }
        setIsRunning(false);
      }, 3000);
    } catch (err) {
      console.error('[clawdbot] HTTP send failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsRunning(false);
    }
  }, [wsSend]);

  /** Cancel the current run */
  const cancel = useCallback(() => {
    wsSend('chat.abort', { sessionKey: canonicalizeSessionKey(configRef.current.sessionKey || 'main') });
    setIsRunning(false);
  }, [wsSend]);

  /** Clear local message history */
  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isRunning, isConnected, loadingPhase, error, append, cancel, clearHistory };
}
