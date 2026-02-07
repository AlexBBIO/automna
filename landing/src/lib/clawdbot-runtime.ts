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

export interface ThreadMessage {
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

/** Detect heartbeat messages (both prompts and HEARTBEAT_OK responses) */
function isHeartbeatMessage(m: RawMessage): boolean {
  const text = typeof m.content === 'string'
    ? m.content
    : Array.isArray(m.content)
      ? m.content.filter((p: ContentPart) => p.type === 'text').map((p: ContentPart) => p.text || '').join(' ')
      : '';
  const trimmed = text.trim();
  // Match heartbeat prompts (contain "HEARTBEAT_OK" instruction or "Read HEARTBEAT.md")
  if (m.role === 'user' && (
    trimmed.includes('HEARTBEAT_OK') ||
    trimmed.includes('HEARTBEAT.md') ||
    trimmed.includes('heartbeat poll')
  )) return true;
  // Match heartbeat responses
  if (m.role === 'assistant' && (
    trimmed === 'HEARTBEAT_OK' ||
    trimmed.startsWith('HEARTBEAT_OK')
  )) return true;
  return false;
}

/** Convert raw API messages to ThreadMessage[], filtering out system/tool/heartbeat messages */
function parseMessages(messages: RawMessage[], prefix: string): ThreadMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => !isHeartbeatMessage(m))
    .map((m, idx) => ({
      id: `${prefix}-${idx}`,
      role: m.role as 'user' | 'assistant',
      content: parseContent(m.content),
      createdAt: m.timestamp ? new Date(m.timestamp) : new Date(),
    }));
}

// ─── Module-level state (persists across component remounts) ─────────────────

// Maps runId → sessionKey for cross-talk prevention.
// Must be module-level because the dashboard remounts the chat component on
// conversation switch (key={currentConversation}), which destroys all refs.
const runIdSessionMap = new Map<string, string>();

// Tracks conversations with unread messages (filtered events went to a different session)
const unreadSessions = new Set<string>();
let unreadListeners: Array<(keys: Set<string>) => void> = [];

function trackRunIdSession(runId: string, sessionKey: string) {
  runIdSessionMap.set(runId, sessionKey);
  // Keep map bounded
  if (runIdSessionMap.size > 100) {
    const entries = Array.from(runIdSessionMap.entries());
    const trimmed = entries.slice(-50);
    runIdSessionMap.clear();
    for (const [k, v] of trimmed) runIdSessionMap.set(k, v);
  }
}

/**
 * Check if an event belongs to a different session.
 * Uses both runId→session mapping AND the event's own sessionKey field.
 * This prevents webhook/hook-triggered events (unknown runId) from leaking
 * into whichever chat happens to be active.
 */
function isEventForDifferentSession(
  runId: string | undefined,
  currentSession: string,
  eventSessionKey?: string | undefined,
): boolean {
  // If the event carries its own sessionKey, use that as the source of truth
  if (eventSessionKey) {
    const canonical = eventSessionKey.startsWith('agent:main:')
      ? eventSessionKey
      : `agent:main:${eventSessionKey}`;
    if (canonical !== currentSession) {
      // Also register the runId→session mapping for future events in this run
      if (runId) trackRunIdSession(runId, canonical);
      return true;
    }
    return false;
  }

  // Fall back to runId mapping
  if (!runId) return false;
  const mapped = runIdSessionMap.get(runId);
  if (!mapped) return false; // Unknown runId with no sessionKey → allow through (legacy)
  return mapped !== currentSession;
}

function markSessionUnread(sessionKey: string) {
  // Extract bare key from canonical format (agent:main:research → research)
  const bare = sessionKey.startsWith('agent:main:') ? sessionKey.slice(11) : sessionKey;
  if (!unreadSessions.has(bare)) {
    unreadSessions.add(bare);
    notifyUnreadListeners();
  }
}

