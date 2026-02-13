/**
 * BYOK Credential Management API
 * 
 * POST - Save and validate an Anthropic credential (setup token or API key)
 * GET  - Check BYOK connection status
 * DELETE - Remove credential
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { machines, secrets, machineEvents } from '@/lib/db/schema';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { eq, and } from 'drizzle-orm';

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_API_BASE = 'https://api.machines.dev/v1';

type CredentialType = 'setup_token' | 'api_key';

function detectCredentialType(credential: string): CredentialType | null {
  if (credential.startsWith('sk-ant-oat')) return 'setup_token';
  if (credential.startsWith('sk-ant-api')) return 'api_key';
  return null;
}

function buildAuthProfilesJson(credential: string, type: CredentialType): string {
  // Both setup tokens and API keys use the same format in OpenClaw.
  // Setup tokens: type "token" with the raw token (same as `openclaw onboard` stores them)
  // API keys: type "api_key" with the key
  const profile: Record<string, unknown> = type === 'setup_token'
    ? { type: 'token', provider: 'anthropic', token: credential }
    : { type: 'api_key', provider: 'anthropic', key: credential };

  return JSON.stringify({
    version: 1,
    profiles: { 'anthropic:default': profile },
    order: { anthropic: ['anthropic:default'] },
    lastGood: { anthropic: 'anthropic:default' },
  });
}

async function validateCredential(credential: string, type: CredentialType): Promise<{ valid: boolean; error?: string }> {
  // Use claude-3-haiku for validation - it's available on all subscription tiers
  // and is the cheapest model, so even API key users won't mind the tiny cost
  const body = JSON.stringify({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  });

  // Try x-api-key first (works for both API keys and most setup tokens)
  // Then try Authorization: Bearer for setup tokens (some OAuth tokens need this)
  const methods: Array<{ name: string; headers: Record<string, string> }> = [
    {
      name: 'x-api-key',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': credential,
      },
    },
  ];

  if (type === 'setup_token') {
    methods.push({
      name: 'Bearer',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'Authorization': `Bearer ${credential}`,
      },
    });
  }

  let lastError = '';
  for (const method of methods) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: method.headers,
        body,
      });

      console.log(`[byok] Validation attempt (${method.name}): ${res.status}`);

      const resBody = await res.text().catch(() => '');
      console.log(`[byok] Validation (${method.name}): status=${res.status} body=${resBody.slice(0, 300)}`);

      // 401/403 = invalid with this auth method, try next
      if (res.status === 401 || res.status === 403) {
        lastError = resBody;
        continue;
      }

      // Any other status means the credential is valid
      return { valid: true };
    } catch (err) {
      console.error(`[byok] Validation error with ${method.name}:`, err);
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
  }

  // Parse the Anthropic error message if possible
  let detail = '';
  try {
    const parsed = JSON.parse(lastError);
    detail = parsed?.error?.message || '';
  } catch { /* not json */ }

  return { valid: false, error: detail || 'Authentication failed. Please check that your key is active and valid.' };
}

async function pushCredentialToMachine(
  appName: string,
  machineId: string,
  authProfilesJson: string
): Promise<boolean> {
  try {
    // Write auth-profiles.json via exec
    const escapedJson = authProfilesJson.replace(/'/g, "'\\''");
    const cmd = `mkdir -p /home/node/.openclaw/agents/main/agent && printf '${escapedJson}' > /home/node/.openclaw/agents/main/agent/auth-profiles.json`;

    const execRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}/exec`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cmd: ['sh', '-c', cmd] }),
    });

    if (!execRes.ok) {
      console.error(`[byok] Failed to write auth-profiles.json: ${execRes.status} ${await execRes.text()}`);
      return false;
    }

    // Signal gateway restart
    const restartRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}/exec`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cmd: ['sh', '-c', 'kill -USR1 1'] }),
    });

    if (!restartRes.ok) {
      console.warn(`[byok] Gateway restart signal failed: ${restartRes.status}`);
      // Non-fatal - creds are written, gateway will pick them up on next restart
    }

    return true;
  } catch (error) {
    console.error('[byok] Error pushing credential to machine:', error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { credential: rawCredential } = await request.json();
    if (!rawCredential || typeof rawCredential !== 'string') {
      return NextResponse.json({ error: 'Credential required' }, { status: 400 });
    }

    // Trim whitespace/newlines that can sneak in from copy-paste
    const credential = rawCredential.trim();

    // Detect type
    const type = detectCredentialType(credential);
    if (!type) {
      return NextResponse.json(
        { error: 'Invalid credential format. Must start with sk-ant-oat (setup token) or sk-ant-api (API key).' },
        { status: 400 }
      );
    }

    // Validate credential
    // Setup tokens (sk-ant-oat) are OAuth access tokens scoped to Claude Code.
    // They can't call /v1/messages directly - only OpenClaw knows how to use them.
    // So we only validate API keys against the Anthropic API.
    if (type === 'api_key') {
      const validation = await validateCredential(credential, type);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Credential validation failed. Please check that your key is active and valid.' },
          { status: 422 }
        );
      }
    }

    // Encrypt and store
    const { encrypted, iv } = encryptSecret(credential, userId);

    // Upsert secret
    const existingSecret = await db.query.secrets.findFirst({
      where: and(eq(secrets.userId, userId), eq(secrets.name, 'anthropic_credential')),
    });

    if (existingSecret) {
      await db.update(secrets)
        .set({ encryptedValue: encrypted, iv, updatedAt: new Date() })
        .where(eq(secrets.id, existingSecret.id));
    } else {
      await db.insert(secrets).values({
        userId,
        name: 'anthropic_credential',
        encryptedValue: encrypted,
        iv,
      });
    }

    // Update machines table
    const byokProvider = type === 'setup_token' ? 'anthropic_oauth' : 'anthropic_api_key';
    await db.update(machines)
      .set({ byokProvider, byokEnabled: 1, updatedAt: new Date() })
      .where(eq(machines.userId, userId));

    // Push to Fly machine
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    let pushedToMachine = false;
    if (machine?.appName) {
      const authProfilesJson = buildAuthProfilesJson(credential, type);
      pushedToMachine = await pushCredentialToMachine(machine.appName, machine.id, authProfilesJson);

      // Log event
      await db.insert(machineEvents).values({
        machineId: machine.id,
        eventType: 'byok_configured',
        details: JSON.stringify({ type, pushedToMachine }),
      });
    }

    return NextResponse.json({
      success: true,
      type,
      pushedToMachine,
    });
  } catch (error) {
    console.error('[byok] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save credential' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    const secret = await db.query.secrets.findFirst({
      where: and(eq(secrets.userId, userId), eq(secrets.name, 'anthropic_credential')),
    });

    return NextResponse.json({
      enabled: machine?.byokEnabled === 1,
      type: machine?.byokProvider ?? null,
      lastValidated: secret?.updatedAt ? new Date(secret.updatedAt).toISOString() : null,
    });
  } catch (error) {
    console.error('[byok] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to check BYOK status' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete secret
    const secret = await db.query.secrets.findFirst({
      where: and(eq(secrets.userId, userId), eq(secrets.name, 'anthropic_credential')),
    });
    if (secret) {
      await db.delete(secrets).where(eq(secrets.id, secret.id));
    }

    // Update machines table
    await db.update(machines)
      .set({ byokProvider: null, byokEnabled: 0, updatedAt: new Date() })
      .where(eq(machines.userId, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[byok] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to remove credential' },
      { status: 500 }
    );
  }
}
