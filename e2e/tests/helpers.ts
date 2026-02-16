import { Page, expect } from '@playwright/test';

/**
 * Sign in via Clerk's hosted sign-in page.
 * Clerk renders inside an iframe or its own UI — we interact with the visible form.
 */
export async function clerkSignIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  
  // Clerk renders its own UI — wait for the email input
  const emailInput = page.locator('input[name="identifier"], input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(email);
  
  // Click continue/submit
  const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
  await continueBtn.click();
  
  // Wait for password field (Clerk shows it on next step)
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
  await passwordInput.fill(password);
  
  // Submit
  const signInBtn = page.locator('button:has-text("Continue"), button:has-text("Sign in"), button[type="submit"]').first();
  await signInBtn.click();
  
  // Wait for redirect away from sign-in
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15_000 });
}

/**
 * Fill Stripe checkout form with test card details.
 * Stripe checkout is on checkout.stripe.com — inputs are in iframes.
 */
export async function fillStripeCheckout(page: Page) {
  // Wait for Stripe checkout page to load
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  
  // Stripe embeds card fields in iframes. The exact structure varies.
  // For Stripe Checkout (hosted page), fields are direct inputs.
  
  // Email might be pre-filled from Stripe customer, but fill if empty
  const emailField = page.locator('input[name="email"], input#email').first();
  if (await emailField.isVisible().catch(() => false)) {
    const val = await emailField.inputValue().catch(() => '');
    if (!val) {
      await emailField.fill(process.env.CLERK_TEST_EMAIL || 'e2e-test@example.com');
    }
  }

  // Card number
  const cardNumber = page.locator('input[name="cardNumber"], input#cardNumber').first();
  await cardNumber.waitFor({ state: 'visible', timeout: 15_000 });
  await cardNumber.fill('4242424242424242');
  
  // Expiry
  const expiry = page.locator('input[name="cardExpiry"], input#cardExpiry').first();
  await expiry.fill('12/30');
  
  // CVC
  const cvc = page.locator('input[name="cardCvc"], input#cardCvc').first();
  await cvc.fill('123');
  
  // Cardholder name (if present)
  const nameField = page.locator('input[name="billingName"]').first();
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill('E2E Test User');
  }

  // Country/ZIP might be needed
  const zipField = page.locator('input[name="billingPostalCode"], input[name="postalCode"]').first();
  if (await zipField.isVisible().catch(() => false)) {
    await zipField.fill('94105');
  }

  // Submit payment
  const payBtn = page.locator('button[type="submit"], button:has-text("Subscribe"), button:has-text("Pay")').first();
  await payBtn.click();
  
  // Wait for redirect back to automna.ai
  await page.waitForURL(url => url.hostname.includes('automna.ai'), { timeout: 60_000 });
}

/**
 * Poll provisioning status until ready or timeout.
 */
export async function waitForProvisionReady(page: Page, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await page.request.get('/api/user/provision/status');
    const data = await response.json();
    
    if (data.status === 'ready') return;
    if (data.status === 'error') throw new Error(`Provisioning error: ${data.error}`);
    
    await page.waitForTimeout(5_000);
  }
  throw new Error(`Provisioning did not become ready within ${timeoutMs / 1000}s`);
}
