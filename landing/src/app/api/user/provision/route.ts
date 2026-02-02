/**
 * User Machine Provisioning API
 * 
 * Creates a dedicated Fly.io app + machine for each user.
 * Each user gets their own isolated environment with:
 * - Dedicated Fly app (automna-u-{shortId})
 * - Persistent volume for data
 * - Running OpenClaw instance
 * 
 * This provides true user isolation - each user connects to their own
 * fly.dev URL with no shared state.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, machineEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_ORG_ID = process.env.FLY_ORG_ID; // Must be the actual org ID, not slug
const FLY_REGION = process.env.FLY_REGION || "sjc";
const FLY_API_BASE = "https://api.machines.dev/v1";
// Use community OpenClaw image from GHCR
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || "ghcr.io/phioranex/openclaw-docker:latest";

/**
 * Get the personal organization ID from Fly API
 */
async function getPersonalOrgId(): Promise<string> {
  if (FLY_ORG_ID) return FLY_ORG_ID;
  
  const response = await fetch("https://api.fly.io/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "{ personalOrganization { id } }",
    }),
  });
  
  const data = await response.json();
  if (data.errors) {
    throw new Error(`Failed to get org ID: ${JSON.stringify(data.errors)}`);
  }
  return data.data.personalOrganization.id;
}

interface FlyApp {
  id: string;
  name: string;
  organization: { slug: string };
}

interface FlyMachine {
  id: string;
  name: string;
  state: string;
  region: string;
  private_ip: string;
}

interface FlyVolume {
  id: string;
  name: string;
  state: string;
  region: string;
  size_gb: number;
}

/**
 * Generate a short, URL-safe ID from Clerk userId
 * Clerk IDs are like "user_2abc123def456" - we take the last 12 chars
 */
function shortUserId(clerkId: string): string {
  // Remove "user_" prefix and take last 12 chars (or all if shorter)
  const clean = clerkId.replace("user_", "");
  return clean.slice(-12).toLowerCase();
}

/**
 * Create a new Fly app for the user
 */
async function createApp(appName: string, orgId: string): Promise<FlyApp> {
  const response = await fetch("https://api.fly.io/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        mutation($input: CreateAppInput!) {
          createApp(input: $input) {
            app {
              id
              name
              organization { slug }
            }
          }
        }
      `,
      variables: {
        input: {
          name: appName,
          organizationId: orgId,
        },
      },
    }),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Failed to create app: ${JSON.stringify(data.errors)}`);
  }
  return data.data.createApp.app;
}

/**
 * Set secrets for a Fly app
 */
async function setAppSecrets(appName: string, secrets: Record<string, string>): Promise<void> {
  const response = await fetch("https://api.fly.io/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        mutation($input: SetSecretsInput!) {
          setSecrets(input: $input) {
            app { id }
          }
        }
      `,
      variables: {
        input: {
          appId: appName,
          secrets: Object.entries(secrets).map(([key, value]) => ({ key, value })),
        },
      },
    }),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Failed to set secrets: ${JSON.stringify(data.errors)}`);
  }
}

/**
 * Create a volume in the app
 */
async function createVolume(appName: string): Promise<FlyVolume> {
  const response = await fetch(`${FLY_API_BASE}/apps/${appName}/volumes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "openclaw_data",
      region: FLY_REGION,
      size_gb: 1,
      encrypted: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create volume: ${error}`);
  }

  return response.json();
}

/**
 * Create and start a machine in the app
 */
async function createMachine(appName: string, volumeId: string): Promise<FlyMachine> {
  const gatewayToken = process.env.FLY_GATEWAY_TOKEN || crypto.randomUUID();
  
  const config = {
    image: OPENCLAW_IMAGE,
    guest: {
      cpu_kind: "shared",
      cpus: 1,
      memory_mb: 2048,
    },
    // Command to start the gateway with required config
    // --allow-unconfigured: allows starting without config file
    // --bind lan: allows external connections (beyond loopback)
    // --token: authentication token for WebSocket connections
    init: {
      cmd: ["gateway", "--allow-unconfigured", "--bind", "lan", "--token", gatewayToken],
    },
    services: [
      {
        ports: [
          { port: 443, handlers: ["tls", "http"] },
          { port: 80, handlers: ["http"] },
        ],
        protocol: "tcp",
        internal_port: 18789,
      },
    ],
    env: {
      // Keep env vars as backup (some OpenClaw features may use them)
      OPENCLAW_GATEWAY_TOKEN: gatewayToken,
    },
    mounts: [
      {
        volume: volumeId,
        path: "/home/node/.openclaw",
      },
    ],
  };

  const response = await fetch(`${FLY_API_BASE}/apps/${appName}/machines`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "openclaw",
      region: FLY_REGION,
      config,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create machine: ${error}`);
  }

  return response.json();
}

/**
 * Get machine status
 */
async function getMachineStatus(appName: string, machineId: string): Promise<FlyMachine | null> {
  const response = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}`, {
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get machine status: ${error}`);
  }

  return response.json();
}

/**
 * Start a stopped machine
 */
async function startMachine(appName: string, machineId: string): Promise<void> {
  const response = await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${machineId}/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start machine: ${error}`);
  }
}

/**
 * Wait for machine to be ready
 */
async function waitForMachine(appName: string, machineId: string, timeoutMs = 120000): Promise<FlyMachine> {
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    const machine = await getMachineStatus(appName, machineId);
    
    if (machine && machine.state === "started") {
      return machine;
    }
    
    await new Promise((r) => setTimeout(r, 3000));
  }
  
  throw new Error("Timeout waiting for machine to start");
}

