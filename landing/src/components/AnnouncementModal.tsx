'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Announcement {
  id: string;
  type: 'new_user' | 'all_users';
  title: string;
  content: string;
  version: number;
}

interface AnnouncementModalProps {
  onAllDismissed?: () => void;
}

export function AnnouncementModal({ onAllDismissed }: AnnouncementModalProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    async function fetchAnnouncements() {
      try {
        const res = await fetch('/api/user/announcements');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setAnnouncements(data.announcements || []);
      } catch (err) {
        console.error('Failed to fetch announcements:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnnouncements();
  }, []);

  const currentAnnouncement = announcements[currentIndex];

  const handleDismiss = async () => {
    if (!currentAnnouncement || dismissing) return;

    setDismissing(true);
    try {
      await fetch(`/api/user/announcements/${currentAnnouncement.id}/dismiss`, {
        method: 'POST',
      });

      if (currentIndex < announcements.length - 1) {
        // Move to next announcement
        setCurrentIndex(currentIndex + 1);
      } else {
        // All done
        setAnnouncements([]);
        onAllDismissed?.();
      }
    } catch (err) {
      console.error('Failed to dismiss:', err);
    } finally {
      setDismissing(false);
    }
  };

  // Don't render if loading or no announcements
  if (loading || announcements.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            {currentAnnouncement.type === 'new_user' ? (
              <span className="text-2xl">👋</span>
            ) : (
              <span className="text-2xl">📢</span>
            )}
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              {currentAnnouncement.title}
            </h2>
          </div>
          {announcements.length > 1 && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {currentIndex + 1} / {announcements.length}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[50vh]">
          <div 
            className="prose prose-zinc dark:prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatContent(currentAnnouncement.content) }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {dismissing ? (
              'Please wait...'
            ) : currentIndex < announcements.length - 1 ? (
              'Next →'
            ) : (
              "Got it, let's go!"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Simple markdown-to-HTML converter for common patterns
function formatContent(content: string): string {
  return content
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc space-y-1 my-2">$&</ul>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="mb-3">')
    // Wrap in paragraph
    .replace(/^/, '<p class="mb-3">')
    .replace(/$/, '</p>')
    // Clean up empty paragraphs
    .replace(/<p class="mb-3"><\/p>/g, '');
}
