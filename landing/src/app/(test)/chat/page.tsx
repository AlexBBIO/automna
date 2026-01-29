'use client';

/**
 * Simple Chat Test - Just embed the working Control UI
 */

export default function ChatPage() {
  // Just use an iframe to the working Control UI
  return (
    <div className="h-screen w-screen">
      <iframe 
        src="https://test.automna.ai/?token=test123"
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