/**
 * Check if an app exists
 */
async function appExists(appName: string): Promise<boolean> {
  const response = await fetch(`${FLY_API_BASE}/apps/${appName}`, {
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
    },
  });
  return response.ok;
}

export async function POST() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!FLY_API_TOKEN) {
      return NextResponse.json(
        { error: "Fly API token not configured" },
        { status: 500 }
      );
    }

    // Check if user already has a machine record
    const existingMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (existingMachine && existingMachine.appName) {
      // User has an app - check if machine is running
      const flyMachine = await getMachineStatus(existingMachine.appName, existingMachine.id);
      
      if (!flyMachine) {
        // Machine was deleted, clean up and recreate
        console.log(`[provision] Machine ${existingMachine.id} not found, will recreate`);
        await db.delete(machines).where(eq(machines.id, existingMachine.id));
      } else if (flyMachine.state === "stopped") {
        // Start the stopped machine
        console.log(`[provision] Starting stopped machine ${existingMachine.id}`);
        await startMachine(existingMachine.appName, existingMachine.id);
        const startedMachine = await waitForMachine(existingMachine.appName, existingMachine.id);
        
        await db.insert(machineEvents).values({
          machineId: existingMachine.id,
          eventType: "started",
          details: JSON.stringify({ triggeredBy: "provision-api" }),
        });
        
        await db.update(machines)
          .set({ 
            lastActiveAt: new Date(),
            status: "started",
            ipAddress: startedMachine.private_ip,
          })
          .where(eq(machines.id, existingMachine.id));
        
        return NextResponse.json({
          appName: existingMachine.appName,
          machineId: existingMachine.id,
          status: "started",
          gatewayUrl: `wss://${existingMachine.appName}.fly.dev/ws`,
          region: startedMachine.region,
          created: false,
        });
      } else {
        // Machine exists and is running
        console.log(`[provision] Machine ${existingMachine.id} already running`);
        return NextResponse.json({
          appName: existingMachine.appName,
          machineId: existingMachine.id,
          status: flyMachine.state,
          gatewayUrl: `wss://${existingMachine.appName}.fly.dev/ws`,
          region: flyMachine.region,
          created: false,
        });
      }
    }

    // Create new app + machine for user
    const shortId = shortUserId(userId);
    const appName = `automna-u-${shortId}`;
    
    console.log(`[provision] Creating new app ${appName} for user ${userId}`);

    // Get org ID for app creation
    const orgId = await getPersonalOrgId();
    console.log(`[provision] Using org ID: ${orgId}`);

    // Step 1: Create app (if doesn't exist)
    if (!(await appExists(appName))) {
      console.log(`[provision] Creating Fly app: ${appName}`);
      await createApp(appName, orgId);
    } else {
      console.log(`[provision] App ${appName} already exists`);
    }

    // Step 2: Set secrets
    const gatewayToken = crypto.randomUUID();
    console.log(`[provision] Setting secrets for ${appName}`);
    await setAppSecrets(appName, {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
      OPENCLAW_GATEWAY_TOKEN: gatewayToken,
    });

    // Step 3: Create volume
    console.log(`[provision] Creating volume for ${appName}`);
    const volume = await createVolume(appName);

    // Step 4: Create machine
    console.log(`[provision] Creating machine for ${appName}`);
    const machine = await createMachine(appName, volume.id);

    // Step 5: Wait for machine to be ready
    console.log(`[provision] Waiting for machine ${machine.id} to start`);
    const readyMachine = await waitForMachine(appName, machine.id);

    // Step 6: Store in database
    await db.insert(machines).values({
      id: machine.id,
      userId,
      appName,
      region: FLY_REGION,
      volumeId: volume.id,
      status: "started",
      ipAddress: readyMachine.private_ip,
      gatewayToken,
      lastActiveAt: new Date(),
    });

    await db.insert(machineEvents).values({
      machineId: machine.id,
      eventType: "created",
      details: JSON.stringify({
        appName,
        volumeId: volume.id,
        region: FLY_REGION,
      }),
    });

    console.log(`[provision] Successfully created ${appName} with machine ${machine.id}`);

    return NextResponse.json({
      appName,
      machineId: machine.id,
      volumeId: volume.id,
      status: "started",
      gatewayUrl: `wss://${appName}.fly.dev/ws`,
      region: FLY_REGION,
      created: true,
    });
  } catch (error) {
    console.error("[provision] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Provisioning failed" },
      { status: 500 }
    );
  }
}

// GET: Check if user has a machine
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (!existingMachine || !existingMachine.appName) {
      return NextResponse.json({ hasMachine: false });
    }

    // Check current status
    const flyMachine = await getMachineStatus(existingMachine.appName, existingMachine.id);
    
    if (!flyMachine) {
      // Machine was deleted externally
      await db.delete(machines).where(eq(machines.id, existingMachine.id));
      return NextResponse.json({ hasMachine: false });
    }

    return NextResponse.json({
      hasMachine: true,
      appName: existingMachine.appName,
      machineId: existingMachine.id,
      status: flyMachine.state,
      gatewayUrl: `wss://${existingMachine.appName}.fly.dev/ws`,
      region: flyMachine.region,
      volumeId: existingMachine.volumeId,
    });
  } catch (error) {
    console.error("[provision] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Check failed" },
      { status: 500 }
    );
  }
}
