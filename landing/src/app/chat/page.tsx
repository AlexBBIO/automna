'use client';

/**
 * Test Chat Page
 * 
 * For testing the chat UI against test.automna.ai
 * Access: /chat?token=test123
 */

import { AutomnaChat } from '@/components/AutomnaChat';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';

function ChatContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || 'test123';
  const [isReady, setIsReady] = useState(false);
  
  // Wait a moment to ensure we're stable and on client
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // For prototype, connect directly to test.automna.ai
  const gatewayUrl = 'wss://test.automna.ai';

  if (!isReady) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center text-white">
        Initializing...
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-950">
      <AutomnaChat
        gatewayUrl={gatewayUrl}
        authToken={token}
        sessionKey="main"
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-gray-950 flex items-center justify-center text-white">
        Loading...
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
