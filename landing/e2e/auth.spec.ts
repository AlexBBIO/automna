import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('unauthenticated user redirected to sign-in', async ({ page }) => {
    await page.goto('/dashboard')
    
    // Should redirect to sign-in
    await expect(page).toHaveURL(/sign-in/)
  })

  test('sign-in page loads', async ({ page }) => {
    await page.goto('/sign-in')
    
    // Clerk sign-in form should be visible
    await expect(page.locator('text=Sign in')).toBeVisible({ timeout: 10000 })
  })

  test('sign-up page loads', async ({ page }) => {
    await page.goto('/sign-up')
    
    // Clerk sign-up form should be visible
    await expect(page.locator('text=Sign up')).toBeVisible({ timeout: 10000 })
  })

  test('landing page is accessible', async ({ page }) => {
    await page.goto('/')
    
    // Landing page should load
    await expect(page).toHaveTitle(/Automna/i)
  })
})
