/**
 * Admin Announcement Detail API
 * 
 * Update or delete a specific announcement
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcements, announcementDismissals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_USER_IDS = ["user_38uauJcurhCOJznltOKvU12RCdK"]; // Alex

// GET - Get single announcement
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const announcement = await db.query.announcements.findFirst({
      where: eq(announcements.id, id),
    });

    if (!announcement) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ announcement });

  } catch (error) {
    console.error("[admin/announcements/[id]] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update announcement
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { title, content, enabled, bumpVersion } = body;

    // Get current announcement
    const current = await db.query.announcements.findFirst({
      where: eq(announcements.id, id),
    });

    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (enabled !== undefined) updates.enabled = enabled;
    
    // Bump version to re-show to users who dismissed
    if (bumpVersion) {
      updates.version = (current.version || 1) + 1;
    }

    const [updated] = await db
      .update(announcements)
      .set(updates)
      .where(eq(announcements.id, id))
      .returning();

    return NextResponse.json({ 
      announcement: updated,
      versionBumped: bumpVersion || false,
    });

  } catch (error) {
    console.error("[admin/announcements/[id]] PUT Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete announcement
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Delete dismissals first (FK constraint)
    await db.delete(announcementDismissals)
      .where(eq(announcementDismissals.announcementId, id));

    // Delete announcement
    await db.delete(announcements)
      .where(eq(announcements.id, id));

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[admin/announcements/[id]] DELETE Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
