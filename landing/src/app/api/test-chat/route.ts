import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>API Chat Test</title>
  <style>
    body { background: #111; color: #fff; font-family: sans-serif; padding: 40px; }
  </style>
</head>
<body>
  <h1>API Route Chat Test</h1>
  <p id="status">Connecting...</p>
  <script>
    const ws = new WebSocket('wss://test.automna.ai');
    const status = document.getElementById('status');
    
    ws.onopen = () => status.textContent = 'WebSocket opened';
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === 'connect.challenge') {
        status.textContent = 'Got challenge, authenticating...';
        ws.send(JSON.stringify({
          type: 'req', id: 'c1', method: 'connect',
          params: {
            minProtocol: 3, maxProtocol: 3,
            client: { id: 'test', version: '1', platform: 'web', mode: 'webchat' },
            role: 'operator', scopes: ['operator.read', 'operator.write'],
            caps: [], commands: [], permissions: {}, locale: 'en-US',
            auth: { token: 'test123' }
          }
        }));
      }
      if (msg.payload?.type === 'hello-ok') {
        status.textContent = 'Connected! ✅';
      }
    };
    ws.onerror = () => status.textContent = 'Error';
    ws.onclose = () => status.textContent += ' (closed)';
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
