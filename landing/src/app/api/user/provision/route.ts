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
// Use our custom Automna OpenClaw image with session key fix
// Falls back to community image if not set
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || "registry.fly.io/automna-openclaw-image:latest";

// Browserbase config for persistent browser sessions
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

// Agentmail config for email capabilities
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;
const AGENTMAIL_DOMAIN = process.env.AGENTMAIL_DOMAIN || "agentmail.to"; // Custom domain support

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

/**
 * Create a Browserbase context for persistent browser sessions
 * Each user gets their own context so cookies/logins persist and are isolated
 */
async function createBrowserbaseContext(): Promise<string | null> {
  if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
    console.log("[provision] Browserbase not configured, skipping context creation");
    return null;
  }

  const response = await fetch("https://api.browserbase.com/v1/contexts", {
    method: "POST",
    headers: {
      "X-BB-API-Key": BROWSERBASE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: BROWSERBASE_PROJECT_ID,
    }),
  });

  if (!response.ok) {
    console.error("[provision] Failed to create Browserbase context:", await response.text());
    return null; // Non-fatal - user can still use the bot without browser
  }

  const data = await response.json();
  console.log(`[provision] Created Browserbase context: ${data.id}`);
  return data.id;
}

// Word lists for friendly email usernames
const ADJECTIVES = [
  "happy", "swift", "clever", "bright", "calm", "bold", "warm", "cool", "wild", "gentle",
  "quick", "smart", "brave", "kind", "wise", "keen", "fair", "true", "free", "glad",
  "crisp", "fresh", "vivid", "eager", "noble", "proud", "sweet", "merry", "lively", "jolly",
  "cosmic", "stellar", "lunar", "solar", "misty", "foggy", "sunny", "breezy", "stormy", "snowy",
  "golden", "silver", "copper", "bronze", "crystal", "velvet", "silk", "satin", "cotton", "linen",
  "ancient", "mystic", "hidden", "secret", "silent", "peaceful", "tranquil", "serene", "graceful", "elegant"
];

const NOUNS = [
  "fox", "owl", "wolf", "bear", "deer", "hawk", "crow", "swan", "dove", "hare",
  "oak", "pine", "maple", "cedar", "birch", "willow", "aspen", "elm", "ash", "spruce",
  "moon", "star", "sun", "cloud", "wind", "rain", "snow", "storm", "wave", "stream",
  "stone", "river", "lake", "hill", "vale", "glen", "grove", "meadow", "field", "path",
  "flame", "spark", "ember", "glow", "flash", "beam", "ray", "gleam", "shimmer", "glint",
  "dream", "wish", "hope", "dawn", "dusk", "mist", "shade", "echo", "whisper", "song"
];

/**
 * Generate a friendly username like "swiftfox" or "calmriver"
 * No numbers for cleaner look - collisions handled by retry
 */
function generateFriendlyUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}

/**
 * Create an Agentmail inbox for email capabilities
 * Each user gets a friendly email like swiftfox@mail.automna.ai
 * Retries with number suffix if name is taken
 */
async function createAgentmailInbox(shortId: string): Promise<string | null> {
  if (!AGENTMAIL_API_KEY) {
    console.log("[provision] Agentmail not configured, skipping inbox creation");
    return null;
  }

  // Try up to 5 times with different usernames
  for (let attempt = 0; attempt < 5; attempt++) {
    const baseUsername = generateFriendlyUsername();
    // First attempt: no number. Subsequent: add number
    const username = attempt === 0 ? baseUsername : `${baseUsername}${attempt}`;
    
    const requestBody: Record<string, string> = {
      username,
      display_name: `Automna Agent`,
    };
    
    // Use custom domain if configured (domain must be verified with Agentmail first)
    if (AGENTMAIL_DOMAIN !== "agentmail.to") {
      requestBody.domain = AGENTMAIL_DOMAIN;
    }

    const response = await fetch("https://api.agentmail.to/v0/inboxes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AGENTMAIL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[provision] Created Agentmail inbox: ${data.inbox_id}`);
      return data.inbox_id;
    }

    const errorText = await response.text();
    // If it's a collision error, retry with different name
    if (errorText.includes("already exists") || errorText.includes("taken")) {
      console.log(`[provision] Username ${username} taken, retrying...`);
      continue;
    }
    
    // Other error - give up
    console.error("[provision] Failed to create Agentmail inbox:", errorText);
    return null;
  }

  console.error("[provision] Failed to create Agentmail inbox after 5 attempts");
  return null;
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
 * Allocate public IP addresses for a Fly app
 * Needed for the app to be accessible via appname.fly.dev
 */
async function allocateIps(appName: string): Promise<void> {
  // Allocate shared IPv4 (free, returns null but still works)
  const v4Response = await fetch("https://api.fly.io/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        mutation($input: AllocateIPAddressInput!) {
          allocateIpAddress(input: $input) {
            ipAddress { id address type }
          }
        }
      `,
      variables: {
        input: { appId: appName, type: "shared_v4" },
      },
    }),
  });
  const v4Data = await v4Response.json();
  if (v4Data.errors) {
    console.warn(`[provision] IPv4 allocation warning:`, v4Data.errors);
  }

  // Allocate IPv6 (free, dedicated)
  const v6Response = await fetch("https://api.fly.io/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        mutation($input: AllocateIPAddressInput!) {
          allocateIpAddress(input: $input) {
            ipAddress { id address type }
          }
        }
      `,
      variables: {
        input: { appId: appName, type: "v6" },
      },
    }),
  });
  const v6Data = await v6Response.json();
  if (v6Data.errors) {
    console.warn(`[provision] IPv6 allocation warning:`, v6Data.errors);
  }

  console.log(`[provision] IPs allocated for ${appName}`);
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
 * Build the gateway start command
 * 
 * Note: The phioranex image doesn't support shell scripts in init.cmd
 * (it wraps everything in node /app/dist/index.js). We handle the session
 * key mismatch in our API layer instead.
 */
