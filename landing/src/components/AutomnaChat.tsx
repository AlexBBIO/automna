'use client';

/**
 * AutomnaChat - Polished Chat Interface (Light Theme)
 */

import { useClawdbotRuntime } from '@/lib/clawdbot-runtime';
import { MessageContent } from './MessageContent';
import { 
  useEffect, 
  useRef, 
  useState,
  useMemo,
  type FormEvent,
  type KeyboardEvent 
} from 'react';

interface AutomnaChatProps {
  gatewayUrl: string;
  authToken?: string;
  sessionKey?: string;
  initialMessage?: string | null;
  onInitialMessageSent?: () => void;
}

// Assistant avatar component
function AssistantAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md">
      <span className="text-white text-sm font-bold">A</span>
    </div>
  );
}

// Loading skeleton with animation
function ChatSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-end">
        <div className="bg-purple-100 rounded-2xl h-12 w-52" />
      </div>
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-zinc-200" />
        <div className="bg-zinc-100 rounded-2xl h-20 w-72" />
      </div>
      <div className="flex justify-end">
        <div className="bg-purple-100 rounded-2xl h-12 w-36" />
      </div>
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-zinc-200" />
        <div className="bg-zinc-100 rounded-2xl h-28 w-80" />
      </div>
    </div>
  );
}

// Typing indicator with pulse animation
function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start animate-fadeIn">
      <AssistantAvatar />
      <div className="bg-zinc-100 rounded-2xl px-4 py-3 shadow-sm border border-zinc-200">
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
        <span className="text-sm text-red-600">{error || 'Connection error'}</span>
      </div>
    );
  }
  
  if (phase === 'connecting') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-sm text-amber-600">Connecting...</span>
      </div>
    );
  }
  
  if (phase === 'loading-history') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-sm text-blue-600">Loading...</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-emerald-500" />
      <span className="text-sm text-zinc-500">Online</span>
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
        className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
        title="Copy message"
      >
        {copied ? (
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
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
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mb-6 shadow-lg">
        <span className="text-3xl">✨</span>
      </div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-2">Hey there!</h2>
      <p className="text-zinc-500 mb-8 max-w-md">
        I'm your AI assistant. Ask me anything or try one of these:
      </p>
      <div className="grid grid-cols-2 gap-3 max-w-md w-full">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(s.prompt)}
            className="flex items-center gap-3 p-4 bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-purple-300 rounded-xl text-left transition-all group shadow-sm"
          >
            <span className="text-2xl">{s.icon}</span>
            <span className="text-sm text-zinc-600 group-hover:text-zinc-900 transition-colors">{s.text}</span>
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

// Tool call display (compact, dimmed)
function ToolCallDisplay({ name, input }: { name: string; input: Record<string, unknown> }) {
  const inputPreview = Object.keys(input).length > 0 
    ? JSON.stringify(input).slice(0, 80) + (JSON.stringify(input).length > 80 ? '...' : '')
    : '';
  
  return (
    <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg px-3 py-2 my-1.5 font-mono border border-zinc-200 dark:border-zinc-700/50">
      <span className="text-purple-600 dark:text-purple-400">🔧 {name}</span>
      {inputPreview && (
        <span className="text-zinc-400 dark:text-zinc-500 ml-2 break-all">{inputPreview}</span>
      )}
    </div>
  );
}

// Tool result display (compact, dimmed)
function ToolResultDisplay({ content }: { content: unknown }) {
  let preview = '';
  if (typeof content === 'string') {
    preview = content.slice(0, 150) + (content.length > 150 ? '...' : '');
  } else if (content) {
    const str = JSON.stringify(content);
    preview = str.slice(0, 150) + (str.length > 150 ? '...' : '');
  }
  
  return (
    <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg px-3 py-2 my-1.5 font-mono border border-zinc-200/50 dark:border-zinc-700/30">
      <span className="text-emerald-600 dark:text-emerald-400">← </span>
      <span className="break-all">{preview || '(empty)'}</span>
    </div>
  );
}

// Get message text for copying
function getMessageText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(p => p.type === 'text' && typeof p.text === 'string')
    .map(p => p.text)
    .join('\n');
}

// Check if a content part is tool-related
function isToolContentPart(part: { type: string }): boolean {
  const type = part.type?.toLowerCase();
  return type === 'tool_use' || type === 'tool_result' || type === 'toolcall';
}

