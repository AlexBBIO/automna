'use client';

import { useState } from 'react';

interface Integration {
  id: string;
  name: string;
  icon: string;
  category: 'messaging' | 'productivity' | 'calendar' | 'developer' | 'notes' | 'smart-home' | 'media' | 'other';
  setupPrompt: string;
  comingSoon?: boolean;
}

const integrations: Integration[] = [
  // === MESSAGING ===
  { 
    id: 'discord', 
    name: 'Discord', 
    icon: '/integrations/discord.svg', 
    category: 'messaging',
    setupPrompt: 'Help me connect Discord to my agent. I want to be able to chat with you from my Discord server or DMs.'
  },
  { 
    id: 'telegram', 
    name: 'Telegram', 
    icon: '/integrations/telegram.svg', 
    category: 'messaging',
    setupPrompt: 'Help me set up Telegram so I can chat with my agent from the Telegram app.'
  },
  { 
    id: 'slack', 
    name: 'Slack', 
    icon: '/integrations/slack.svg', 
    category: 'messaging',
    setupPrompt: 'Help me connect Slack to my agent so I can chat from my Slack workspace.'
  },
  { 
    id: 'whatsapp', 
    name: 'WhatsApp', 
    icon: '/integrations/whatsapp.svg', 
    category: 'messaging',
    setupPrompt: 'Help me connect WhatsApp to my agent so I can chat via WhatsApp.'
  },
  { 
    id: 'signal', 
    name: 'Signal', 
    icon: '/integrations/signal.svg', 
    category: 'messaging',
    setupPrompt: 'Help me connect Signal to my agent for secure messaging.'
  },
  { 
    id: 'imessage', 
    name: 'iMessage', 
    icon: '/integrations/imessage.svg', 
    category: 'messaging',
    setupPrompt: 'Help me connect iMessage to my agent. Note: This requires a Mac running as a server.',
    comingSoon: true
  },
  { 
    id: 'teams', 
    name: 'Microsoft Teams', 
    icon: '/integrations/teams.svg', 
    category: 'messaging',
    setupPrompt: 'Help me connect Microsoft Teams to my agent.',
    comingSoon: true
  },

  // === PRODUCTIVITY ===
  { 
    id: 'notion', 
    name: 'Notion', 
    icon: '/integrations/notion.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect Notion so my agent can read and write to my Notion workspace.'
  },
  { 
    id: 'trello', 
    name: 'Trello', 
    icon: '/integrations/trello.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect Trello so my agent can manage my boards and cards.'
  },
  { 
    id: 'linear', 
    name: 'Linear', 
    icon: '/integrations/linear.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect Linear so my agent can manage issues and projects.',
    comingSoon: true
  },
  { 
    id: 'asana', 
    name: 'Asana', 
    icon: '/integrations/asana.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect Asana so my agent can manage my tasks and projects.',
    comingSoon: true
  },
  { 
    id: 'todoist', 
    name: 'Todoist', 
    icon: '/integrations/todoist.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect Todoist so my agent can manage my tasks.',
    comingSoon: true
  },
  { 
    id: 'clickup', 
    name: 'ClickUp', 
    icon: '/integrations/clickup.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect ClickUp so my agent can manage my workspace.',
    comingSoon: true
  },
  { 
    id: 'jira', 
    name: 'Jira', 
    icon: '/integrations/jira.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect Jira so my agent can manage issues and sprints.',
    comingSoon: true
  },
  { 
    id: 'monday', 
    name: 'Monday.com', 
    icon: '/integrations/monday.svg', 
    category: 'productivity',
    setupPrompt: 'Help me connect Monday.com so my agent can manage my boards.',
    comingSoon: true
  },

  // === CALENDAR ===
  { 
    id: 'google-calendar', 
    name: 'Google Calendar', 
    icon: '/integrations/google-calendar.svg', 
    category: 'calendar',
    setupPrompt: 'Help me connect Google Calendar so my agent can see and manage my schedule.',
    comingSoon: true
  },
  { 
    id: 'outlook-calendar', 
    name: 'Outlook Calendar', 
    icon: '/integrations/outlook.svg', 
    category: 'calendar',
    setupPrompt: 'Help me connect Microsoft Outlook Calendar so my agent can manage my schedule.',
    comingSoon: true
  },
  { 
    id: 'calendly', 
    name: 'Calendly', 
    icon: '/integrations/calendly.svg', 
    category: 'calendar',
    setupPrompt: 'Help me connect Calendly so my agent can manage my scheduling.',
    comingSoon: true
  },

  // === DEVELOPER ===
  { 
    id: 'github', 
    name: 'GitHub', 
    icon: '/integrations/github.svg', 
    category: 'developer',
    setupPrompt: 'Help me connect GitHub so my agent can work with my repositories, issues, and pull requests.'
  },
  { 
    id: 'gitlab', 
    name: 'GitLab', 
    icon: '/integrations/gitlab.svg', 
    category: 'developer',
    setupPrompt: 'Help me connect GitLab so my agent can work with my repositories.',
    comingSoon: true
  },

  // === NOTES ===
  { 
    id: 'obsidian', 
    name: 'Obsidian', 
    icon: '/integrations/obsidian.svg', 
    category: 'notes',
    setupPrompt: 'Help me connect Obsidian so my agent can read and write to my vault.'
  },
  { 
    id: 'apple-notes', 
    name: 'Apple Notes', 
    icon: '/integrations/apple-notes.svg', 
    category: 'notes',
    setupPrompt: 'Help me connect Apple Notes so my agent can manage my notes. Note: Requires a Mac.',
    comingSoon: true
  },
  { 
    id: 'bear', 
    name: 'Bear', 
    icon: '/integrations/bear.svg', 
    category: 'notes',
    setupPrompt: 'Help me connect Bear Notes so my agent can manage my notes. Note: Requires a Mac.',
    comingSoon: true
  },
  { 
    id: 'evernote', 
    name: 'Evernote', 
    icon: '/integrations/evernote.svg', 
    category: 'notes',
    setupPrompt: 'Help me connect Evernote so my agent can manage my notes.',
    comingSoon: true
  },

  // === SMART HOME ===
  { 
    id: 'philips-hue', 
    name: 'Philips Hue', 
    icon: '/integrations/philips-hue.svg', 
    category: 'smart-home',
    setupPrompt: 'Help me connect Philips Hue so my agent can control my smart lights.',
    comingSoon: true
  },
  { 
    id: 'home-assistant', 
    name: 'Home Assistant', 
    icon: '/integrations/home-assistant.svg', 
    category: 'smart-home',
    setupPrompt: 'Help me connect Home Assistant so my agent can control my smart home.',
    comingSoon: true
  },

  // === MEDIA ===
  { 
    id: 'spotify', 
    name: 'Spotify', 
    icon: '/integrations/spotify.svg', 
    category: 'media',
    setupPrompt: 'Help me connect Spotify so my agent can control my music playback.'
  },

  // === OTHER ===
  { 
    id: 'email', 
    name: 'Email', 
    icon: '/integrations/email.svg', 
    category: 'other',
    setupPrompt: 'Help me set up email so my agent can send and receive emails on my behalf.'
  },
  { 
    id: '1password', 
    name: '1Password', 
    icon: '/integrations/1password.svg', 
    category: 'other',
    setupPrompt: 'Help me connect 1Password so my agent can securely access credentials when needed.',
    comingSoon: true
  },
];

