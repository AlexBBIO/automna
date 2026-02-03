import { test, expect } from '@playwright/test';

/**
 * Conversation Management E2E Tests
 * 
 * Tests for creating, switching, and managing conversations in the dashboard.
 * Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars.
 */

test.describe('Conversations (requires auth)', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Skipping - no test credentials');

  test.beforeEach(async ({ page }) => {
    // Sign in before each test
    await page.goto('/sign-in');
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    
    // Wait for chat to be ready
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 30000 });
  });

  test('should show conversation sidebar', async ({ page }) => {
    // Sidebar should be visible
    await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible();
  });

  test('should have default "General" conversation', async ({ page }) => {
    // Should have at least one conversation
    await expect(page.locator('text=General')).toBeVisible();
  });

  test('can create new conversation', async ({ page }) => {
    // Find and click the new conversation button
    const newConvoButton = page.locator('button[aria-label="New conversation"]');
    await expect(newConvoButton).toBeVisible();
    await newConvoButton.click();

    // Should show input for conversation name
    const nameInput = page.locator('input[placeholder*="conversation"]');
    await nameInput.fill('Test Project');
    await nameInput.press('Enter');

    // New conversation should appear in sidebar
    await expect(page.locator('text=Test Project')).toBeVisible({ timeout: 5000 });
  });

  test('can switch between conversations', async ({ page }) => {
    // Create a second conversation first
    const newConvoButton = page.locator('button[aria-label="New conversation"]');
    await newConvoButton.click();
    
    const nameInput = page.locator('input[placeholder*="conversation"]');
    await nameInput.fill('Work Tasks');
    await nameInput.press('Enter');

    // Wait for it to appear
    await expect(page.locator('text=Work Tasks')).toBeVisible({ timeout: 5000 });

    // Switch back to General
    await page.locator('text=General').click();
    
    // Verify we're in General conversation (check URL or active state)
    await expect(page.locator('[data-active="true"]')).toContainText('General');
  });

  test('messages are isolated per conversation', async ({ page }) => {
    // Send message in General
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await expect(chatInput).toBeEnabled({ timeout: 30000 });
    
    const uniqueMessage = `Test message ${Date.now()}`;
    await chatInput.fill(uniqueMessage);
    await chatInput.press('Enter');

    // Wait for message to appear
    await expect(page.locator(`text="${uniqueMessage}"`)).toBeVisible({ timeout: 5000 });

    // Create and switch to new conversation
    const newConvoButton = page.locator('button[aria-label="New conversation"]');
    await newConvoButton.click();
    
    const nameInput = page.locator('input[placeholder*="conversation"]');
    await nameInput.fill(`Isolated ${Date.now()}`);
    await nameInput.press('Enter');

    // In the new conversation, the message should NOT be visible
    await expect(page.locator(`text="${uniqueMessage}"`)).not.toBeVisible();
  });

  test('conversation persists after page refresh', async ({ page }) => {
    // Create a conversation
    const convoName = `Persist Test ${Date.now()}`;
    
    const newConvoButton = page.locator('button[aria-label="New conversation"]');
    await newConvoButton.click();
    
    const nameInput = page.locator('input[placeholder*="conversation"]');
    await nameInput.fill(convoName);
    await nameInput.press('Enter');

    await expect(page.locator(`text="${convoName}"`)).toBeVisible({ timeout: 5000 });

    // Refresh the page
    await page.reload();

    // Wait for dashboard to load
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 30000 });

    // Conversation should still be there
    await expect(page.locator(`text="${convoName}"`)).toBeVisible();
  });
});

test.describe('Conversation Sidebar Collapse', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Skipping - no test credentials');

  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  });

  test('can collapse and expand sidebar', async ({ page }) => {
    const sidebar = page.locator('[data-testid="conversation-sidebar"]');
    const collapseButton = page.locator('button[aria-label="Collapse sidebar"]');

    // Initially expanded
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');

    // Collapse it
    await collapseButton.click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');

    // Expand it
    const expandButton = page.locator('button[aria-label="Expand sidebar"]');
    await expandButton.click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  });

  test('sidebar state persists after refresh', async ({ page }) => {
    const collapseButton = page.locator('button[aria-label="Collapse sidebar"]');
    await collapseButton.click();

    // Refresh
    await page.reload();
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 30000 });

    // Should still be collapsed
    const sidebar = page.locator('[data-testid="conversation-sidebar"]');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  });
});
