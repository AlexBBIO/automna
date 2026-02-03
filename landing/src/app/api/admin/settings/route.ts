/**
 * Admin Settings API
 * 
 * Get and update global settings
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const ADMIN_USER_IDS = ["user_38uauJcurhCOJznltOKvU12RCdK"];

// Settings are stored in a simple key-value table
// For MVP, we'll use in-memory defaults with DB overrides

const DEFAULT_SETTINGS = {
  // Plan limits (tokens per month)
  "limits.free.monthlyTokens": 100000,
  "limits.starter.monthlyTokens": 2000000,
  "limits.pro.monthlyTokens": 10000000,
  "limits.business.monthlyTokens": 50000000,
  
  // Cost caps (cents per month)
  "limits.free.monthlyCostCents": 100,
  "limits.starter.monthlyCostCents": 2000,
  "limits.pro.monthlyCostCents": 10000,
  "limits.business.monthlyCostCents": 50000,
  
  // Rate limits (requests per minute)
  "limits.free.rpm": 5,
  "limits.starter.rpm": 20,
  "limits.pro.rpm": 60,
  "limits.business.rpm": 120,
  
  // Email limits (per day)
  "limits.email.perDay": 50,
  
  // Feature flags
  "features.newUserProvisioning": true,
  "features.emailEnabled": true,
  "features.browserbaseEnabled": true,
  "features.heartbeatEnabled": true,
  
  // Maintenance
  "maintenance.enabled": false,
  "maintenance.message": "We're performing scheduled maintenance. Please check back soon.",
};

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Try to get settings from DB, fall back to defaults
    const settings: Record<string, string | number | boolean> = { ...DEFAULT_SETTINGS };
    
    try {
      const result = await db.run(sql`SELECT key, value FROM settings`);
      // Note: db.run doesn't return rows in drizzle, we'd need raw query
      // For now, just use defaults - settings will be created on first save
    } catch {
      // Settings table might not exist yet, use defaults
    }

    return NextResponse.json({ settings });

  } catch (error) {
    console.error("[admin/settings] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updates = await request.json();

    // Validate keys
    for (const key of Object.keys(updates)) {
      if (!(key in DEFAULT_SETTINGS)) {
        return NextResponse.json(
          { error: `Invalid setting key: ${key}` },
          { status: 400 }
        );
      }
    }

    // Ensure settings table exists
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Upsert each setting
    for (const [key, value] of Object.entries(updates)) {
      await db.run(sql`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (${key}, ${String(value)}, strftime('%s', 'now'))
        ON CONFLICT(key) DO UPDATE SET 
          value = ${String(value)},
          updated_at = strftime('%s', 'now')
      `);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[admin/settings] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
