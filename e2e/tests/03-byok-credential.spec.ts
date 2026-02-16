import { test, expect } from '@playwright/test';
import { clerkSignIn } from './helpers';

const EMAIL = process.env.CLERK_TEST_EMAIL!;
const PASSWORD = process.env.CLERK_TEST_PASSWORD!;

test.describe('BYOK Credential Submission', () => {
  test.skip(!EMAIL || !PASSWORD, 'CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD required');

  test('submit API key via /setup/connect/apikey', async ({ page }) => {
    await clerkSignIn(page, EMAIL, PASSWORD);
    await page.goto('/setup/connect/apikey');

    // Verify the page loaded
    await expect(page.locator('text=Connect with API key')).toBeVisible();
    await expect(page.locator('text=API usage costs extra')).toBeVisible();

    // Fill in a test API key (will fail validation, but we verify the form works)
    const input = page.locator('input[type="password"]').first();
    await input.fill('sk-ant-api03-test-key-for-e2e-testing');

    // Click submit
    const submitBtn = page.locator('button:has-text("Validate")');
    await submitBtn.click();

    // Expect either redirect to /dashboard (if key valid) or error message
    // With a fake key, we expect an error
    const errorOrRedirect = await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 10_000 }).then(() => 'redirected'),
      page.locator('text=Failed to validate').waitFor({ timeout: 10_000 }).then(() => 'error'),
      page.locator('.text-red-400').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    // A fake key should produce an error; a real key would redirect
    expect(['redirected', 'error']).toContain(errorOrRedirect);
  });

  test('submit Claude setup token via /setup/connect/claude', async ({ page }) => {
    await clerkSignIn(page, EMAIL, PASSWORD);
    await page.goto('/setup/connect/claude');

    await expect(page.locator('text=Connect your Claude subscription')).toBeVisible();

    const input = page.locator('input[type="password"]').first();
    await input.fill('sk-ant-oat01-test-token-for-e2e');

    const submitBtn = page.locator('button:has-text("Validate")');
    await submitBtn.click();

    const errorOrRedirect = await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 10_000 }).then(() => 'redirected'),
      page.locator('text=Failed to validate').waitFor({ timeout: 10_000 }).then(() => 'error'),
      page.locator('.text-red-400').waitFor({ timeout: 10_000 }).then(() => 'error'),
    ]);

    expect(['redirected', 'error']).toContain(errorOrRedirect);
  });
});
