import { test, expect } from '@playwright/test';
import { clerkSignIn, fillStripeCheckout } from './helpers';

const EMAIL = process.env.CLERK_TEST_EMAIL!;
const PASSWORD = process.env.CLERK_TEST_PASSWORD!;
const PRICE_ID = process.env.STRIPE_PRICE_ID!;

test.describe('Stripe Checkout Flow', () => {
  test.skip(!EMAIL || !PASSWORD, 'CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD required');

  test('sign in → select plan → checkout → redirect to /setup/connect', async ({ page }) => {
    // 1. Sign in
    await clerkSignIn(page, EMAIL, PASSWORD);

    // 2. Go to pricing and select a plan
    await page.goto('/pricing');
    await expect(page.locator('text=Starter')).toBeVisible();

    // Click the first "Get Started" CTA button (Starter plan)
    const ctaButton = page.locator('button:has-text("Get Started"), a:has-text("Get Started")').first();
    await ctaButton.click();

    // The app POSTs to /api/checkout which returns a Stripe URL, then redirects.
    // Wait for navigation to Stripe checkout.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

    // 3. Fill in Stripe test card
    await fillStripeCheckout(page);

    // 4. Verify redirect to /setup/connect
    await expect(page).toHaveURL(/\/setup\/connect/, { timeout: 30_000 });
  });
});
