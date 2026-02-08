/**
 * Transactional email utilities using Resend
 * 
 * All templates are defined inline — no dashboard needed.
 * Emails fail gracefully (log + continue) so they never block user flows.
 */

import { Resend } from 'resend';

// Lazy init to avoid throwing during build when env var isn't set
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// Sender address — update once domain is verified in Resend
const FROM = process.env.RESEND_FROM || 'Automna <onboarding@resend.dev>';

// Token limits by plan
const TOKEN_LIMITS: Record<string, string> = {
  starter: '2M',
  pro: '10M',
  business: '50M',
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
  firstName?: string
) {
  const name = firstName || 'there';
  return sendEmail({
    to: email,
    subject: 'Your AI agent is ready',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Your AI agent is ready</h2>
        <p>Hi ${name},</p>
        <p>Your Automna agent is set up and ready to go.</p>
        <p><strong>Your agent's email:</strong> ${agentEmail}</p>
        <p>Your agent can receive emails at this address and act on them.</p>
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
