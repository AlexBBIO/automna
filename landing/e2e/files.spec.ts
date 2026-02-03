import { test, expect } from '@playwright/test';

/**
 * File Browser E2E Tests
 * 
 * Tests for the file browser functionality in the dashboard.
 * Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars.
 */

test.describe('File Browser (requires auth)', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Skipping - no test credentials');

  test.beforeEach(async ({ page }) => {
    // Sign in before each test
    await page.goto('/sign-in');
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    
    // Wait for dashboard to be ready
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 30000 });
  });

  test('can access Files tab', async ({ page }) => {
    // Click on Files tab
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await expect(filesTab).toBeVisible();
    await filesTab.click();

    // File browser should be visible
    await expect(page.locator('[data-testid="file-browser"]')).toBeVisible({ timeout: 10000 });
  });

  test('shows file tree', async ({ page }) => {
    // Navigate to Files tab
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();

    // Wait for file tree to load
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    // Should show workspace directory
    await expect(page.locator('text=workspace')).toBeVisible();
  });

  test('can navigate into directories', async ({ page }) => {
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();

    // Wait for tree to load
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    // Click on a directory to expand it
    const workspaceDir = page.locator('[data-testid="file-tree"] >> text=workspace').first();
    await workspaceDir.click();

    // Should show contents (wait for expansion)
    await page.waitForTimeout(500);
    
    // Directory should be expanded (could check for child items)
    const treeItems = page.locator('[data-testid="file-tree-item"]');
    await expect(treeItems.first()).toBeVisible();
  });

  test('can view file content', async ({ page }) => {
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();

    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    // Find and click on a markdown file (e.g., AGENTS.md)
    const agentsFile = page.locator('[data-testid="file-tree-item"]:has-text(".md")').first();
    if (await agentsFile.isVisible()) {
      await agentsFile.click();

      // File content should be visible in the editor/viewer
      await expect(page.locator('[data-testid="file-content"], [data-testid="file-editor"]')).toBeVisible({ timeout: 5000 });
    }
  });

  test('can create new file', async ({ page }) => {
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();

    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    // Click new file button
    const newFileButton = page.locator('button[aria-label="New file"], button:has-text("New")');
    if (await newFileButton.isVisible()) {
      await newFileButton.click();

      // Enter filename
      const filenameInput = page.locator('input[placeholder*="filename"], input[placeholder*="name"]');
      await filenameInput.fill(`test-${Date.now()}.md`);
      await filenameInput.press('Enter');

      // File should appear in tree
      await expect(page.locator(`text=test-`)).toBeVisible({ timeout: 5000 });
    }
  });

  test('can edit file content', async ({ page }) => {
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();

    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    // Click on a file to edit
    const editableFile = page.locator('[data-testid="file-tree-item"]:has-text(".md")').first();
    if (await editableFile.isVisible()) {
      await editableFile.click();

      // Wait for editor to load
      const editor = page.locator('[data-testid="file-editor"], textarea');
      await expect(editor).toBeVisible({ timeout: 5000 });

      // Type some content
      await editor.fill(`# Test Edit ${Date.now()}\n\nEdited content.`);

      // Save
      const saveButton = page.locator('button:has-text("Save")');
      if (await saveButton.isVisible()) {
        await saveButton.click();

        // Should show success feedback
        await expect(page.locator('text=Saved, text=saved successfully')).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('shows file metadata', async ({ page }) => {
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();

    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    // Click on a file
    const file = page.locator('[data-testid="file-tree-item"]').first();
    await file.click();

    // Should show file info (size, modified date)
    // This depends on UI implementation
    const fileInfo = page.locator('[data-testid="file-info"], [data-testid="file-metadata"]');
    if (await fileInfo.isVisible()) {
      await expect(fileInfo).toContainText(/bytes|KB|MB|modified|size/i);
    }
  });
});

test.describe('File Browser Performance', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Skipping - no test credentials');

  test('file tree loads within 5 seconds', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Navigate to Files
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    
    const start = Date.now();
    await filesTab.click();
    
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 5000 });
    
    const elapsed = Date.now() - start;
    console.log(`File tree loaded in ${elapsed}ms`);
    
    expect(elapsed).toBeLessThan(5000);
  });

  test('file content loads within 3 seconds', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    const file = page.locator('[data-testid="file-tree-item"]:has-text(".md")').first();
    if (await file.isVisible()) {
      const start = Date.now();
      await file.click();
      
      await expect(page.locator('[data-testid="file-content"], [data-testid="file-editor"]')).toBeVisible({ timeout: 3000 });
      
      const elapsed = Date.now() - start;
      console.log(`File content loaded in ${elapsed}ms`);
      
      expect(elapsed).toBeLessThan(3000);
    }
  });
});

test.describe('File Upload', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Skipping - no test credentials');

  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[name="identifier"]', process.env.E2E_TEST_EMAIL!);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  });

  test('can upload a file', async ({ page }) => {
    const filesTab = page.locator('button:has-text("Files"), [role="tab"]:has-text("Files")');
    await filesTab.click();
    await expect(page.locator('[data-testid="file-tree"]')).toBeVisible({ timeout: 10000 });

    // Look for upload button
    const uploadButton = page.locator('button[aria-label="Upload"], button:has-text("Upload")');
    if (await uploadButton.isVisible()) {
      // Create a test file
      const fileName = `test-upload-${Date.now()}.txt`;
      const fileContent = 'Test file content for E2E upload test';

      // Use setInputFiles for file input
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: fileName,
          mimeType: 'text/plain',
          buffer: Buffer.from(fileContent),
        });

        // Wait for upload to complete
        await expect(page.locator(`text=${fileName}`)).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
