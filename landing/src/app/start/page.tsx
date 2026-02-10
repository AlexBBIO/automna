'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function StartRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref') || 'unknown';

    // Fire GA4 event with a callback to ensure it sends before redirect
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'campaign_landing', {
        campaign: 'newsletter',
        ref,
        landing_page: '/start',
        event_callback: () => {
          router.replace('/');
        },
        event_timeout: 2000, // redirect after 2s max even if GA4 is slow
      });
    } else {
      // gtag not loaded (ad blocker etc), just redirect
      router.replace('/');
    }
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
