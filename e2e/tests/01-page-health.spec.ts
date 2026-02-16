import { test, expect } from '@playwright/test';

test.describe('Page Health', () => {
  test('landing page loads', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('text=Automna')).toBeVisible();
  });

  test('pricing page loads', async ({ page }) => {
    const response = await page.goto('/pricing');
    expect(response?.status()).toBe(200);
    await expect(page.locator('text=Starter')).toBeVisible();
    await expect(page.locator('text=Pro')).toBeVisible();
  });

  test('sign-in page loads', async ({ page }) => {
    const response = await page.goto('/sign-in');
    expect(response?.status()).toBe(200);
  });

  test('sign-up page loads', async ({ page }) => {
    const response = await page.goto('/sign-up');
    expect(response?.status()).toBe(200);
  });
});
