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
}

export function ChannelSidebar({ 
  currentChannel, 
  onChannelChange, 
  channels,
  onCreateChannel 
}: ChannelSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

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

  return (
    <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="font-semibold text-gray-200 text-sm">Channels</h2>
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
