/**
 * Transactional email utilities using Resend
 * 
 * All templates are defined inline — no dashboard needed.
 * Emails fail gracefully (log + continue) so they never block user flows.
 * 
 * Two API keys:
 * - RESEND_API_KEY: send-only (for transactional emails)
 * - RESEND_FULL_API_KEY: full access (for contacts/audience management)
 */

import { Resend } from 'resend';

// Lazy init to avoid throwing during build when env var isn't set
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// Contact management uses fetch directly (SDK types don't support custom properties)
// Requires RESEND_FULL_API_KEY env var (full access, not send-only)

// Sender address — update once domain is verified in Resend
const FROM = process.env.RESEND_FROM || 'Automna <onboarding@resend.dev>';

// Token limits by plan
const TOKEN_LIMITS: Record<string, string> = {
  lite: '50K',
  starter: '200K',
  pro: '1M',
  business: '5M',
};

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.log(`[Email] No RESEND_API_KEY, skipping: "${subject}" to ${to}`);
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[Email] Failed to send "${subject}":`, error);
      return false;
    }

    console.log(`[Email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Error sending "${subject}":`, err);
    return false;
  }
}

// ─── Email Templates ───────────────────────────────────────────────

export async function sendWelcomeEmail(email: string, firstName?: string) {
  const name = firstName || 'there';
  return sendEmail({
    to: email,
    subject: 'Welcome to Automna',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Welcome to Automna</h2>
        <p>Hi ${name},</p>
        <p>Your account is ready. Head to your dashboard to set up your AI agent.</p>
        <a href="https://automna.ai/dashboard" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Go to Dashboard</a>
        <p style="color: #666; font-size: 14px; margin-top: 32px;">— Automna</p>
      </div>
    `,
  });
}

export async function sendSubscriptionStarted(
  email: string,
  plan: string,
  firstName?: string
) {
  const name = firstName || 'there';
  const displayPlan = plan.charAt(0).toUpperCase() + plan.slice(1);
  const tokenLimit = TOKEN_LIMITS[plan] || '2M';
  return sendEmail({
    to: email,
    subject: `Your ${displayPlan} plan is active`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Your ${displayPlan} plan is active</h2>
        <p>Hi ${name},</p>
        <p>Your Automna ${displayPlan} subscription is now active. You get ${tokenLimit} tokens/month.</p>
        <a href="https://automna.ai/dashboard" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Go to Dashboard</a>
        <p style="color: #666; font-size: 14px; margin-top: 32px;">— Automna</p>
      </div>
    `,
  });
}

export async function sendMachineReady(
  email: string,
  agentEmail: string,
  firstName?: string,
  phoneNumber?: string | null
) {
  const name = firstName || 'there';
  
  // Format phone for display: +17254339890 → (725) 433-9890
  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      const area = digits.slice(1, 4);
      const prefix = digits.slice(4, 7);
      const line = digits.slice(7);
      return `(${area}) ${prefix}-${line}`;
    }
    return phone;
  };

  const phoneSection = phoneNumber ? `
        <div style="background: #f8f8f8; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px; font-weight: 600;">📞 Your agent's phone number</p>
          <p style="margin: 0 0 12px; font-size: 20px; font-weight: 700;">${formatPhone(phoneNumber)}</p>
          <p style="margin: 0 0 8px; color: #444; font-size: 14px;">Your agent can make and receive real phone calls. Try calling it right now — it'll pick up and talk to you.</p>
          <p style="margin: 0 0 12px; color: #444; font-size: 14px;">Save this number to your contacts so you always have your AI on speed dial.</p>
          <a href="https://automna.ai/api/user/vcard" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px;">Add to Contacts</a>
        </div>
        <p style="color: #444; font-size: 14px;">💡 <strong>Tip:</strong> Tell your agent how you want it to handle calls — its name, personality, what to say when someone calls. Just chat with it in the dashboard.</p>
  ` : '';

  return sendEmail({
    to: email,
    subject: phoneNumber ? 'Your AI agent is ready — with its own phone number' : 'Your AI agent is ready',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Your AI agent is ready</h2>
        <p>Hi ${name},</p>
        <p>Your Automna agent is set up and ready to work for you.</p>
        
        <div style="background: #f8f8f8; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px; font-weight: 600;">✉️ Your agent's email</p>
          <p style="margin: 0 0 4px; font-size: 16px; font-weight: 700;">${agentEmail}</p>
          <p style="margin: 0; color: #444; font-size: 14px;">Your agent can send and receive emails. Forward things to this address and your agent will handle them.</p>
        </div>
        ${phoneSection}
        <a href="https://automna.ai/dashboard" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Start Chatting</a>
        <p style="color: #666; font-size: 14px; margin-top: 32px;">— Automna</p>
      </div>
    `,
  });
}