const categoryLabels: Record<string, string> = {
  messaging: '💬 Messaging',
  productivity: '✅ Productivity',
  calendar: '📅 Calendar',
  developer: '👨‍💻 Developer',
  notes: '📝 Notes',
  'smart-home': '🏠 Smart Home',
  media: '🎵 Media',
  other: '🔧 Other',
};

const categoryOrder = ['messaging', 'productivity', 'calendar', 'developer', 'notes', 'smart-home', 'media', 'other'];

interface IntegrationsPanelProps {
  onSelectIntegration: (prompt: string) => void;
}

export function IntegrationsPanel({ onSelectIntegration }: IntegrationsPanelProps) {
  const [filter, setFilter] = useState<string>('all');
  const [showComingSoon, setShowComingSoon] = useState(true);

  const filteredIntegrations = integrations.filter(i => {
    if (!showComingSoon && i.comingSoon) return false;
    if (filter === 'all') return true;
    return i.category === filter;
  });

  const groupedIntegrations = categoryOrder.reduce((acc, category) => {
    const items = filteredIntegrations.filter(i => i.category === category);
    if (items.length > 0) {
      acc[category] = items;
    }
    return acc;
  }, {} as Record<string, Integration[]>);

  return (
    <div className="h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            Integrations
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Connect your agent to the tools you use every day. Click any integration to get help setting it up.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              filter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {categoryOrder.map(cat => {
            const hasItems = integrations.some(i => i.category === cat && (showComingSoon || !i.comingSoon));
            if (!hasItems) return null;
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  filter === cat
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {categoryLabels[cat]}
              </button>
            );
          })}
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showComingSoon}
              onChange={(e) => setShowComingSoon(e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-600 text-purple-600 focus:ring-purple-500"
            />
            Show coming soon
          </label>
        </div>

        {/* Integration Grid by Category */}
        {filter === 'all' ? (
          // Grouped view
          <div className="space-y-8">
            {Object.entries(groupedIntegrations).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
                  {categoryLabels[category]}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {items.map((integration) => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      onClick={() => onSelectIntegration(integration.setupPrompt)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat view for filtered
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onClick={() => onSelectIntegration(integration.setupPrompt)}
              />
            ))}
          </div>
        )}

        {filteredIntegrations.length === 0 && (
          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
            No integrations found.
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 p-4 bg-zinc-100 dark:bg-zinc-900 rounded-xl text-center">
          <p className="text-zinc-600 dark:text-zinc-400 text-sm">
            Don't see what you need? Ask your agent — it might be able to help you set up custom integrations!
          </p>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ 
  integration, 
  onClick 
}: { 
  integration: Integration; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={integration.comingSoon}
      className={`relative flex flex-col items-center p-5 bg-white dark:bg-zinc-800 
                 border border-zinc-200 dark:border-zinc-700 rounded-xl
                 transition-all group
                 ${integration.comingSoon 
                   ? 'opacity-60 cursor-not-allowed' 
                   : 'hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer'
                 }`}
    >
      {/* Coming Soon Badge */}
      {integration.comingSoon && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
          Soon
        </div>
      )}
      
      {/* Icon */}
      <div className="w-12 h-12 mb-3 flex items-center justify-center">
        <img 
          src={integration.icon} 
          alt={integration.name}
          className="w-10 h-10 object-contain"
          onError={(e) => {
            // Fallback to emoji placeholder
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
        <span className="hidden text-3xl">🔌</span>
      </div>
      
      {/* Name */}
      <span className="text-sm font-medium text-zinc-900 dark:text-white text-center">
        {integration.name}
      </span>
    </button>
  );
}
