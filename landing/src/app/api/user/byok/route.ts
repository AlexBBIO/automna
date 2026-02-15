/**
 * BYOK Credential Management API
 * 
 * POST - Save and validate an Anthropic credential (setup token or API key)
 * GET  - Check BYOK connection status
 * DELETE - Remove credential
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { machines, secrets, machineEvents, users } from '@/lib/db/schema';
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

/**
 * Ensure the Fly machine is in BYOK mode.
 * If the machine doesn't have BYOK_MODE env var, update its config and restart.
 * This handles legacy→BYOK migration: the machine needs a full restart for the
 * entrypoint to regenerate config in BYOK mode.
 */
async function ensureMachineByokMode(appName: string, machineId: string): Promise<boolean> {
  try {
    // Get current machine config
    const getRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}`, {
      headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
    });
    if (!getRes.ok) {
      console.error(`[byok] Failed to get machine config: ${getRes.status}`);
      return false;
    }

    const machine = await getRes.json();
    const env = machine.config?.env || {};

    // Already in BYOK mode? Just need to clear init.cmd if present
    const needsEnvUpdate = env.BYOK_MODE !== 'true' || env.ANTHROPIC_BASE_URL;
    const needsInitClear = machine.config?.init?.cmd?.length > 0;

    if (!needsEnvUpdate && !needsInitClear) {
      console.log('[byok] Machine already in BYOK mode');
      return true;
    }

    console.log(`[byok] Migrating machine to BYOK mode (envUpdate=${needsEnvUpdate}, initClear=${needsInitClear})`);

    // Build updated config (FULL config — never partial!)
    const updatedConfig = { ...machine.config };
    updatedConfig.env = { ...env, BYOK_MODE: 'true' };
    delete updatedConfig.env.ANTHROPIC_BASE_URL;
    delete updatedConfig.env.ANTHROPIC_API_KEY;
    
    // Clear init.cmd so Docker ENTRYPOINT runs
    updatedConfig.init = {};

    // Always pull latest image (ensures BYOK entrypoint + CORS fixes are present)
    updatedConfig.image = 'registry.fly.io/automna-openclaw-image:latest';

    // Update machine (this triggers a restart with new image + env)
    const updateRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config: updatedConfig }),
    });

    if (!updateRes.ok) {
      console.error(`[byok] Failed to update machine: ${updateRes.status} ${await updateRes.text()}`);
      return false;
    }

    // Wait for machine to come back up (up to 90 seconds)
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const stateRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}`, {
        headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
      });
      if (stateRes.ok) {
        const state = await stateRes.json();
        if (state.state === 'started') {
          console.log(`[byok] Machine restarted in BYOK mode (took ~${(i + 1) * 5}s)`);
          return true;
        }
      }
    }

    console.warn('[byok] Machine restart timed out (90s), continuing anyway');
    return true; // Credentials are saved in DB, machine will pick them up eventually
  } catch (error) {
    console.error('[byok] Error migrating machine to BYOK mode:', error);
    return false;
  }
}

async function pushCredentialToMachine(
  appName: string,
  machineId: string,
  authProfilesJson: string
): Promise<boolean> {
  try {
    // Write auth-profiles.json via exec using base64 to avoid shell escaping issues
    const b64 = Buffer.from(authProfilesJson).toString('base64');
    const cmd = `mkdir -p /home/node/.openclaw/agents/main/agent && echo ${b64} | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json`;

    const execRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}/exec`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: ['sh', '-c', cmd] }),
    });

    if (!execRes.ok) {
      console.error(`[byok] Failed to write auth-profiles.json: ${execRes.status} ${await execRes.text()}`);
      return false;
    }

    // Signal gateway restart to pick up new credentials
    const restartRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}/exec`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: ['sh', '-c', 'PID=$(pgrep -f openclaw-gateway || pgrep -f entry.js); [ -n "$PID" ] && kill -USR1 $PID || echo "No gateway process found"'] }),
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

    // Strip ALL whitespace (spaces, newlines, tabs) that can sneak in from copy-paste
    // Tokens/keys should never contain whitespace, so this is safe
    const credential = rawCredential.replace(/\s+/g, '');

    // Detect type
    const type = detectCredentialType(credential);
    if (!type) {
      return NextResponse.json(
        { error: 'Invalid credential format. Must start with sk-ant-oat (setup token) or sk-ant-api (API key).' },
        { status: 400 }
      );
    }

    // Validate credential
    if (type === 'api_key') {
      // API keys: validate against Anthropic API
      const validation = await validateCredential(credential, type);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Credential validation failed. Please check that your key is active and valid.' },
          { status: 422 }
        );
      }
    } else if (type === 'setup_token') {
      // Setup tokens (sk-ant-oat) are OAuth access tokens scoped to Claude Code.
      // They can't call /v1/messages directly, so we validate format only.
      // Real tokens are 200+ chars, alphanumeric with hyphens/underscores.
      if (credential.length < 50) {
        return NextResponse.json(
          { error: 'Setup token is too short. Please copy the full token from Claude Code.' },
          { status: 422 }
        );
      }
      if (!/^sk-ant-oat[a-zA-Z0-9_-]+$/.test(credential)) {
        return NextResponse.json(
          { error: 'Setup token contains invalid characters. Please copy it again carefully.' },
          { status: 422 }
        );
      }
    }

    // Ensure user record exists (normally created by /api/user/sync from dashboard,
    // but user hits this route from /setup/connect before reaching dashboard)
    const clerkUser = await currentUser();
    await db.insert(users).values({
      id: userId,
      email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? null,
      name: clerkUser?.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : null,
    }).onConflictDoNothing();

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

    // Store choice in Clerk metadata so it persists before machine exists
    const byokProvider = type === 'setup_token' ? 'anthropic_oauth' : 'anthropic_api_key';
    const { clerkClient: getClerk } = await import('@clerk/nextjs/server');
    const client = await getClerk();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { byokChoice: byokProvider },
    });

    // Update machines table (may be 0 rows if machine not provisioned yet — that's OK)
    await db.update(machines)
      .set({ byokProvider, byokEnabled: 1, updatedAt: new Date() })
      .where(eq(machines.userId, userId));

    // Push to Fly machine if it exists
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    let pushedToMachine = false;
    if (machine?.appName) {
      // First, ensure the machine is in BYOK mode (sets env vars, clears init.cmd, restarts)
      const migrated = await ensureMachineByokMode(machine.appName, machine.id);
      console.log(`[byok] Machine migration: ${migrated ? 'success' : 'skipped/failed'}`);

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
      machineExists: !!machine,
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

    // If no machine yet, check Clerk metadata for pre-provision choice
    let type = machine?.byokProvider ?? null;
    let enabled = machine?.byokEnabled === 1;
    if (!machine) {
      const { currentUser } = await import('@clerk/nextjs/server');
      const user = await currentUser();
      const byokChoice = user?.publicMetadata?.byokChoice as string | undefined;
      if (byokChoice) {
        type = byokChoice;
        enabled = byokChoice !== 'proxy';
      }
    }

    return NextResponse.json({
      enabled,
      type,
      lastValidated: secret?.updatedAt ? new Date(secret.updatedAt).toISOString() : null,
      isProxy: type === 'proxy',
    });
  } catch (error) {
    console.error('[byok] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to check BYOK status' },
      { status: 500 }
    );
  }
}

