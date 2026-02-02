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
  appName?: string;
  machineId?: string;
  userId?: string;
}

type LoadPhase = 'init' | 'syncing' | 'fetching-gateway' | 'provisioning' | 'warming' | 'ready' | 'error';

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null);
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('init');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const prewarmStarted = useRef(false);
  
  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>(DEFAULT_CONVERSATIONS);
  const [currentConversation, setCurrentConversation] = useState(() => {
    // Restore last active conversation from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automna-current-conversation');
      return saved || 'main';
    }
    return 'main';
  });
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

  // Fetch conversations from gateway when ready
  // Gateway is the source of truth for what sessions exist
  useEffect(() => {
    if (loadPhase !== 'ready' || !gatewayInfo) return;
    
    const fetchSessions = async () => {
      try {
        const response = await fetch('/api/user/sessions');
        const data = await response.json();
        
        if (data.sessions && Array.isArray(data.sessions)) {
          const newConversations: Conversation[] = data.sessions.map((s: { key: string; name?: string }) => ({
            key: s.key,
            name: s.name || (s.key === 'main' ? 'General' : s.key),
            icon: s.key === 'main' ? '💬' : '📝',
          }));
          
          // Always have at least the General conversation
          if (newConversations.length === 0) {
            newConversations.push({ key: 'main', name: 'General', icon: '💬' });
          }
          
          setConversations(newConversations);
          
          // If current conversation doesn't exist anymore, switch to main
          if (!newConversations.some(c => c.key === currentConversation)) {
            setCurrentConversation('main');
          }
        }
      } catch (err) {
        console.warn('[dashboard] Failed to fetch sessions:', err);
        // Keep default conversations on error
      }
    };
    
    fetchSessions();
  }, [loadPhase, gatewayInfo, currentConversation]);
  
  // Save conversations to localStorage when they change (for local convos before first message)
  useEffect(() => {
    localStorage.setItem('automna-conversations', JSON.stringify(conversations));
  }, [conversations]);

  // Save current conversation to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('automna-current-conversation', currentConversation);
  }, [currentConversation]);
  
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
        // Clear any remaining local storage
        localStorage.removeItem('automna-conversations');
        localStorage.removeItem('automna-channels');
        
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

  // Wait for gateway to be ready - polls our health check endpoint
  // Returns true when ready, false on timeout
  const waitForGatewayReady = async (): Promise<boolean> => {
    if (prewarmStarted.current) return true;
    prewarmStarted.current = true;
    
    const MAX_WAIT_MS = 60000; // 60 seconds max wait
    const POLL_INTERVAL_MS = 1000; // Check every 1 second (was 2s)
    
    console.log('[warmup] Waiting for gateway to be ready...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < MAX_WAIT_MS) {
      try {
        const response = await fetch('/api/user/health', {
          method: 'GET',
          signal: AbortSignal.timeout(6000),
        });
        
        const data = await response.json();
        
        if (data.ready) {
          console.log('[warmup] Gateway is ready!');
          return true;
        }
        console.log(`[warmup] Gateway not ready yet: ${data.error || 'unknown'}`);
      } catch (err) {
        console.log(`[warmup] Health check failed: ${err instanceof Error ? err.message : 'error'}`);
      }
      
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    
    console.warn('[warmup] Timeout after 60s - proceeding anyway');
    return false;
  };

  // Sync user and fetch gateway info on mount
  // If user doesn't have a machine yet, provision one first
  useEffect(() => {
    if (!isLoaded || !user) return;
    
    const initializeGateway = async () => {
      try {
        setLoadPhase('fetching-gateway');
        
        // Sync user and fetch gateway info in parallel (faster startup)
        // Fire off sync in background, don't await
        fetch('/api/user/sync', { method: 'POST' }).catch(() => {});
        
        // Fetch gateway info
        let gatewayRes = await fetch('/api/user/gateway');
        let gatewayData = await gatewayRes.json();
        
        console.log('[dashboard] Gateway response:', {
          hasGatewayUrl: !!gatewayData.gatewayUrl,
          needsProvisioning: gatewayData.needsProvisioning,
          appName: gatewayData.appName,
          error: gatewayData.error,
        });
        
        // If user needs provisioning, do it now
        if (gatewayData.needsProvisioning) {
          console.log('[dashboard] Provisioning new machine...');
          setLoadPhase('provisioning');
          
          const provisionRes = await fetch('/api/user/provision', { method: 'POST' });
          const provisionData = await provisionRes.json();
          
          console.log('[dashboard] Provision response:', provisionData);
          
          if (provisionData.error) {
            console.error('[dashboard] Provisioning failed:', provisionData.error);
            setLoadError(provisionData.error);
            setLoadPhase('error');
            return;
          }
          
          // Retry getting gateway URL after provisioning
          setLoadPhase('fetching-gateway');
          gatewayRes = await fetch('/api/user/gateway');
          gatewayData = await gatewayRes.json();
          
          console.log('[dashboard] Gateway response after provisioning:', {
            hasGatewayUrl: !!gatewayData.gatewayUrl,
            appName: gatewayData.appName,
          });
        }
        
        if (gatewayData.gatewayUrl) {
          setGatewayInfo(gatewayData);
          
          // Wait for gateway to be ready before showing chat
          setLoadPhase('warming');
          const isReady = await waitForGatewayReady();
          
          if (!isReady) {
            console.warn('[dashboard] Gateway warmup timed out but proceeding anyway');
          }
          
          setLoadPhase('ready');
        } else {
          console.error('[dashboard] No gatewayUrl in response:', gatewayData);
          setLoadPhase('error');
        }
      } catch (err) {
        console.error('User sync/gateway fetch error:', err);
        setLoadPhase('error');
      }
    };
    
    initializeGateway();
  }, [isLoaded, user]);

  // Keep-alive pings to prevent sandbox hibernation
  useEffect(() => {
    if (!gatewayInfo?.gatewayUrl) return;
    
    const pingInterval = setInterval(() => {
      const wsUrl = new URL(gatewayInfo.gatewayUrl);
      // Use local proxy to avoid CORS
      const keepAliveUrl = new URL('/api/gateway/keepalive', window.location.origin);
      const userId = wsUrl.searchParams.get('userId');
      const exp = wsUrl.searchParams.get('exp');
      const sig = wsUrl.searchParams.get('sig');
      const token = wsUrl.searchParams.get('token');
      if (token) keepAliveUrl.searchParams.set('token', token);
      if (userId) keepAliveUrl.searchParams.set('userId', userId);
      if (exp) keepAliveUrl.searchParams.set('exp', exp);
      if (sig) keepAliveUrl.searchParams.set('sig', sig);
      
      fetch(keepAliveUrl.toString(), { method: 'GET' })
        .then(() => console.log('[keepalive] ping'))
        .catch(() => {});
    }, 4 * 60 * 1000);
    
    return () => clearInterval(pingInterval);
  }, [gatewayInfo]);

  // Show error state
  if (loadPhase === 'error') {
    return (
      <div className="h-screen bg-gray-950 flex flex-col">
        <nav className="border-b border-gray-800 bg-black/80 backdrop-blur-sm px-4 py-2 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
          </Link>
          <UserButton />
        </nav>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-white mb-2">Setup Failed</h2>
            <p className="text-gray-400 mb-4">
              {loadError || 'Something went wrong while setting up your agent.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show skeleton during all loading phases until ready
  if (!isLoaded || loadPhase === 'init' || loadPhase === 'syncing' || loadPhase === 'fetching-gateway' || loadPhase === 'provisioning' || loadPhase === 'warming') {
    // Map dashboard phases to ChatSkeleton phases
    const skeletonPhaseMap: Record<string, 'connecting' | 'provisioning' | 'warming' | 'loading-history'> = {
      'init': 'connecting',
      'syncing': 'connecting',
      'fetching-gateway': 'connecting',
      'provisioning': 'provisioning',
      'warming': 'warming',
    };
    
    const skeletonPhase = skeletonPhaseMap[loadPhase] || 'connecting';
    
    return (
      <div className="h-screen bg-gray-950 flex flex-col">
        <nav className="border-b border-gray-800 bg-black/80 backdrop-blur-sm px-4 py-2 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">Auto</span>mna
          </Link>
          <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse"></div>
        </nav>
        <div className="flex-1">
          <ChatSkeleton phase={skeletonPhase} />
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
