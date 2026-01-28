import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Loops.so API integration
    // Set LOOPS_API_KEY in Vercel environment variables
    const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
    
    if (!LOOPS_API_KEY) {
      // Fallback: just log to console if no API key (for testing)
      console.log('Waitlist signup:', email);
      return NextResponse.json({ success: true, message: 'Logged (no Loops API key set)' });
    }

    const response = await fetch('https://app.loops.so/api/v1/contacts/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOOPS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        source: 'waitlist',
        subscribed: true,
        userGroup: 'waitlist',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Loops API error:', error);
      
      // If contact already exists, that's fine
      if (error.includes('already exists')) {
        return NextResponse.json({ success: true, message: 'Already on waitlist' });
      }
      
      return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Waitlist error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
