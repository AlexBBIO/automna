/**
 * Dismiss Announcement API
 * 
 * Records that a user has dismissed an announcement
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcements, announcementDismissals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: announcementId } = await params;

    // Get the announcement to know its version
    const announcement = await db.query.announcements.findFirst({
      where: eq(announcements.id, announcementId),
    });

    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    // Check if already dismissed
    const existing = await db.query.announcementDismissals.findFirst({
      where: and(
        eq(announcementDismissals.userId, userId),
        eq(announcementDismissals.announcementId, announcementId)
      ),
    });

    if (existing) {
      // Update the dismissed version
      await db
        .update(announcementDismissals)
        .set({ 
          dismissedVersion: announcement.version || 1,
          dismissedAt: new Date(),
        })
        .where(eq(announcementDismissals.id, existing.id));
    } else {
      // Create new dismissal
      await db.insert(announcementDismissals).values({
        userId,
        announcementId,
        dismissedVersion: announcement.version || 1,
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[dismiss] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
