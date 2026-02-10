import { NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref') || 'newsletter';
  
  const url = new URL('/', request.url);
  url.searchParams.set('utm_source', ref);
  url.searchParams.set('utm_medium', 'paid');
  url.searchParams.set('utm_campaign', 'feb2026');

  return NextResponse.redirect(url, 302);
}
