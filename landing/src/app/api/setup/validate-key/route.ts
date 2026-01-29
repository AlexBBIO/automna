import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { apiKey } = await request.json();

    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return NextResponse.json({ valid: false, error: 'Invalid API key format' });
    }

    // Test the API key with a minimal request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok) {
      return NextResponse.json({ valid: true });
    } else {
      const error = await response.json();
      return NextResponse.json({ 
        valid: false, 
        error: error.error?.message || 'API key validation failed' 
      });
    }
  } catch (error) {
    console.error('API key validation error:', error);
    return NextResponse.json({ valid: false, error: 'Validation failed' });
  }
}
