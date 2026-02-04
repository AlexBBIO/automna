# Automna Transactional Emails Spec

## Overview

Transactional emails are system-triggered emails for account events (welcome, billing, alerts). We'll use **Loops.so** (already configured) since it supports both marketing and transactional email via their "Loop Messages" feature.

## Current State

| System | Purpose | Status |
|--------|---------|--------|
| **Loops.so** | Waitlist, user sync | ✅ Working |
| **Agentmail** | Agent-to-world emails | ✅ Working |
| **Transactional** | System notifications | ❌ Not set up |

## Required Transactional Emails

### Priority 1: Essential

| Email | Trigger | Purpose |
|-------|---------|---------|
| **Welcome** | User signs up | Introduce product, link to dashboard |
| **Subscription Started** | Stripe checkout.session.completed | Confirm plan, what's included |
| **Machine Ready** | Provision complete | Agent email, getting started |

### Priority 2: Billing

| Email | Trigger | Purpose |
|-------|---------|---------|
| **Payment Receipt** | Stripe invoice.paid | Monthly receipt |
| **Payment Failed** | Stripe invoice.payment_failed | Action needed |
| **Subscription Canceled** | Stripe customer.subscription.deleted | Confirmation, feedback ask |
| **Plan Changed** | Stripe customer.subscription.updated (plan change) | Confirm upgrade/downgrade |

### Priority 3: Usage Alerts

| Email | Trigger | Purpose |
|-------|---------|---------|
| **Usage Warning (80%)** | Daily usage check | Approaching token limit |
| **Usage Limit Reached** | API proxy rejection | Requests being blocked |

## Implementation

### 1. Create Templates in Loops.so Dashboard

Go to [Loops Dashboard](https://app.loops.so) → Loop Messages → Create:

**Template IDs to create:**
- `welcome`
- `subscription_started`
- `machine_ready`
- `payment_receipt`
- `payment_failed`
- `subscription_canceled`
- `plan_changed`
- `usage_warning`
- `usage_limit`

Each template uses Loops' visual editor. Variables available:
- `{{email}}`
- `{{firstName}}`
- `{{plan}}` (starter/pro/business)
- `{{agentEmail}}` (e.g., swiftfox@mail.automna.ai)
- `{{tokenLimit}}`
- `{{tokensUsed}}`
- `{{usagePercent}}`
- `{{amount}}` (for receipts)

### 2. Email Sender Utility

Create `landing/src/lib/email.ts`:

```typescript
const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
const LOOPS_API_URL = 'https://app.loops.so/api/v1';

interface SendTransactionalParams {
  transactionalId: string;
  email: string;
  dataVariables?: Record<string, string | number>;
}

export async function sendTransactionalEmail({
  transactionalId,
  email,
  dataVariables = {},
}: SendTransactionalParams): Promise<boolean> {
  if (!LOOPS_API_KEY) {
    console.log(`[Email] No LOOPS_API_KEY, skipping: ${transactionalId} to ${email}`);
    return false;
  }

  try {
    const response = await fetch(`${LOOPS_API_URL}/transactional`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOOPS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionalId,
        email,
        dataVariables,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Email] Failed to send ${transactionalId}:`, error);
      return false;
    }

    console.log(`[Email] Sent ${transactionalId} to ${email}`);
    return true;
  } catch (error) {
    console.error(`[Email] Error sending ${transactionalId}:`, error);
    return false;
  }
}

// Convenience functions
export const sendWelcomeEmail = (email: string, firstName?: string) =>
  sendTransactionalEmail({
    transactionalId: 'welcome',
    email,
    dataVariables: { firstName: firstName || 'there' },
  });

export const sendSubscriptionStarted = (
  email: string,
  plan: string,
  firstName?: string
) =>
  sendTransactionalEmail({
    transactionalId: 'subscription_started',
    email,
    dataVariables: {
      firstName: firstName || 'there',
      plan,
      tokenLimit: plan === 'starter' ? '2M' : plan === 'pro' ? '10M' : '50M',
    },
  });

export const sendMachineReady = (
  email: string,
  agentEmail: string,
  firstName?: string
) =>
  sendTransactionalEmail({
    transactionalId: 'machine_ready',
    email,
    dataVariables: {
      firstName: firstName || 'there',
      agentEmail,
    },
  });

export const sendPaymentFailed = (email: string, firstName?: string) =>
  sendTransactionalEmail({
    transactionalId: 'payment_failed',
    email,
    dataVariables: { firstName: firstName || 'there' },
  });

export const sendSubscriptionCanceled = (email: string, firstName?: string) =>
  sendTransactionalEmail({
    transactionalId: 'subscription_canceled',
    email,
    dataVariables: { firstName: firstName || 'there' },
  });

export const sendUsageWarning = (
  email: string,
  usagePercent: number,
  tokensUsed: string,
  tokenLimit: string
) =>
  sendTransactionalEmail({
    transactionalId: 'usage_warning',
    email,
    dataVariables: { usagePercent, tokensUsed, tokenLimit },
  });