// Check if a message role is tool-related
function isToolResultRole(role: string): boolean {
  const r = role?.toLowerCase();
  return r === 'toolresult' || r === 'tool_result';
}

export function AutomnaChat({ gatewayUrl, authToken, sessionKey, initialMessage, onInitialMessageSent }: AutomnaChatProps) {
  const { messages, isRunning, isConnected, loadingPhase, error, append, cancel } = useClawdbotRuntime({
    gatewayUrl,
    authToken,
    sessionKey,
  });

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);
  
  // Filter messages to hide tool-related content when showToolCalls is false
  const displayMessages = useMemo(() => {
    if (showToolCalls) return messages;
    
    return messages
      // Filter out toolResult role messages entirely
      .filter(msg => !isToolResultRole(msg.role))
      // Filter out tool content parts from remaining messages
      .map(msg => ({
        ...msg,
        content: msg.content.filter(part => !isToolContentPart(part))
      }))
      // Remove messages that have no content left after filtering
      .filter(msg => msg.content.length > 0);
  }, [messages, showToolCalls]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoWakeSentRef = useRef(false);
  const dragCounterRef = useRef(0);
  const initialMessageSentRef = useRef(false);

  // Handle initial message from integrations
  useEffect(() => {
    if (initialMessage && isConnected && !isRunning && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      append({
        role: 'user',
        content: [{ type: 'text', text: initialMessage }]
      });
      onInitialMessageSent?.();
    }
  }, [initialMessage, isConnected, isRunning, append, onInitialMessageSent]);

  // Reset initial message ref when initialMessage changes
  useEffect(() => {
    if (!initialMessage) {
      initialMessageSentRef.current = false;
    }
  }, [initialMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-wake on first connect with empty history (triggers BOOTSTRAP flow)
  useEffect(() => {
    if (
      loadingPhase === 'ready' &&
      messages.length === 0 &&
      !autoWakeSentRef.current &&
      !isRunning &&
      sessionKey === 'main' // Only auto-wake on main session
    ) {
      autoWakeSentRef.current = true;
      console.log('[chat] Auto-waking agent (empty history, fresh session)');
      // Send a friendly greeting to trigger the agent's BOOTSTRAP response
      append({
        role: 'user',
        content: [{ type: 'text', text: 'Hey!' }],
      });
    }
  }, [loadingPhase, messages.length, isRunning, sessionKey, append]);

  const uploadFileToWorkspace = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const targetPath = `/home/node/.openclaw/workspace/uploads/${timestamp}_${safeName}`;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', targetPath);
    
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    return targetPath;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && pendingFiles.length === 0) || isRunning || isUploading) return;
    
    let messageText = input.trim();
    
    // Upload any pending files
    if (pendingFiles.length > 0) {
      setIsUploading(true);
      try {
        const uploadedPaths: string[] = [];
        for (const file of pendingFiles) {
          const path = await uploadFileToWorkspace(file);
          uploadedPaths.push(path);
        }
        
        // Use MEDIA:/path syntax (OpenClaw native format) for inline rendering
        const fileRefs = uploadedPaths.map(path => `MEDIA:${path}`).join('\n');
        
        messageText = messageText 
          ? `${messageText}\n\n${fileRefs}`
          : fileRefs;
        
        setPendingFiles([]);
      } catch (err) {
        console.error('Upload failed:', err);
        alert('Failed to upload file(s)');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }
    
    if (!messageText) return;
    
    append({
      role: 'user',
      content: [{ type: 'text', text: messageText }],
    });
    setInput('');
    
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
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

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files]);
      inputRef.current?.focus();
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white transition-colors relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-purple-600/10 border-4 border-dashed border-purple-500 rounded-xl flex items-center justify-center pointer-events-none animate-fadeIn">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-8 shadow-xl border border-purple-200 dark:border-purple-700">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-medium text-zinc-800 dark:text-white">Drop files here</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Files will be attached to your message</p>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <ConnectionStatus phase={loadingPhase} error={error} />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowToolCalls(!showToolCalls)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              showToolCalls 
                ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30' 
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
            title={showToolCalls ? 'Hide tool calls' : 'Show tool calls'}
          >
            <span>{showToolCalls ? '🔧' : '💬'}</span>
            <span>{showToolCalls ? 'Tools' : 'Chat'}</span>
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
            {sessionKey === 'main' ? 'General' : sessionKey}
          </span>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-50/30 dark:bg-zinc-950/30">
        {/* Empty state */}
        {messages.length === 0 && (
          <EmptyState onSuggestionClick={handleSuggestionClick} />
        )}
        
        {/* Messages */}
        {displayMessages.length > 0 && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {displayMessages.map((message, index) => (
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
                        : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700'
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
                        // OpenClaw uses 'toolCall' type for tool calls
                        if (part.type === 'toolCall') {
                          const toolData = part as { type: string; name?: string; args?: Record<string, unknown>; result?: unknown };
                          const hasResult = toolData.result !== undefined && toolData.result !== null;
                          return (
                            <div key={i} className="my-2">
                              <ToolCallDisplay 
                                name={String(toolData.name || 'unknown')}
                                input={toolData.args || {}}
                              />
                              {hasResult && (
                                <ToolResultDisplay content={toolData.result} />
                              )}
                            </div>
                          );
                        }
                        // Legacy Anthropic format
                        if (part.type === 'tool_use') {
                          return (
                            <ToolCallDisplay 
                              key={i}
                              name={String(part.name || 'unknown')}
                              input={(part.input as Record<string, unknown>) || {}}
                            />
                          );
                        }
                        if (part.type === 'tool_result') {
                          return (
                            <ToolResultDisplay 
                              key={i}
                              content={part.content}
                            />
                          );
                        }
                        // Handle image content parts (base64 data from OpenClaw)
                        if (part.type === 'image' || part.type === 'toolCall' || part.type === 'tool_use') {
                          console.log('[AutomnaChat] Content part:', part.type, part.type === 'image' ? 'has data:' + !!(part as { data?: string }).data : '');
                        }
                        if (part.type === 'image') {
                          const imageData = part as { type: string; data?: string; media_type?: string; source?: { type: string; media_type?: string; data?: string } };
                          // Handle both direct data and Anthropic source format
                          const base64Data = imageData.data || imageData.source?.data;
                          const mediaType = imageData.media_type || imageData.source?.media_type || 'image/jpeg';
                          if (base64Data) {
                            return (
                              <div key={i} className="my-2">
                                <img 
                                  src={`data:${mediaType};base64,${base64Data}`}
                                  alt="Shared image"
                                  className="max-w-full rounded-lg shadow-md"
                                  style={{ maxHeight: '400px', objectFit: 'contain' }}
                                />
                              </div>
                            );
                          }
                        }
                        return null;
                      })}
                  </div>
                  
                  {/* Timestamp and actions */}
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className={`text-xs ${
                      message.role === 'user' ? 'text-zinc-400' : 'text-zinc-400'
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
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-colors">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          {/* Pending files preview */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 px-1">
              {pendingFiles.map((file, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700"
                >
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {file.type.startsWith('image/') ? '🖼️' : '📄'}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 max-w-[150px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    className="text-zinc-400 hover:text-red-500 ml-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className={`flex items-end gap-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-3 border-2 transition-colors ${
            input.trim() || pendingFiles.length > 0 ? 'border-purple-300 dark:border-purple-500/50' : 'border-transparent'
          }`}>
            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning || isUploading}
              className="p-3 text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50"
              title="Attach file"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              multiple
              accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx,.xls,.xlsx"
            />
            
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingFiles.length > 0 ? "Add a message (optional)..." : "Ask anything..."}
              rows={1}
              className="flex-1 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none resize-none px-1 py-2 text-base min-h-[44px] max-h-[200px] leading-relaxed"
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
                className="p-3 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 text-red-600 dark:text-red-400 rounded-xl transition-colors flex-shrink-0"
                title="Stop (Esc)"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={(!input.trim() && pendingFiles.length === 0) || isUploading}
                className={`p-3 rounded-xl transition-all flex-shrink-0 ${
                  (input.trim() || pendingFiles.length > 0) && !isUploading
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200 dark:shadow-purple-500/25'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                }`}
                title="Send (Enter)"
              >
                {isUploading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-2 text-center">
            {isUploading ? 'Uploading files...' : isRunning ? 'Press Esc to stop' : 'Enter to send, Shift+Enter for new line'}
          </p>
        </form>
      </div>
    </div>
  );
}
