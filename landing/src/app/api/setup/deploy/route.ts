import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

// Simple encryption for API keys (in production, use proper key management)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'automna-default-key-change-me!!';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { 
      apiKey, 
      agentName, 
      personality, 
      timezone, 
      discordToken, 
      telegramToken 
    } = await request.json();

    if (!apiKey || !agentName) {
      return NextResponse.json({ error: 'API key and agent name required' }, { status: 400 });
    }

    // Encrypt sensitive data
    const encryptedApiKey = encrypt(apiKey);
    const encryptedDiscord = discordToken ? encrypt(discordToken) : null;
    const encryptedTelegram = telegramToken ? encrypt(telegramToken) : null;

    // Upsert user record
    const dbUser = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        anthropicKeyEncrypted: encryptedApiKey,
      },
      create: {
        clerkId: userId,
        email: user.emailAddresses[0]?.emailAddress || '',
        anthropicKeyEncrypted: encryptedApiKey,
      },
      include: { agents: true },
    });

    // Check if user already has an agent
    const existingAgent = dbUser.agents?.[0];

    // Create or update agent
    let agent;
    if (existingAgent) {
      agent = await prisma.agent.update({
        where: { id: existingAgent.id },
        data: {
          name: agentName,
          personality: personality || null,
          discordConfig: encryptedDiscord,
          telegramConfig: encryptedTelegram,
          status: 'pending',
        },
      });
    } else {
      agent = await prisma.agent.create({
        data: {
          userId: dbUser.id,
          name: agentName,
          personality: personality || null,
          discordConfig: encryptedDiscord,
          telegramConfig: encryptedTelegram,
          status: 'pending',
        },
      });
    }

    // Generate Clawdbot config (for future container deployment)
    const clawdbotConfig = generateClawdbotConfig({
      agentName,
      personality,
      timezone,
      hasDiscord: !!discordToken,
      hasTelegram: !!telegramToken,
    });

    // TODO: Actually deploy container with this config
    // For now, we just store the setup and mark as pending
    
    console.log(`Agent ${agentName} configured for user ${userId}, pending deployment`);

    return NextResponse.json({ 
      success: true, 
      agentId: agent.id,
      status: 'pending',
      message: 'Agent configured! Deployment coming soon.'
    });
  } catch (error) {
    console.error('Deploy error:', error);
    return NextResponse.json({ error: 'Deployment failed' }, { status: 500 });
  }
}

function generateClawdbotConfig(options: {
  agentName: string;
  personality?: string;
  timezone: string;
  hasDiscord: boolean;
  hasTelegram: boolean;
}) {
  // This generates a Clawdbot config structure
  // API keys are NOT included here - they're injected at container runtime
  return {
    meta: {
      generatedBy: 'automna',
      generatedAt: new Date().toISOString(),
    },
    agents: {
      defaults: {
        model: {
          primary: 'anthropic/claude-sonnet-4',
        },
        workspace: '/root/clawd',
        userTimezone: options.timezone,
        personality: options.personality || undefined,
      },
    },
    channels: {
      discord: options.hasDiscord ? {
        enabled: true,
        // Token injected at runtime
      } : { enabled: false },
      telegram: options.hasTelegram ? {
        enabled: true,
        // Token injected at runtime  
      } : { enabled: false },
    },
    gateway: {
      web: {
        enabled: true,
      },
    },
  };
}
