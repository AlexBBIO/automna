'use client';

import { useState } from 'react';

interface Channel {
  key: string;
  name: string;
  icon: string;
}

interface ChannelSidebarProps {
  currentChannel: string;
  onChannelChange: (key: string) => void;
  channels: Channel[];
  onCreateChannel: (name: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function ChannelSidebar({ 
  currentChannel, 
  onChannelChange, 
  channels,
  onCreateChannel,
  isCollapsed,
  onToggleCollapse,
}: ChannelSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  
  // Find current channel for collapsed view
  const currentChannelData = channels.find(c => c.key === currentChannel);

  const handleCreate = () => {
    if (!newChannelName.trim()) return;
    onCreateChannel(newChannelName.trim());
    setNewChannelName('');
    setIsCreating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewChannelName('');
    }
  };

  // Collapsed view - just show icons
  if (isCollapsed) {
    return (
      <div className="w-14 bg-gray-900 border-r border-gray-800 flex flex-col">
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

        {/* Channel icons */}
        <div className="flex-1 overflow-y-auto py-2">
          {channels.map((channel) => (
            <button
              key={channel.key}
              onClick={() => onChannelChange(channel.key)}
              className={`w-full p-3 flex items-center justify-center transition-colors ${
                currentChannel === channel.key
                  ? 'bg-purple-900/50 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              title={channel.name}
            >
              <span className="text-lg">{channel.icon}</span>
            </button>
          ))}
        </div>

        {/* New channel button */}
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={() => {
              onToggleCollapse();
              setTimeout(() => setIsCreating(true), 100);
            }}
            className="w-full p-2 flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-lg transition-colors"
            title="New Channel"
          >
            <span className="text-lg">+</span>
          </button>
        </div>
      </div>
    );
  }

  // Expanded view
  return (
    <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Header with collapse button */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="font-semibold text-gray-200 text-sm">Channels</h2>
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

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-2">
        {channels.map((channel) => (
          <button
            key={channel.key}
            onClick={() => onChannelChange(channel.key)}
            className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
              currentChannel === channel.key
                ? 'bg-purple-900/50 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            <span className="text-base">{channel.icon}</span>
            <span className="text-sm truncate">{channel.name}</span>
          </button>
        ))}
      </div>

      {/* Create new channel */}
      <div className="p-2 border-t border-gray-800">
        {isCreating ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Channel name..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newChannelName.trim()}
                className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewChannelName('');
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
            <span className="text-sm">New Channel</span>
          </button>
        )}
      </div>
    </div>
  );
}
