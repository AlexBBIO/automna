/**
 * Simple in-memory rate limiter using sliding window.
 * Not shared across Vercel serverless instances, but sufficient
 * to stop rapid-fire abuse from a single instance.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => now - t < 600_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);

/**
 * Check if a request should be rate limited.
 * @returns { limited: false } or { limited: true, retryAfterSeconds }
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { limited: false } | { limited: true; retryAfterSeconds: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return { limited: true, retryAfterSeconds };
  }

  entry.timestamps.push(now);
  return { limited: false };
}
