import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail, upsertContact } from '@/lib/email';

export async function POST(req: Request) {
  // Get the Svix headers for verification
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  
  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Verify the webhook
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  // Handle the event
  const eventType = evt.type;

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const primaryEmail = email_addresses?.[0]?.email_address;

    if (primaryEmail) {
      // Create user in database
      try {
        await prisma.user.upsert({
          where: { clerkId: id },
          update: { email: primaryEmail },
          create: {
            clerkId: id,
            email: primaryEmail,
            plan: 'free',
          },
        });
        console.log(`User created in DB: ${primaryEmail} (${id})`);
      } catch (error) {
        console.error('Failed to create user in DB:', error);
      }

      // Add to Loops.so
      await addToLoops({
        email: primaryEmail,
        firstName: first_name || undefined,
        lastName: last_name || undefined,
        clerkId: id,
        userGroup: 'users',
      });

      // Send welcome email
      await sendWelcomeEmail(primaryEmail, first_name || undefined);

      // Add to Resend audience
      await upsertContact({
        email: primaryEmail,
        firstName: first_name || undefined,
        lastName: last_name || undefined,
        clerkId: id,
        plan: 'free',
      });
    }
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const primaryEmail = email_addresses?.[0]?.email_address;

    if (primaryEmail) {
      // Update user in database
      try {
        await prisma.user.upsert({
          where: { clerkId: id },
          update: { email: primaryEmail },
          create: {
            clerkId: id,
            email: primaryEmail,
            plan: 'free',
          },
        });
      } catch (error) {
        console.error('Failed to update user in DB:', error);
      }

      // Update in Loops.so
      await addToLoops({
        email: primaryEmail,
        firstName: first_name || undefined,
        lastName: last_name || undefined,
        clerkId: id,
        userGroup: 'users',
      });
    }
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;
    
    // Delete user from database
    if (id) {
      try {
        await prisma.user.delete({
          where: { clerkId: id },
        });
        console.log(`User deleted from DB: ${id}`);
      } catch (error) {
        // User might not exist, that's fine
        console.log(`User not found in DB for deletion: ${id}`);
      }
    }
  }

  return NextResponse.json({ success: true });
}

async function addToLoops(data: {
  email: string;
  firstName?: string;
  lastName?: string;
  clerkId: string;
  userGroup: string;
}) {
  const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
  
  if (!LOOPS_API_KEY) {
    console.log('No LOOPS_API_KEY, skipping Loops integration');
    return;
  }

  try {
    const response = await fetch('https://app.loops.so/api/v1/contacts/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOOPS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        userId: data.clerkId,
        source: 'signup',
        subscribed: true,
        userGroup: data.userGroup,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      if (!error.includes('already exists')) {
        console.error('Loops API error:', error);
      }
    }
  } catch (error) {
    console.error('Failed to add to Loops:', error);
  }
}
