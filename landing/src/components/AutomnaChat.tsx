'use client';

/**
 * AutomnaChat
 * 
 * Chat interface component using assistant-ui with Clawdbot backend.
 */

import { useClawdbotRuntime } from '@/lib/clawdbot-runtime';
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

export function AutomnaChat({ gatewayUrl, authToken, sessionKey }: AutomnaChatProps) {
  const { messages, isRunning, isConnected, append, cancel } = useClawdbotRuntime({
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
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <span className="text-sm text-gray-400">
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
        <span className="text-xs text-gray-500">Automna</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && isConnected && (
          <div className="text-center text-gray-500 py-8">
            <p className="text-lg mb-2">👋 Hello!</p>
            <p className="text-sm">Send a message to start chatting with your agent.</p>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {message.content.map((part, i) => {
                if (part.type === 'text' && 'text' in part) {
                  return (
                    <div 
                      key={i} 
                      className="whitespace-pre-wrap break-words"
                      style={{ wordBreak: 'break-word' }}
                    >
                      {formatMessage(part.text as string)}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {isRunning && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-4 py-2">
              <div className="flex gap-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            disabled={!isConnected}
          />
          {isRunning ? (
            <button
              type="button"
              onClick={cancel}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !isConnected}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// Simple markdown-like formatting
function formatMessage(text: string): React.ReactNode {
  // For now, just return the text
  // TODO: Add proper markdown parsing with react-markdown
  return text;
}
