'use client';

/**
 * AutomnaChat - Polished Chat Interface
 * 
 * UI Improvements (2026-02-01):
 * - Assistant avatar with Automna branding
 * - Visible timestamps (subtle)
 * - Message actions on hover (Copy, Retry)
 * - Fade-in animations for messages
 * - Improved empty state with suggestions
 * - Larger, more inviting input area
 * - Better colors and spacing
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
  gatewayUrl: string;
  authToken?: string;
  sessionKey?: string;
}

// Assistant avatar component
function AssistantAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg">
      <span className="text-white text-sm font-bold">A</span>
    </div>
  );
}

// Loading skeleton with animation
function ChatSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-end">
        <div className="bg-purple-900/20 rounded-2xl h-12 w-52" />
      </div>
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-gray-800" />
        <div className="bg-gray-800/50 rounded-2xl h-20 w-72" />
      </div>
      <div className="flex justify-end">
        <div className="bg-purple-900/20 rounded-2xl h-12 w-36" />
      </div>
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-gray-800" />
        <div className="bg-gray-800/50 rounded-2xl h-28 w-80" />
      </div>
    </div>
  );
}

// Typing indicator with pulse animation
function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start animate-fadeIn">
      <AssistantAvatar />
      <div className="bg-gray-800/80 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// Connection status
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
        <span className="text-sm text-blue-400">Loading...</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-green-500" />
      <span className="text-sm text-gray-500">Online</span>
    </div>
  );
}

// Message actions (hover)
function MessageActions({ 
  onCopy, 
  onRetry, 
  showRetry,
  copied 
}: { 
  onCopy: () => void; 
  onRetry?: () => void;
  showRetry?: boolean;
  copied: boolean;
}) {
  return (
    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
      <button
        onClick={onCopy}
        className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded transition-colors"
        title="Copy message"
      >
        {copied ? (
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
      {showRetry && onRetry && (
        <button
          onClick={onRetry}
          className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded transition-colors"
          title="Regenerate response"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Empty state with suggestions
function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    { icon: '💻', text: 'Write some code', prompt: 'Help me write a function that...' },
    { icon: '🔍', text: 'Research a topic', prompt: 'Research and summarize...' },
    { icon: '✍️', text: 'Help with writing', prompt: 'Help me write a...' },
    { icon: '🧠', text: 'Brainstorm ideas', prompt: 'Help me brainstorm ideas for...' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-fadeIn">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg">
        <span className="text-3xl">✨</span>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Hey there!</h2>
      <p className="text-gray-400 mb-8 max-w-md">
        I'm your AI assistant. Ask me anything or try one of these:
      </p>
      <div className="grid grid-cols-2 gap-3 max-w-md w-full">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(s.prompt)}
            className="flex items-center gap-3 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-purple-500/50 rounded-xl text-left transition-all group"
          >
            <span className="text-2xl">{s.icon}</span>
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Get message text for copying
function getMessageText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(p => p.type === 'text' && typeof p.text === 'string')
    .map(p => p.text)
    .join('\n');
}

export function AutomnaChat({ gatewayUrl, authToken, sessionKey }: AutomnaChatProps) {
  const { messages, isRunning, isConnected, loadingPhase, error, append, cancel, clearHistory } = useClawdbotRuntime({
    gatewayUrl,
    authToken,
    sessionKey,
  });

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Clear all history (calls API + clears local state)
  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      // Build the reset URL using the gateway URL
      const wsUrl = new URL(gatewayUrl);
      const baseUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      const resetUrl = new URL(`${baseUrl}/api/reset-workspace`);
      
      // Copy auth params from gateway URL
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      if (userId) resetUrl.searchParams.set('userId', userId);
      if (exp) resetUrl.searchParams.set('exp', exp);
      if (sig) resetUrl.searchParams.set('sig', sig);
      
      const response = await fetch(resetUrl.toString(), { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        // Clear local messages
        clearHistory?.();
        setShowClearConfirm(false);
        // Reload to get fresh state
        window.location.reload();
      } else {
        console.error('Clear failed:', data);
        alert('Failed to clear history. Please try again.');
      }
    } catch (err) {
      console.error('Clear error:', err);
      alert('Failed to clear history. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;
    
    append({
      role: 'user',
      content: [{ type: 'text', text: input }],
    });
    setInput('');
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Escape' && isRunning) {
      cancel();
    }
  };

  const handleCopy = async (messageId: string, content: Array<{ type: string; text?: string }>) => {
    const text = getMessageText(content);
    await navigator.clipboard.writeText(text);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50 bg-gray-900/30">
        <ConnectionStatus phase={loadingPhase} error={error} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            {sessionKey === 'main' ? 'General' : sessionKey}
          </span>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            title="Clear history"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-700 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Clear all history?</h3>
            <p className="text-gray-400 text-sm mb-6">
              This will permanently delete all your conversations. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                disabled={isClearing}
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                disabled={isClearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isClearing ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Empty state - show immediately, even while loading */}
        {messages.length === 0 && (
          <EmptyState onSuggestionClick={handleSuggestionClick} />
        )}
        
        {/* Messages */}
        {messages.length > 0 && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'gap-3 items-start'} group animate-fadeIn`}
                style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
              >
                {/* Assistant avatar */}
                {message.role === 'assistant' && <AssistantAvatar />}
                
                <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {/* Message bubble */}
                  <div
                    className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                      message.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800/80 text-gray-100'
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
                  </div>
                  
                  {/* Timestamp and actions */}
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className={`text-xs ${
                      message.role === 'user' ? 'text-gray-500' : 'text-gray-600'
                    }`}>
                      {formatTime(message.createdAt)}
                    </span>
                    <MessageActions
                      onCopy={() => handleCopy(message.id, message.content as Array<{ type: string; text?: string }>)}
                      showRetry={message.role === 'assistant' && index === messages.length - 1}
                      copied={copiedId === message.id}
                    />
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
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-gray-800/50 bg-gray-900/50">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className={`flex items-end gap-3 bg-gray-800/80 rounded-2xl p-3 border-2 transition-colors ${
            input.trim() ? 'border-purple-500/50' : 'border-transparent'
          }`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none px-1 py-2 text-base min-h-[44px] max-h-[200px] leading-relaxed"
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
            />
            {isRunning ? (
              <button
                type="button"
                onClick={cancel}
                className="p-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors flex-shrink-0"
                title="Stop (Esc)"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className={`p-3 rounded-xl transition-all flex-shrink-0 ${
                  input.trim()
                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                    : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                }`}
                title="Send (Enter)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            {isRunning ? 'Press Esc to stop' : 'Enter to send, Shift+Enter for new line'}
          </p>
        </form>
      </div>
    </div>
  );
}
