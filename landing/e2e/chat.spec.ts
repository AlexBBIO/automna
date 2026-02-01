import { test, expect } from '@playwright/test'

// These tests require authentication
// Skip in CI unless we have test credentials set up
test.describe('Chat (requires auth)', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Skipping - no test credentials')

  test.beforeEach(async ({ page }) => {
    // Sign in before each test
    await page.goto('/sign-in')
    
    // Fill in test credentials
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!)
    await page.click('button:has-text("Continue")')
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!)
    await page.click('button:has-text("Continue")')
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })
  })

  test('dashboard loads with chat interface', async ({ page }) => {
    // Chat container should be visible
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 15000 })
  })

  test('chat input is enabled after connection', async ({ page }) => {
    // Wait for WebSocket connection and history load
    const chatInput = page.locator('textarea, input[type="text"]').first()
    await expect(chatInput).toBeEnabled({ timeout: 30000 })
  })

  test('can send a message', async ({ page }) => {
    // Wait for chat to be ready
    const chatInput = page.locator('textarea, input[type="text"]').first()
    await expect(chatInput).toBeEnabled({ timeout: 30000 })
    
    // Type and send a message
    const testMessage = `Test message ${Date.now()}`
    await chatInput.fill(testMessage)
    await chatInput.press('Enter')
    
    // User message should appear
    await expect(page.locator(`text="${testMessage}"`)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Chat Performance', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Skipping - no test credentials')

  test('cold start completes within 15 seconds', async ({ page }) => {
    // Sign in
    await page.goto('/sign-in')
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!)
    await page.click('button:has-text("Continue")')
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!)
    await page.click('button:has-text("Continue")')
    
    // Measure time to chat ready
    const start = Date.now()
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })
    
    const chatInput = page.locator('textarea, input[type="text"]').first()
    await expect(chatInput).toBeEnabled({ timeout: 15000 })
    
    const elapsed = Date.now() - start
    console.log(`Cold start time: ${elapsed}ms`)
    
    // Should complete within 15 seconds
    expect(elapsed).toBeLessThan(15000)
  })
})
