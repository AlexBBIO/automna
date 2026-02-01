'use client';

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { AutomnaChat } from "@/components/AutomnaChat";
import { ChatSkeleton } from "@/components/ChatSkeleton";
import { ChannelSidebar } from "@/components/ChannelSidebar";

interface Channel {
  key: string;
  name: string;
  icon: string;
}

const DEFAULT_CHANNELS: Channel[] = [
  { key: 'main', name: 'General', icon: '💬' },
];

const CreditCardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="5" rx="2"/>
    <line x1="2" x2="22" y1="10" y2="10"/>
  </svg>
);

interface GatewayInfo {
  gatewayUrl: string;
  sessionKey?: string;
}

type LoadPhase = 'init' | 'syncing' | 'fetching-gateway' | 'warming' | 'ready' | 'error';

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null);
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('init');
  const [loadingPortal, setLoadingPortal] = useState(false);
  const prewarmStarted = useRef(false);
  
  // Channel state
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  const [currentChannel, setCurrentChannel] = useState('main');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Default collapsed, will check screen size
  const [sidebarHidden, setSidebarHidden] = useState(true); // Fully hidden on mobile
  
  // Set initial sidebar state based on screen size
  useEffect(() => {
    const isLargeScreen = window.innerWidth >= 768; // md breakpoint
    if (isLargeScreen) {
      setSidebarHidden(false);
      setSidebarCollapsed(false);
    } else {
      setSidebarHidden(true);
    }
    
    // Handle resize
    const handleResize = () => {
      const isLarge = window.innerWidth >= 768;
      if (!isLarge && !sidebarHidden) {
        // Screen became small, hide sidebar
        setSidebarHidden(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarHidden]);

  // Load channels from localStorage on mount
  useEffect(() => {
    const savedChannels = localStorage.getItem('automna-channels');
    if (savedChannels) {
      try {
        const parsed = JSON.parse(savedChannels);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChannels(parsed);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, []);
  
  // Save channels to localStorage when they change
  useEffect(() => {
    localStorage.setItem('automna-channels', JSON.stringify(channels));
  }, [channels]);
  
  // Create a new channel
  const handleCreateChannel = useCallback((name: string) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!key || channels.some(c => c.key === key)) return;
    
    const newChannel: Channel = {
      key,
      name,
      icon: '📝',
    };
    setChannels(prev => [...prev, newChannel]);
    setCurrentChannel(key);
  }, [channels]);

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Billing portal error:', error);
    }
    setLoadingPortal(false);
  };

  // Prewarm the sandbox (fire and forget)
  const prewarmSandbox = async (gatewayUrl: string) => {
    if (prewarmStarted.current) return;
    prewarmStarted.current = true;
    
    try {
      const wsUrl = new URL(gatewayUrl);
      const baseUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      const keepAliveUrl = new URL(`${baseUrl}/api/keepalive`);
      
      // Pass auth params
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      if (userId) keepAliveUrl.searchParams.set('userId', userId);
      if (exp) keepAliveUrl.searchParams.set('exp', exp);
      if (sig) keepAliveUrl.searchParams.set('sig', sig);
      
      console.log('[prewarm] Starting sandbox warmup...');
      await fetch(keepAliveUrl.toString());
      console.log('[prewarm] Sandbox warmed');
    } catch (err) {
      console.warn('[prewarm] Failed (non-fatal):', err);
    }
  };

  // Sync user and fetch gateway info on mount
  useEffect(() => {
    if (!isLoaded || !user) return;
    
    setLoadPhase('syncing');
    
    fetch('/api/user/sync', { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        setLoadPhase('fetching-gateway');
        return fetch('/api/user/gateway');
      })
      .then(res => res.json())
      .then(data => {
        if (data.gatewayUrl) {
          setGatewayInfo(data);
          setLoadPhase('warming');
          // Start prewarming immediately (don't wait)
          prewarmSandbox(data.gatewayUrl);
          // Move to ready after a brief delay to show warming phase
          setTimeout(() => setLoadPhase('ready'), 500);
        } else {
          setLoadPhase('error');
        }
      })
      .catch(err => {
        console.error('User sync/gateway fetch error:', err);
        setLoadPhase('error');
      });
  }, [isLoaded, user]);

  // Keep-alive pings to prevent sandbox hibernation
  useEffect(() => {
    if (!gatewayInfo?.gatewayUrl) return;
    
    // Ping every 4 minutes while user is on dashboard
    const pingInterval = setInterval(() => {
      // Extract base URL for keep-alive
      const wsUrl = new URL(gatewayInfo.gatewayUrl);
      const baseUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      
      // Build keep-alive URL with auth params
      const keepAliveUrl = new URL(`${baseUrl}/api/keepalive`);
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      if (userId) keepAliveUrl.searchParams.set('userId', userId);
      if (exp) keepAliveUrl.searchParams.set('exp', exp);
      if (sig) keepAliveUrl.searchParams.set('sig', sig);
      
      fetch(keepAliveUrl.toString(), { method: 'GET' })
        .then(() => console.log('[keepalive] ping'))
        .catch(() => {}); // Ignore errors
    }, 4 * 60 * 1000); // 4 minutes
    
    return () => clearInterval(pingInterval);
  }, [gatewayInfo]);

  // Show skeleton during initial loading phases
  if (!isLoaded || loadPhase === 'init' || loadPhase === 'syncing' || loadPhase === 'fetching-gateway') {
    const phaseMessages: Record<string, string> = {
      'init': 'Initializing...',
      'syncing': 'Syncing account...',
      'fetching-gateway': 'Connecting to your agent...',
    };
    
    return (
      <div className="h-screen bg-gray-950 flex flex-col">
        <nav className="border-b border-gray-800 bg-black/80 backdrop-blur-sm px-4 py-2 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
          </Link>
          <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse"></div>
        </nav>
        <div className="flex-1">
          <ChatSkeleton phase="connecting" message={phaseMessages[loadPhase] || 'Loading...'} />
        </div>
      </div>
    );
  }

  // Gateway configured - show chat as main interface
  if (gatewayInfo) {
    return (
      <div className="h-screen bg-gray-950 flex flex-col">
        {/* Persistent nav header */}
        <nav className="border-b border-gray-800 bg-black/80 backdrop-blur-sm px-4 py-2 flex justify-between items-center sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile: Hamburger button */}
            {sidebarHidden && (
              <button
                onClick={() => setSidebarHidden(false)}
                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors md:hidden"
                title="Open sidebar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <Link href="/" className="text-xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Action
                  label="Manage Subscription"
                  labelIcon={<CreditCardIcon />}
                  onClick={handleManageBilling}
                />
              </UserButton.MenuItems>
            </UserButton>
          </div>
        </nav>
        <div className="flex-1 flex overflow-hidden">
          
          {/* Channel sidebar - hidden on mobile by default */}
          {!sidebarHidden && (
            <ChannelSidebar
              currentChannel={currentChannel}
              onChannelChange={(key) => {
                setCurrentChannel(key);
                // Auto-hide on mobile after selection
                if (window.innerWidth < 768) {
                  setSidebarHidden(true);
                }
              }}
              channels={channels}
              onCreateChannel={handleCreateChannel}
              isCollapsed={sidebarCollapsed}
              onToggleCollapse={() => {
                if (window.innerWidth < 768) {
                  // On mobile, toggle collapse hides sidebar
                  setSidebarHidden(true);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
            />
          )}
          
          {/* Chat area */}
          <div className="flex-1">
            <AutomnaChat
              key={currentChannel} // Re-mount when channel changes
              gatewayUrl={gatewayInfo.gatewayUrl}
              sessionKey={currentChannel}
            />
          </div>
        </div>
      </div>
    );
  }

  // No gateway - show setup prompt
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      <nav className="border-b border-gray-800 bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">
              {user?.emailAddresses[0]?.emailAddress}
            </span>
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Action
                  label="Manage Subscription"
                  labelIcon={<CreditCardIcon />}
                  onClick={handleManageBilling}
                />
              </UserButton.MenuItems>
            </UserButton>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-6xl mb-6">🤖</div>
          <h1 className="text-3xl font-bold mb-4">Set Up Your Agent</h1>
          <p className="text-gray-400 mb-8">
            Your agent isn&apos;t configured yet. Complete the setup to start chatting.
          </p>
          <Link
            href="/dashboard/setup"
            className="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg font-semibold transition-colors"
          >
            Start Setup →
          </Link>
        </div>
      </main>
    </div>
  );
}
