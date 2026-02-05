/**
 * Transactional email utilities using Loops.so
 */

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

// Token limits by plan
const TOKEN_LIMITS: Record<string, string> = {
  starter: '2M',
  pro: '10M',
  business: '50M',
};

// Convenience functions for each email type

export async function sendWelcomeEmail(email: string, firstName?: string) {
  return sendTransactionalEmail({
    transactionalId: 'welcome',
    email,
    dataVariables: { firstName: firstName || 'there' },
  });
}

export async function sendSubscriptionStarted(
  email: string,
  plan: string,
  firstName?: string
) {
  return sendTransactionalEmail({
    transactionalId: 'subscription_started',
    email,
    dataVariables: {
      firstName: firstName || 'there',
      plan: plan.charAt(0).toUpperCase() + plan.slice(1), // Capitalize
      tokenLimit: TOKEN_LIMITS[plan] || '2M',
    },
  });
}

export async function sendMachineReady(
  email: string,
  agentEmail: string,
  firstName?: string
) {
  return sendTransactionalEmail({
    transactionalId: 'machine_ready',
    email,
    dataVariables: {
      firstName: firstName || 'there',
      agentEmail,
    },
  });
}

export async function sendPaymentFailed(email: string, firstName?: string) {
  return sendTransactionalEmail({
    transactionalId: 'payment_failed',
    email,
    dataVariables: { firstName: firstName || 'there' },
  });
}

export async function sendSubscriptionCanceled(email: string, firstName?: string) {
  return sendTransactionalEmail({
    transactionalId: 'subscription_canceled',
    email,
    dataVariables: { firstName: firstName || 'there' },
  });
}

export async function sendUsageWarning(
  email: string,
  usagePercent: number,
  tokensUsed: string,
  tokenLimit: string
) {
  return sendTransactionalEmail({
    transactionalId: 'usage_warning',
    email,
    dataVariables: {
      usagePercent: Math.round(usagePercent),
      tokensUsed,
      tokenLimit,
    },
  });
}
