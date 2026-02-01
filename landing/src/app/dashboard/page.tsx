'use client';

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { AutomnaChat } from "@/components/AutomnaChat";
import { ChatSkeleton } from "@/components/ChatSkeleton";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { FileProvider } from "@/lib/file-context";
import { FileBrowser } from "@/components/FileBrowser";

type TabView = 'chat' | 'files';

interface Conversation {
  key: string;
  name: string;
  icon: string;
}

const DEFAULT_CONVERSATIONS: Conversation[] = [
  { key: 'main', name: 'General', icon: '💬' },
];

const CreditCardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="5" rx="2"/>
    <line x1="2" x2="22" y1="10" y2="10"/>
  </svg>
);

const ResetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
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
  
  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>(DEFAULT_CONVERSATIONS);
  const [currentConversation, setCurrentConversation] = useState('main');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarHidden, setSidebarHidden] = useState(true);
  
  // Reset account state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabView>('chat');
  
  // Set initial sidebar state based on screen size (runs once on mount)
  useEffect(() => {
    const isLargeScreen = window.innerWidth >= 768;
    if (isLargeScreen) {
      setSidebarHidden(false);
      setSidebarCollapsed(false);
    } else {
      setSidebarHidden(true);
    }
  }, []);
  
  // Handle resize: auto-hide sidebar when shrinking from large to small
  // (but don't prevent user from opening it on mobile)
  useEffect(() => {
    let wasLarge = window.innerWidth >= 768;
    
    const handleResize = () => {
      const isLarge = window.innerWidth >= 768;
      // Only auto-hide when transitioning FROM large TO small
      if (wasLarge && !isLarge) {
        setSidebarHidden(true);
      }
      // Auto-show when transitioning FROM small TO large
      if (!wasLarge && isLarge) {
        setSidebarHidden(false);
        setSidebarCollapsed(false);
      }
      wasLarge = isLarge;
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load conversations from localStorage on mount
  // Also migrate old 'automna-channels' key if present
  useEffect(() => {
    // Try new key first
    let saved = localStorage.getItem('automna-conversations');
    
    // Migrate from old key if new key doesn't exist
    if (!saved) {
      const oldSaved = localStorage.getItem('automna-channels');
      if (oldSaved) {
        saved = oldSaved;
        localStorage.setItem('automna-conversations', oldSaved);
        localStorage.removeItem('automna-channels');
      }
    }
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, []);
  
  // Save conversations to localStorage when they change
  useEffect(() => {
    localStorage.setItem('automna-conversations', JSON.stringify(conversations));
  }, [conversations]);
  
  // Create a new conversation
  const handleCreateConversation = useCallback((name: string) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!key || conversations.some(c => c.key === key)) return;
    
    const newConversation: Conversation = {
      key,
      name,
      icon: '📝',
    };
    setConversations(prev => [...prev, newConversation]);
    setCurrentConversation(key);
  }, [conversations]);

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

  // Reset account - clears all data and starts fresh
  const handleResetAccount = async () => {
    if (!gatewayInfo?.gatewayUrl) return;
    
    setIsResetting(true);
    setResetStatus('Connecting to your agent...');
    
    try {
      const wsUrl = new URL(gatewayInfo.gatewayUrl);
      const baseUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      const resetUrl = new URL(`${baseUrl}/api/reset-workspace`);
      
      // Copy auth params
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      if (userId) resetUrl.searchParams.set('userId', userId);
      if (exp) resetUrl.searchParams.set('exp', exp);
      if (sig) resetUrl.searchParams.set('sig', sig);
      
      setResetStatus('Clearing your conversations...');
      
      const response = await fetch(resetUrl.toString(), { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setResetStatus('Cleaning up local data...');
        // Clear local storage
        localStorage.removeItem('automna-conversations');
        
        setResetStatus('Restarting your agent...');
        // Give the gateway a moment to restart
        await new Promise(r => setTimeout(r, 2000));
        
        setResetStatus('Done! Refreshing...');
        await new Promise(r => setTimeout(r, 500));
        
        // Reload to get fresh state
        window.location.reload();
      } else {
        console.error('Reset failed:', data);
        setResetStatus(null);
        alert('Failed to reset account. Please try again.');
      }
    } catch (error) {
      console.error('Reset error:', error);
      setResetStatus(null);
      setIsResetting(false);
      alert('Failed to reset account. Please try again.');
    }
    // Don't reset isResetting on success - page will reload
  };

  // Prewarm the sandbox - waits for container to be ready
  // Returns when container is warm or after timeout (60s)
  const prewarmSandbox = async (gatewayUrl: string): Promise<void> => {
    if (prewarmStarted.current) return;
    prewarmStarted.current = true;
    
    const PREWARM_TIMEOUT_MS = 60000; // 60 seconds max wait
    
    try {
      const wsUrl = new URL(gatewayUrl);
      const baseUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      const keepAliveUrl = new URL(`${baseUrl}/api/keepalive`);
      
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      if (userId) keepAliveUrl.searchParams.set('userId', userId);
      if (exp) keepAliveUrl.searchParams.set('exp', exp);
      if (sig) keepAliveUrl.searchParams.set('sig', sig);
      
      console.log('[prewarm] Starting sandbox warmup...');
      
      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PREWARM_TIMEOUT_MS);
      
      try {
        await fetch(keepAliveUrl.toString(), { signal: controller.signal });
        console.log('[prewarm] Sandbox warmed');
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn('[prewarm] Timeout after 60s - proceeding anyway');
      } else {
        console.warn('[prewarm] Failed (non-fatal):', err);
      }
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
      .then(async data => {
        if (data.gatewayUrl) {
          setGatewayInfo(data);
          setLoadPhase('warming');
          // Wait for prewarm to complete before showing ready
          // This ensures the container is warm before WebSocket connects
          await prewarmSandbox(data.gatewayUrl);
          setLoadPhase('ready');
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
    
    const pingInterval = setInterval(() => {
      const wsUrl = new URL(gatewayInfo.gatewayUrl);
      const baseUrl = `${wsUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${wsUrl.host}`;
      
      const keepAliveUrl = new URL(`${baseUrl}/api/keepalive`);
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      if (userId) keepAliveUrl.searchParams.set('userId', userId);
      if (exp) keepAliveUrl.searchParams.set('exp', exp);
      if (sig) keepAliveUrl.searchParams.set('sig', sig);
      
      fetch(keepAliveUrl.toString(), { method: 'GET' })
        .then(() => console.log('[keepalive] ping'))
        .catch(() => {});
    }, 4 * 60 * 1000);
    
    return () => clearInterval(pingInterval);
  }, [gatewayInfo]);

  // Show skeleton during initial loading phases (including warming)
  if (!isLoaded || loadPhase === 'init' || loadPhase === 'syncing' || loadPhase === 'fetching-gateway' || loadPhase === 'warming') {
    const phaseMessages: Record<string, string> = {
      'init': 'Initializing...',
      'syncing': 'Syncing account...',
      'fetching-gateway': 'Connecting to your agent...',
      'warming': 'Starting your agent (this may take a moment)...',
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
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setSidebarHidden(false);
                }}
                className="p-3 -ml-1 text-gray-400 hover:text-white active:text-white hover:bg-gray-800 active:bg-gray-800 rounded-lg transition-colors md:hidden touch-manipulation"
                title="Open sidebar"
              >
                <svg className="w-5 h-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                <UserButton.Action
                  label="Reset Account"
                  labelIcon={<ResetIcon />}
                  onClick={() => setShowResetConfirm(true)}
                />
              </UserButton.MenuItems>
            </UserButton>
          </div>
        </nav>
        
        {/* Reset confirmation modal */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl">
              {isResetting ? (
                // Progress view
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Resetting Account</h3>
                  <p className="text-purple-300 text-sm animate-pulse">{resetStatus || 'Please wait...'}</p>
                  <p className="text-gray-500 text-xs mt-4">Don&apos;t close this window</p>
                </div>
              ) : (
                // Confirmation view
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Reset Account?</h3>
                      <p className="text-sm text-gray-400">This cannot be undone</p>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm mb-6">
                    This will permanently delete all your conversations, custom settings, and agent data. 
                    Your account will be reset to a fresh state.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetAccount}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                    >
                      Reset Everything
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Mobile backdrop - click to close */}
          <div 
            className={`
              fixed inset-0 bg-black/60 z-30 md:hidden
              transition-opacity duration-200
              ${sidebarHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}
            `}
            onClick={() => setSidebarHidden(true)}
          />
          
          {/* Conversation sidebar - drawer on mobile, inline on desktop */}
          <div className={`
            fixed md:relative inset-y-0 left-0 z-40 md:z-0
            transition-transform duration-200 ease-out
            ${sidebarHidden ? '-translate-x-full pointer-events-none' : 'translate-x-0'}
            md:translate-x-0 md:pointer-events-auto
            ${sidebarHidden ? 'md:hidden' : ''}
            top-[49px] md:top-0 h-[calc(100%-49px)] md:h-full
          `}>
            <ConversationSidebar
              currentConversation={currentConversation}
              onConversationChange={(key) => {
                setCurrentConversation(key);
                if (window.innerWidth < 768) {
                  setSidebarHidden(true);
                }
              }}
              conversations={conversations}
              onCreateConversation={handleCreateConversation}
              isCollapsed={sidebarCollapsed}
              onToggleCollapse={() => {
                if (window.innerWidth < 768) {
                  setSidebarHidden(true);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
            />
          </div>
          
          {/* Main content area with tabs */}
          <FileProvider gatewayUrl={gatewayInfo.gatewayUrl}>
            <div className="flex-1 flex flex-col">
              {/* Tab bar */}
              <div className="flex border-b border-gray-800 bg-gray-900/30">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'chat'
                      ? 'text-white border-b-2 border-purple-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  💬 Chat
                </button>
                <button
                  onClick={() => setActiveTab('files')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'files'
                      ? 'text-white border-b-2 border-purple-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  📁 Files
                </button>
              </div>
              
              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'chat' && (
                  <AutomnaChat
                    key={currentConversation}
                    gatewayUrl={gatewayInfo.gatewayUrl}
                    sessionKey={currentConversation}
                  />
                )}
                {activeTab === 'files' && (
                  <FileBrowser isVisible={activeTab === 'files'} />
                )}
              </div>
            </div>
          </FileProvider>
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
