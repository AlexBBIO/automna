'use client';

/**
 * AutomnaChat
 * 
 * Chat interface component using Clawdbot backend.
 * Features:
 * - Optimistic loading states
 * - Typing indicators
 * - Message streaming
 * - Keyboard shortcuts
 */

import { useClawdbotRuntime } from '@/lib/clawdbot-runtime';
import { MessageContent } from './MessageContent';
import { 
  useEffect, 
  useRef, 
  useState, 
  type FormEvent,
  type KeyboardEvent 
} from 'react';

interface AutomnaChatProps {
  /** WebSocket URL to gateway */
  gatewayUrl: string;
  /** Auth token */
  authToken?: string;
  /** Session key */
  sessionKey?: string;
}

// Loading skeleton for messages
function ChatSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-end">
        <div className="bg-purple-900/30 rounded-2xl h-10 w-48" />
      </div>
      <div className="flex justify-start">
        <div className="bg-gray-800/50 rounded-2xl h-16 w-64" />
      </div>
      <div className="flex justify-end">
        <div className="bg-purple-900/30 rounded-2xl h-10 w-32" />
      </div>
      <div className="flex justify-start">
        <div className="bg-gray-800/50 rounded-2xl h-24 w-72" />
      </div>
    </div>
  );
}

// Typing indicator dots
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-800 rounded-2xl px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// Connection status indicator
function ConnectionStatus({ phase, error }: { phase: string; error: string | null }) {
  if (phase === 'error') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-sm text-red-400">{error || 'Connection error'}</span>
      </div>
    );
  }
  
  if (phase === 'connecting') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        <span className="text-sm text-yellow-400">Connecting...</span>
      </div>
    );
  }
  
  if (phase === 'loading-history') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-sm text-blue-400">Loading history...</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-green-500" />
      <span className="text-sm text-gray-400">Connected</span>
    </div>
  );
}

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AutomnaChat({ gatewayUrl, authToken, sessionKey }: AutomnaChatProps) {
  const { messages, isRunning, isConnected, loadingPhase, error, append, cancel } = useClawdbotRuntime({
    gatewayUrl,
    authToken,
    sessionKey,
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when ready
  useEffect(() => {
    if (loadingPhase === 'ready') {
      inputRef.current?.focus();
    }
  }, [loadingPhase]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning || !isConnected) return;
    
    append({
      role: 'user',
      content: [{ type: 'text', text: input }],
    });
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    // Escape to cancel generation
    if (e.key === 'Escape' && isRunning) {
      cancel();
    }
  };

  const isLoading = loadingPhase === 'connecting' || loadingPhase === 'loading-history';

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <ConnectionStatus phase={loadingPhase} error={error} />
        <span className="text-xs text-gray-500 font-medium">
          {sessionKey === 'main' ? 'General' : sessionKey}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Loading skeleton */}
        {isLoading && <ChatSkeleton />}
        
        {/* Empty state */}
        {!isLoading && messages.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-lg font-medium mb-2">Ready to help!</p>
            <p className="text-sm">Send a message to start chatting with your agent.</p>
          </div>
        )}
        
        {/* Messages */}
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                message.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {message.content.map((part, i) => {
                if (part.type === 'text' && typeof part.text === 'string') {
                  return (
                    <MessageContent 
                      key={i} 
                      text={part.text}
                      isUser={message.role === 'user'}
                    />
                  );
                }
                return null;
              })}
              {/* Timestamp on hover */}
              <div className={`text-xs mt-1 opacity-0 group-hover:opacity-60 transition-opacity ${
                message.role === 'user' ? 'text-purple-200' : 'text-gray-400'
              }`}>
                {formatTime(message.createdAt)}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isRunning && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
          <TypingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/30">
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-2 bg-gray-800 rounded-xl p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConnected ? "Message your agent..." : "Connecting..."}
              rows={1}
              className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none px-2 py-1 text-[15px] min-h-[36px] max-h-[120px]"
              disabled={!isConnected}
              style={{
                height: 'auto',
                overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            {isRunning ? (
              <button
                type="button"
                onClick={cancel}
                className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex-shrink-0"
                title="Stop generation (Esc)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="6" y="6" width="12" height="12" strokeWidth="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !isConnected}
                className="p-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0"
                title="Send message (Enter)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            )}
          </div>
          {isRunning && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Press Esc to stop
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