/**
 * Revert a Fly machine from BYOK mode back to legacy proxy mode.
 * Removes BYOK_MODE env, sets ANTHROPIC_BASE_URL back to proxy,
 * deletes auth-profiles.json, and restarts with latest image.
 */
async function revertMachineToProxyMode(appName: string, machineId: string): Promise<boolean> {
  try {
    const getRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}`, {
      headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
    });
    if (!getRes.ok) {
      console.error(`[byok] Failed to get machine config for revert: ${getRes.status}`);
      return false;
    }

    const machine = await getRes.json();
    const env = { ...machine.config.env };

    // Remove BYOK mode, restore proxy URL + API key for proxy auth
    delete env.BYOK_MODE;
    const proxyUrl = env.AUTOMNA_PROXY_URL || 'https://automna-proxy.fly.dev';
    env.ANTHROPIC_BASE_URL = `${proxyUrl}/api/llm`;
    env.ANTHROPIC_API_KEY = env.OPENCLAW_GATEWAY_TOKEN; // Use gateway token for proxy auth

    const updatedConfig = { ...machine.config, env };
    updatedConfig.image = 'registry.fly.io/automna-openclaw-image:latest';

    // Delete auth-profiles.json before restart
    await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}/exec`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: ['sh', '-c', 'rm -f /home/node/.openclaw/agents/main/agent/auth-profiles.json'] }),
    });

    // Update machine (triggers restart with legacy entrypoint)
    const updateRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config: updatedConfig }),
    });

    if (!updateRes.ok) {
      console.error(`[byok] Failed to revert machine: ${updateRes.status} ${await updateRes.text()}`);
      return false;
    }

    // Wait for machine to come back
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const stateRes = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}`, {
        headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
      });
      if (stateRes.ok) {
        const state = await stateRes.json();
        if (state.state === 'started') {
          console.log(`[byok] Machine reverted to proxy mode (took ~${(i + 1) * 5}s)`);
          return true;
        }
      }
    }

    console.warn('[byok] Machine revert restart timed out (60s)');
    return true;
  } catch (error) {
    console.error('[byok] Error reverting machine to proxy mode:', error);
    return false;
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

    // Fall back to proxy mode (not null — null means legacy)
    const { clerkClient: getClerk } = await import('@clerk/nextjs/server');
    const client = await getClerk();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { byokChoice: 'proxy' },
    });

    // Update machines table — fall back to proxy, not null
    await db.update(machines)
      .set({ byokProvider: 'proxy', byokEnabled: 0, updatedAt: new Date() })
      .where(eq(machines.userId, userId));

    // Revert machine to proxy mode
    const machine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    let revertedMachine = false;
    if (machine?.appName) {
      revertedMachine = await revertMachineToProxyMode(machine.appName, machine.id);

      await db.insert(machineEvents).values({
        machineId: machine.id,
        eventType: 'byok_removed',
        details: JSON.stringify({ revertedMachine }),
      });
    }

    return NextResponse.json({ success: true, revertedMachine });
  } catch (error) {
    console.error('[byok] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to remove credential' },
      { status: 500 }
    );
  }
}
