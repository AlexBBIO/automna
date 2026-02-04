'use client';

import { useState, useRef, useEffect } from 'react';

interface Conversation {
  key: string;
  name: string;
  icon: string;
  lastActive?: number;
  starred?: boolean;
}

interface ConversationSidebarProps {
  currentConversation: string;
  onConversationChange: (key: string) => void;
  conversations: Conversation[];
  onCreateConversation: (name: string) => void;
  onDeleteConversation?: (key: string) => void;
  onRenameConversation?: (key: string, newName: string) => void;
  onToggleStar?: (key: string) => void;
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
  onDeleteConversation,
  onRenameConversation,
  onToggleStar,
  isCollapsed,
  onToggleCollapse,
  isLoading = false,
  onRefresh,
}: ConversationSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newConversationName, setNewConversationName] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenKey(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingKey && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingKey]);

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

  const handleStartEdit = (conv: Conversation) => {
    setEditingKey(conv.key);
    setEditingName(conv.name);
    setMenuOpenKey(null);
  };

  const handleSaveEdit = () => {
    if (editingKey && editingName.trim() && onRenameConversation) {
      onRenameConversation(editingKey, editingName.trim());
    }
    setEditingKey(null);
    setEditingName('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingKey(null);
      setEditingName('');
    }
  };

  const handleDelete = (key: string) => {
    if (onDeleteConversation) {
      onDeleteConversation(key);
    }
    setDeleteConfirmKey(null);
    setMenuOpenKey(null);
  };

  const handleToggleStar = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleStar) {
      onToggleStar(key);
    }
  };

  // Sort conversations: starred first, then by lastActive
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return (b.lastActive || 0) - (a.lastActive || 0);
  });

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
          {sortedConversations.map((conv) => (
            <button
              key={conv.key}
              onClick={() => onConversationChange(conv.key)}
              className={`w-full p-3 flex items-center justify-center transition-colors relative ${
                currentConversation === conv.key
                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
              }`}
              title={conv.name}
            >
              <span className="text-lg">{conv.icon}</span>
              {conv.starred && (
                <span className="absolute top-1 right-1 text-yellow-500 text-[10px]">★</span>
              )}
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
        {sortedConversations.map((conv) => (
          <div key={conv.key} className="relative group">
            {editingKey === conv.key ? (
              // Editing mode
              <div className="px-3 py-2">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={handleSaveEdit}
                  className="w-full px-2 py-1 bg-white dark:bg-zinc-800 border border-purple-400 dark:border-purple-500 rounded text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            ) : deleteConfirmKey === conv.key ? (
              // Delete confirmation
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20">
                <p className="text-xs text-red-600 dark:text-red-400 mb-2">Delete "{conv.name}"?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(conv.key)}
                    className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeleteConfirmKey(null)}
                    className="flex-1 px-2 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 text-xs rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Normal view
              <button
                onClick={() => onConversationChange(conv.key)}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
                  currentConversation === conv.key
                    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span className="text-base flex-shrink-0">{conv.icon}</span>
                <span className="text-sm truncate flex-1">{conv.name}</span>
                
                {/* Star button - always visible for starred, hover for others */}
                {onToggleStar && (
                  <button
                    onClick={(e) => handleToggleStar(conv.key, e)}
                    className={`flex-shrink-0 transition-opacity ${
                      conv.starred 
                        ? 'text-yellow-500 opacity-100' 
                        : 'text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-yellow-500'
                    }`}
                    title={conv.starred ? 'Unstar' : 'Star'}
                  >
                    {conv.starred ? '★' : '☆'}
                  </button>
                )}
                
                {/* Menu button - visible on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenKey(menuOpenKey === conv.key ? null : conv.key);
                  }}
                  className="flex-shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-zinc-700 dark:hover:text-white transition-opacity p-0.5"
                  title="More options"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </button>
            )}
            
            {/* Context menu */}
            {menuOpenKey === conv.key && (
              <div 
                ref={menuRef}
                className="absolute right-2 top-full mt-1 z-50 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 min-w-[120px]"
              >
                {onRenameConversation && (
                  <button
                    onClick={() => handleStartEdit(conv)}
                    className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Rename
                  </button>
                )}
                {onToggleStar && (
                  <button
                    onClick={(e) => {
                      handleToggleStar(conv.key, e);
                      setMenuOpenKey(null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                  >
                    <span className="w-4 text-center">{conv.starred ? '★' : '☆'}</span>
                    {conv.starred ? 'Unstar' : 'Star'}
                  </button>
                )}
                {onDeleteConversation && (
                  <button
                    onClick={() => {
                      setDeleteConfirmKey(conv.key);
                      setMenuOpenKey(null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
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