function buildInitCommand(gatewayToken: string): string[] {
  // Simple command - just start the gateway with required flags
  // --allow-unconfigured: allows starting without config file
  // --bind lan: allows external connections (beyond loopback)
  // --auth token: use simple token auth
  // --token: the authentication token
  return ["gateway", "--allow-unconfigured", "--bind", "lan", "--auth", "token", "--token", gatewayToken];
}

/**
 * Create and start a machine in the app
 */
async function createMachine(
  appName: string,
  volumeId: string,
  gatewayToken: string,
  browserbaseContextId: string | null,
  agentmailInboxId: string | null
): Promise<FlyMachine> {
  
  // Build env vars - only include integrations if configured
  const env: Record<string, string> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
    OPENCLAW_GATEWAY_TOKEN: gatewayToken,
  };
  
  // Add Browserbase config if available
  if (BROWSERBASE_API_KEY && BROWSERBASE_PROJECT_ID) {
    env.BROWSERBASE_API_KEY = BROWSERBASE_API_KEY;
    env.BROWSERBASE_PROJECT_ID = BROWSERBASE_PROJECT_ID;
    if (browserbaseContextId) {
      env.BROWSERBASE_CONTEXT_ID = browserbaseContextId;
    }
  }

  // Add Agentmail inbox ID (agents use our proxy API for sending, not direct Agentmail)
  if (agentmailInboxId) {
    env.AGENTMAIL_INBOX_ID = agentmailInboxId;
    // Note: AGENTMAIL_API_KEY intentionally NOT passed to enforce rate limits via our proxy
  }

  const config = {
    image: OPENCLAW_IMAGE,
    guest: {
      cpu_kind: "shared",
      cpus: 1,
      memory_mb: 2048,
    },
    // Initialize session structure with canonical key, then start gateway
    // This fixes the session key mismatch bug where "main" != "agent:main:main"
    init: {
      cmd: buildInitCommand(gatewayToken),
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
    env,
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
      
      // Step 1b: Allocate public IPs for DNS resolution
      console.log(`[provision] Allocating IPs for ${appName}`);
      await allocateIps(appName);
    } else {
      console.log(`[provision] App ${appName} already exists`);
    }

    // Step 2: Create volume, Browserbase context, and Agentmail inbox in parallel
    const gatewayToken = crypto.randomUUID();
    console.log(`[provision] Creating volume and integrations for ${appName}`);
    const [volume, browserbaseContextId, agentmailInboxId] = await Promise.all([
      createVolume(appName),
      createBrowserbaseContext(),
      createAgentmailInbox(shortId),
    ]);

    // Step 3: Create machine (env vars passed directly, no Fly secrets needed)
    console.log(`[provision] Creating machine for ${appName}`);
    const machine = await createMachine(appName, volume.id, gatewayToken, browserbaseContextId, agentmailInboxId);

    // Step 4: Wait for machine to be ready
    console.log(`[provision] Waiting for machine ${machine.id} to start`);
    const readyMachine = await waitForMachine(appName, machine.id);

    // Step 5: Store in database
    await db.insert(machines).values({
      id: machine.id,
      userId,
      appName,
      region: FLY_REGION,
      volumeId: volume.id,
      status: "started",
      ipAddress: readyMachine.private_ip,
      gatewayToken,
      browserbaseContextId,
      agentmailInboxId,
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
