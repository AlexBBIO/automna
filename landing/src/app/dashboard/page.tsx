'use client';

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { AutomnaChat } from "@/components/AutomnaChat";
import { ChatSkeleton } from "@/components/ChatSkeleton";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { FileProvider } from "@/lib/file-context";
import { FileBrowser } from "@/components/FileBrowser";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AnnouncementModal } from "@/components/AnnouncementModal";
import { SettingsPanel } from "@/components/SettingsPanel";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";

type TabView = 'chat' | 'files' | 'settings' | 'integrations';

interface Conversation {
  key: string;
  name: string;
  icon: string;
  lastActive?: number;
  starred?: boolean;
}

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
  
  // Conversation state - fetched from OpenClaw
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState(() => {
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
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  
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
  useEffect(() => {
    let wasLarge = window.innerWidth >= 768;
    
    const handleResize = () => {
      const isLarge = window.innerWidth >= 768;
      if (wasLarge && !isLarge) {
        setSidebarHidden(true);
      }
      if (!wasLarge && isLarge) {
        setSidebarHidden(false);
        setSidebarCollapsed(false);
      }
      wasLarge = isLarge;
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load starred conversations from localStorage
  const getStarredConversations = useCallback((): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('automna-starred-conversations');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }, []);

  const saveStarredConversations = useCallback((starred: Set<string>) => {
    localStorage.setItem('automna-starred-conversations', JSON.stringify([...starred]));
  }, []);

  // Fetch conversations from OpenClaw when gateway is ready
  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch('/api/user/sessions');
      if (response.ok) {
        const data = await response.json();
        const sessions = data.sessions || [];
        const starred = getStarredConversations();
        const convos: Conversation[] = sessions.map((s: { key: string; name: string; lastActive?: number }) => ({
          key: s.key,
          name: s.name,
          icon: s.key === 'main' ? '💬' : '📝',
          lastActive: s.lastActive,
          starred: starred.has(s.key),
        }));
        setConversations(convos);
      }
    } catch (err) {
      console.error('[dashboard] Failed to fetch conversations:', err);
    } finally {
      setConversationsLoading(false);
    }
  }, [getStarredConversations]);

  // Fetch conversations when gateway becomes ready
  useEffect(() => {
    if (loadPhase === 'ready') {
      fetchConversations();
    }
  }, [loadPhase, fetchConversations]);

  // Save current conversation to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('automna-current-conversation', currentConversation);
  }, [currentConversation]);
  
  // Create a new conversation
  const handleCreateConversation = useCallback(async (name: string) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!key || conversations.some(c => c.key === key)) return;
    
    const newConversation: Conversation = {
      key,
      name,
      icon: '📝',
    };
    
    setConversations(prev => [...prev, newConversation]);
    setCurrentConversation(key);
    
    try {
      await fetch('/api/user/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, label: name }),
      });
    } catch (err) {
      console.error('[dashboard] Failed to set session label:', err);
    }
  }, [conversations]);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (key: string) => {
    // Don't allow deleting the main conversation
    if (key === 'main') return;
    
    // Optimistic update
    setConversations(prev => prev.filter(c => c.key !== key));
    
    // If we're deleting the current conversation, switch to main
    if (currentConversation === key) {
      setCurrentConversation('main');
    }
    
    // Remove from starred
    const starred = getStarredConversations();
    if (starred.has(key)) {
      starred.delete(key);
      saveStarredConversations(starred);
    }
    
    try {
      await fetch('/api/user/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
    } catch (err) {
      console.error('[dashboard] Failed to delete session:', err);
      // Refetch on error
      fetchConversations();
    }
  }, [currentConversation, fetchConversations, getStarredConversations, saveStarredConversations]);

  // Rename a conversation
  const handleRenameConversation = useCallback(async (key: string, newName: string) => {
    // Optimistic update
    setConversations(prev => prev.map(c => 
      c.key === key ? { ...c, name: newName } : c
    ));
    
    try {
      await fetch('/api/user/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, label: newName }),
      });
    } catch (err) {
      console.error('[dashboard] Failed to rename session:', err);
      // Refetch on error
      fetchConversations();
    }
  }, [fetchConversations]);

  // Toggle star on a conversation
  const handleToggleStar = useCallback((key: string) => {
    const starred = getStarredConversations();
    
    if (starred.has(key)) {
      starred.delete(key);
    } else {
      starred.add(key);
    }
    
    saveStarredConversations(starred);
    
    // Update state
    setConversations(prev => prev.map(c => 
      c.key === key ? { ...c, starred: starred.has(key) } : c
    ));
  }, [getStarredConversations, saveStarredConversations]);

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        // No subscription found - redirect to pricing
        if (data.error === 'No subscription found') {
          window.location.href = '/pricing?subscribe=true';
        } else {
          alert(`Billing error: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('Billing portal error:', error);
      alert('Failed to load billing portal. Please try again.');
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
        localStorage.removeItem('automna-current-conversation');
        localStorage.removeItem('automna-channels');
        
        setResetStatus('Restarting your agent...');
        await new Promise(r => setTimeout(r, 2000));
        
        setResetStatus('Done! Refreshing...');
        await new Promise(r => setTimeout(r, 500));
        
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
  };

  // Wait for gateway to be ready
  const waitForGatewayReady = async (): Promise<boolean> => {
    if (prewarmStarted.current) return true;
    prewarmStarted.current = true;
    
    const MAX_WAIT_MS = 90000; // Extended to 90s for fresh provisions
    const POLL_INTERVAL_MS = 1500;
    const CONSECUTIVE_SUCCESS_NEEDED = 2; // Require 2 successful checks in a row
    const POST_READY_BUFFER_MS = 3000; // Extra buffer after gateway reports ready
    
    console.log('[warmup] Waiting for gateway to be ready...');
    const startTime = Date.now();
    let consecutiveSuccesses = 0;
    
    while (Date.now() - startTime < MAX_WAIT_MS) {
      try {
        const response = await fetch('/api/user/health', {
          method: 'GET',
          signal: AbortSignal.timeout(6000),
        });
        
        const data = await response.json();
        
        if (data.ready) {
          consecutiveSuccesses++;
          console.log(`[warmup] Health check passed (${consecutiveSuccesses}/${CONSECUTIVE_SUCCESS_NEEDED})`);
          
          if (consecutiveSuccesses >= CONSECUTIVE_SUCCESS_NEEDED) {
            console.log(`[warmup] Gateway stable, waiting ${POST_READY_BUFFER_MS}ms buffer...`);
            await new Promise(r => setTimeout(r, POST_READY_BUFFER_MS));
            console.log('[warmup] Gateway is ready!');
            return true;
          }
        } else {
          consecutiveSuccesses = 0; // Reset on failure
          console.log(`[warmup] Gateway not ready yet: ${data.error || 'unknown'}`);
        }
      } catch (err) {
        consecutiveSuccesses = 0; // Reset on error
        console.log(`[warmup] Health check failed: ${err instanceof Error ? err.message : 'error'}`);
      }
      
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    
    console.warn('[warmup] Timeout after 90s - proceeding anyway');
    return false;
  };

  // Sync user and fetch gateway info on mount
  useEffect(() => {
    if (!isLoaded || !user) return;
    
    const initializeGateway = async () => {
      try {
        setLoadPhase('fetching-gateway');
        
        fetch('/api/user/sync', { method: 'POST' }).catch(() => {});
        
        let gatewayRes = await fetch('/api/user/gateway');
        let gatewayData = await gatewayRes.json();
        
        console.log('[dashboard] Gateway response:', {
          hasGatewayUrl: !!gatewayData.gatewayUrl,
          needsProvisioning: gatewayData.needsProvisioning,
          appName: gatewayData.appName,
          error: gatewayData.error,
        });
        
        if (gatewayData.needsProvisioning) {
          console.log('[dashboard] Provisioning new machine...');
          setLoadPhase('provisioning');
          
          const provisionRes = await fetch('/api/user/provision', { method: 'POST' });
          const provisionData = await provisionRes.json();
          
          console.log('[dashboard] Provision response:', provisionData);
          
          if (provisionData.error) {
            console.error('[dashboard] Provisioning failed:', provisionData.error);
            // Subscription required - redirect to pricing
            if (provisionData.error === 'subscription_required' || provisionRes.status === 402) {
              window.location.href = '/pricing?subscribe=true';
              return;
            }
            setLoadError(provisionData.error);
            setLoadPhase('error');
            return;
          }
          
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

  // Keep-alive pings
  useEffect(() => {
    if (!gatewayInfo?.gatewayUrl) return;
    
    const pingInterval = setInterval(() => {
      const wsUrl = new URL(gatewayInfo.gatewayUrl);
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

  // Error state
  if (loadPhase === 'error') {
    return (
      <div className="h-screen bg-white flex flex-col">
        <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm px-4 py-2 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="text-purple-600">Auto</span><span className="text-zinc-900">mna</span>
          </Link>
          <UserButton />
        </nav>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">Setup Failed</h2>
            <p className="text-zinc-500 mb-4">
              {loadError || 'Something went wrong while setting up your agent.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (!isLoaded || loadPhase === 'init' || loadPhase === 'syncing' || loadPhase === 'fetching-gateway' || loadPhase === 'provisioning' || loadPhase === 'warming') {
    const skeletonPhaseMap: Record<string, 'connecting' | 'provisioning' | 'warming' | 'loading-history'> = {
      'init': 'connecting',
      'syncing': 'connecting',
      'fetching-gateway': 'connecting',
      'provisioning': 'provisioning',
      'warming': 'warming',
    };
    
    const skeletonPhase = skeletonPhaseMap[loadPhase] || 'connecting';
    
    return (
      <div className="h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-colors">
        <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm px-4 py-2 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="text-purple-600">Auto</span><span className="text-zinc-900 dark:text-white">mna</span>
          </Link>
          <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse"></div>
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
      <div className="h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-colors">
        {/* Persistent nav header */}
        <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm px-4 py-2 flex justify-between items-center sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile: Hamburger button */}
            {sidebarHidden && (
              <button
                onClick={() => setSidebarHidden(false)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setSidebarHidden(false);
                }}
                className="p-3 -ml-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white active:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-100 rounded-lg transition-colors md:hidden touch-manipulation"
                title="Open sidebar"
              >
                <svg className="w-5 h-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <Link href="/" className="text-xl font-bold tracking-tight">
              <span className="text-purple-600 dark:text-purple-400">Auto</span><span className="text-zinc-900 dark:text-white">mna</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-zinc-200 shadow-2xl">
              {isResetting ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-900 mb-2">Resetting Account</h3>
                  <p className="text-purple-600 text-sm animate-pulse">{resetStatus || 'Please wait...'}</p>
                  <p className="text-zinc-400 text-xs mt-4">Don&apos;t close this window</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900">Reset Account?</h3>
                      <p className="text-sm text-zinc-500">This cannot be undone</p>
                    </div>
                  </div>
                  <p className="text-zinc-600 text-sm mb-6">
                    This will permanently delete all your conversations, custom settings, and agent data. 
                    Your account will be reset to a fresh state.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="px-4 py-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetAccount}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
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
              fixed inset-0 bg-black/40 z-30 md:hidden
              transition-opacity duration-200
              ${sidebarHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}
            `}
            onClick={() => setSidebarHidden(true)}
          />
          
          {/* Conversation sidebar */}
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
              conversations={conversations.length > 0 ? conversations : [{ key: 'main', name: 'General', icon: '💬' }]}
              onCreateConversation={handleCreateConversation}
              onDeleteConversation={handleDeleteConversation}
              onRenameConversation={handleRenameConversation}
              onToggleStar={handleToggleStar}
              isCollapsed={sidebarCollapsed}
              onToggleCollapse={() => {
                if (window.innerWidth < 768) {
                  setSidebarHidden(true);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
              isLoading={conversationsLoading}
              onRefresh={fetchConversations}
            />
          </div>
          
          {/* Main content area with tabs */}
          <FileProvider gatewayUrl={gatewayInfo.gatewayUrl}>
            <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 transition-colors">
              {/* Tab bar */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'chat'
                      ? 'text-zinc-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  💬 Chat
                </button>
                <button
                  onClick={() => setActiveTab('files')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'files'
                      ? 'text-zinc-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  📁 Files
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'settings'
                      ? 'text-zinc-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  ⚙️ Settings
                </button>
                <button
                  onClick={() => setActiveTab('integrations')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'integrations'
                      ? 'text-zinc-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  🔌 Integrations
                </button>
              </div>
              
              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'chat' && (
                  <div className="h-full animate-fadeIn" key={currentConversation}>
                    <AutomnaChat
                      gatewayUrl={gatewayInfo.gatewayUrl}
                      sessionKey={currentConversation}
                      initialMessage={pendingMessage}
                      onInitialMessageSent={() => setPendingMessage(null)}
                    />
                  </div>
                )}
                {activeTab === 'files' && (
                  <FileBrowser isVisible={activeTab === 'files'} />
                )}
                {activeTab === 'settings' && (
                  <SettingsPanel />
                )}
                {activeTab === 'integrations' && (
                  <IntegrationsPanel 
                    onSelectIntegration={(integrationName, prompt) => {
                      // Create a new conversation for this integration setup
                      const key = `setup-${integrationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                      const name = `${integrationName} Setup`;
                      
                      // Check if conversation already exists
                      if (!conversations.some(c => c.key === key)) {
                        const newConversation: Conversation = {
                          key,
                          name,
                          icon: '🔌',
                        };
                        setConversations(prev => [...prev, newConversation]);
                        
                        // Save to backend
                        fetch('/api/user/sessions', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ key, label: name }),
                        }).catch(err => console.error('[dashboard] Failed to set session label:', err));
                      }
                      
                      setCurrentConversation(key);
                      setPendingMessage(prompt);
                      setActiveTab('chat');
                    }}
                  />
                )}
              </div>
            </div>
          </FileProvider>
        </div>
        
        {/* Announcement Modal - shows on first login or for updates */}
        <AnnouncementModal />
      </div>
    );
  }

  // No gateway - show setup prompt
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-zinc-50 to-white text-zinc-900">
      <nav className="border-b border-zinc-200 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            <span className="text-purple-600">Auto</span>mna
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-zinc-500 text-sm">
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
          <h1 className="text-3xl font-bold mb-4 text-zinc-900">Set Up Your Agent</h1>
          <p className="text-zinc-500 mb-8">
            Your agent isn&apos;t configured yet. Complete the setup to start chatting.
          </p>
          <Link
            href="/dashboard/setup"
            className="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-lg font-semibold transition-colors"
          >
            Start Setup →
          </Link>
        </div>
      </main>
    </div>
  );
}
