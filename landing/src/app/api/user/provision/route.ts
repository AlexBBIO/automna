/**
 * User Machine Provisioning API
 * 
 * Creates a Fly.io machine for a user if they don't have one.
 * Stores machine info in Turso database.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { machines, machineEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_APP_NAME = process.env.FLY_APP_NAME || "automna-gateway";
const FLY_REGION = process.env.FLY_REGION || "sjc";
const FLY_API_BASE = "https://api.machines.dev/v1";

// Machine configuration
const MACHINE_CONFIG = {
  image: "registry.fly.io/automna-gateway:latest",
  guest: {
    cpu_kind: "shared",
    cpus: 1,
    memory_mb: 2048,
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
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    MOLTBOT_GATEWAY_TOKEN: process.env.FLY_GATEWAY_TOKEN || "",
  },
};

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

// Create a Fly volume for the user
async function createVolume(userId: string): Promise<FlyVolume> {
  const volumeName = `data-${userId.replace("user_", "").substring(0, 20)}`;
  
  const response = await fetch(`${FLY_API_BASE}/apps/${FLY_APP_NAME}/volumes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: volumeName,
      region: FLY_REGION,
      size_gb: 1, // Start with 1GB
      encrypted: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create volume: ${error}`);
  }

  return response.json();
}

// Create a Fly machine for the user
async function createMachine(userId: string, volumeId: string): Promise<FlyMachine> {
  const machineName = `user-${userId.replace("user_", "").substring(0, 20)}`;
  
  const config = {
    ...MACHINE_CONFIG,
    env: {
      ...MACHINE_CONFIG.env,
      MOLTBOT_USER_ID: userId,
    },
    mounts: [
      {
        volume: volumeId,
        path: "/data",
      },
    ],
  };

  const response = await fetch(`${FLY_API_BASE}/apps/${FLY_APP_NAME}/machines`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: machineName,
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

// Start a stopped machine
async function startMachine(machineId: string): Promise<void> {
  const response = await fetch(
    `${FLY_API_BASE}/apps/${FLY_APP_NAME}/machines/${machineId}/start`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start machine: ${error}`);
  }
}

// Get machine status
async function getMachineStatus(machineId: string): Promise<FlyMachine | null> {
  const response = await fetch(
    `${FLY_API_BASE}/apps/${FLY_APP_NAME}/machines/${machineId}`,
    {
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get machine status: ${error}`);
  }

  return response.json();
}

// Wait for machine to be ready
async function waitForMachine(machineId: string, timeoutMs = 60000): Promise<FlyMachine> {
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    const machine = await getMachineStatus(machineId);
    
    if (machine && machine.state === "started") {
      return machine;
    }
    
    // Wait 2 seconds before checking again
    await new Promise((r) => setTimeout(r, 2000));
  }
  
  throw new Error("Timeout waiting for machine to start");
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

    // Check if user already has a machine
    const existingMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });

    if (existingMachine) {
      // Check if machine still exists and is running
      const flyMachine = await getMachineStatus(existingMachine.id);
      
      if (!flyMachine) {
        // Machine was deleted externally, clean up database
        await db.delete(machines).where(eq(machines.id, existingMachine.id));
        // Fall through to create new machine
      } else if (flyMachine.state === "stopped") {
        // Start the stopped machine
        await startMachine(existingMachine.id);
        const startedMachine = await waitForMachine(existingMachine.id);
        
        // Log event
        await db.insert(machineEvents).values({
          machineId: existingMachine.id,
          eventType: "started",
          details: JSON.stringify({ triggeredBy: "provision-api" }),
        });
        
        // Update last active
        await db
          .update(machines)
          .set({ 
            lastActiveAt: new Date(),
            status: "started",
            ipAddress: startedMachine.private_ip,
          })
          .where(eq(machines.id, existingMachine.id));
        
        return NextResponse.json({
          machineId: existingMachine.id,
          status: "started",
          ipAddress: startedMachine.private_ip,
          region: startedMachine.region,
          created: false,
        });
      } else {
        // Machine exists and is running
        return NextResponse.json({
          machineId: existingMachine.id,
          status: flyMachine.state,
          ipAddress: flyMachine.private_ip,
          region: flyMachine.region,
          created: false,
        });
      }
    }

    // Create new machine for user
    console.log(`[provision] Creating machine for user ${userId}`);
    
    // Step 1: Create volume
    const volume = await createVolume(userId);
    console.log(`[provision] Created volume ${volume.id}`);
    
    // Step 2: Create machine with volume attached
    const machine = await createMachine(userId, volume.id);
    console.log(`[provision] Created machine ${machine.id}`);
    
    // Step 3: Wait for machine to be ready
    const readyMachine = await waitForMachine(machine.id);
    console.log(`[provision] Machine ${machine.id} is ready`);
    
    // Step 4: Store in database
    await db.insert(machines).values({
      id: machine.id,
      userId,
      region: FLY_REGION,
      volumeId: volume.id,
      status: "started",
      ipAddress: readyMachine.private_ip,
      lastActiveAt: new Date(),
    });
    
    // Log event
    await db.insert(machineEvents).values({
      machineId: machine.id,
      eventType: "created",
      details: JSON.stringify({
        volumeId: volume.id,
        region: FLY_REGION,
      }),
    });

    return NextResponse.json({
      machineId: machine.id,
      volumeId: volume.id,
      status: "started",
      ipAddress: readyMachine.private_ip,
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

    if (!existingMachine) {
      return NextResponse.json({ hasMachine: false });
    }

    // Check current status
    const flyMachine = await getMachineStatus(existingMachine.id);
    
    if (!flyMachine) {
      // Machine was deleted externally
      await db.delete(machines).where(eq(machines.id, existingMachine.id));
      return NextResponse.json({ hasMachine: false });
    }

    return NextResponse.json({
      hasMachine: true,
      machineId: existingMachine.id,
      status: flyMachine.state,
      ipAddress: flyMachine.private_ip,
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
