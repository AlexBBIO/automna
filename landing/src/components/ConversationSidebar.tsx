'use client';

import { useState } from 'react';

interface Conversation {
  key: string;
  name: string;
  icon: string;
}

interface ConversationSidebarProps {
  currentConversation: string;
  onConversationChange: (key: string) => void;
  conversations: Conversation[];
  onCreateConversation: (name: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function ConversationSidebar({ 
  currentConversation, 
  onConversationChange, 
  conversations,
  onCreateConversation,
  isCollapsed,
  onToggleCollapse,
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
      <div className="w-14 h-full bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Expand button */}
        <button
          onClick={onToggleCollapse}
          className="p-3 border-b border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
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
                  ? 'bg-purple-900/50 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              title={conv.name}
            >
              <span className="text-lg">{conv.icon}</span>
            </button>
          ))}
        </div>

        {/* New conversation button */}
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={() => {
              onToggleCollapse();
              setTimeout(() => setIsCreating(true), 100);
            }}
            className="w-full p-2 flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-lg transition-colors"
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
    <div className="w-56 h-full bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Header with collapse button */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="font-semibold text-gray-200 text-sm">Conversations</h2>
        <button
          onClick={onToggleCollapse}
          className="text-gray-400 hover:text-white transition-colors"
          title="Collapse sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.map((conv) => (
          <button
            key={conv.key}
            onClick={() => onConversationChange(conv.key)}
            className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
              currentConversation === conv.key
                ? 'bg-purple-900/50 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            <span className="text-base">{conv.icon}</span>
            <span className="text-sm truncate">{conv.name}</span>
          </button>
        ))}
      </div>

      {/* Create new conversation */}
      <div className="p-2 border-t border-gray-800">
        {isCreating ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newConversationName}
              onChange={(e) => setNewConversationName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Conversation name..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newConversationName.trim()}
                className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewConversationName('');
                }}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-lg transition-colors"
          >
            <span className="text-lg">+</span>
            <span className="text-sm">New Conversation</span>
          </button>
        )}
      </div>
    </div>
  );
}