export async function sendPaymentFailed(email: string, firstName?: string) {
  const name = firstName || 'there';
  return sendEmail({
    to: email,
    subject: 'Action needed: Payment failed',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Payment failed</h2>
        <p>Hi ${name},</p>
        <p>We couldn't process your latest payment for Automna. Please update your payment method to keep your agent running.</p>
        <a href="https://automna.ai/dashboard/settings" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Update Payment</a>
        <p style="color: #666; font-size: 14px; margin-top: 32px;">— Automna</p>
      </div>
    `,
  });
}

export async function sendSubscriptionCanceled(email: string, firstName?: string) {
  const name = firstName || 'there';
  return sendEmail({
    to: email,
    subject: 'Your Automna subscription has been canceled',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Subscription canceled</h2>
        <p>Hi ${name},</p>
        <p>Your Automna subscription has been canceled. Your agent will stop running at the end of your billing period.</p>
        <p>If this was a mistake, you can resubscribe anytime.</p>
        <a href="https://automna.ai/pricing" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Resubscribe</a>
        <p style="color: #666; font-size: 14px; margin-top: 32px;">— Automna</p>
      </div>
    `,
  });
}

export async function sendUsageWarning(
  email: string,
  usagePercent: number,
  tokensUsed: string,
  tokenLimit: string
) {
  return sendEmail({
    to: email,
    subject: `Usage alert: ${Math.round(usagePercent)}% of your token limit used`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Usage alert</h2>
        <p>You've used ${tokensUsed} of your ${tokenLimit} monthly token limit (${Math.round(usagePercent)}%).</p>
        <p>Consider upgrading your plan for more capacity.</p>
        <a href="https://automna.ai/pricing" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">View Plans</a>
        <p style="color: #666; font-size: 14px; margin-top: 32px;">— Automna</p>
      </div>
    `,
  });
}

// ─── Audience / Contact Management ─────────────────────────────────

interface ContactData {
  email: string;
  firstName?: string;
  lastName?: string;
  clerkId?: string;
  plan?: string;
  agentEmail?: string;
  phoneNumber?: string;
}

/**
 * Add or update a contact in Resend audience.
 * Called on signup and plan changes.
 */
export async function upsertContact(data: ContactData): Promise<boolean> {
  if (!process.env.RESEND_FULL_API_KEY) {
    console.log(`[Email] No RESEND_FULL_API_KEY, skipping contact upsert for ${data.email}`);
    return false;
  }

  try {
    // Use fetch directly for contact creation since SDK types don't support custom properties
    const body: Record<string, unknown> = {
      email: data.email,
      unsubscribed: false,
    };

    if (data.firstName) body.first_name = data.firstName;
    if (data.lastName) body.last_name = data.lastName;
    if (data.clerkId) body.clerk_id = data.clerkId;
    if (data.plan) body.plan = data.plan;
    if (data.agentEmail) body.agent_email = data.agentEmail;
    if (data.phoneNumber) body.phone_number = data.phoneNumber;

    const response = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_FULL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Email] Failed to upsert contact ${data.email}:`, error);
      return false;
    }

    console.log(`[Email] Upserted contact ${data.email} (plan: ${data.plan || 'free'})`);
    return true;
  } catch (err) {
    console.error(`[Email] Error upserting contact ${data.email}:`, err);
    return false;
  }
}

/**
 * Update just the plan label for a contact.
 */
export async function updateContactPlan(email: string, plan: string): Promise<boolean> {
  if (!process.env.RESEND_FULL_API_KEY) {
    console.log(`[Email] No RESEND_FULL_API_KEY, skipping plan update for ${email}`);
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_FULL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, plan }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Email] Failed to update contact plan ${email}:`, error);
      return false;
    }

    console.log(`[Email] Updated contact ${email} plan to ${plan}`);
    return true;
  } catch (err) {
    console.error(`[Email] Error updating contact plan ${email}:`, err);
    return false;
  }
}
