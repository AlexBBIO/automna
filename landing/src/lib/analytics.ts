/**
 * GA4 Analytics Helpers
 * 
 * Client-side: call trackEvent() from React components
 * Server-side: call trackServerEvent() from API routes (requires Measurement Protocol secret)
 */

const GA_MEASUREMENT_ID = 'G-QGH92V1XEJ';

// ─── Client-side (browser) ───────────────────────────────────────────────────

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Fire a GA4 event from the browser.
 * Safe to call even if gtag hasn't loaded yet (no-ops gracefully).
 */
export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// ─── Server-side (Measurement Protocol) ──────────────────────────────────────

const GA_API_SECRET = process.env.GA4_API_SECRET;

/**
 * Fire a GA4 event from the server via Measurement Protocol.
 * Requires GA4_API_SECRET env var. Non-blocking, non-fatal.
 * 
 * @param clientId - A unique identifier for the user (e.g. Clerk userId)
 * @param eventName - The event name
 * @param params - Event parameters
 */
export async function trackServerEvent(
  clientId: string,
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  if (!GA_API_SECRET) {
    console.warn(`[analytics] GA4_API_SECRET not set, skipping server event: ${eventName}`);
    return;
  }

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          events: [{ name: eventName, params: params || {} }],
        }),
      }
    );
  } catch (error) {
    // Never let analytics break the actual flow
    console.error(`[analytics] Failed to send server event ${eventName}:`, error);
  }
}
