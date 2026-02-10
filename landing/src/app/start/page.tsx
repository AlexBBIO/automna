'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { trackEvent } from '@/lib/analytics';

function StartRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Track the campaign landing
    const ref = searchParams.get('ref') || 'unknown';
    trackEvent('campaign_landing', {
      campaign: 'newsletter',
      ref,
      landing_page: '/start',
    });

    // Redirect to homepage - GA4 will know they came through /start
    router.replace('/');
  }, [router, searchParams]);

  return null;
}

export default function StartPage() {
  return (
    <Suspense>
      <StartRedirect />
    </Suspense>
  );
}
