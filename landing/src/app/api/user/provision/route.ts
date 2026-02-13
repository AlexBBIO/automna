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

import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, machineEvents, phoneNumbers, users, provisionStatus } from "@/lib/db/schema";
import Stripe from "stripe";
import { sendMachineReady } from "@/lib/email";
import { provisionPhoneNumber } from "@/lib/twilio";
import { importNumberToBland, configureInboundNumber } from "@/lib/bland";
import { canUsePhone, shouldSleepWhenIdle } from "@/lib/feature-gates";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
import { eq, and, ne } from "drizzle-orm";

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
  // Clean API key and project ID (Vercel env vars sometimes have trailing newlines)
  const apiKey = BROWSERBASE_API_KEY?.replace(/[\r\n]+$/, "");
  const projectId = BROWSERBASE_PROJECT_ID?.replace(/[\r\n]+$/, "");
  
  if (!apiKey || !projectId) {
    console.log("[provision] Browserbase not configured, skipping context creation");
    return null;
  }

  const response = await fetch("https://api.browserbase.com/v1/contexts", {
    method: "POST",
    headers: {
      "X-BB-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: projectId,
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
  // Clean the API key (Vercel env vars sometimes have trailing newlines)
  const apiKey = AGENTMAIL_API_KEY?.replace(/[\r\n]+$/, "");
  const domain = AGENTMAIL_DOMAIN?.replace(/[\r\n]+$/, "") || "agentmail.to";
  
  if (!apiKey) {
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
    if (domain !== "agentmail.to") {
      requestBody.domain = domain;
    }

    const response = await fetch("https://api.agentmail.to/v0/inboxes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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

/**
 * Provision a phone number for a user if they don't already have one.
 * This is a fallback — the Stripe webhook normally handles this,
 * but if it fails or fires late, provisioning catches it here.
 * Non-fatal: logs errors but doesn't block provisioning.
 */
async function ensurePhoneNumber(userId: string): Promise<string | null> {
  try {
    const existing = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.userId, userId),
    });

    if (existing) {
      console.log(`[provision] User ${userId} already has phone ${existing.phoneNumber}`);
      return existing.phoneNumber;
    }

    console.log(`[provision] Provisioning phone number for user ${userId}`);
    const { phoneNumber, sid } = await provisionPhoneNumber("725");

    const imported = await importNumberToBland(phoneNumber);

    if (imported) {
      await configureInboundNumber(phoneNumber, {
        prompt: `You are a helpful AI assistant. You answer phone calls on behalf of your user.
Be friendly, professional, and helpful. If someone is calling for the user, take a message 
including their name, what it's regarding, and a callback number. Keep responses concise and natural.`,
        firstSentence: "Hello, you've reached an AI assistant. How can I help you?",
      });
    }

    await db.insert(phoneNumbers).values({
      userId,
      phoneNumber,
      twilioSid: sid,
      blandImported: imported,
      agentName: "AI Assistant",
      voiceId: "6277266e-01eb-44c6-b965-438566ef7076",
      inboundPrompt: "You are a helpful AI assistant...",
      inboundFirstSentence: "Hello, you've reached an AI assistant. How can I help you?",
    });

    console.log(`[provision] Provisioned phone ${phoneNumber} for user ${userId}`);
    return phoneNumber;
  } catch (error) {
    console.error(`[provision] Failed to provision phone for ${userId}:`, error);
    return null;
  }
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
 * Strip trailing newlines from env vars (Vercel sometimes includes them)
 */
function cleanEnvValue(value: string | undefined): string {
  return (value || "").replace(/[\r\n]+$/, "");
}

// All BYOK machines are same size: 1 shared CPU, 2GB RAM

/**
 * Create and start a machine in the app
 */
async function createMachine(
  appName: string,
  volumeId: string,
  gatewayToken: string,
  browserbaseContextId: string | null,
  agentmailInboxId: string | null,
  plan: string = "starter"
): Promise<FlyMachine> {
  
  // Build env vars - only include integrations if configured
  // Note: cleanEnvValue strips trailing newlines that may be in Vercel env vars
  // 
  // API Proxy Authentication:
  // All external API calls are proxied through automna.ai to:
  // 1. Keep real API keys secure (only on Vercel, never on user machines)
  // 2. Enable usage logging and billing
  // 3. Apply rate limits
  //
  // User machines get gateway token as their "API key" for each service.
  // Proxies authenticate via gateway token, then forward with real keys.
  //
  // Proxied services:
  // - Anthropic: ANTHROPIC_BASE_URL + gateway token
  // - Gemini: GOOGLE_API_BASE_URL + gateway token  
  // - Browserbase: BROWSERBASE_API_URL + gateway token
  const env: Record<string, string> = {
    // Gateway auth
    OPENCLAW_GATEWAY_TOKEN: gatewayToken,
    
    // BYOK mode - user provides their own Claude credentials
    BYOK_MODE: "true",
    
    // Proxy URL (entrypoint reads this to configure clawdbot.json)
    AUTOMNA_PROXY_URL: "https://automna-proxy.fly.dev",

    // No ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL - BYOK handles this via auth-profiles.json
    
    // Gemini proxy
    GEMINI_API_KEY: gatewayToken,
    GOOGLE_API_KEY: gatewayToken,  // Some SDKs use this
    GOOGLE_API_BASE_URL: "https://automna-proxy.fly.dev/api/gemini",
    
    // Browserbase proxy
    BROWSERBASE_API_KEY: gatewayToken,
    BROWSERBASE_API_URL: "https://automna-proxy.fly.dev/api/browserbase",
    
    // Brave Search proxy
    BRAVE_API_KEY: gatewayToken,
    BRAVE_API_URL: "https://automna-proxy.fly.dev/api/brave",
  };
  
  // Add Browserbase context if available (for persistent browser sessions)
  if (BROWSERBASE_PROJECT_ID) {
    env.BROWSERBASE_PROJECT_ID = cleanEnvValue(BROWSERBASE_PROJECT_ID);
  }
  if (browserbaseContextId) {
    env.BROWSERBASE_CONTEXT_ID = browserbaseContextId;
  }

  // Add Agentmail inbox ID (agents use our proxy API for sending, not direct Agentmail)
  if (agentmailInboxId) {
    env.AGENTMAIL_INBOX_ID = agentmailInboxId;
    // Note: AGENTMAIL_API_KEY intentionally NOT passed to enforce rate limits via our proxy
  }

  // Determine if machine should sleep when idle (starter/free plans)
  const sleepEnabled = shouldSleepWhenIdle(plan);

  const config: Record<string, unknown> = {
    image: OPENCLAW_IMAGE,
    guest: {
      cpu_kind: "shared",
      cpus: 1,
      memory_mb: 2048,
    },
    // Let the Docker ENTRYPOINT handle startup (automna-entrypoint.sh)
    // The entrypoint manages config merging, BYOK mode, Caddy proxy, etc.
    // Gateway token is passed via OPENCLAW_GATEWAY_TOKEN env var
    init: {},
    services: [
      {
        ports: [
          { port: 443, handlers: ["tls", "http"] },
          { port: 80, handlers: ["http"] },
        ],
        protocol: "tcp",
        internal_port: 18789,
        // Auto-start: Fly proxy holds incoming requests and boots the machine
        auto_start: true,
        // Auto-stop: machine stops after idle period (no active connections)
        // Only enabled for plans with sleepWhenIdle (starter, free)
        auto_stop: sleepEnabled ? "stop" : "off",
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
    // Handle orphaned machines: if a machine named "openclaw" already exists
    // (e.g., DB record was deleted but Fly machine wasn't), reuse it
    if (error.includes("already_exists")) {
      console.log(`[provision] Machine already exists in ${appName}, reusing...`);
      const listResp = await fetch(`${FLY_API_BASE}/apps/${appName}/machines`, {
        headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
      });
      if (listResp.ok) {
        const machines = await listResp.json();
        const existing = machines.find((m: FlyMachine) => m.name === "openclaw");
        if (existing) {
          // If stopped, start it
          if (existing.state === "stopped") {
            await fetch(`${FLY_API_BASE}/apps/${appName}/machines/${existing.id}/start`, {
              method: "POST",
              headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
            });
          }
          return existing;
        }
      }
    }
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

    // Check subscription status - require active subscription before provisioning
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const stripeCustomerId = user.publicMetadata?.stripeCustomerId as string | undefined;
    const subscriptionStatus = user.publicMetadata?.subscriptionStatus as string | undefined;
    
    // Allow if user has active/trialing subscription status cached in Clerk
    // OR verify directly with Stripe if they have a customer ID
    let hasActiveSubscription = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    
    if (!hasActiveSubscription && stripeCustomerId) {
      // Double-check with Stripe in case webhook hasn't fired yet
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "active",
        limit: 1,
      });
      hasActiveSubscription = subscriptions.data.length > 0;
    }
    
    if (!hasActiveSubscription) {
      return NextResponse.json(
        { error: "subscription_required", message: "Active subscription required to use Automna" },
        { status: 402 }
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
        
        // Ensure phone number exists for pro/power plans
        if (canUsePhone(existingMachine.plan || 'starter')) {
          ensurePhoneNumber(userId).catch((err) =>
            console.error("[provision] Background phone provision failed:", err)
          );
        }
        
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
        
        // Ensure phone number exists for pro/power plans
        if (canUsePhone(existingMachine.plan || 'starter')) {
          ensurePhoneNumber(userId).catch((err) =>
            console.error("[provision] Background phone provision failed:", err)
          );
        }
        
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

    // ========================================
    // DUPLICATE EMAIL GUARD
    // ========================================
    // Prevent creating a second machine for the same email address.
    // This happens when Clerk creates a new user ID for an existing email
    // (e.g., user signs in with a different auth method like Google vs email/password).
    // Without this check, each Clerk ID gets its own machine, wasting resources.
    const primaryEmail = user.emailAddresses?.[0]?.emailAddress;
    if (primaryEmail) {
      const existingUserWithEmail = await db
        .select({
          userId: users.id,
          machineId: machines.id,
          appName: machines.appName,
        })
        .from(users)
        .innerJoin(machines, eq(machines.userId, users.id))
        .where(
          and(
            eq(users.email, primaryEmail),
            ne(users.id, userId) // Different Clerk ID, same email
          )
        )
        .limit(1);

      if (existingUserWithEmail.length > 0) {
        const existing = existingUserWithEmail[0];
        console.error(
          `[provision] DUPLICATE EMAIL BLOCKED: ${primaryEmail} already has machine ${existing.appName} ` +
          `under user ${existing.userId}. Current Clerk ID: ${userId}. ` +
          `User likely signed in with a different auth method creating a second Clerk account.`
        );
        return NextResponse.json(
          {
            error: "duplicate_account",
            message: "An account with this email already exists. Please sign in with your original method, or contact support.",
          },
          { status: 409 }
        );
      }
    }

    // Determine user's plan for resource allocation
    // Check Clerk metadata first, but also verify with Stripe to handle the race
    // condition where the user just completed checkout but the webhook hasn't
    // updated Clerk yet. This prevented Bobby (and would prevent future Pro users)
    // from being provisioned with the wrong plan.
    let userPlan = (user.publicMetadata?.plan as string) || "starter";
    
    if (userPlan === "starter" && stripeCustomerId) {
      // User has a Stripe customer ID but shows as starter — check Stripe directly
      // in case the webhook hasn't updated Clerk metadata yet
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: "active",
          limit: 1,
          expand: ["data.items.data.price"],
        });
        
        if (subscriptions.data.length > 0) {
          const sub = subscriptions.data[0];
          const priceId = sub.items.data[0]?.price?.id;
          
          // Map Stripe price ID to plan name
          const priceIdToPlan: Record<string, string> = {};
          // BYOK tier prices
          if (process.env.STRIPE_PRICE_STARTER_BYOK) priceIdToPlan[process.env.STRIPE_PRICE_STARTER_BYOK] = "starter";
          if (process.env.STRIPE_PRICE_PRO_BYOK) priceIdToPlan[process.env.STRIPE_PRICE_PRO_BYOK] = "pro";
          if (process.env.STRIPE_PRICE_POWER_BYOK) priceIdToPlan[process.env.STRIPE_PRICE_POWER_BYOK] = "power";
          // Legacy prices (for existing subscribers during transition)
          if (process.env.STRIPE_PRICE_LITE) priceIdToPlan[process.env.STRIPE_PRICE_LITE] = "starter";
          if (process.env.STRIPE_PRICE_STARTER) priceIdToPlan[process.env.STRIPE_PRICE_STARTER] = "starter";
          if (process.env.STRIPE_PRICE_PRO) priceIdToPlan[process.env.STRIPE_PRICE_PRO] = "pro";
          if (process.env.STRIPE_PRICE_BUSINESS) priceIdToPlan[process.env.STRIPE_PRICE_BUSINESS] = "power";
          
          const stripePlan = priceId ? priceIdToPlan[priceId] : null;
          
          if (stripePlan && stripePlan !== "starter") {
            console.log(`[provision] Clerk shows '${userPlan}' but Stripe shows '${stripePlan}' — using Stripe (webhook race condition)`);
            userPlan = stripePlan;
            
            // Also fix Clerk metadata so it's correct going forward
            const client = await clerkClient();
            await client.users.updateUserMetadata(userId, {
              publicMetadata: {
                plan: stripePlan,
                stripeCustomerId,
                stripeSubscriptionId: sub.id,
                subscriptionStatus: "active",
              },
            }).catch((err: Error) => console.warn(`[provision] Failed to fix Clerk metadata:`, err));
          }
        }
      } catch (err) {
        console.warn(`[provision] Stripe plan check failed, using Clerk value '${userPlan}':`, err);
      }
    }

    // Create new app + machine for user
    const shortId = shortUserId(userId);
    const appName = `automna-u-${shortId}`;
    
    console.log(`[provision] Creating new app ${appName} for user ${userId} (plan: ${userPlan}, BYOK mode)`);

    // Helper to write provisioning status (non-fatal if it fails)
    const setStatus = async (status: string, error?: string) => {
      try {
        await db.insert(provisionStatus).values({
          userId,
          status,
          error: error || null,
          startedAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: provisionStatus.userId,
          set: { status, error: error || null, updatedAt: new Date() },
        });
      } catch (err) {
        console.warn(`[provision] Failed to write status '${status}':`, err);
      }
    };

    // Insert initial provisioning status
    await setStatus("creating_app");

    // Get org ID for app creation
    const orgId = await getPersonalOrgId();
    console.log(`[provision] Using org ID: ${orgId}`);

    // Step 1: Create app (if doesn't exist)
    if (!(await appExists(appName))) {
      console.log(`[provision] Creating Fly app: ${appName}`);
      await createApp(appName, orgId);
      
      // Step 1b: Allocate public IPs for DNS resolution
      await setStatus("allocating_ips");
      console.log(`[provision] Allocating IPs for ${appName}`);
      await allocateIps(appName);
    } else {
      console.log(`[provision] App ${appName} already exists`);
    }

    // Step 2: Create volume, Browserbase context, and Agentmail inbox in parallel
    await setStatus("creating_integrations");
    const gatewayToken = crypto.randomUUID();
    console.log(`[provision] Creating volume and integrations for ${appName}`);
    const [volume, browserbaseContextId, agentmailInboxId] = await Promise.all([
      createVolume(appName),
      createBrowserbaseContext(),
      createAgentmailInbox(shortId),
    ]);

    // Step 3: Create machine (env vars passed directly, no Fly secrets needed)
    await setStatus("creating_machine");
    console.log(`[provision] Creating machine for ${appName}`);
    const machine = await createMachine(appName, volume.id, gatewayToken, browserbaseContextId, agentmailInboxId, userPlan);

    // Step 4: Wait for Fly machine to be ready
    await setStatus("starting");
    console.log(`[provision] Waiting for machine ${machine.id} to start`);
    const readyMachine = await waitForMachine(appName, machine.id);

    // Machine is started but OpenClaw may not be listening yet.
    // Set status to waiting_for_gateway - the status endpoint will do live
    // health checks and upgrade to "ready" when the gateway responds.
    await setStatus("waiting_for_gateway");
    console.log(`[provision] Machine started, gateway warming up...`);

    // Step 5: Store in database
    // Note: Heartbeat config is handled by the Docker image on first boot
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
      plan: userPlan,
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

    // Don't set "ready" here - the status endpoint does a live health check
    // and will upgrade waiting_for_gateway → ready when OpenClaw responds
    console.log(`[provision] Successfully created ${appName} with machine ${machine.id}`);

    // Ensure phone number exists for pro/power plans
    const phoneNumber = canUsePhone(userPlan) ? await ensurePhoneNumber(userId) : null;

    // Send machine ready email (non-blocking)
    const userEmail = user.emailAddresses?.[0]?.emailAddress;
    if (userEmail && agentmailInboxId) {
      sendMachineReady(
        userEmail,
        agentmailInboxId,
        user.firstName || undefined,
        phoneNumber || null
      ).catch((err) => console.error("[provision] Failed to send machine ready email:", err));
    }

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
    // Write error status (best-effort, userId may not be available if auth failed)
    try {
      const { userId: errUserId } = await auth();
      if (errUserId) {
        await db.insert(provisionStatus).values({
          userId: errUserId,
          status: "error",
          error: error instanceof Error ? error.message : "Provisioning failed",
          startedAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: provisionStatus.userId,
          set: {
            status: "error",
            error: error instanceof Error ? error.message : "Provisioning failed",
            updatedAt: new Date(),
          },
        });
      }
    } catch {
      // Ignore - best effort
    }
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