```

### 3. Integration Points

#### Clerk Webhook (user.created)

In `webhooks/clerk/route.ts`, add after DB create:

```typescript
import { sendWelcomeEmail } from '@/lib/email';

// After user created in DB:
await sendWelcomeEmail(primaryEmail, first_name || undefined);
```

#### Stripe Webhook (checkout.session.completed)

In `webhooks/stripe/route.ts`, add:

```typescript
import { sendSubscriptionStarted } from '@/lib/email';

// After updating user metadata:
if (session.customer_email) {
  await sendSubscriptionStarted(
    session.customer_email,
    plan,
    session.metadata?.firstName
  );
}
```

#### Stripe Webhook (customer.subscription.deleted)

```typescript
import { sendSubscriptionCanceled } from '@/lib/email';

// After updating user metadata:
const customerEmail = (customer as Stripe.Customer).email;
if (customerEmail) {
  await sendSubscriptionCanceled(customerEmail);
}
```

#### Stripe Webhook (invoice.payment_failed)

Add new case:

```typescript
case 'invoice.payment_failed': {
  const invoice = event.data.object as Stripe.Invoice;
  const customerEmail = invoice.customer_email;
  if (customerEmail) {
    await sendPaymentFailed(customerEmail);
  }
  break;
}
```

#### Provision API (machine ready)

In `api/user/provision/route.ts`, after machine is ready:

```typescript
import { sendMachineReady } from '@/lib/email';

// After successful provision:
await sendMachineReady(user.email, agentmailInboxId);
```

#### LLM Proxy (usage tracking)

Add usage warning check in `api/llm/v1/messages/route.ts`:

```typescript
import { sendUsageWarning } from '@/lib/email';

// After logging usage, check threshold:
const usagePercent = (totalTokens / tokenLimit) * 100;
if (usagePercent >= 80 && usagePercent < 100) {
  // Check if we already sent warning today
  const lastWarning = await getLastUsageWarning(userId);
  if (!lastWarning || daysSince(lastWarning) >= 1) {
    await sendUsageWarning(user.email, usagePercent, totalTokens, tokenLimit);
    await recordUsageWarning(userId);
  }
}
```

### 4. Email Content (Draft Copy)

#### Welcome Email

**Subject:** Welcome to Automna ✨

```
Hi {{firstName}},

Welcome to Automna! You now have your own AI agent that can:

• Browse the web and research anything
• Read and send emails on your behalf  
• Automate repetitive tasks
• Work 24/7 while you focus on what matters

**Get started:** https://automna.ai/dashboard

Questions? Just reply to this email.

— The Automna Team
```

#### Subscription Started

**Subject:** Your {{plan}} plan is active

```
Hi {{firstName}},

Your Automna {{plan}} subscription is now active.

**Your plan includes:**
• {{tokenLimit}} tokens/month
• Dedicated AI agent
• [plan-specific features]

**Dashboard:** https://automna.ai/dashboard

Thanks for choosing Automna!

— The Automna Team
```

#### Machine Ready

**Subject:** Your AI agent is ready! 🤖

```
Hi {{firstName}},

Great news — your AI agent is provisioned and ready to work.

**Your agent's email:** {{agentEmail}}

Your agent can receive emails at this address and respond on your behalf (with your approval).

**Start chatting:** https://automna.ai/dashboard

— The Automna Team
```

#### Payment Failed

**Subject:** Action needed: Payment failed

```
Hi {{firstName}},

We couldn't process your payment for Automna.

**Update payment method:** https://automna.ai/dashboard/billing

If you don't update within 7 days, your subscription will be paused.

Need help? Reply to this email.

— The Automna Team
```

### 5. Testing

1. Create templates in Loops dashboard
2. Use Loops "Test" feature to preview with sample data
3. Deploy code changes
4. Test each flow:
   - Create new account → welcome email
   - Subscribe → subscription started
   - Cancel subscription → cancellation email

### 6. Monitoring

Track in Loops dashboard:
- Delivery rates
- Open rates
- Bounce rates

Set up alerts for:
- Bounce rate > 5%
- Delivery failures

## Environment Variables

Already set:
- `LOOPS_API_KEY` (in Vercel)

No new secrets needed.

## Timeline

| Task | Effort | Priority |
|------|--------|----------|
| Create Loops templates (P1) | 1 hour | High |
| Add `lib/email.ts` utility | 30 min | High |
| Integrate Clerk webhook | 15 min | High |
| Integrate Stripe webhooks | 30 min | High |
| Integrate provision API | 15 min | High |
| Create Loops templates (P2) | 1 hour | Medium |
| Add usage tracking/warnings | 1 hour | Low |

**Total: ~4-5 hours for full implementation**

## Notes

- Loops handles unsubscribes automatically for marketing; transactional emails don't have unsubscribe (they're required for service)
- Payment receipts could also come from Stripe directly (Stripe Billing has built-in receipts) — decide if we want custom ones
- Consider adding email preferences in dashboard later (e.g., disable usage warnings)
