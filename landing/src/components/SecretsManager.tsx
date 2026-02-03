'use client';

/**
 * SecretsManager Component
 * 
 * UI for managing encrypted user secrets (API keys, tokens, etc.)
 */

import { useState, useEffect } from 'react';

interface Secret {
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function SecretsManager() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // New secret form
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Edit mode
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchSecrets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/user/secrets');
      if (!res.ok) throw new Error('Failed to fetch secrets');
      const data = await res.json();
      setSecrets(data.secrets || []);
      setError(null);
    } catch (err) {
      setError('Failed to load secrets');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecrets();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newValue.trim()) return;

    try {
      setSaving(true);
      const res = await fetch('/api/user/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), value: newValue }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save secret');
      }
      
      setNewName('');
      setNewValue('');
      fetchSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (name: string) => {
    if (!editValue.trim()) return;

    try {
      setSaving(true);
      const res = await fetch('/api/user/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value: editValue }),
      });
      
      if (!res.ok) throw new Error('Failed to update secret');
      
      setEditingName(null);
      setEditValue('');
      fetchSecrets();
    } catch (err) {
      setError('Failed to update secret');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete secret "${name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/user/secrets/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to delete secret');
      
      fetchSecrets();
    } catch (err) {
      setError('Failed to delete secret');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-zinc-200 rounded w-full" />
        <div className="h-10 bg-zinc-200 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button 
            onClick={() => setError(null)} 
            className="float-right text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Existing secrets */}
      {secrets.length > 0 && (
        <div className="space-y-3">
          {secrets.map((secret) => (
            <div 
              key={secret.name}
              className="flex items-center justify-between p-4 bg-zinc-50 rounded-lg border border-zinc-200"
            >
              <div className="flex-1">
                <div className="font-mono text-sm font-medium text-zinc-900">
                  {secret.name}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Updated {formatDate(secret.updatedAt)}
                </div>
              </div>

              {editingName === secret.name ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="New value"
                    className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdate(secret.name)}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingName(null); setEditValue(''); }}
                    className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-zinc-400">••••••••••••</span>
                  <button
                    onClick={() => { setEditingName(secret.name); setEditValue(''); }}
                    className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(secret.name)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {secrets.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          <p>No secrets stored yet.</p>
          <p className="text-sm mt-1">Add API keys, tokens, or other sensitive values below.</p>
        </div>
      )}

      {/* Add new secret form */}
      <form onSubmit={handleAdd} className="space-y-4 pt-4 border-t border-zinc-200">
        <h3 className="text-sm font-medium text-zinc-700">Add New Secret</h3>
        
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_'))}
            placeholder="name (e.g. discord_token)"
            className="flex-1 px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
          />
          <input
            type="password"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            className="flex-1 px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={saving || !newName.trim() || !newValue.trim()}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Saving...' : 'Add'}
          </button>
        </div>
        
        <p className="text-xs text-zinc-500">
          Secrets are encrypted and stored securely. Your agent can access them to configure integrations.
        </p>
      </form>

      {/* Common secrets suggestions */}
      {secrets.length === 0 && (
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
          <h4 className="text-sm font-medium text-purple-900 mb-2">Common secrets to add:</h4>
          <ul className="text-sm text-purple-700 space-y-1">
            <li>• <code className="bg-purple-100 px-1 rounded">discord_token</code> - Connect your agent to Discord</li>
            <li>• <code className="bg-purple-100 px-1 rounded">telegram_token</code> - Connect your agent to Telegram</li>
            <li>• <code className="bg-purple-100 px-1 rounded">github_token</code> - Let your agent access GitHub</li>
          </ul>
        </div>
      )}
    </div>
  );
}
