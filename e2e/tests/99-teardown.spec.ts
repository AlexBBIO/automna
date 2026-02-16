import { test, expect } from '@playwright/test';

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_API_BASE = 'https://api.machines.dev/v1';

/**
 * Teardown: clean up test machine if FLY_API_TOKEN is provided.
 * 
 * This is intentionally conservative — it only deletes apps matching
 * the e2e test pattern. Run manually if needed:
 *   FLY_API_TOKEN=xxx npx playwright test tests/99-teardown.spec.ts
 */
test.describe('Teardown', () => {
  test.skip(!FLY_API_TOKEN, 'FLY_API_TOKEN not set — skipping teardown');

  test('clean up test machine (manual)', async ({ request }) => {
    // This test is a manual cleanup helper.
    // To find the test user's app, we'd need to know the shortId.
    // For safety, this just logs what would be cleaned up.
    
    // List all automna apps
    const response = await request.fetch('https://api.fly.io/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: {
        query: `{ apps(type: "", first: 100) { nodes { id name status } } }`,
      },
    });

    const data = await response.json();
    const apps = data?.data?.apps?.nodes || [];
    const testApps = apps.filter((a: any) => 
      a.name.startsWith('automna-u-') && a.status === 'deployed'
    );

    console.log(`Found ${testApps.length} automna user apps:`);
    testApps.forEach((a: any) => console.log(`  - ${a.name} (${a.status})`));

    // NOTE: Actual deletion requires knowing which app belongs to the test user.
    // Do NOT auto-delete all apps. This is just a listing helper.
    // To delete a specific test app:
    //   fly apps destroy automna-u-XXXX --yes
    
    expect(true).toBe(true); // Always passes — informational only
  });
});
