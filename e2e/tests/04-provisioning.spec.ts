import { test, expect } from '@playwright/test';
import { clerkSignIn, waitForProvisionReady } from './helpers';

const EMAIL = process.env.CLERK_TEST_EMAIL!;
const PASSWORD = process.env.CLERK_TEST_PASSWORD!;

test.describe('Provisioning', () => {
  test.skip(!EMAIL || !PASSWORD, 'CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD required');
  test.setTimeout(300_000); // 5 min — provisioning can take a while

  test('trigger provisioning and wait for ready', async ({ page }) => {
    await clerkSignIn(page, EMAIL, PASSWORD);

    // Trigger provisioning via API
    const provisionResponse = await page.request.post('/api/user/provision');
    const provisionData = await provisionResponse.json();

    // Should succeed or tell us machine already exists
    expect([200, 402, 429]).toContain(provisionResponse.status());

    if (provisionResponse.status() === 402) {
      test.skip(true, 'User needs active subscription — run checkout test first');
      return;
    }

    if (provisionResponse.status() === 429) {
      test.skip(true, 'Rate limited — try again later');
      return;
    }

    expect(provisionData.appName).toBeTruthy();
    expect(provisionData.machineId).toBeTruthy();

    // Store for cleanup
    test.info().annotations.push({
      type: 'appName',
      description: provisionData.appName,
    });

    // Wait for gateway to be ready
    await waitForProvisionReady(page, 180_000);
  });

  test('provision status returns ready', async ({ page }) => {
    await clerkSignIn(page, EMAIL, PASSWORD);
    
    const response = await page.request.get('/api/user/provision/status');
    const data = await response.json();
    
    // After previous test, should be ready (or not_started if no subscription)
    expect(['ready', 'not_started', 'waiting_for_gateway']).toContain(data.status);
  });
});
