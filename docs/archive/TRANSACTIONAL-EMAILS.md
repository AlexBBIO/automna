# Automna Transactional Emails — MVP Spec

## Provider

**Resend** — templates defined in code (`lib/email.ts`), no dashboard needed.

- **API Key:** Vercel env `RESEND_API_KEY`
- **Sender:** `Automna <hello@automna.ai>` (Vercel env `RESEND_FROM`)
- **Domain:** `automna.ai` (verified in Resend)

## MVP Emails (3 total)

### 1. Welcome Email
- **Trigger:** User signs up (Clerk `user.created` webhook)
- **To:** New user's email
- **Subject:** Welcome to Automna
- **Body:** Short greeting + dashboard link
- **Variables:** `firstName`
- **Status:** ✅ Wired up

### 2. Subscription Started
- **Trigger:** Checkout completes (Stripe `checkout.session.completed` webhook)
- **To:** Customer email from Stripe session
- **Subject:** Your {Plan} plan is active
- **Body:** Plan confirmation + token limit + dashboard link
- **Variables:** `firstName`, `plan`, `tokenLimit`
- **Status:** ✅ Wired up

### 3. Payment Failed
- **Trigger:** Invoice payment fails (Stripe `invoice.payment_failed` webhook)
- **To:** Customer email from invoice
- **Subject:** Action needed: Payment failed
- **Body:** Update payment method prompt + settings link
- **Variables:** `firstName`
- **Status:** ✅ Wired up

## Also Implemented (Lower Priority)

| Email | Trigger | Status |
|-------|---------|--------|
| Machine Ready | Provision completes | ✅ Wired up |
| Subscription Canceled | Stripe sub deleted | ✅ Wired up |
| Usage Warning (80%) | Token threshold | ⚠️ Code exists, not wired to usage tracking yet |

## Architecture

```
User Action
    │
    ▼
Webhook (Clerk/Stripe) or API route
    │
    │  import { sendWelcomeEmail } from '@/lib/email'
    │
    ▼
lib/email.ts
    │
    │  Resend SDK (lazy init)
    │  Templates = inline HTML
    │  Fails gracefully (log + continue)
    │
    ▼
Resend API → User's inbox
```

## Key Design Decisions

- **No template dashboard.** All email content is in `lib/email.ts`.
- **Fail-safe.** Email errors never block the main flow (try/catch, log, continue).
- **Lazy init.** Resend client only created when first email is sent, avoiding build-time errors.
- **Minimal styling.** System font stack, black button, clean layout. No images or heavy HTML.

## Adding a New Email

1. Add a function to `lib/email.ts`:
```ts
export async function sendNewEmail(email: string, data: string) {
  return sendEmail({
    to: email,
    subject: 'Your Subject',
    html: `<div>Your content with ${data}</div>`,
  });
}
```

2. Call it from the relevant webhook/API route:
```ts
import { sendNewEmail } from '@/lib/email';
await sendNewEmail(user.email, someData);
```

3. Deploy.

## Monitoring

Check Resend dashboard at <https://resend.com/emails> for:
- Delivery status
- Bounce/complaint rates
- Failed sends
