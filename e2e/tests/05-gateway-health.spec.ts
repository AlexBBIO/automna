import { test, expect } from '@playwright/test';
import { clerkSignIn } from './helpers';

const EMAIL = process.env.CLERK_TEST_EMAIL!;
const PASSWORD = process.env.CLERK_TEST_PASSWORD!;

test.describe('Gateway Health', () => {
  test.skip(!EMAIL || !PASSWORD, 'CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD required');

  test('provisioned gateway responds', async ({ page }) => {
    await clerkSignIn(page, EMAIL, PASSWORD);

    // Get machine info
    const provisionResponse = await page.request.get('/api/user/provision');
    const data = await provisionResponse.json();

    if (!data.hasMachine && !data.appName) {
      test.skip(true, 'No machine provisioned — run provisioning test first');
      return;
    }

    const appName = data.appName;
    expect(appName).toBeTruthy();

    // Hit the gateway health endpoint directly
    const gatewayUrl = `https://${appName}.fly.dev`;
    const healthResponse = await page.request.get(gatewayUrl, {
      timeout: 30_000,
      ignoreHTTPSErrors: true,
    });

    // Gateway should respond (might be 401 without token, but should not be 502/503)
    expect(healthResponse.status()).toBeLessThan(500);
  });
});
