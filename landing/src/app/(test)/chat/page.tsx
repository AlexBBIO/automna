'use client';

import { useEffect, useState } from 'react';

export default function ChatPage() {
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || 'test123';
    
    setStatus('connecting...');
    
    const ws = new WebSocket('wss://test.automna.ai');
    
    ws.onopen = () => {
      setStatus('connected, waiting for challenge...');
    };
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.event === 'connect.challenge') {
          setStatus('got challenge, sending auth...');
          ws.send(JSON.stringify({
            type: 'req',
            id: 'c1',
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: 'clawdbot-control-ui', version: 'vdev', platform: 'web', mode: 'webchat' },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              caps: [], commands: [], permissions: {},
              locale: 'en-US',
              auth: { token },
            }
          }));
        }
        
        if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
          setStatus('authenticated! ✅');
        }
      } catch (e) {
        setError(String(e));
      }
    };
    
    ws.onerror = () => setError('WebSocket error');
    ws.onclose = (e) => setStatus(`closed: ${e.code}`);
    
    return () => ws.close();
  }, []);
  
  return (
    <div style={{ padding: 40, background: '#111', color: '#fff', minHeight: '100vh' }}>
      <h1>Minimal WebSocket Test</h1>
      <p>Status: {status}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
    </div>
  );
}
// cache bust 1769666268
