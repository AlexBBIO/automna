'use client';

/**
 * Test Chat Page
 */

import { AutomnaChat } from '@/components/AutomnaChat';
import { useEffect, useState } from 'react';

export default function ChatPage() {
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || 'test123');
    setMounted(true);
  }, []);

  if (!mounted || !token) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-950">
      <AutomnaChat
        gatewayUrl="wss://test.automna.ai"
        authToken={token}
        sessionKey="main"
      />
    </div>
  );
}
