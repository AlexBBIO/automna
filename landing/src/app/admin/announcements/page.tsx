"use client";

import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, Eye, EyeOff, RefreshCw, Megaphone, UserPlus } from "lucide-react";

interface Announcement {
  id: string;
  type: 'new_user' | 'all_users';
  title: string;
  content: string;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit modal state
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formType, setFormType] = useState<'new_user' | 'all_users'>('new_user');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [bumpVersion, setBumpVersion] = useState(false);

  async function fetchAnnouncements() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/announcements');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAnnouncements(data.announcements || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  function openCreate() {
    setIsCreating(true);
    setEditingAnnouncement(null);
    setFormType('new_user');
    setFormTitle('');
    setFormContent('');
    setFormEnabled(true);
    setBumpVersion(false);
  }

  function openEdit(ann: Announcement) {
    setIsCreating(false);
    setEditingAnnouncement(ann);
    setFormType(ann.type);
    setFormTitle(ann.title);
    setFormContent(ann.content);
    setFormEnabled(ann.enabled);
    setBumpVersion(false);
  }

  function closeModal() {
    setEditingAnnouncement(null);
    setIsCreating(false);
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) {
      alert('Title and content are required');
      return;
    }

    setSaving(true);
    try {
      if (isCreating) {
        const res = await fetch('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: formType,
            title: formTitle,
            content: formContent,
            enabled: formEnabled,
          }),
        });
        if (!res.ok) throw new Error('Failed to create');
      } else if (editingAnnouncement) {
        const res = await fetch(`/api/admin/announcements/${editingAnnouncement.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            content: formContent,
            enabled: formEnabled,
            bumpVersion,
          }),
        });
        if (!res.ok) throw new Error('Failed to update');
      }
      
      closeModal();
      await fetchAnnouncements();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchAnnouncements();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleToggleEnabled(ann: Announcement) {
    try {
      const res = await fetch(`/api/admin/announcements/${ann.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !ann.enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchAnnouncements();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-6"></div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-zinc-800 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Announcements</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Announcement
        </button>
      </div>

      {/* Announcements List */}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No announcements yet</p>
            <p className="text-sm mt-1">Create one to show to users</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <div
              key={ann.id}
              className={`bg-zinc-900 border rounded-xl p-5 ${
                ann.enabled ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {ann.type === 'new_user' ? (
                      <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
                        <UserPlus className="w-3 h-3" />
                        New Users
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
                        <Megaphone className="w-3 h-3" />
                        All Users
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">v{ann.version}</span>
                    {!ann.enabled && (
                      <span className="text-xs text-zinc-500">(disabled)</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{ann.title}</h3>
                  <p className="text-sm text-zinc-400 line-clamp-2">{ann.content}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEnabled(ann)}
                    className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                    title={ann.enabled ? 'Disable' : 'Enable'}
                  >
                    {ann.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(ann)}
                    className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit/Create Modal */}
      {(editingAnnouncement || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative bg-zinc-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h2 className="text-xl font-semibold">
                {isCreating ? 'Create Announcement' : 'Edit Announcement'}
              </h2>
            </div>
            
            <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Type selector (only for create) */}
              {isCreating && (
                <div>
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFormType('new_user')}
                      className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                        formType === 'new_user'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      <UserPlus className="w-5 h-5 mx-auto mb-1" />
                      New Users Only
                    </button>
                    <button
                      onClick={() => setFormType('all_users')}
                      className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                        formType === 'all_users'
                          ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      <Megaphone className="w-5 h-5 mx-auto mb-1" />
                      All Users
                    </button>
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                  placeholder="Welcome to Automna!"
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium mb-2">Content (Markdown supported)</label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={8}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 font-mono text-sm"
                  placeholder="Your AI assistant is ready! Here's what you can do..."
                />
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="enabled" className="text-sm">Enabled (visible to users)</label>
              </div>

              {/* Bump version (only for edit) */}
              {!isCreating && (
                <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
                  <input
                    type="checkbox"
                    id="bumpVersion"
                    checked={bumpVersion}
                    onChange={(e) => setBumpVersion(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-purple-500 focus:ring-purple-500"
                  />
                  <div>
                    <label htmlFor="bumpVersion" className="text-sm font-medium">Re-show to users</label>
                    <p className="text-xs text-zinc-500">Bump version to show this again to users who already dismissed it</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : isCreating ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
