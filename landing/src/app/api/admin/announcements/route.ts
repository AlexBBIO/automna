/**
 * Admin Announcements API
 * 
 * CRUD for managing announcements
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";

// GET - List all announcements
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId || !isAdmin(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const all = await db.query.announcements.findMany({
      orderBy: [desc(announcements.updatedAt)],
    });

    return NextResponse.json({ announcements: all });

  } catch (error) {
    console.error("[admin/announcements] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create new announcement
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId || !isAdmin(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, title, content, enabled = true } = body;

    if (!type || !title || !content) {
      return NextResponse.json(
        { error: "Missing required fields: type, title, content" },
        { status: 400 }
      );
    }

    if (!['new_user', 'all_users'].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'new_user' or 'all_users'" },
        { status: 400 }
      );
    }

    const [created] = await db.insert(announcements).values({
      type,
      title,
      content,
      enabled,
      version: 1,
    }).returning();

    return NextResponse.json({ announcement: created });

  } catch (error) {
    console.error("[admin/announcements] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
