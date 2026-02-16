# Automna E2E Tests

Playwright end-to-end tests for the Automna provisioning flow: signup → payment → BYOK → provisioning → gateway health.

## Setup

### 1. Install dependencies

```bash
cd e2e
npm install
npx playwright install chromium
```

### 2. Create a Clerk test user

In the [Clerk Dashboard](https://dashboard.clerk.com):

1. Go to **Users → Add user**
2. Create a user with:
   - Email: `e2e-test@automna.ai` (or any test email)
   - Password: a strong password
3. Note: This user should be on **Stripe test mode** — do NOT use a real payment method

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|----------|-------------|
| `BASE_URL` | Target (default: `https://automna.ai`) |
| `CLERK_TEST_EMAIL` | Email of the Clerk test user |
| `CLERK_TEST_PASSWORD` | Password of the Clerk test user |
| `STRIPE_PRICE_ID` | A Stripe test-mode price ID (e.g., `price_xxx` from Stripe dashboard) |
| `FLY_API_TOKEN` | (Optional) For teardown/cleanup of test machines |

### 4. Stripe test mode

Ensure your Stripe dashboard is in **test mode**. The test uses:
- Card: `4242 4242 4242 4242`
- Expiry: `12/30`
- CVC: `123`

## Running

```bash
# All tests
npx playwright test

# Specific test file
npx playwright test tests/01-page-health.spec.ts

# With browser visible (debugging)
npx playwright test --headed

# View report
npx playwright show-report
```

## Test Suite

| File | Description |
|------|-------------|
| `01-page-health` | Landing, pricing, auth pages load |
| `02-checkout-flow` | Sign in → select plan → Stripe checkout → redirect |
| `03-byok-credential` | Submit API key and Claude setup token forms |
| `04-provisioning` | Trigger `/api/user/provision`, poll status until ready |
| `05-gateway-health` | Verify provisioned Fly.io gateway responds |
| `99-teardown` | List/cleanup test machines (requires `FLY_API_TOKEN`) |

## Safety

- Uses Stripe **test mode** only — no real charges
- Uses a dedicated Clerk test user — no impact on real users
- Teardown is conservative — lists apps but does NOT auto-delete
- Provisioning creates a real Fly machine; clean up with `fly apps destroy automna-u-XXXX --yes`

## CI Notes

For CI, you'd need:
1. Clerk test credentials as secrets
2. Stripe in test mode
3. Optional: `FLY_API_TOKEN` for auto-cleanup
4. Run: `npx playwright test --reporter=github`