function clearSessionUnread(sessionKey: string) {
  const bare = sessionKey.startsWith('agent:main:') ? sessionKey.slice(11) : sessionKey;
  if (unreadSessions.has(bare)) {
    unreadSessions.delete(bare);
    notifyUnreadListeners();
  }
}

function notifyUnreadListeners() {
  const snapshot = new Set(unreadSessions);
  for (const listener of unreadListeners) {
    listener(snapshot);
  }
}

/** Subscribe to unread session changes. Returns unsubscribe function. */
export function subscribeUnread(listener: (keys: Set<string>) => void): () => void {
  unreadListeners.push(listener);
  // Immediately notify with current state
  listener(new Set(unreadSessions));
  return () => {
    unreadListeners = unreadListeners.filter(l => l !== listener);
  };
}

/** Clear unread for a session (call when user switches to it) */
export function clearUnread(sessionKey: string) {
  clearSessionUnread(sessionKey);
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
  const isRunningRef = useRef(false); // Mirror of isRunning for use in timeouts
  const activeRunIdRef = useRef<string | null>(null); // Current run ID for deduplication
  const turnCountRef = useRef(0); // Counts assistant turns within a run (increments on tool calls)
  const streamingMediaRef = useRef<string[]>([]); // Accumulated MEDIA URLs for current turn
  const recoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const deltaCountRef = useRef(0); // Count deltas per run for diagnostics
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

  // ─── Run Recovery ─────────────────────────────────────────────────────────
  // Safety net: if the final event never arrives (WS drop, gateway bug, etc.),
  // periodically poll history to check if the run completed server-side.

  const MAX_RECOVERY_ATTEMPTS = 8; // 30s + 8*15s = ~2.5 minutes max

  function clearRecoveryTimer() {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    recoveryAttemptsRef.current = 0;
  }

  function startRecoveryTimer() {
    clearRecoveryTimer();
    // First check at 30s, then every 15s
    recoveryTimerRef.current = setTimeout(() => attemptRecovery(), 30_000);
  }

  function attemptRecovery() {
    if (!mountedRef.current || !isRunningRef.current) {
      log('🔄 Recovery skipped (not mounted or not running)');
      return;
    }

    recoveryAttemptsRef.current++;
    log(`🔄 Recovery attempt ${recoveryAttemptsRef.current}/${MAX_RECOVERY_ATTEMPTS}`);

    // Max attempts reached - give up and reset UI
    if (recoveryAttemptsRef.current > MAX_RECOVERY_ATTEMPTS) {
      log('Recovery: max attempts reached, resetting');
      finalizeStaleRun();
      return;
    }

    const cfg = configRef.current;
    const sk = currentSessionRef.current;
    if (!sk || !cfg.gatewayUrl) {
      scheduleRecoveryRetry();
      return;
    }

    const historyUrl = buildHistoryUrl(cfg.gatewayUrl, sk);
    fetch(historyUrl)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!mountedRef.current || !isRunningRef.current) return;

        const msgs = (data?.messages || []).filter(
          (m: RawMessage) => m.role === 'user' || m.role === 'assistant'
        );
        const lastMsg = msgs[msgs.length - 1];

        if (lastMsg?.role === 'assistant') {
          // Run completed on server - update UI with full history
          log('Recovery: run completed server-side, updating messages');
          setMessages(parseMessages(msgs, 'recovery'));
          setIsRunning(false);
          isRunningRef.current = false;
          streamingTextRef.current = '';
          streamingMediaRef.current = [];
          clearRecoveryTimer();
        } else {
          // Still running on server, check again
          log('Recovery: still running, will retry');
          scheduleRecoveryRetry();
        }
      })
      .catch((err) => {
        log('Recovery fetch failed:', err.message);
        scheduleRecoveryRetry();
      });
  }

  function scheduleRecoveryRetry() {
    recoveryTimerRef.current = setTimeout(() => attemptRecovery(), 15_000);
  }

  /** Last resort: reset the UI when all recovery attempts fail */
  function finalizeStaleRun() {
    clearRecoveryTimer();
    activeRunIdRef.current = null;
    streamingTextRef.current = '';
    streamingMediaRef.current = [];
    setIsRunning(false);
    isRunningRef.current = false;

    // Give any remaining streaming messages permanent IDs
    setMessages((prev) => {
      let changed = false;
      const updated = prev.map((m) => {
        if (m.role === 'assistant' && (m.id === 'streaming' || m.id.startsWith('streaming-'))) {
          changed = true;
          return { ...m, id: genId() };
        }
        return m;
      });
      return changed ? updated : prev;
    });
  }

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

    // If we were waiting for a response when the WS dropped, recover immediately
    if (isRunningRef.current) {
      log('Reconnected while running - attempting immediate recovery');
      attemptRecovery();
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
      const history = wsMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
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
        // Message not found - don't add a duplicate, just log
        log('⚠️ Re-fetch: could not find message to update:', pending.messageId);
        return prev;
      });
    } else {
      log('History content not richer, keeping streamed version');
    }
  }

  /** Handle chat.send acknowledgment */
  function handleSendAck(payload: Record<string, unknown>) {
    const runId = payload.runId as string | undefined;
    log('📤 Run started:', { runId, status: payload.status });
    // Cancel any pending re-fetch from previous run (prevents cross-run content swap)
    pendingRefetchRef.current = null;
    activeRunIdRef.current = runId || null;
    turnCountRef.current = 0;
    deltaCountRef.current = 0;
    streamingMediaRef.current = [];
    // Map this runId to the current session for cross-talk prevention (module-level, survives remounts)
    if (runId) {
      trackRunIdSession(runId, currentSessionRef.current);
    }
    setIsRunning(true);
    isRunningRef.current = true;
    startRecoveryTimer();
  }

  /** Handle event chat - streaming deltas and final state */
  function handleChatEvent(payload: Record<string, unknown>) {
    const state = payload.state as string | undefined;
    const message = payload.message as { role?: string; content?: ContentPart[] } | undefined;
    const runId = payload.runId as string | undefined;
    const eventSessionKey = payload.sessionKey as string | undefined;

    // Session-aware event filtering: prevent cross-talk between conversations
    if (isEventForDifferentSession(runId, currentSessionRef.current, eventSessionKey)) {
      const targetSession = eventSessionKey || runIdSessionMap.get(runId!);
      if (targetSession && state === 'final') {
        markSessionUnread(typeof targetSession === 'string' ? targetSession : targetSession);
      }
      log('🚫 Filtered chat event for different session:', { runId, state, current: currentSessionRef.current });
      // For final events, clean up running state if this was our active run
      if (state === 'final' && activeRunIdRef.current === runId) {
        clearRecoveryTimer();
        activeRunIdRef.current = null;
        streamingTextRef.current = '';
        streamingMediaRef.current = [];
        setIsRunning(false);
        isRunningRef.current = false;
      }
      return;
    }

    // Log every chat event state for diagnostics
    if (state !== 'delta') {
      // Log non-delta events fully (deltas are too noisy)
      log(`📨 chat event: state=${state} runId=${runId}`, {
        hasMessage: !!message,
        messageRole: message?.role,
        contentTypes: message?.content?.map((c) => c.type),
        payloadKeys: Object.keys(payload),
      });
    }

    // Delta: no-op. We use event agent assistant deltas instead (per-token, no resets).
    // Chat deltas are throttled at 150ms and reset after tool calls.
    if (state === 'delta') {
      // Still reset recovery timer as a signal the run is alive
      startRecoveryTimer();
      return;
    }

    // Final: message complete
    if (state === 'final') {
      clearRecoveryTimer();
      const streamedText = streamingTextRef.current;
      streamingTextRef.current = '';
      streamingMediaRef.current = [];

      // Get text from the final event's message (fallback for non-agent runs like commands)
      const finalText = message?.content?.find((c) => c.type === 'text')?.text || '';
      const bestText = streamedText || finalText;
      const cleanedText = bestText ? stripMessageMeta(bestText) : '';

      log('✅ Final event processed:', {
        deltaCount: deltaCountRef.current,
        streamedTextLen: streamedText.length,
        finalTextLen: finalText.length,
        cleanedTextLen: cleanedText.length,
        contentTypes: message?.content?.map((c) => c.type),
      });

      // Finalize the last streaming message with a permanent ID
      const finalId = runId || genId();
      const turn = turnCountRef.current;
      const streamingId = runId
        ? (turn > 0 ? `streaming-${runId}-t${turn}` : `streaming-${runId}`)
        : 'streaming';
      activeRunIdRef.current = null;
      turnCountRef.current = 0;
      setMessages((prev) => {
        // Find the streaming message for the current turn
        const streamIdx = prev.findIndex((m) =>
          m.role === 'assistant' && (m.id === streamingId || m.id === 'streaming')
        );
        if (streamIdx >= 0) {
          const updated = [...prev];
          if (cleanedText) {
            updated[streamIdx] = { ...prev[streamIdx], id: finalId, content: [{ type: 'text', text: cleanedText }] };
          } else {
            updated[streamIdx] = { ...prev[streamIdx], id: finalId };
          }
          return updated;
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
      isRunningRef.current = false;

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
      clearRecoveryTimer();
      activeRunIdRef.current = null;
      streamingTextRef.current = '';
      streamingMediaRef.current = [];
      setIsRunning(false);
      isRunningRef.current = false;
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

  /** Handle event agent - per-token streaming, tool boundaries, and lifecycle events */
  function handleAgentEvent(payload: Record<string, unknown>) {
    const stream = payload.stream as string | undefined;
    const data = payload.data as Record<string, unknown> | undefined;
    const runId = payload.runId as string | undefined;
    const eventSessionKey = payload.sessionKey as string | undefined;

    // Session-aware event filtering: prevent cross-talk between conversations
    if (isEventForDifferentSession(runId, currentSessionRef.current, eventSessionKey)) {
      const targetSession = eventSessionKey || runIdSessionMap.get(runId!);
      if (targetSession && stream === 'assistant') {
        markSessionUnread(typeof targetSession === 'string' ? targetSession : targetSession);
      }
      log('🚫 Filtered agent event for different session:', { runId, current: currentSessionRef.current });
      return;
    }

    // Capture runId if we missed the send ack
    if (runId && !activeRunIdRef.current) activeRunIdRef.current = runId;

    // ── Assistant text streaming ──
    if (stream === 'assistant' && data) {
      const delta = data.delta as string | undefined;
      const mediaUrls = data.mediaUrls as string[] | undefined;

      if (typeof delta === 'string' && delta) {
        deltaCountRef.current++;
        startRecoveryTimer();

        // Append delta to our accumulator
        streamingTextRef.current += delta;
      }

      // Collect MEDIA URLs stripped from text by the server
      // Re-inject them as MEDIA: lines so MessageContent can render them
      if (mediaUrls?.length) {
        for (const url of mediaUrls) {
          if (!streamingMediaRef.current.includes(url)) {
            streamingMediaRef.current.push(url);
            streamingTextRef.current += `\n\nMEDIA:${url}`;
          }
        }
      }

      // Update the streaming message bubble
      const displayText = streamingTextRef.current;
      if (displayText) {
        const turn = turnCountRef.current;
        const sid = runId
          ? (turn > 0 ? `streaming-${runId}-t${turn}` : `streaming-${runId}`)
          : 'streaming';

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.id === sid) {
            return [...prev.slice(0, -1), { ...last, content: [{ type: 'text', text: displayText }] }];
          }
          return [
            ...prev,
            { id: sid, role: 'assistant', content: [{ type: 'text', text: displayText }], createdAt: new Date() },
          ];
        });
      }
      return;
    }

    // ── Tool events: split bubbles at tool boundaries ──
    // Requires verboseDefault: "on" in OpenClaw config (otherwise gateway filters these out)
    if (stream === 'tool') {
      startRecoveryTimer();
      const phase = (data?.phase as string) || '';

      // Only split on tool start (not update/result) to avoid multiple splits per tool call
      if (phase === 'start') {
        const currentText = streamingTextRef.current;
        if (currentText) {
          const currentRunId = activeRunIdRef.current;
          const turn = turnCountRef.current;
          const currentSid = currentRunId
            ? (turn > 0 ? `streaming-${currentRunId}-t${turn}` : `streaming-${currentRunId}`)
            : 'streaming';
          const permanentId = genId();

          log('🔧 Tool boundary, finalizing bubble', { turn, tool: data?.name, textLen: currentText.length });

          // Give current bubble a permanent ID (no longer "streaming")
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.role === 'assistant' && m.id === currentSid);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], id: permanentId, content: [{ type: 'text', text: stripMessageMeta(currentText) }] };
              return updated;
            }
            return prev;
          });

          // Reset accumulators for next bubble
          streamingTextRef.current = '';
          streamingMediaRef.current = [];
          turnCountRef.current++;
        }
      }

      log('🔧 Tool:', phase, data?.name || '');
      return;
    }

    // ── Lifecycle events: logging only ──
    // Bubble splitting is handled by tool events (above), not lifecycle.
    // Lifecycle fires once per run (start/end), not per assistant turn.
    if (stream === 'lifecycle' && data) {
      const phase = data.phase as string | undefined;
      log(`🔄 Lifecycle: ${phase}`);
      if (phase === 'start') {
        startRecoveryTimer();
      }
      // Don't finalize on lifecycle end - wait for chat final event
      return;
    }
  }

  /** Handle error responses */
  function handleErrorResponse(msg: { error?: { message?: string; type?: string }; limits?: unknown }) {
    const errorMsg = msg.error?.message;
    const errorType = msg.error?.type;
    if (errorMsg) {
      log('Error response:', errorMsg);
      // Make rate limit errors user-friendly
      if (errorType === 'rate_limit_error' || errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('cost limit') || errorMsg.toLowerCase().includes('token limit')) {
        setError('You\'ve reached your plan limit for this month. Upgrade your plan to keep chatting.');
      } else {
        setError(errorMsg);
      }
    }
    clearRecoveryTimer();
    setIsRunning(false);
    isRunningRef.current = false;
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
    streamingMediaRef.current = [];
    historyLoadedRef.current = false;
    pendingRefetchRef.current = null;
    isRunningRef.current = false;
    activeRunIdRef.current = null;
    // runIdSessionMap is module-level, no need to clear here
    clearRecoveryTimer();
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
              handleSendAck(payload);
              return;
            }

            // Log any unhandled res messages (includes status:"ok" dedupe responses)
            log('📩 Unhandled res:', { keys: Object.keys(payload), status: payload.status, runId: payload.runId });
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
      clearRecoveryTimer();

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
    streamingMediaRef.current = [];
    setIsRunning(true);
    isRunningRef.current = true;
    startRecoveryTimer();

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
        isRunningRef.current = false;
        clearRecoveryTimer();
      }, 3000);
    } catch (err) {
      console.error('[clawdbot] HTTP send failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsRunning(false);
      isRunningRef.current = false;
      clearRecoveryTimer();
    }
  }, [wsSend]);

  /** Cancel the current run */
  const cancel = useCallback(() => {
    wsSend('chat.abort', { sessionKey: canonicalizeSessionKey(configRef.current.sessionKey || 'main') });
    clearRecoveryTimer();
    activeRunIdRef.current = null;
    setIsRunning(false);
    isRunningRef.current = false;
  }, [wsSend]);

  /** Clear local message history */
  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isRunning, isConnected, loadingPhase, error, append, cancel, clearHistory };
}
