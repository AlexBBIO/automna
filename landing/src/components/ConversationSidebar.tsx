'use client';

import { useState } from 'react';

interface Conversation {
  key: string;
  name: string;
  icon: string;
  lastActive?: number;
}

interface ConversationSidebarProps {
  currentConversation: string;
  onConversationChange: (key: string) => void;
  conversations: Conversation[];
  onCreateConversation: (name: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function ConversationSidebar({ 
  currentConversation, 
  onConversationChange, 
  conversations,
  onCreateConversation,
  isCollapsed,
  onToggleCollapse,
  isLoading = false,
  onRefresh,
}: ConversationSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newConversationName, setNewConversationName] = useState('');

  const handleCreate = () => {
    if (!newConversationName.trim()) return;
    onCreateConversation(newConversationName.trim());
    setNewConversationName('');
    setIsCreating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewConversationName('');
    }
  };

  // Collapsed view - just show icons
  if (isCollapsed) {
    return (
      <div className="w-14 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-colors">
        {/* Expand button */}
        <button
          onClick={onToggleCollapse}
          className="p-3 border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          title="Expand sidebar"
        >
          <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>

        {/* Conversation icons */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.map((conv) => (
            <button
              key={conv.key}
              onClick={() => onConversationChange(conv.key)}
              className={`w-full p-3 flex items-center justify-center transition-colors ${
                currentConversation === conv.key
                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
              }`}
              title={conv.name}
            >
              <span className="text-lg">{conv.icon}</span>
            </button>
          ))}
        </div>

        {/* New conversation button */}
        <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => {
              onToggleCollapse();
              setTimeout(() => setIsCreating(true), 100);
            }}
            className="w-full p-2 flex items-center justify-center text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-colors"
            title="New Conversation"
          >
            <span className="text-lg">+</span>
          </button>
        </div>
      </div>
    );
  }

  // Expanded view
  return (
    <div className="w-56 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-colors">
      {/* Header with collapse button */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-zinc-700 dark:text-zinc-200 text-sm">Conversations</h2>
          {isLoading && (
            <svg className="w-3 h-3 text-zinc-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors p-1"
              title="Refresh conversations"
              disabled={isLoading}
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors p-1"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.map((conv) => (
          <button
            key={conv.key}
            onClick={() => onConversationChange(conv.key)}
            className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
              currentConversation === conv.key
                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <span className="text-base">{conv.icon}</span>
            <span className="text-sm truncate">{conv.name}</span>
          </button>
        ))}
      </div>

      {/* Create new conversation */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
        {isCreating ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newConversationName}
              onChange={(e) => setNewConversationName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Conversation name..."
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500 focus:ring-1 focus:ring-purple-100 dark:focus:ring-purple-900"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newConversationName.trim()}
                className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed text-white disabled:text-zinc-400 dark:disabled:text-zinc-500 text-sm rounded-lg transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewConversationName('');
                }}
                className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-colors"
          >
            <span className="text-lg">+</span>
            <span className="text-sm">New Conversation</span>
          </button>
        )}
      </div>
    </div>
  );
}
