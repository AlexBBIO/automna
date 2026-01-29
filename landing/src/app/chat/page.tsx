'use client';

/**
 * Test Chat Page
 * 
 * For testing the chat UI against test.automna.ai
 * Access: /chat?token=test123
 */

import { AutomnaChat } from '@/components/AutomnaChat';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ChatContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || 'test123';
  
  // For prototype, connect directly to test.automna.ai
  // In production, this would be proxied through /api/ws/
  const gatewayUrl = typeof window !== 'undefined' 
    ? `wss://test.automna.ai`
    : '';

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
