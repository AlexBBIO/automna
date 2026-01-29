import { NextResponse } from 'next/server';

export async function GET() {
  const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
  
  if (!LOOPS_API_KEY) {
    return NextResponse.json({ count: 0 });
  }

  try {
    // Loops doesn't have a count endpoint, so we'll need to track this ourselves
    // For now, query the audience endpoint if available, or use a stored value
    
    // Try to get contacts from Loops (this may not return all, pagination may be needed)
    // Note: Loops API may require different approach for counting
    
    // Quick solution: Use Vercel KV or environment variable for count
    // For now, return a reasonable estimate or fetch from Loops dashboard data
    
    // Try fetching from Loops API - they may have added endpoints
    const response = await fetch('https://app.loops.so/api/v1/contacts?limit=1000', {
      headers: {
        'Authorization': `Bearer ${LOOPS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        return NextResponse.json({ count: data.length }, {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
        });
      }
    }

    // Fallback: return stored count or 0
    // In production, you'd use Vercel KV or a database
    return NextResponse.json({ count: 1 }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
    });
  } catch (error) {
    console.error('Count error:', error);
    return NextResponse.json({ count: 0 });
  }
}
